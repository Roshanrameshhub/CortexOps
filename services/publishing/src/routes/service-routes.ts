import { Router } from 'express';
import { ServiceController } from '../controllers/service-controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth-middleware';

const router = Router();
const serviceController = new ServiceController();

/**
 * Service Publishing Routes
 */

// POST /api/v1/services - Publish new service
router.post(
  '/',
  authenticateToken,
  authorizeRoles('provider', 'admin'),
  (req, res) => serviceController.publishService(req, res)
);

// GET /api/v1/services/:id - Get service details
router.get(
  '/:id',
  (req, res) => serviceController.getService(req, res)
);

// PUT /api/v1/services/:id - Update service
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('provider', 'admin'),
  (req, res) => serviceController.updateService(req, res)
);

// POST /api/v1/services/:id/versions - Create new version
router.post(
  '/:id/versions',
  authenticateToken,
  authorizeRoles('provider', 'admin'),
  (req, res) => serviceController.createVersion(req, res)
);

// DELETE /api/v1/services/:id - Deprecate service
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('provider', 'admin'),
  (req, res) => serviceController.deprecateService(req, res)
);

// GET /api/v1/services/:id/status - Check publishing status
router.get(
  '/:id/status',
  authenticateToken,
  (req, res) => serviceController.getPublishingStatus(req, res)
);

export default router;
