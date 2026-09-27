/**
 * Authentication Routes
 */

import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

/**
 * Public routes
 */
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refreshToken);

/**
 * Protected routes (require authentication)
 */
router.get('/me', authenticateJWT, authController.getProfile);
router.post('/api-keys', authenticateJWT, authController.createApiKey);
router.get('/api-keys', authenticateJWT, authController.listApiKeys);
router.delete('/api-keys/:id', authenticateJWT, authController.revokeApiKey);

export default router;
