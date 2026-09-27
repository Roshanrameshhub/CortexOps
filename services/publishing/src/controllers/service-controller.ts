import { Request, Response } from 'express';
import { PublishingService } from '../services/publishing-service';
import { Service } from '../types';
import { logger } from '../utils/logger';

/**
 * Controller for service publishing endpoints
 */
export class ServiceController {
  private publishingService: PublishingService;

  constructor() {
    this.publishingService = new PublishingService();
  }

  /**
   * POST /api/v1/services - Publish new service
   */
  async publishService(req: Request, res: Response): Promise<void> {
    try {
      const providerId = req.user?.id; // Extracted from JWT middleware
      const serviceSpec: Partial<Service> = req.body;

      if (!providerId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Provider ID not found',
        });
        return;
      }

      logger.info('Publishing service request', {
        providerId,
        serviceName: serviceSpec.name,
      });

      const result = await this.publishingService.publishService(
        providerId,
        serviceSpec
      );

      res.status(201).json({
        success: true,
        data: {
          serviceId: result.serviceId,
          status: result.status,
          message: result.message,
        },
      });
    } catch (error) {
      logger.error('Publish service error', { error });

      res.status(500).json({
        success: false,
        error: 'Failed to publish service',
        message: (error as Error).message,
      });
    }
  }

  /**
   * PUT /api/v1/services/:id - Update service
   */
  async updateService(req: Request, res: Response): Promise<void> {
    try {
      const providerId = req.user?.id;
      const serviceId = req.params.id;
      const updates: Partial<Service> = req.body;

      if (!providerId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Provider ID not found',
        });
        return;
      }

      logger.info('Update service request', {
        serviceId,
        providerId,
      });

      const result = await this.publishingService.updateService(
        serviceId,
        providerId,
        updates
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Update service error', { error });

      const statusCode = (error as Error).message.includes('not found') ? 404 :
                        (error as Error).message.includes('Unauthorized') ? 403 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to update service',
        message: (error as Error).message,
      });
    }
  }

  /**
   * POST /api/v1/services/:id/versions - Create new version
   */
  async createVersion(req: Request, res: Response): Promise<void> {
    try {
      const providerId = req.user?.id;
      const serviceId = req.params.id;
      const { version, changes } = req.body;

      if (!providerId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Provider ID not found',
        });
        return;
      }

      if (!version) {
        res.status(400).json({
          success: false,
          error: 'Version is required',
        });
        return;
      }

      logger.info('Create version request', {
        serviceId,
        providerId,
        version,
      });

      const result = await this.publishingService.createVersion(
        serviceId,
        providerId,
        version,
        changes
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Create version error', { error });

      const statusCode = (error as Error).message.includes('not found') ? 404 :
                        (error as Error).message.includes('Unauthorized') ? 403 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to create version',
        message: (error as Error).message,
      });
    }
  }

  /**
   * DELETE /api/v1/services/:id - Deprecate service
   */
  async deprecateService(req: Request, res: Response): Promise<void> {
    try {
      const providerId = req.user?.id;
      const serviceId = req.params.id;
      const { reason } = req.body;

      if (!providerId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Provider ID not found',
        });
        return;
      }

      logger.info('Deprecate service request', {
        serviceId,
        providerId,
        reason,
      });

      const result = await this.publishingService.deprecateService(
        serviceId,
        providerId,
        reason
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Deprecate service error', { error });

      const statusCode = (error as Error).message.includes('not found') ? 404 :
                        (error as Error).message.includes('Unauthorized') ? 403 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to deprecate service',
        message: (error as Error).message,
      });
    }
  }

  /**
   * GET /api/v1/services/:id - Get service details
   */
  async getService(req: Request, res: Response): Promise<void> {
    try {
      const serviceId = req.params.id;

      logger.info('Get service request', {
        serviceId,
      });

      const service = await this.publishingService.getService(serviceId);

      if (!service) {
        res.status(404).json({
          success: false,
          error: 'Service not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: service,
      });
    } catch (error) {
      logger.error('Get service error', { error });

      res.status(500).json({
        success: false,
        error: 'Failed to get service',
        message: (error as Error).message,
      });
    }
  }

  /**
   * GET /api/v1/services/:id/status - Check publishing status
   */
  async getPublishingStatus(req: Request, res: Response): Promise<void> {
    try {
      const serviceId = req.params.id;

      logger.info('Get publishing status request', {
        serviceId,
      });

      const status = await this.publishingService.getPublishingStatus(serviceId);

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Get publishing status error', { error });

      const statusCode = (error as Error).message.includes('not found') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to get publishing status',
        message: (error as Error).message,
      });
    }
  }
}
