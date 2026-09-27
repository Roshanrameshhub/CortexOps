/**
 * Authentication Controller
 * Handles authentication-related HTTP requests
 */

import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { asyncHandler } from '../middleware/error.middleware';

/**
 * POST /auth/register
 * Register a new user
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, role } = req.body;

  const user = await authService.register({
    email,
    password,
    firstName,
    lastName,
    role,
  });

  res.status(201).json({
    success: true,
    data: { user },
    message: 'User registered successfully',
  });
});

/**
 * POST /auth/login
 * Login with email and password
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  const authResponse = await authService.login(email, password, ipAddress, userAgent);

  res.status(200).json({
    success: true,
    data: authResponse,
    message: 'Login successful',
  });
});

/**
 * POST /auth/logout
 * Logout (invalidate refresh token)
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  await authService.logout(refreshToken);

  res.status(200).json({
    success: true,
    message: 'Logout successful',
  });
});

/**
 * POST /auth/refresh
 * Refresh access token
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const tokens = await authService.refreshAccessToken(refreshToken);

  res.status(200).json({
    success: true,
    data: tokens,
    message: 'Token refreshed successfully',
  });
});

/**
 * GET /auth/me
 * Get current user profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: { user: req.user },
  });
});

/**
 * POST /auth/api-keys
 * Create API key
 */
export const createApiKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, scopes, expiresInDays } = req.body;

  const result = await authService.createApiKey(userId, {
    name,
    scopes,
    expiresInDays,
  });

  res.status(201).json({
    success: true,
    data: result,
    message: 'API key created successfully. Save the key securely - it will not be shown again.',
  });
});

/**
 * GET /auth/api-keys
 * List user's API keys
 */
export const listApiKeys = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const apiKeys = await authService.listApiKeys(userId);

  res.status(200).json({
    success: true,
    data: { apiKeys },
  });
});

/**
 * DELETE /auth/api-keys/:id
 * Revoke API key
 */
export const revokeApiKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const apiKeyId = req.params.id;

  await authService.revokeApiKey(userId, apiKeyId);

  res.status(200).json({
    success: true,
    message: 'API key revoked successfully',
  });
});
