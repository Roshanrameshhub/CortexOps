/**
 * Tenant Context Middleware
 * Extracts and validates tenant context from requests
 */
import { Request, Response, NextFunction } from 'express';
import { TenantService } from '../services/tenant.service';
import { QuotaService } from '../services/quota.service';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { Logger } from '../utils/logger';
import { verify } from 'jsonwebtoken';

const logger = new Logger('TenantContextMiddleware');

/**
 * Tenant Context
 */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantTier: string;
  tenantStatus: string;
  userId?: string;
  userRole?: string;
  permissions?: string[];
}

/**
 * Extended Request with Tenant Context
 */
export interface TenantRequest extends Request {
  tenant?: TenantContext;
}

/**
 * Tenant Context Middleware
 */
export class TenantContextMiddleware {
  constructor(
    private tenantService: TenantService,
    private quotaService: QuotaService
  ) {}

  /**
   * Extract tenant context from request
   */
  extract() {
    return async (req: TenantRequest, res: Response, next: NextFunction) => {
      try {
        // Extract tenant ID from various sources
        const tenantId = this.extractTenantId(req);

        if (!tenantId) {
          throw new UnauthorizedError('Tenant ID not found in request');
        }

        // Get tenant
        const tenant = await this.tenantService.getTenant(tenantId);

        // Check if tenant is active
        if (!tenant.isActive()) {
          throw new ForbiddenError(`Tenant is ${tenant.status}`);
        }

        // Check if trial expired
        if (tenant.isTrialExpired()) {
          throw new ForbiddenError('Trial period has expired');
        }

        // Extract user info from JWT
        const userInfo = this.extractUserInfo(req);

        // Build tenant context
        req.tenant = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantTier: tenant.tier,
          tenantStatus: tenant.status,
          userId: userInfo?.userId,
          userRole: userInfo?.role,
          permissions: userInfo?.permissions
        };

        logger.debug(`Tenant context set: ${tenant.id}`);

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Require tenant to be active
   */
  requireActive() {
    return (req: TenantRequest, res: Response, next: NextFunction) => {
      if (!req.tenant) {
        return next(new UnauthorizedError('Tenant context not found'));
      }

      if (req.tenant.tenantStatus !== 'active') {
        return next(new ForbiddenError('Tenant must be active'));
      }

      next();
    };
  }

  /**
   * Require minimum tier
   */
  requireTier(minimumTier: string) {
    const tierOrder = ['free', 'starter', 'professional', 'enterprise'];

    return (req: TenantRequest, res: Response, next: NextFunction) => {
      if (!req.tenant) {
        return next(new UnauthorizedError('Tenant context not found'));
      }

      const requiredIndex = tierOrder.indexOf(minimumTier);
      const tenantIndex = tierOrder.indexOf(req.tenant.tenantTier);

      if (tenantIndex < requiredIndex) {
        return next(
          new ForbiddenError(`Requires minimum tier: ${minimumTier}`)
        );
      }

      next();
    };
  }

  /**
   * Require specific permission
   */
  requirePermission(permission: string) {
    return (req: TenantRequest, res: Response, next: NextFunction) => {
      if (!req.tenant) {
        return next(new UnauthorizedError('Tenant context not found'));
      }

      const hasPermission =
        req.tenant.permissions?.includes(permission) ||
        req.tenant.permissions?.includes('admin');

      if (!hasPermission) {
        return next(new ForbiddenError(`Missing permission: ${permission}`));
      }

      next();
    };
  }

  /**
   * Enforce quota
   */
  enforceQuota(quotaType: string, amount: number = 1) {
    return async (req: TenantRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.tenant) {
          return next(new UnauthorizedError('Tenant context not found'));
        }

        // Check and increment quota
        await this.quotaService.enforceQuota(
          req.tenant.tenantId,
          quotaType as any,
          amount
        );

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Rate limiting per tenant
   */
  rateLimitPerTenant(options: {
    windowMs: number;
    maxRequests: number;
  }) {
    const { windowMs, maxRequests } = options;
    const requestCounts = new Map<string, { count: number; resetAt: number }>();

    return (req: TenantRequest, res: Response, next: NextFunction) => {
      if (!req.tenant) {
        return next(new UnauthorizedError('Tenant context not found'));
      }

      const key = `${req.tenant.tenantId}:${req.path}`;
      const now = Date.now();

      let record = requestCounts.get(key);

      if (!record || now > record.resetAt) {
        record = {
          count: 0,
          resetAt: now + windowMs
        };
        requestCounts.set(key, record);
      }

      record.count++;

      if (record.count > maxRequests) {
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', record.resetAt.toString());

        return res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((record.resetAt - now) / 1000)
        });
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader(
        'X-RateLimit-Remaining',
        (maxRequests - record.count).toString()
      );
      res.setHeader('X-RateLimit-Reset', record.resetAt.toString());

      next();
    };
  }

  // Helper methods

  private extractTenantId(req: Request): string | null {
    // 1. From header
    let tenantId = req.headers['x-tenant-id'] as string;
    if (tenantId) return tenantId;

    // 2. From subdomain
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      // Would need to lookup tenant by subdomain
      // For now, assuming tenant ID in subdomain
    }

    // 3. From JWT token
    const token = this.extractToken(req);
    if (token) {
      try {
        const decoded: any = verify(token, process.env.JWT_SECRET || 'secret');
        if (decoded.tenantId) {
          return decoded.tenantId;
        }
      } catch (error) {
        logger.warn('Invalid JWT token');
      }
    }

    // 4. From query parameter (for development/testing only)
    if (process.env.NODE_ENV === 'development') {
      tenantId = req.query.tenantId as string;
      if (tenantId) return tenantId;
    }

    return null;
  }

  private extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  private extractUserInfo(req: Request): any | null {
    const token = this.extractToken(req);
    if (!token) return null;

    try {
      const decoded = verify(token, process.env.JWT_SECRET || 'secret');
      return decoded;
    } catch (error) {
      return null;
    }
  }
}

/**
 * Database Query Filter Middleware
 * Automatically adds tenant_id to database queries
 */
export class TenantQueryFilterMiddleware {
  /**
   * Add tenant filter to TypeORM query
   */
  static addTenantFilter(tenantId: string) {
    return (queryBuilder: any) => {
      // Add where clause for tenant_id
      if (queryBuilder.expressionMap.mainAlias) {
        const alias = queryBuilder.expressionMap.mainAlias.name;
        queryBuilder.andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
      }

      return queryBuilder;
    };
  }

  /**
   * Create scoped repository for tenant
   */
  static createScopedRepository(repository: any, tenantId: string) {
    return {
      ...repository,
      find: (options: any = {}) => {
        return repository.find({
          ...options,
          where: {
            ...options.where,
            tenantId
          }
        });
      },
      findOne: (options: any = {}) => {
        return repository.findOne({
          ...options,
          where: {
            ...options.where,
            tenantId
          }
        });
      },
      createQueryBuilder: (alias?: string) => {
        const qb = repository.createQueryBuilder(alias);
        if (alias) {
          qb.andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
        }
        return qb;
      }
    };
  }
}

/**
 * Audit logging middleware
 */
export class TenantAuditMiddleware {
  /**
   * Log tenant actions
   */
  static logAction(action: string) {
    return async (req: TenantRequest, res: Response, next: NextFunction) => {
      const tenant = req.tenant;

      if (tenant) {
        logger.info(`[Audit] Tenant: ${tenant.tenantId}, User: ${tenant.userId}, Action: ${action}`, {
          tenantId: tenant.tenantId,
          userId: tenant.userId,
          action,
          path: req.path,
          method: req.method,
          ip: req.ip
        });

        // Store in audit log database
        // await auditService.log({...});
      }

      next();
    };
  }
}
