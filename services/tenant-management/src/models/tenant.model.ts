/**
 * Tenant data models for multi-tenancy support
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn
} from 'typeorm';

/**
 * Tenant Tiers
 */
export enum TenantTier {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

/**
 * Tenant Status
 */
export enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated'
}

/**
 * Isolation Level
 */
export enum IsolationLevel {
  SHARED = 'shared',
  DEDICATED_SCHEMA = 'dedicated_schema',
  DEDICATED_INSTANCE = 'dedicated_instance'
}

/**
 * Tenant Settings Interface
 */
export interface TenantSettings {
  timezone: string;
  language: string;
  dateFormat: string;
  currency: string;
  notifications: {
    email: boolean;
    slack: boolean;
    webhook: boolean;
  };
  security: {
    mfaRequired: boolean;
    ipWhitelist: string[];
    sessionTimeout: number;
  };
}

/**
 * Feature Flags Interface
 */
export interface FeatureFlags {
  advancedAnalytics: boolean;
  aiRecommendations: boolean;
  customBranding: boolean;
  ssoIntegration: boolean;
  apiAccess: boolean;
  webhooks: boolean;
  advancedSecurity: boolean;
  prioritySupport: boolean;
  customDomain: boolean;
  whiteLabeling: boolean;
}

/**
 * Tenant Customization Interface
 */
export interface TenantCustomization {
  branding: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    favicon?: string;
  };
  ui: {
    theme: 'light' | 'dark' | 'custom';
    customCSS?: string;
    layout?: string;
  };
  domains: string[];
}

/**
 * Billing Information Interface
 */
export interface BillingInformation {
  companyName: string;
  billingEmail: string;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  taxId?: string;
  paymentMethod?: {
    type: 'card' | 'bank' | 'invoice';
    last4?: string;
  };
}

/**
 * Tenant Entity
 */
@Entity('tenants')
@Index(['slug'], { unique: true })
@Index(['status'])
@Index(['tier'])
@Index(['createdAt'])
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: TenantTier,
    default: TenantTier.FREE
  })
  tier: TenantTier;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.TRIAL
  })
  status: TenantStatus;

  @Column({
    type: 'enum',
    enum: IsolationLevel,
    default: IsolationLevel.SHARED
  })
  isolationLevel: IsolationLevel;

  @Column({ type: 'varchar', length: 50, default: 'us-east-1' })
  region: string;

  @Column({ type: 'jsonb', nullable: true })
  settings: TenantSettings;

  @Column({ type: 'jsonb', nullable: true })
  features: FeatureFlags;

  @Column({ type: 'jsonb', nullable: true })
  customization: TenantCustomization;

  @Column({ type: 'jsonb', nullable: true })
  billingInfo: BillingInformation;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subscriptionId: string;

  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  suspendedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToMany(() => TenantQuota, quota => quota.tenant)
  quotas: TenantQuota[];

  @OneToMany(() => TenantMember, member => member.tenant)
  members: TenantMember[];

  @OneToMany(() => UsageMetric, metric => metric.tenant)
  usageMetrics: UsageMetric[];

  // Helper methods
  isActive(): boolean {
    return this.status === TenantStatus.ACTIVE;
  }

  isTrial(): boolean {
    return this.status === TenantStatus.TRIAL;
  }

  isTrialExpired(): boolean {
    return this.isTrial() && this.trialEndsAt && new Date() > this.trialEndsAt;
  }

  hasFeature(feature: keyof FeatureFlags): boolean {
    return this.features?.[feature] ?? false;
  }

  getDefaultQuotas(): Record<string, number> {
    const quotas: Record<TenantTier, Record<string, number>> = {
      [TenantTier.FREE]: {
        api_requests: 10000,
        storage_gb: 1,
        compute_hours: 10,
        users: 3,
        services: 5
      },
      [TenantTier.STARTER]: {
        api_requests: 100000,
        storage_gb: 10,
        compute_hours: 100,
        users: 10,
        services: 25
      },
      [TenantTier.PROFESSIONAL]: {
        api_requests: 1000000,
        storage_gb: 100,
        compute_hours: 500,
        users: 50,
        services: 100
      },
      [TenantTier.ENTERPRISE]: {
        api_requests: -1, // Unlimited
        storage_gb: -1,
        compute_hours: -1,
        users: -1,
        services: -1
      }
    };

    return quotas[this.tier];
  }
}

/**
 * Quota Type Enum
 */
export enum QuotaType {
  API_REQUESTS = 'api_requests',
  COMPUTE_HOURS = 'compute_hours',
  GPU_HOURS = 'gpu_hours',
  STORAGE_GB = 'storage_gb',
  BANDWIDTH_GB = 'bandwidth_gb',
  USERS = 'users',
  SERVICES = 'services',
  MODELS = 'models',
  CUSTOM = 'custom'
}

/**
 * Reset Period Enum
 */
export enum ResetPeriod {
  HOURLY = 'hourly',
  DAILY = 'daily',
  MONTHLY = 'monthly',
  NEVER = 'never'
}

/**
 * Enforcement Action Enum
 */
export enum EnforcementAction {
  BLOCK = 'block',
  THROTTLE = 'throttle',
  ALERT = 'alert',
  OVERAGE = 'overage'
}

/**
 * Tenant Quota Entity
 */
@Entity('tenant_quotas')
@Index(['tenantId', 'quotaType'], { unique: true })
@Index(['quotaType'])
export class TenantQuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: QuotaType
  })
  quotaType: QuotaType;

  @Column({ type: 'bigint', default: 0 })
  limit: number;

  @Column({ type: 'bigint', nullable: true })
  softLimit: number;

  @Column({ type: 'bigint', default: 0 })
  currentUsage: number;

  @Column({
    type: 'enum',
    enum: ResetPeriod,
    default: ResetPeriod.MONTHLY
  })
  resetPeriod: ResetPeriod;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastReset: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextReset: Date;

  @Column({
    type: 'enum',
    enum: EnforcementAction,
    default: EnforcementAction.BLOCK
  })
  enforcementAction: EnforcementAction;

  @Column({ type: 'boolean', default: false })
  overageAllowed: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  overageRate: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Tenant, tenant => tenant.quotas)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  // Helper methods
  isExceeded(): boolean {
    if (this.limit === -1) return false; // Unlimited
    return this.currentUsage >= this.limit;
  }

  isSoftLimitExceeded(): boolean {
    if (!this.softLimit || this.limit === -1) return false;
    return this.currentUsage >= this.softLimit;
  }

  getUsagePercentage(): number {
    if (this.limit === -1) return 0; // Unlimited
    if (this.limit === 0) return 100;
    return (this.currentUsage / this.limit) * 100;
  }

  getRemainingQuota(): number {
    if (this.limit === -1) return Infinity; // Unlimited
    return Math.max(0, this.limit - this.currentUsage);
  }

  shouldReset(): boolean {
    return this.nextReset && new Date() >= this.nextReset;
  }
}

/**
 * Tenant Role Enum
 */
export enum TenantRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
  CUSTOM = 'custom'
}

/**
 * Tenant Member Entity
 */
@Entity('tenant_members')
@Index(['tenantId', 'userId'], { unique: true })
@Index(['userId'])
@Index(['role'])
export class TenantMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: TenantRole,
    default: TenantRole.MEMBER
  })
  role: TenantRole;

  @Column({ type: 'jsonb', nullable: true })
  permissions: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  invitedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  invitedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Tenant, tenant => tenant.members)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  // Helper methods
  hasPermission(permission: string): boolean {
    return this.permissions?.includes(permission) ?? false;
  }

  isOwner(): boolean {
    return this.role === TenantRole.OWNER;
  }

  isAdmin(): boolean {
    return this.role === TenantRole.ADMIN || this.role === TenantRole.OWNER;
  }
}

/**
 * Usage Metric Entity
 */
@Entity('usage_metrics')
@Index(['tenantId', 'date', 'metricType'])
@Index(['date'])
export class UsageMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 100 })
  metricType: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'bigint', default: 0 })
  value: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => Tenant, tenant => tenant.usageMetrics)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;
}

/**
 * Tenant Audit Log Entity
 */
@Entity('tenant_audit_logs')
@Index(['tenantId', 'createdAt'])
@Index(['userId'])
@Index(['action'])
export class TenantAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resourceType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resourceId: string;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}
