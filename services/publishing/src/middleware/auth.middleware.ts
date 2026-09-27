/**
 * Authentication Middleware
 * Handles JWT and API key authentication, RBAC authorization
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError } from '../common/errors';
import * as authService from '../services/auth.service';
import { UserRole, JWTPayload } from '../models/user.model';

/**
 * Extend Express Request to include user information
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
      apiKey?: {
        userId: string;
        scopes: string[];
      };
    }
  }
}

/**
 * Extract token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;

  if (scheme.toLowerCase() === 'bearer') {
    return token;
  }

  return null;
}

/**
 * Extract API key from header or query parameter
 */
function extractApiKey(req: Request): string | null {
  // Check X-API-Key header
  const headerKey = req.headers['x-api-key'] as string;
  if (headerKey) {
    return headerKey;
  }

  // Check query parameter (less secure, for convenience)
  const queryKey = req.query.api_key as string;
  if (queryKey) {
    return queryKey;
  }

  return null;
}

/**
 * Authenticate request using JWT
 */
export async function authenticateJWT(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    const payload: JWTPayload = await authService.verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authenticate request using API key
 */
export async function authenticateApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw new AuthenticationError('No API key provided');
    }

    const { userId, scopes } = await authService.verifyApiKey(apiKey);

    req.apiKey = {
      userId,
      scopes,
    };

    // Also set user for consistency
    req.user = {
      id: userId,
      email: '', // Not available from API key
      role: UserRole.CONSUMER, // Default role for API key users
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authenticate using either JWT or API key
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try JWT first
    const token = extractToken(req);
    if (token) {
      const payload: JWTPayload = await authService.verifyAccessToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      return next();
    }

    // Try API key
    const apiKey = extractApiKey(req);
    if (apiKey) {
      const { userId, scopes } = await authService.verifyApiKey(apiKey);
      req.apiKey = {
        userId,
        scopes,
      };
      req.user = {
        id: userId,
        email: '',
        role: UserRole.CONSUMER,
      };
      return next();
    }

    throw new AuthenticationError('No valid authentication credentials provided');
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication (don't fail if not authenticated)
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authenticate(req, res, (err?: any) => {
      // Ignore authentication errors
      if (err && (err instanceof AuthenticationError)) {
        return next();
      }
      if (err) {
        return next(err);
      }
      next();
    });
  } catch (error) {
    // Ignore errors and continue
    next();
  }
}

/**
 * Require specific role (middleware factory)
 */
export function requireRole(requiredRole: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    // Check role hierarchy
    const roleHierarchy: Record<UserRole, number> = {
      [UserRole.ADMIN]: 4,
      [UserRole.PROVIDER]: 3,
      [UserRole.CONSUMER]: 2,
      [UserRole.VIEWER]: 1,
    };
    const userRoleLevel = roleHierarchy[req.user.role as UserRole];
    const requiredRoleLevel = roleHierarchy[requiredRole];
    const hasRequiredRole = userRoleLevel >= requiredRoleLevel;

    if (!hasRequiredRole) {
      return next(
        new AuthorizationError(
          `Requires ${requiredRole} role or higher. Current role: ${req.user.role}`
        )
      );
    }

    next();
  };
}

/**
 * Require specific permission (middleware factory)
 */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    // Check API key scopes first
    if (req.apiKey && req.apiKey.scopes.includes(permission)) {
      return next();
    }

    // Check role-based permissions
    const permissions: Record<UserRole, string[]> = {
      [UserRole.ADMIN]: ['*'], // All permissions
      [UserRole.PROVIDER]: [
        'service:create',
        'service:read',
        'service:update',
        'service:delete',
        'service:publish',
      ],
      [UserRole.CONSUMER]: ['service:read', 'service:consume'],
      [UserRole.VIEWER]: ['service:read'],
    };
    const userPermissions = permissions[req.user.role as UserRole] || [];
    const hasPermission = userPermissions.includes('*') || userPermissions.includes(permission);

    if (!hasPermission) {
      return next(
        new AuthorizationError(
          `Insufficient permissions. Required: ${permission}`
        )
      );
    }

    next();
  };
}

/**
 * Require resource ownership (user can only access their own resources)
 */
export function requireOwnership(getUserIdFromRequest: (req: Request) => string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    // Admins can access any resource
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }

    const resourceUserId = getUserIdFromRequest(req);

    if (resourceUserId !== req.user.id) {
      return next(
        new AuthorizationError('You can only access your own resources')
      );
    }

    next();
  };
}

/**
 * Rate limiting check (using user ID)
 */
export async function checkRateLimit(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next();
    }

    // const identifier = req.user.id;
    // Rate limiting logic would go here
    // For now, just pass through

    next();
  } catch (error) {
    next(error);
  }
}
