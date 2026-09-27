/**
 * Quota Management Service
 */
import { Repository, DataSource, EntityManager } from 'typeorm';
import {
  TenantQuota,
  QuotaType,
  ResetPeriod,
  EnforcementAction,
  TenantTier
} from '../models/tenant.model';
import { QuotaExceededError, NotFoundError } from '../errors';
import { Logger } from '../utils/logger';
import { RedisClient } from '../utils/redis';

const logger = new Logger('QuotaService');

/**
 * Quota Check Result
 */
export interface QuotaCheckResult {
  allowed: boolean;
  quota: TenantQuota;
  remaining: number;
  resetAt: Date;
  reason?: string;
}

/**
 * Quota Service
 */
export class QuotaService {
  private quotaRepo: Repository<TenantQuota>;
  private redis: RedisClient;

  constructor(private dataSource: DataSource) {
    this.quotaRepo = dataSource.getRepository(TenantQuota);
    this.redis = new RedisClient();
  }

  /**
   * Initialize quotas for a new tenant
   */
  async initializeQuotas(
    tenantId: string,
    tier: TenantTier,
    manager?: EntityManager
  ): Promise<TenantQuota[]> {
    logger.info(`Initializing quotas for tenant ${tenantId} with tier ${tier}`);

    const repo = manager ? manager.getRepository(TenantQuota) : this.quotaRepo;

    const quotaDefinitions = this.getQuotaDefinitions(tier);
    const quotas: TenantQuota[] = [];

    for (const [quotaType, config] of Object.entries(quotaDefinitions)) {
      const quota = repo.create({
        tenantId,
        quotaType: quotaType as QuotaType,
        limit: config.limit,
        softLimit: config.softLimit,
        currentUsage: 0,
        resetPeriod: config.resetPeriod,
        lastReset: new Date(),
        nextReset: this.calculateNextReset(config.resetPeriod),
        enforcementAction: config.enforcementAction,
        overageAllowed: config.overageAllowed || false,
        overageRate: config.overageRate
      });

      quotas.push(await repo.save(quota));
    }

    logger.info(`Initialized ${quotas.length} quotas for tenant ${tenantId}`);

    return quotas;
  }

  /**
   * Get all quotas for a tenant
   */
  async getQuotas(tenantId: string): Promise<TenantQuota[]> {
    return await this.quotaRepo.find({
      where: { tenantId },
      order: { quotaType: 'ASC' }
    });
  }

  /**
   * Get specific quota for a tenant
   */
  async getQuota(tenantId: string, quotaType: QuotaType): Promise<TenantQuota> {
    const quota = await this.quotaRepo.findOne({
      where: { tenantId, quotaType }
    });

    if (!quota) {
      throw new NotFoundError(`Quota ${quotaType} not found for tenant ${tenantId}`);
    }

    // Check if quota needs reset
    if (quota.shouldReset()) {
      await this.resetQuota(quota);
    }

    return quota;
  }

  /**
   * Check if quota allows usage
   */
  async checkQuota(
    tenantId: string,
    quotaType: QuotaType,
    amount: number = 1
  ): Promise<QuotaCheckResult> {
    const quota = await this.getQuota(tenantId, quotaType);

    // Unlimited quota
    if (quota.limit === -1) {
      return {
        allowed: true,
        quota,
        remaining: Infinity,
        resetAt: quota.nextReset!
      };
    }

    const wouldExceed = quota.currentUsage + amount > quota.limit;

    if (wouldExceed) {
      // Check if overage is allowed
      if (quota.overageAllowed) {
        return {
          allowed: true,
          quota,
          remaining: quota.getRemainingQuota(),
          resetAt: quota.nextReset!,
          reason: 'overage_allowed'
        };
      }

      return {
        allowed: false,
        quota,
        remaining: quota.getRemainingQuota(),
        resetAt: quota.nextReset!,
        reason: 'quota_exceeded'
      };
    }

    return {
      allowed: true,
      quota,
      remaining: quota.getRemainingQuota() - amount,
      resetAt: quota.nextReset!
    };
  }

  /**
   * Increment quota usage
   */
  async incrementUsage(
    tenantId: string,
    quotaType: QuotaType,
    amount: number = 1
  ): Promise<TenantQuota> {
    // Try to increment in Redis first for better performance
    const redisKey = `quota:${tenantId}:${quotaType}`;

    try {
      const current = await this.redis.incrBy(redisKey, amount);

      // Set TTL if not set
      const ttl = await this.redis.ttl(redisKey);
      if (ttl === -1) {
        await this.redis.expire(redisKey, 3600); // 1 hour
      }

      // Sync to database periodically (every 10th increment or every minute)
      if (current % 10 === 0 || Math.random() < 0.1) {
        await this.syncUsageFromRedis(tenantId, quotaType);
      }

      // Return quota with updated usage from Redis
      const quota = await this.getQuota(tenantId, quotaType);
      quota.currentUsage = current;
      return quota;

    } catch (error) {
      logger.error(`Redis error, falling back to database: ${error}`);

      // Fallback to database
      const quota = await this.getQuota(tenantId, quotaType);

      quota.currentUsage += amount;

      return await this.quotaRepo.save(quota);
    }
  }

  /**
   * Sync usage from Redis to database
   */
  async syncUsageFromRedis(tenantId: string, quotaType: QuotaType): Promise<void> {
    const redisKey = `quota:${tenantId}:${quotaType}`;
    const usage = await this.redis.get(redisKey);

    if (usage !== null) {
      await this.quotaRepo.update(
        { tenantId, quotaType },
        { currentUsage: parseInt(usage, 10) }
      );
    }
  }

  /**
   * Enforce quota (check and increment atomically)
   */
  async enforceQuota(
    tenantId: string,
    quotaType: QuotaType,
    amount: number = 1
  ): Promise<TenantQuota> {
    const check = await this.checkQuota(tenantId, quotaType, amount);

    if (!check.allowed) {
      const quota = check.quota;

      // Handle based on enforcement action
      switch (quota.enforcementAction) {
        case EnforcementAction.BLOCK:
          throw new QuotaExceededError(
            `Quota exceeded for ${quotaType}. Limit: ${quota.limit}, Current: ${quota.currentUsage}`,
            {
              quotaType,
              limit: quota.limit,
              current: quota.currentUsage,
              resetAt: check.resetAt
            }
          );

        case EnforcementAction.THROTTLE:
          // Implement throttling logic
          await this.throttle(tenantId, quotaType);
          break;

        case EnforcementAction.ALERT:
          // Send alert but allow
          await this.sendQuotaAlert(tenantId, quota);
          break;
      }
    }

    // Increment usage
    return await this.incrementUsage(tenantId, quotaType, amount);
  }

  /**
   * Reset quota usage
   */
  async resetQuota(quota: TenantQuota): Promise<TenantQuota> {
    logger.info(`Resetting quota ${quota.quotaType} for tenant ${quota.tenantId}`);

    quota.currentUsage = 0;
    quota.lastReset = new Date();
    quota.nextReset = this.calculateNextReset(quota.resetPeriod);

    const updated = await this.quotaRepo.save(quota);

    // Clear Redis cache
    const redisKey = `quota:${quota.tenantId}:${quota.quotaType}`;
    await this.redis.del(redisKey);

    return updated;
  }

  /**
   * Update quota limit
   */
  async updateQuotaLimit(
    tenantId: string,
    quotaType: QuotaType,
    newLimit: number,
    softLimit?: number
  ): Promise<TenantQuota> {
    const quota = await this.getQuota(tenantId, quotaType);

    quota.limit = newLimit;
    if (softLimit !== undefined) {
      quota.softLimit = softLimit;
    }

    return await this.quotaRepo.save(quota);
  }

  /**
   * Update quotas when tier changes
   */
  async updateQuotasForTier(
    tenantId: string,
    newTier: TenantTier,
    manager?: EntityManager
  ): Promise<void> {
    logger.info(`Updating quotas for tenant ${tenantId} to tier ${newTier}`);

    const repo = manager ? manager.getRepository(TenantQuota) : this.quotaRepo;
    const quotaDefinitions = this.getQuotaDefinitions(newTier);

    for (const [quotaType, config] of Object.entries(quotaDefinitions)) {
      await repo.update(
        { tenantId, quotaType: quotaType as QuotaType },
        {
          limit: config.limit,
          softLimit: config.softLimit
        }
      );
    }

    // Clear Redis cache
    const pattern = `quota:${tenantId}:*`;
    await this.redis.deletePattern(pattern);
  }

  /**
   * Get quota usage statistics
   */
  async getUsageStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    // Implementation would query usage_metrics table
    // This is a simplified version

    const quotas = await this.getQuotas(tenantId);

    return quotas.map(quota => ({
      quotaType: quota.quotaType,
      limit: quota.limit,
      currentUsage: quota.currentUsage,
      percentage: quota.getUsagePercentage(),
      resetPeriod: quota.resetPeriod,
      nextReset: quota.nextReset
    }));
  }

  /**
   * Get quota definitions for a tier
   */
  private getQuotaDefinitions(tier: TenantTier): Record<string, any> {
    const definitions: Record<TenantTier, Record<string, any>> = {
      [TenantTier.FREE]: {
        [QuotaType.API_REQUESTS]: {
          limit: 10000,
          softLimit: 8000,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.BLOCK
        },
        [QuotaType.STORAGE_GB]: {
          limit: 1,
          softLimit: 0.8,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.BLOCK
        },
        [QuotaType.COMPUTE_HOURS]: {
          limit: 10,
          softLimit: 8,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.BLOCK
        },
        [QuotaType.USERS]: {
          limit: 3,
          softLimit: 3,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.BLOCK
        },
        [QuotaType.SERVICES]: {
          limit: 5,
          softLimit: 5,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.BLOCK
        }
      },
      [TenantTier.STARTER]: {
        [QuotaType.API_REQUESTS]: {
          limit: 100000,
          softLimit: 80000,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.THROTTLE,
          overageAllowed: true,
          overageRate: 0.001
        },
        [QuotaType.STORAGE_GB]: {
          limit: 10,
          softLimit: 8,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.ALERT,
          overageAllowed: true,
          overageRate: 0.15
        },
        [QuotaType.COMPUTE_HOURS]: {
          limit: 100,
          softLimit: 80,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.THROTTLE,
          overageAllowed: true,
          overageRate: 0.05
        },
        [QuotaType.USERS]: {
          limit: 10,
          softLimit: 10,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.BLOCK
        },
        [QuotaType.SERVICES]: {
          limit: 25,
          softLimit: 25,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.BLOCK
        }
      },
      [TenantTier.PROFESSIONAL]: {
        [QuotaType.API_REQUESTS]: {
          limit: 1000000,
          softLimit: 800000,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.ALERT,
          overageAllowed: true,
          overageRate: 0.0005
        },
        [QuotaType.STORAGE_GB]: {
          limit: 100,
          softLimit: 80,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.ALERT,
          overageAllowed: true,
          overageRate: 0.10
        },
        [QuotaType.COMPUTE_HOURS]: {
          limit: 500,
          softLimit: 400,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.ALERT,
          overageAllowed: true,
          overageRate: 0.03
        },
        [QuotaType.GPU_HOURS]: {
          limit: 50,
          softLimit: 40,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.ALERT,
          overageAllowed: true,
          overageRate: 2.00
        },
        [QuotaType.USERS]: {
          limit: 50,
          softLimit: 50,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.ALERT
        },
        [QuotaType.SERVICES]: {
          limit: 100,
          softLimit: 100,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.ALERT
        }
      },
      [TenantTier.ENTERPRISE]: {
        [QuotaType.API_REQUESTS]: {
          limit: -1, // Unlimited
          softLimit: undefined,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.ALERT
        },
        [QuotaType.STORAGE_GB]: {
          limit: -1,
          softLimit: undefined,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.ALERT
        },
        [QuotaType.COMPUTE_HOURS]: {
          limit: -1,
          softLimit: undefined,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.ALERT
        },
        [QuotaType.GPU_HOURS]: {
          limit: -1,
          softLimit: undefined,
          resetPeriod: ResetPeriod.MONTHLY,
          enforcementAction: EnforcementAction.ALERT
        },
        [QuotaType.USERS]: {
          limit: -1,
          softLimit: undefined,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.ALERT
        },
        [QuotaType.SERVICES]: {
          limit: -1,
          softLimit: undefined,
          resetPeriod: ResetPeriod.NEVER,
          enforcementAction: EnforcementAction.ALERT
        }
      }
    };

    return definitions[tier];
  }

  /**
   * Calculate next reset time based on reset period
   */
  private calculateNextReset(period: ResetPeriod): Date | undefined {
    const now = new Date();

    switch (period) {
      case ResetPeriod.HOURLY:
        return new Date(now.getTime() + 60 * 60 * 1000);

      case ResetPeriod.DAILY:
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;

      case ResetPeriod.MONTHLY:
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth;

      case ResetPeriod.NEVER:
      default:
        return undefined;
    }
  }

  /**
   * Throttle request
   */
  private async throttle(tenantId: string, quotaType: QuotaType): Promise<void> {
    // Implement rate limiting/throttling logic
    // For now, add a delay
    const delay = 1000; // 1 second
    await new Promise(resolve => setTimeout(resolve, delay));

    logger.info(`Throttled request for tenant ${tenantId}, quota ${quotaType}`);
  }

  /**
   * Send quota alert
   */
  private async sendQuotaAlert(tenantId: string, quota: TenantQuota): Promise<void> {
    // Implement alerting logic (email, webhook, etc.)
    logger.warn(
      `Quota alert for tenant ${tenantId}: ${quota.quotaType} at ${quota.getUsagePercentage()}%`
    );

    // This would integrate with notification service
    // await notificationService.send({
    //   tenantId,
    //   type: 'quota_alert',
    //   data: { quota }
    // });
  }

  /**
   * Perform periodic quota resets
   */
  async performScheduledResets(): Promise<void> {
    logger.info('Performing scheduled quota resets');

    const quotasToReset = await this.quotaRepo
      .createQueryBuilder('quota')
      .where('quota.nextReset IS NOT NULL')
      .andWhere('quota.nextReset <= :now', { now: new Date() })
      .getMany();

    logger.info(`Found ${quotasToReset.length} quotas to reset`);

    for (const quota of quotasToReset) {
      await this.resetQuota(quota);
    }
  }
}
