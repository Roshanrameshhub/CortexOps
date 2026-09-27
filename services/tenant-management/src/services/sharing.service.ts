/**
 * Cross-Tenant Sharing Service
 */
import { Repository, DataSource } from 'typeorm';
import {
  SharingPolicy,
  SharingAccessRequest,
  SharingAccessGrant,
  SharingUsageTracking,
  MarketplaceListing,
  ResourceType,
  Visibility,
  Permission,
  AccessRequestStatus,
  AccessCondition
} from '../models/sharing.model';
import { Tenant, TenantTier } from '../models/tenant.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors';
import { Logger } from '../utils/logger';

const logger = new Logger('SharingService');

/**
 * Create Policy DTO
 */
export interface CreatePolicyDTO {
  resourceId: string;
  resourceType: ResourceType;
  ownerTenantId: string;
  name?: string;
  description?: string;
  visibility: Visibility;
  permissions: Permission[];
  conditions?: AccessCondition[];
  pricing?: any;
  requiresApproval?: boolean;
  maxConsumers?: number;
}

/**
 * Sharing Service
 */
export class SharingService {
  private policyRepo: Repository<SharingPolicy>;
  private requestRepo: Repository<SharingAccessRequest>;
  private grantRepo: Repository<SharingAccessGrant>;
  private usageRepo: Repository<SharingUsageTracking>;
  private listingRepo: Repository<MarketplaceListing>;
  private tenantRepo: Repository<Tenant>;

  constructor(private dataSource: DataSource) {
    this.policyRepo = dataSource.getRepository(SharingPolicy);
    this.requestRepo = dataSource.getRepository(SharingAccessRequest);
    this.grantRepo = dataSource.getRepository(SharingAccessGrant);
    this.usageRepo = dataSource.getRepository(SharingUsageTracking);
    this.listingRepo = dataSource.getRepository(MarketplaceListing);
    this.tenantRepo = dataSource.getRepository(Tenant);
  }

  /**
   * Create sharing policy
   */
  async createPolicy(dto: CreatePolicyDTO): Promise<SharingPolicy> {
    logger.info(`Creating sharing policy for resource ${dto.resourceId}`);

    // Check if policy already exists
    const existing = await this.policyRepo.findOne({
      where: {
        resourceId: dto.resourceId,
        resourceType: dto.resourceType,
        ownerTenantId: dto.ownerTenantId
      }
    });

    if (existing) {
      throw new ValidationError('Sharing policy already exists for this resource');
    }

    const policy = this.policyRepo.create({
      ...dto,
      requiresApproval: dto.requiresApproval ?? true,
      maxConsumers: dto.maxConsumers ?? 0,
      currentConsumers: 0
    });

    const saved = await this.policyRepo.save(policy);

    logger.info(`Created sharing policy: ${saved.id}`);

    return saved;
  }

  /**
   * Get sharing policy
   */
  async getPolicy(policyId: string): Promise<SharingPolicy> {
    const policy = await this.policyRepo.findOne({
      where: { id: policyId }
    });

    if (!policy) {
      throw new NotFoundError(`Sharing policy ${policyId} not found`);
    }

    return policy;
  }

  /**
   * Update sharing policy
   */
  async updatePolicy(
    policyId: string,
    updates: Partial<SharingPolicy>,
    tenantId: string
  ): Promise<SharingPolicy> {
    const policy = await this.getPolicy(policyId);

    // Verify ownership
    if (policy.ownerTenantId !== tenantId) {
      throw new ForbiddenError('Only owner can update sharing policy');
    }

    Object.assign(policy, updates);

    return await this.policyRepo.save(policy);
  }

  /**
   * Delete sharing policy
   */
  async deletePolicy(policyId: string, tenantId: string): Promise<void> {
    const policy = await this.getPolicy(policyId);

    // Verify ownership
    if (policy.ownerTenantId !== tenantId) {
      throw new ForbiddenError('Only owner can delete sharing policy');
    }

    // Revoke all active grants
    await this.grantRepo.update(
      { policyId, isActive: true },
      { isActive: false, revokedAt: new Date() }
    );

    // Soft delete - deactivate policy
    policy.isActive = false;
    await this.policyRepo.save(policy);

    logger.info(`Deleted sharing policy: ${policyId}`);
  }

  /**
   * Request access to shared resource
   */
  async requestAccess(
    policyId: string,
    requesterTenantId: string,
    requesterUserId: string,
    justification?: string
  ): Promise<SharingAccessRequest> {
    const policy = await this.getPolicy(policyId);

    // Check if policy is accessible
    if (!policy.isAccessible()) {
      throw new ForbiddenError('Resource is not accessible');
    }

    // Check if already has access
    const existingGrant = await this.grantRepo.findOne({
      where: {
        policyId,
        consumerTenantId: requesterTenantId,
        isActive: true
      }
    });

    if (existingGrant) {
      throw new ValidationError('Already has access to this resource');
    }

    // Check if pending request exists
    const pendingRequest = await this.requestRepo.findOne({
      where: {
        policyId,
        requesterTenantId,
        status: AccessRequestStatus.PENDING
      }
    });

    if (pendingRequest) {
      throw new ValidationError('Access request already pending');
    }

    // Check conditions
    await this.validateConditions(policy, requesterTenantId);

    // Create request
    const request = this.requestRepo.create({
      policyId,
      requesterTenantId,
      requesterUserId,
      justification,
      status: AccessRequestStatus.PENDING
    });

    const saved = await this.requestRepo.save(request);

    // Auto-approve if not required
    if (!policy.requiresApproval) {
      await this.approveAccess(saved.id, policy.ownerTenantId);
    }

    logger.info(`Access request created: ${saved.id}`);

    return saved;
  }

  /**
   * Approve access request
   */
  async approveAccess(
    requestId: string,
    approverUserId: string
  ): Promise<SharingAccessGrant> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId }
    });

    if (!request) {
      throw new NotFoundError(`Access request ${requestId} not found`);
    }

    if (request.status !== AccessRequestStatus.PENDING) {
      throw new ValidationError('Request is not pending');
    }

    const policy = await this.getPolicy(request.policyId);

    // Check capacity
    if (!policy.hasCapacity()) {
      throw new ValidationError('Resource has reached maximum consumers');
    }

    return await this.dataSource.transaction(async (manager) => {
      // Update request
      request.status = AccessRequestStatus.APPROVED;
      request.approvedBy = approverUserId;
      request.approvedAt = new Date();
      await manager.save(request);

      // Create grant
      const grant = manager.create(SharingAccessGrant, {
        policyId: policy.id,
        consumerTenantId: request.requesterTenantId,
        permissions: policy.permissions,
        isActive: true,
        grantedBy: approverUserId,
        grantedAt: new Date(),
        usageCount: 0
      });

      const savedGrant = await manager.save(grant);

      // Update policy consumer count
      policy.currentConsumers += 1;
      await manager.save(policy);

      logger.info(`Access granted: ${savedGrant.id}`);

      return savedGrant;
    });
  }

  /**
   * Reject access request
   */
  async rejectAccess(
    requestId: string,
    rejectedBy: string,
    reason?: string
  ): Promise<void> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId }
    });

    if (!request) {
      throw new NotFoundError(`Access request ${requestId} not found`);
    }

    if (request.status !== AccessRequestStatus.PENDING) {
      throw new ValidationError('Request is not pending');
    }

    request.status = AccessRequestStatus.REJECTED;
    request.rejectedBy = rejectedBy;
    request.rejectedAt = new Date();
    request.rejectionReason = reason;

    await this.requestRepo.save(request);

    logger.info(`Access rejected: ${requestId}`);
  }

  /**
   * Revoke access
   */
  async revokeAccess(
    grantId: string,
    revokedBy: string,
    reason?: string
  ): Promise<void> {
    const grant = await this.grantRepo.findOne({
      where: { id: grantId }
    });

    if (!grant) {
      throw new NotFoundError(`Access grant ${grantId} not found`);
    }

    if (!grant.isActive) {
      throw new ValidationError('Access already revoked');
    }

    await this.dataSource.transaction(async (manager) => {
      // Revoke grant
      grant.isActive = false;
      grant.revokedBy = revokedBy;
      grant.revokedAt = new Date();
      grant.revocationReason = reason;
      await manager.save(grant);

      // Update policy consumer count
      const policy = await this.getPolicy(grant.policyId);
      policy.currentConsumers = Math.max(0, policy.currentConsumers - 1);
      await manager.save(policy);

      logger.info(`Access revoked: ${grantId}`);
    });
  }

  /**
   * Check if tenant has access to resource
   */
  async hasAccess(
    resourceId: string,
    resourceType: ResourceType,
    tenantId: string,
    permission?: Permission
  ): Promise<boolean> {
    // Find policy
    const policy = await this.policyRepo.findOne({
      where: { resourceId, resourceType, isActive: true }
    });

    if (!policy) {
      return false;
    }

    // Owner always has access
    if (policy.ownerTenantId === tenantId) {
      return true;
    }

    // Check if accessible
    if (!policy.canAccess(tenantId)) {
      return false;
    }

    // Check grant
    const grant = await this.grantRepo.findOne({
      where: {
        policyId: policy.id,
        consumerTenantId: tenantId,
        isActive: true
      }
    });

    if (!grant || !grant.isValid()) {
      return false;
    }

    // Check specific permission if requested
    if (permission && !grant.hasPermission(permission)) {
      return false;
    }

    return true;
  }

  /**
   * Track resource usage
   */
  async trackUsage(
    grantId: string,
    cost: number = 0,
    metadata?: any
  ): Promise<void> {
    const grant = await this.grantRepo.findOne({
      where: { id: grantId }
    });

    if (!grant) {
      throw new NotFoundError(`Access grant ${grantId} not found`);
    }

    const policy = await this.getPolicy(grant.policyId);

    // Update grant usage
    grant.usageCount += 1;
    grant.lastUsedAt = new Date();
    await this.grantRepo.save(grant);

    // Calculate revenue split
    const revenue = policy.pricing ? this.calculateRevenue(cost, policy.pricing) : 0;

    // Track usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usage = await this.usageRepo.findOne({
      where: {
        grantId,
        date: today
      }
    });

    if (usage) {
      usage.usageCount += 1;
      usage.cost += cost;
      usage.revenue += revenue;
      await this.usageRepo.save(usage);
    } else {
      const newUsage = this.usageRepo.create({
        grantId,
        policyId: policy.id,
        ownerTenantId: policy.ownerTenantId,
        consumerTenantId: grant.consumerTenantId,
        resourceId: policy.resourceId,
        resourceType: policy.resourceType,
        date: today,
        usageCount: 1,
        cost,
        revenue,
        metadata
      });

      await this.usageRepo.save(newUsage);
    }

    logger.debug(`Usage tracked for grant ${grantId}`);
  }

  /**
   * Get resource usage statistics
   */
  async getUsageStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    role: 'owner' | 'consumer' = 'owner'
  ): Promise<any[]> {
    const query = this.usageRepo
      .createQueryBuilder('usage')
      .where('usage.date >= :startDate', { startDate })
      .andWhere('usage.date <= :endDate', { endDate });

    if (role === 'owner') {
      query.andWhere('usage.ownerTenantId = :tenantId', { tenantId });
    } else {
      query.andWhere('usage.consumerTenantId = :tenantId', { tenantId });
    }

    const results = await query
      .select([
        'usage.resourceId',
        'usage.resourceType',
        'SUM(usage.usageCount) as totalUsage',
        'SUM(usage.cost) as totalCost',
        'SUM(usage.revenue) as totalRevenue'
      ])
      .groupBy('usage.resourceId, usage.resourceType')
      .getRawMany();

    return results;
  }

  /**
   * Create marketplace listing
   */
  async createListing(
    policyId: string,
    listingData: Partial<MarketplaceListing>
  ): Promise<MarketplaceListing> {
    const policy = await this.getPolicy(policyId);

    // Ensure policy visibility is marketplace or public
    if (![Visibility.MARKETPLACE, Visibility.PUBLIC].includes(policy.visibility)) {
      throw new ValidationError('Policy must have marketplace or public visibility');
    }

    const listing = this.listingRepo.create({
      policyId,
      ownerTenantId: policy.ownerTenantId,
      ...listingData,
      isPublished: false
    });

    const saved = await this.listingRepo.save(listing);

    logger.info(`Marketplace listing created: ${saved.id}`);

    return saved;
  }

  /**
   * List marketplace offerings
   */
  async listMarketplace(options: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: 'popularity' | 'rating' | 'newest';
  } = {}): Promise<{ listings: MarketplaceListing[]; total: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.listingRepo
      .createQueryBuilder('listing')
      .where('listing.isPublished = :published', { published: true });

    if (options.category) {
      query.andWhere('listing.category = :category', { category: options.category });
    }

    if (options.search) {
      query.andWhere(
        '(listing.title ILIKE :search OR listing.description ILIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    // Sorting
    switch (options.sortBy) {
      case 'popularity':
        query.orderBy('listing.installCount', 'DESC');
        break;
      case 'rating':
        query.orderBy('listing.rating', 'DESC');
        break;
      case 'newest':
      default:
        query.orderBy('listing.publishedAt', 'DESC');
    }

    const [listings, total] = await query.skip(skip).take(limit).getManyAndCount();

    return { listings, total };
  }

  // Helper methods

  private async validateConditions(
    policy: SharingPolicy,
    tenantId: string
  ): Promise<void> {
    if (!policy.conditions || policy.conditions.length === 0) {
      return;
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new NotFoundError(`Tenant ${tenantId} not found`);
    }

    for (const condition of policy.conditions) {
      switch (condition.type) {
        case 'tier_minimum':
          const tierOrder = [TenantTier.FREE, TenantTier.STARTER, TenantTier.PROFESSIONAL, TenantTier.ENTERPRISE];
          const requiredIndex = tierOrder.indexOf(condition.value);
          const tenantIndex = tierOrder.indexOf(tenant.tier);

          if (tenantIndex < requiredIndex) {
            throw new ForbiddenError(`Requires minimum tier: ${condition.value}`);
          }
          break;

        case 'region':
          if (tenant.region !== condition.value) {
            throw new ForbiddenError(`Resource only available in region: ${condition.value}`);
          }
          break;

        // Add more condition validations as needed
      }
    }
  }

  private calculateRevenue(cost: number, pricing: any): number {
    // Simplified revenue calculation
    // In production, this would use complex pricing models

    if (!pricing || pricing.type === 'free') {
      return 0;
    }

    if (pricing.type === 'fixed') {
      return pricing.basePrice || 0;
    }

    if (pricing.type === 'usage_based') {
      return cost * (pricing.usagePrice || 0);
    }

    return 0;
  }
}
