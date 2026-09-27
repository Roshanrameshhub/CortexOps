/**
 * Tenant Management API Controller
 */
import { Router, Request, Response, NextFunction } from 'express';
import { TenantService } from '../services/tenant.service';
import { QuotaService } from '../services/quota.service';
import { TenantRequest } from '../middleware/tenant-context.middleware';
import { ValidationError } from '../errors';

export class TenantController {
  public router: Router;

  constructor(
    private tenantService: TenantService,
    private quotaService: QuotaService
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Tenant CRUD
    this.router.post('/tenants', this.createTenant.bind(this));
    this.router.get('/tenants/:id', this.getTenant.bind(this));
    this.router.put('/tenants/:id', this.updateTenant.bind(this));
    this.router.delete('/tenants/:id', this.deleteTenant.bind(this));
    this.router.get('/tenants', this.listTenants.bind(this));

    // Tenant operations
    this.router.post('/tenants/:id/upgrade', this.upgradeTier.bind(this));
    this.router.post('/tenants/:id/suspend', this.suspendTenant.bind(this));
    this.router.post('/tenants/:id/reactivate', this.reactivateTenant.bind(this));

    // Tenant members
    this.router.get('/tenants/:id/members', this.listMembers.bind(this));
    this.router.post('/tenants/:id/members', this.addMember.bind(this));
    this.router.delete('/tenants/:id/members/:userId', this.removeMember.bind(this));

    // Tenant quotas
    this.router.get('/tenants/:id/quotas', this.getQuotas.bind(this));
    this.router.put('/tenants/:id/quotas/:type', this.updateQuota.bind(this));

    // Tenant usage
    this.router.get('/tenants/:id/usage', this.getUsage.bind(this));
    this.router.get('/tenants/:id/statistics', this.getStatistics.bind(this));

    // User's tenants
    this.router.get('/users/:userId/tenants', this.getUserTenants.bind(this));
  }

  /**
   * Create tenant
   */
  async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, slug, tier, region, ownerUserId, ownerEmail, billingInfo, trialDays } = req.body;

      if (!name || !slug || !ownerUserId || !ownerEmail) {
        throw new ValidationError('Missing required fields');
      }

      const tenant = await this.tenantService.createTenant({
        name,
        slug,
        tier,
        region,
        ownerUserId,
        ownerEmail,
        billingInfo,
        trialDays
      });

      res.status(201).json({
        success: true,
        data: tenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get tenant
   */
  async getTenant(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const tenant = await this.tenantService.getTenant(id);

      res.json({
        success: true,
        data: tenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.tenant?.userId || 'system';

      const tenant = await this.tenantService.updateTenant(id, updates, userId);

      res.json({
        success: true,
        data: tenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete tenant
   */
  async deleteTenant(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.tenant?.userId || 'system';

      await this.tenantService.deleteTenant(id, userId);

      res.json({
        success: true,
        message: 'Tenant deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List tenants
   */
  async listTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, tier, status, search } = req.query;

      const result = await this.tenantService.listTenants({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        tier: tier as any,
        status: status as any,
        search: search as string
      });

      res.json({
        success: true,
        data: result.tenants,
        pagination: {
          total: result.total,
          page: page ? parseInt(page as string) : 1,
          limit: limit ? parseInt(limit as string) : 20
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upgrade tier
   */
  async upgradeTier(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tier } = req.body;
      const userId = req.tenant?.userId || 'system';

      const tenant = await this.tenantService.upgradeTier(id, tier, userId);

      res.json({
        success: true,
        data: tenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.tenant?.userId || 'system';

      const tenant = await this.tenantService.suspendTenant(id, reason, userId);

      res.json({
        success: true,
        data: tenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reactivate tenant
   */
  async reactivateTenant(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.tenant?.userId || 'system';

      const tenant = await this.tenantService.reactivateTenant(id, userId);

      res.json({
        success: true,
        data: tenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List members
   */
  async listMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const members = await this.tenantService.listMembers(id);

      res.json({
        success: true,
        data: members
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add member
   */
  async addMember(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { userId, role } = req.body;
      const invitedBy = req.tenant?.userId || 'system';

      const member = await this.tenantService.addMember(id, userId, role, invitedBy);

      res.status(201).json({
        success: true,
        data: member
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove member
   */
  async removeMember(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id, userId } = req.params;
      const removedBy = req.tenant?.userId || 'system';

      await this.tenantService.removeMember(id, userId, removedBy);

      res.json({
        success: true,
        message: 'Member removed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get quotas
   */
  async getQuotas(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const quotas = await this.quotaService.getQuotas(id);

      res.json({
        success: true,
        data: quotas.map(q => ({
          type: q.quotaType,
          limit: q.limit,
          usage: q.currentUsage,
          percentage: q.getUsagePercentage(),
          remaining: q.getRemainingQuota(),
          resetAt: q.nextReset
        }))
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update quota
   */
  async updateQuota(req: Request, res: Response, next: NextFunction) {
    try {
      const { id, type } = req.params;
      const { limit, softLimit } = req.body;

      const quota = await this.quotaService.updateQuotaLimit(id, type as any, limit, softLimit);

      res.json({
        success: true,
        data: quota
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get usage
   */
  async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const usage = await this.quotaService.getUsageStatistics(id, start, end);

      res.json({
        success: true,
        data: usage
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const stats = await this.tenantService.getStatistics(id);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's tenants
   */
  async getUserTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;

      const tenants = await this.tenantService.getUserTenants(userId);

      res.json({
        success: true,
        data: tenants
      });
    } catch (error) {
      next(error);
    }
  }
}
