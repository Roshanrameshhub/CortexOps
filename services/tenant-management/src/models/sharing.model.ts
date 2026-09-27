/**
 * Cross-tenant sharing models
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';

/**
 * Resource Type Enum
 */
export enum ResourceType {
  SERVICE = 'service',
  MODEL = 'model',
  DATASET = 'dataset',
  API = 'api',
  WORKFLOW = 'workflow',
  CUSTOM = 'custom'
}

/**
 * Visibility Level Enum
 */
export enum Visibility {
  PRIVATE = 'private',
  TENANT = 'tenant',
  MARKETPLACE = 'marketplace',
  PUBLIC = 'public'
}

/**
 * Permission Enum
 */
export enum Permission {
  READ = 'read',
  EXECUTE = 'execute',
  MODIFY = 'modify',
  SHARE = 'share',
  DELETE = 'delete',
  ADMIN = 'admin'
}

/**
 * Condition Type Enum
 */
export enum ConditionType {
  TIER_MINIMUM = 'tier_minimum',
  TIER_EXACT = 'tier_exact',
  REGION = 'region',
  COMPLIANCE = 'compliance',
  COST_LIMIT = 'cost_limit',
  USAGE_LIMIT = 'usage_limit',
  TIME_WINDOW = 'time_window',
  IP_WHITELIST = 'ip_whitelist'
}

/**
 * Access Condition Interface
 */
export interface AccessCondition {
  type: ConditionType;
  value: any;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin';
}

/**
 * Pricing Model Interface
 */
export interface PricingModel {
  type: 'free' | 'fixed' | 'usage_based' | 'tiered';
  basePrice?: number;
  usagePrice?: number;
  currency: string;
  billingPeriod?: 'hourly' | 'daily' | 'monthly';
  tiers?: Array<{
    upTo: number;
    price: number;
  }>;
}

/**
 * Sharing Policy Entity
 */
@Entity('sharing_policies')
@Index(['resourceId', 'resourceType'])
@Index(['ownerTenantId'])
@Index(['visibility'])
@Index(['isActive'])
export class SharingPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  resourceId: string;

  @Column({
    type: 'enum',
    enum: ResourceType
  })
  resourceType: ResourceType;

  @Column({ type: 'uuid' })
  ownerTenantId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: Visibility,
    default: Visibility.PRIVATE
  })
  visibility: Visibility;

  @Column({ type: 'simple-array', nullable: true })
  allowedTenants: string[];

  @Column({ type: 'simple-array', nullable: true })
  blockedTenants: string[];

  @Column({
    type: 'simple-array',
    default: [Permission.READ]
  })
  permissions: Permission[];

  @Column({ type: 'jsonb', nullable: true })
  conditions: AccessCondition[];

  @Column({ type: 'jsonb', nullable: true })
  pricing: PricingModel;

  @Column({ type: 'boolean', default: true })
  requiresApproval: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'integer', default: 0 })
  maxConsumers: number;

  @Column({ type: 'integer', default: 0 })
  currentConsumers: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  isAccessible(): boolean {
    return this.isActive && (!this.expiresAt || new Date() < this.expiresAt);
  }

  hasCapacity(): boolean {
    return this.maxConsumers === 0 || this.currentConsumers < this.maxConsumers;
  }

  canAccess(tenantId: string): boolean {
    // Owner always has access
    if (tenantId === this.ownerTenantId) return true;

    // Check if blocked
    if (this.blockedTenants?.includes(tenantId)) return false;

    // Check visibility
    switch (this.visibility) {
      case Visibility.PRIVATE:
        return false;
      case Visibility.TENANT:
        return tenantId === this.ownerTenantId;
      case Visibility.MARKETPLACE:
      case Visibility.PUBLIC:
        // Check whitelist if defined
        if (this.allowedTenants && this.allowedTenants.length > 0) {
          return this.allowedTenants.includes(tenantId);
        }
        return true;
      default:
        return false;
    }
  }

  hasPermission(permission: Permission): boolean {
    return this.permissions.includes(permission) || this.permissions.includes(Permission.ADMIN);
  }
}

/**
 * Sharing Access Request Status
 */
export enum AccessRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REVOKED = 'revoked'
}

/**
 * Sharing Access Request Entity
 */
@Entity('sharing_access_requests')
@Index(['policyId', 'requesterTenantId'])
@Index(['status'])
@Index(['createdAt'])
export class SharingAccessRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  policyId: string;

  @Column({ type: 'uuid' })
  requesterTenantId: string;

  @Column({ type: 'uuid', nullable: true })
  requesterUserId: string;

  @Column({
    type: 'enum',
    enum: AccessRequestStatus,
    default: AccessRequestStatus.PENDING
  })
  status: AccessRequestStatus;

  @Column({ type: 'text', nullable: true })
  justification: string;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  rejectedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  isPending(): boolean {
    return this.status === AccessRequestStatus.PENDING;
  }

  isApproved(): boolean {
    return this.status === AccessRequestStatus.APPROVED;
  }

  isRejected(): boolean {
    return this.status === AccessRequestStatus.REJECTED;
  }
}

/**
 * Sharing Access Grant Entity
 */
@Entity('sharing_access_grants')
@Index(['policyId', 'consumerTenantId'], { unique: true })
@Index(['consumerTenantId'])
@Index(['isActive'])
export class SharingAccessGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  policyId: string;

  @Column({ type: 'uuid' })
  consumerTenantId: string;

  @Column({
    type: 'simple-array',
    nullable: true
  })
  permissions: Permission[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  grantedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  grantedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  revokedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date;

  @Column({ type: 'text', nullable: true })
  revocationReason: string;

  @Column({ type: 'bigint', default: 0 })
  usageCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  isValid(): boolean {
    return this.isActive && (!this.expiresAt || new Date() < this.expiresAt);
  }

  hasPermission(permission: Permission): boolean {
    return this.permissions?.includes(permission) || this.permissions?.includes(Permission.ADMIN) || false;
  }
}

/**
 * Sharing Usage Tracking Entity
 */
@Entity('sharing_usage_tracking')
@Index(['grantId', 'date'])
@Index(['consumerTenantId', 'date'])
@Index(['ownerTenantId', 'date'])
export class SharingUsageTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  grantId: string;

  @Column({ type: 'uuid' })
  policyId: string;

  @Column({ type: 'uuid' })
  ownerTenantId: string;

  @Column({ type: 'uuid' })
  consumerTenantId: string;

  @Column({ type: 'varchar', length: 255 })
  resourceId: string;

  @Column({ type: 'enum', enum: ResourceType })
  resourceType: ResourceType;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'bigint', default: 0 })
  usageCount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  cost: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  revenue: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Revenue Share Configuration
 */
export interface RevenueShareConfig {
  enabled: boolean;
  ownerShare: number;        // Percentage (0-100)
  platformFee: number;       // Percentage (0-100)
  minimumPayout: number;     // Minimum amount for payout
  payoutSchedule: 'daily' | 'weekly' | 'monthly';
}

/**
 * Marketplace Listing Entity
 */
@Entity('marketplace_listings')
@Index(['policyId'])
@Index(['category'])
@Index(['isPublished'])
@Index(['createdAt'])
export class MarketplaceListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  policyId: string;

  @Column({ type: 'uuid' })
  ownerTenantId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string;

  @Column({ type: 'simple-array', nullable: true })
  screenshots: string[];

  @Column({ type: 'jsonb', nullable: true })
  pricing: PricingModel;

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ type: 'boolean', default: false })
  isFeatured: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'integer', default: 0 })
  reviewCount: number;

  @Column({ type: 'integer', default: 0 })
  installCount: number;

  @Column({ type: 'jsonb', nullable: true })
  revenueShare: RevenueShareConfig;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date;
}
