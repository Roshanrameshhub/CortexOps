/**
 * Tenant Management Service
 */
import { Repository, DataSource } from 'typeorm';
import {
  Tenant,
  TenantTier,
  TenantStatus,
  TenantQuota,
  QuotaType,
  TenantMember,
  TenantRole,
  UsageMetric,
  TenantAuditLog,
  IsolationLevel
} from '../models/tenant.model';
import { QuotaService } from './quota.service';
import { ValidationError, NotFoundError, ConflictError } from '../errors';
import { Logger } from '../utils/logger';

const logger = new Logger('TenantService');

/**
 * Tenant Creation DTO
 */
export interface CreateTenantDTO {
  name: string;
  slug: string;
  tier?: TenantTier;
  region?: string;
  ownerUserId: string;
  ownerEmail: string;
  billingInfo?: any;
  trialDays?: number;
}

/**
 * Tenant Update DTO
 */
export interface UpdateTenantDTO {
  name?: string;
  settings?: any;
  customization?: any;
  billingInfo?: any;
}

/**
 * Tenant Service
 */
export class TenantService {
  private tenantRepo: Repository<Tenant>;
  private memberRepo: Repository<TenantMember>;
  private auditRepo: Repository<TenantAuditLog>;
  private quotaService: QuotaService;

  constructor(private dataSource: DataSource) {
    this.tenantRepo = dataSource.getRepository(Tenant);
    this.memberRepo = dataSource.getRepository(TenantMember);
    this.auditRepo = dataSource.getRepository(TenantAuditLog);
    this.quotaService = new QuotaService(dataSource);
  }

  /**
   * Create a new tenant
   */
  async createTenant(dto: CreateTenantDTO): Promise<Tenant> {
    logger.info(`Creating tenant: ${dto.name}`);

    // Validate slug uniqueness
    const existing = await this.tenantRepo.findOne({
      where: { slug: dto.slug }
    });

    if (existing) {
      throw new ConflictError(`Tenant with slug "${dto.slug}" already exists`);
    }

    // Start transaction
    return await this.dataSource.transaction(async (manager) => {
      // Create tenant
      const tenant = manager.create(Tenant, {
        name: dto.name,
        slug: dto.slug,
        tier: dto.tier || TenantTier.FREE,
        status: dto.trialDays ? TenantStatus.TRIAL : TenantStatus.ACTIVE,
        region: dto.region || 'us-east-1',
        isolationLevel: this.getDefaultIsolationLevel(dto.tier || TenantTier.FREE),
        billingInfo: dto.billingInfo,
        trialEndsAt: dto.trialDays
          ? new Date(Date.now() + dto.trialDays * 24 * 60 * 60 * 1000)
          : undefined,
        features: this.getDefaultFeatures(dto.tier || TenantTier.FREE),
        settings: this.getDefaultSettings()
      });

      const savedTenant = await manager.save(tenant);

      // Initialize quotas
      await this.quotaService.initializeQuotas(savedTenant.id, savedTenant.tier, manager);

      // Add owner as member
      const owner = manager.create(TenantMember, {
        tenantId: savedTenant.id,
        userId: dto.ownerUserId,
        role: TenantRole.OWNER,
        joinedAt: new Date()
      });

      await manager.save(owner);

      // Create audit log
      await this.createAuditLog({
        tenantId: savedTenant.id,
        userId: dto.ownerUserId,
        action: 'tenant.created',
        metadata: { tier: savedTenant.tier }
      }, manager);

      // Create dedicated schema if needed
      if (savedTenant.isolationLevel === IsolationLevel.DEDICATED_SCHEMA) {
        await this.createTenantSchema(savedTenant.id, manager);
      }

      logger.info(`Tenant created: ${savedTenant.id}`);

      return savedTenant;
    });
  }

  /**
   * Get tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new NotFoundError(`Tenant ${tenantId} not found`);
    }

    return tenant;
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({
      where: { slug }
    });

    if (!tenant) {
      throw new NotFoundError(`Tenant with slug "${slug}" not found`);
    }

    return tenant;
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId: string, dto: UpdateTenantDTO, userId: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    // Update fields
    if (dto.name) tenant.name = dto.name;
    if (dto.settings) tenant.settings = { ...tenant.settings, ...dto.settings };
    if (dto.customization) tenant.customization = { ...tenant.customization, ...dto.customization };
    if (dto.billingInfo) tenant.billingInfo = { ...tenant.billingInfo, ...dto.billingInfo };

    const updated = await this.tenantRepo.save(tenant);

    // Audit log
    await this.createAuditLog({
      tenantId,
      userId,
      action: 'tenant.updated',
      changes: dto
    });

    logger.info(`Tenant updated: ${tenantId}`);

    return updated;
  }

  /**
   * Upgrade tenant tier
   */
  async upgradeTier(tenantId: string, newTier: TenantTier, userId: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    const oldTier = tenant.tier;

    // Validate upgrade path
    if (!this.isValidTierUpgrade(oldTier, newTier)) {
      throw new ValidationError(`Cannot upgrade from ${oldTier} to ${newTier}`);
    }

    return await this.dataSource.transaction(async (manager) => {
      // Update tier
      tenant.tier = newTier;
      tenant.status = TenantStatus.ACTIVE;
      tenant.features = this.getDefaultFeatures(newTier);
      tenant.isolationLevel = this.getDefaultIsolationLevel(newTier);

      const updated = await manager.save(tenant);

      // Update quotas
      await this.quotaService.updateQuotasForTier(tenantId, newTier, manager);

      // Create dedicated schema if upgraded to enterprise
      if (newTier === TenantTier.ENTERPRISE &&
          updated.isolationLevel === IsolationLevel.DEDICATED_SCHEMA) {
        await this.createTenantSchema(tenantId, manager);
      }

      // Audit log
      await this.createAuditLog({
        tenantId,
        userId,
        action: 'tenant.tier_upgraded',
        changes: { from: oldTier, to: newTier }
      }, manager);

      logger.info(`Tenant tier upgraded: ${tenantId} from ${oldTier} to ${newTier}`);

      return updated;
    });
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId: string, reason: string, userId: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    tenant.status = TenantStatus.SUSPENDED;
    tenant.suspendedAt = new Date();

    const updated = await this.tenantRepo.save(tenant);

    // Audit log
    await this.createAuditLog({
      tenantId,
      userId,
      action: 'tenant.suspended',
      metadata: { reason }
    });

    logger.warn(`Tenant suspended: ${tenantId} - ${reason}`);

    return updated;
  }

  /**
   * Reactivate tenant
   */
  async reactivateTenant(tenantId: string, userId: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    if (tenant.status !== TenantStatus.SUSPENDED) {
      throw new ValidationError('Only suspended tenants can be reactivated');
    }

    tenant.status = TenantStatus.ACTIVE;
    tenant.suspendedAt = undefined;

    const updated = await this.tenantRepo.save(tenant);

    // Audit log
    await this.createAuditLog({
      tenantId,
      userId,
      action: 'tenant.reactivated'
    });

    logger.info(`Tenant reactivated: ${tenantId}`);

    return updated;
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(tenantId: string, userId: string): Promise<void> {
    const tenant = await this.getTenant(tenantId);

    // Soft delete - set to deactivated
    tenant.status = TenantStatus.DEACTIVATED;

    await this.tenantRepo.save(tenant);

    // Audit log
    await this.createAuditLog({
      tenantId,
      userId,
      action: 'tenant.deleted'
    });

    logger.warn(`Tenant deleted: ${tenantId}`);
  }

  /**
   * List tenants with filtering
   */
  async listTenants(options: {
    page?: number;
    limit?: number;
    tier?: TenantTier;
    status?: TenantStatus;
    search?: string;
  } = {}): Promise<{ tenants: Tenant[]; total: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.tenantRepo.createQueryBuilder('tenant');

    if (options.tier) {
      query.andWhere('tenant.tier = :tier', { tier: options.tier });
    }

    if (options.status) {
      query.andWhere('tenant.status = :status', { status: options.status });
    }

    if (options.search) {
      query.andWhere(
        '(tenant.name ILIKE :search OR tenant.slug ILIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    const [tenants, total] = await query
      .orderBy('tenant.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { tenants, total };
  }

  /**
   * Add member to tenant
   */
  async addMember(
    tenantId: string,
    userId: string,
    role: TenantRole,
    invitedBy: string
  ): Promise<TenantMember> {
    // Check if member already exists
    const existing = await this.memberRepo.findOne({
      where: { tenantId, userId }
    });

    if (existing) {
      throw new ConflictError('User is already a member of this tenant');
    }

    const member = this.memberRepo.create({
      tenantId,
      userId,
      role,
      invitedBy,
      invitedAt: new Date(),
      joinedAt: new Date()
    });

    const saved = await this.memberRepo.save(member);

    // Audit log
    await this.createAuditLog({
      tenantId,
      userId: invitedBy,
      action: 'member.added',
      metadata: { userId, role }
    });

    logger.info(`Member added to tenant ${tenantId}: ${userId}`);

    return saved;
  }

  /**
   * Remove member from tenant
   */
  async removeMember(tenantId: string, userId: string, removedBy: string): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { tenantId, userId }
    });

    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // Cannot remove owner
    if (member.role === TenantRole.OWNER) {
      throw new ValidationError('Cannot remove tenant owner');
    }

    await this.memberRepo.remove(member);

    // Audit log
    await this.createAuditLog({
      tenantId,
      userId: removedBy,
      action: 'member.removed',
      metadata: { userId }
    });

    logger.info(`Member removed from tenant ${tenantId}: ${userId}`);
  }

  /**
   * List tenant members
   */
  async listMembers(tenantId: string): Promise<TenantMember[]> {
    return await this.memberRepo.find({
      where: { tenantId, isActive: true },
      order: { createdAt: 'ASC' }
    });
  }

  /**
   * Get user's tenants
   */
  async getUserTenants(userId: string): Promise<Tenant[]> {
    const members = await this.memberRepo.find({
      where: { userId, isActive: true }
    });

    const tenantIds = members.map(m => m.tenantId);

    if (tenantIds.length === 0) {
      return [];
    }

    return await this.tenantRepo.find({
      where: tenantIds.map(id => ({ id }))
    });
  }

  /**
   * Check if user is member of tenant
   */
  async isMember(tenantId: string, userId: string): boolean {
    const member = await this.memberRepo.findOne({
      where: { tenantId, userId, isActive: true }
    });

    return !!member;
  }

  /**
   * Get tenant statistics
   */
  async getStatistics(tenantId: string): Promise<any> {
    const tenant = await this.getTenant(tenantId);
    const members = await this.listMembers(tenantId);
    const quotas = await this.quotaService.getQuotas(tenantId);

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        tier: tenant.tier,
        status: tenant.status,
        createdAt: tenant.createdAt
      },
      members: {
        total: members.length,
        byRole: this.groupMembersByRole(members)
      },
      quotas: quotas.map(q => ({
        type: q.quotaType,
        usage: q.currentUsage,
        limit: q.limit,
        percentage: q.getUsagePercentage()
      }))
    };
  }

  // Helper methods

  private getDefaultFeatures(tier: TenantTier): any {
    const features: Record<TenantTier, any> = {
      [TenantTier.FREE]: {
        advancedAnalytics: false,
        aiRecommendations: false,
        customBranding: false,
        ssoIntegration: false,
        apiAccess: true,
        webhooks: false,
        advancedSecurity: false,
        prioritySupport: false,
        customDomain: false,
        whiteLabeling: false
      },
      [TenantTier.STARTER]: {
        advancedAnalytics: true,
        aiRecommendations: true,
        customBranding: false,
        ssoIntegration: false,
        apiAccess: true,
        webhooks: true,
        advancedSecurity: false,
        prioritySupport: false,
        customDomain: false,
        whiteLabeling: false
      },
      [TenantTier.PROFESSIONAL]: {
        advancedAnalytics: true,
        aiRecommendations: true,
        customBranding: true,
        ssoIntegration: true,
        apiAccess: true,
        webhooks: true,
        advancedSecurity: true,
        prioritySupport: true,
        customDomain: true,
        whiteLabeling: false
      },
      [TenantTier.ENTERPRISE]: {
        advancedAnalytics: true,
        aiRecommendations: true,
        customBranding: true,
        ssoIntegration: true,
        apiAccess: true,
        webhooks: true,
        advancedSecurity: true,
        prioritySupport: true,
        customDomain: true,
        whiteLabeling: true
      }
    };

    return features[tier];
  }

  private getDefaultSettings(): any {
    return {
      timezone: 'UTC',
      language: 'en',
      dateFormat: 'YYYY-MM-DD',
      currency: 'USD',
      notifications: {
        email: true,
        slack: false,
        webhook: false
      },
      security: {
        mfaRequired: false,
        ipWhitelist: [],
        sessionTimeout: 3600
      }
    };
  }

  private getDefaultIsolationLevel(tier: TenantTier): IsolationLevel {
    if (tier === TenantTier.ENTERPRISE) {
      return IsolationLevel.DEDICATED_SCHEMA;
    }
    return IsolationLevel.SHARED;
  }

  private isValidTierUpgrade(from: TenantTier, to: TenantTier): boolean {
    const tiers = [TenantTier.FREE, TenantTier.STARTER, TenantTier.PROFESSIONAL, TenantTier.ENTERPRISE];
    const fromIndex = tiers.indexOf(from);
    const toIndex = tiers.indexOf(to);
    return toIndex > fromIndex;
  }

  private async createTenantSchema(tenantId: string, manager: any): Promise<void> {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    await manager.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    logger.info(`Created dedicated schema for tenant: ${tenantId}`);
  }

  private async createAuditLog(data: {
    tenantId: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    changes?: any;
    metadata?: any;
  }, manager: any = null): Promise<void> {
    const repo = manager ? manager.getRepository(TenantAuditLog) : this.auditRepo;

    const log = repo.create({
      tenantId: data.tenantId,
      userId: data.userId,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      changes: data.changes,
      metadata: data.metadata
    });

    await repo.save(log);
  }

  private groupMembersByRole(members: TenantMember[]): Record<string, number> {
    return members.reduce((acc, member) => {
      acc[member.role] = (acc[member.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
