/**
 * Service Routes
 */

import { Router } from 'express';
import * as serviceController from '../controllers/service.controller';
import { authenticate, requireRole, requirePermission } from '../middleware/auth.middleware';
import { UserRole } from '../models/user.model';

const router = Router();

/**
 * Public routes (with optional authentication)
 */
router.get('/', serviceController.listServices);
router.get('/statistics', serviceController.getStatistics);
router.get('/:id', serviceController.getService);
router.get('/:name/versions', serviceController.getServiceVersions);

/**
 * Protected routes (require authentication)
 */

// Get user's own services
router.get(
  '/my/services',
  authenticate,
  serviceController.getMyServices
);

// Create service (requires provider role)
router.post(
  '/',
  authenticate,
  requirePermission('service:create'),
  serviceController.createService
);

// Update service (requires ownership or admin)
router.put(
  '/:id',
  authenticate,
  requirePermission('service:update'),
  serviceController.updateService
);

// Delete service (requires ownership or admin)
router.delete(
  '/:id',
  authenticate,
  requirePermission('service:delete'),
  serviceController.deleteService
);

// Publish service
router.put(
  '/:id/publish',
  authenticate,
  requirePermission('service:publish'),
  serviceController.publishService
);

// Deprecate service
router.put(
  '/:id/deprecate',
  authenticate,
  requirePermission('service:update'),
  serviceController.deprecateService
);

// Suspend service (admin only)
router.put(
  '/:id/suspend',
  authenticate,
  requireRole(UserRole.ADMIN),
  serviceController.suspendService
);

export default router;
