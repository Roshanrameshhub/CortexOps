/**
 * Service Controller
 * Handles service-related HTTP requests
 */

import { Request, Response } from 'express';
import * as serviceRepository from '../repositories/service.repository';
import { asyncHandler } from '../middleware/error.middleware';
import { logAudit } from '../common/logger';
import {
  createServiceSchema,
  updateServiceSchema,
  toServiceDTO,
  ServiceStatus,
  ServiceCategory,
  isValidStatusTransition,
} from '../models/service.model';
import { ValidationError, NotFoundError, AuthorizationError } from '../common/errors';
import { UserRole } from '../models/user.model';

/**
 * POST /services
 * Create a new service
 */
export const createService = asyncHandler(async (req: Request, res: Response) => {
  const providerId = req.user!.id;

  // Validate input
  const validated = createServiceSchema.parse(req.body);

  // Create service
  const service = await serviceRepository.create(providerId, validated);

  logAudit('service_created', providerId, 'service', service.id, {
    name: service.name,
    version: service.version,
  });

  res.status(201).json({
    success: true,
    data: { service: toServiceDTO(service) },
    message: 'Service created successfully',
  });
});

/**
 * GET /services/:id
 * Get service by ID
 */
export const getService = asyncHandler(async (req: Request, res: Response) => {
  const serviceId = req.params.id;

  const service = await serviceRepository.findById(serviceId);

  if (!service) {
    throw new NotFoundError('Service', serviceId);
  }

  res.status(200).json({
    success: true,
    data: { service: toServiceDTO(service) },
  });
});

/**
 * GET /services
 * Search/list services
 */
export const listServices = asyncHandler(async (req: Request, res: Response) => {
  const {
    query,
    category,
    tags,
    status,
    providerId,
    complianceLevel,
    minAvailability,
    maxLatency,
    pricingModel,
    limit,
    offset,
    sortBy,
    sortOrder,
  } = req.query;

  const searchParams = {
    query: query as string,
    category: category as ServiceCategory,
    tags: tags ? (Array.isArray(tags) ? tags : [tags]) as string[] : undefined,
    status: status as ServiceStatus,
    providerId: providerId as string,
    complianceLevel: complianceLevel as any,
    minAvailability: minAvailability ? parseFloat(minAvailability as string) : undefined,
    maxLatency: maxLatency ? parseInt(maxLatency as string, 10) : undefined,
    pricingModel: pricingModel as any,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
    sortBy: sortBy as any,
    sortOrder: sortOrder as any,
  };

  const result = await serviceRepository.search(searchParams);

  res.status(200).json({
    success: true,
    data: {
      services: result.services.map(toServiceDTO),
      total: result.total,
      limit: searchParams.limit || 20,
      offset: searchParams.offset || 0,
    },
  });
});

/**
 * PUT /services/:id
 * Update service
 */
export const updateService = asyncHandler(async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  // Get existing service
  const existingService = await serviceRepository.findById(serviceId);

  if (!existingService) {
    throw new NotFoundError('Service', serviceId);
  }

  // Check ownership (unless admin)
  if (userRole !== UserRole.ADMIN && existingService.provider.id !== userId) {
    throw new AuthorizationError('You can only update your own services');
  }

  // Validate input
  const validated = updateServiceSchema.parse(req.body);

  // Validate status transition if status is being updated
  if (validated.status && validated.status !== existingService.status) {
    if (!isValidStatusTransition(existingService.status, validated.status)) {
      throw new ValidationError(
        `Invalid status transition from ${existingService.status} to ${validated.status}`
      );
    }
  }

  // Update service
  const service = await serviceRepository.update(serviceId, validated);

  logAudit('service_updated', userId, 'service', serviceId, {
    changes: Object.keys(validated),
  });

  res.status(200).json({
    success: true,
    data: { service: toServiceDTO(service) },
    message: 'Service updated successfully',
  });
});

/**
 * DELETE /services/:id
 * Delete service (soft delete)
 */
export const deleteService = asyncHandler(async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  // Get existing service
  const existingService = await serviceRepository.findById(serviceId);

  if (!existingService) {
    throw new NotFoundError('Service', serviceId);
  }

  // Check ownership (unless admin)
  if (userRole !== UserRole.ADMIN && existingService.provider.id !== userId) {
    throw new AuthorizationError('You can only delete your own services');
  }

  // Delete service
  await serviceRepository.deleteService(serviceId);

  logAudit('service_deleted', userId, 'service', serviceId);

  res.status(200).json({
    success: true,
    message: 'Service deleted successfully',
  });
});

/**
 * GET /services/:name/versions
 * Get all versions of a service
 */
export const getServiceVersions = asyncHandler(async (req: Request, res: Response) => {
  const serviceName = req.params.name;

  const versions = await serviceRepository.findVersions(serviceName);

  res.status(200).json({
    success: true,
    data: {
      versions: versions.map(toServiceDTO),
      count: versions.length,
    },
  });
});

/**
 * GET /services/statistics
 * Get service statistics
 */
export const getStatistics = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await serviceRepository.getStatistics();

  res.status(200).json({
    success: true,
    data: stats,
  });
});

/**
 * GET /my-services
 * Get services for current user
 */
export const getMyServices = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const services = await serviceRepository.findByProviderId(userId);

  res.status(200).json({
    success: true,
    data: {
      services: services.map(toServiceDTO),
      count: services.length,
    },
  });
});

/**
 * PUT /services/:id/publish
 * Publish a service (change status to active)
 */
export const publishService = asyncHandler(async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  const userId = req.user!.id;

  // Get existing service
  const existingService = await serviceRepository.findById(serviceId);

  if (!existingService) {
    throw new NotFoundError('Service', serviceId);
  }

  // Update status to active
  const service = await serviceRepository.update(serviceId, {
    status: ServiceStatus.ACTIVE,
  });

  logAudit('service_published', userId, 'service', serviceId);

  res.status(200).json({
    success: true,
    data: { service: toServiceDTO(service) },
    message: 'Service published successfully',
  });
});

/**
 * PUT /services/:id/deprecate
 * Deprecate a service
 */
export const deprecateService = asyncHandler(async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  const userId = req.user!.id;

  const service = await serviceRepository.update(serviceId, {
    status: ServiceStatus.DEPRECATED,
  });

  logAudit('service_deprecated', userId, 'service', serviceId);

  res.status(200).json({
    success: true,
    data: { service: toServiceDTO(service) },
    message: 'Service deprecated successfully',
  });
});

/**
 * PUT /services/:id/suspend
 * Suspend a service
 */
export const suspendService = asyncHandler(async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  const userId = req.user!.id;
  const { reason } = req.body;

  const service = await serviceRepository.update(serviceId, {
    status: ServiceStatus.SUSPENDED,
    suspensionReason: reason,
  });

  logAudit('service_suspended', userId, 'service', serviceId, { reason });

  res.status(200).json({
    success: true,
    data: { service: toServiceDTO(service) },
    message: 'Service suspended successfully',
  });
});
