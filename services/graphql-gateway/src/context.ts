import { Request } from 'express';
import type Redis from 'ioredis';
import jwt from 'jsonwebtoken';

// Import data sources
import { PublishingAPI } from './datasources/PublishingAPI';
import { DiscoveryAPI } from './datasources/DiscoveryAPI';
import { ConsumptionAPI } from './datasources/ConsumptionAPI';
import { AdminAPI } from './datasources/AdminAPI';

// Import DataLoader instances
import { createDataLoaders } from './dataloaders';

/**
 * User information from JWT token
 */
export interface User {
  id: string;
  email: string;
  role: 'USER' | 'PROVIDER' | 'ADMIN' | 'SUPER_ADMIN';
  permissions?: string[];
}

/**
 * GraphQL context type
 */
export interface Context {
  user?: User;
  token?: string;
  req: Request;

  // Data sources
  dataSources: {
    publishingAPI: PublishingAPI;
    discoveryAPI: DiscoveryAPI;
    consumptionAPI: ConsumptionAPI;
    adminAPI: AdminAPI;
  };

  // DataLoaders for batching
  loaders: ReturnType<typeof createDataLoaders>;

  // Redis clients
  cache: Redis;
  pubsub: Redis;

  // Request metadata
  requestId: string;
  startTime: number;
}

/**
 * Extract user from JWT token
 */
function extractUser(token?: string): User | undefined {
  if (!token) return undefined;

  try {
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, '');

    // Verify and decode token
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(cleanToken, secret) as any;

    return {
      id: decoded.sub || decoded.userId,
      email: decoded.email,
      role: decoded.role || 'USER',
      permissions: decoded.permissions || [],
    };
  } catch (error) {
    // Invalid token - return undefined
    console.warn('Invalid token:', error instanceof Error ? error.message : 'Unknown error');
    return undefined;
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create GraphQL context for each request
 */
export async function createContext({
  req,
  cache,
  pubsub,
}: {
  req: Request;
  cache: Redis;
  pubsub: Redis;
}): Promise<Context> {
  // Extract authorization token
  const token = req.headers.authorization;
  const user = extractUser(token);

  // Create data sources with authentication
  const baseURL = process.env.API_BASE_URL || 'http://localhost:3000';

  const dataSources = {
    publishingAPI: new PublishingAPI({
      baseURL: `${baseURL}/publishing`,
      token,
    }),
    discoveryAPI: new DiscoveryAPI({
      baseURL: `${baseURL}/discovery`,
      token,
    }),
    consumptionAPI: new ConsumptionAPI({
      baseURL: `${baseURL}/consumption`,
      token,
    }),
    adminAPI: new AdminAPI({
      baseURL: `${baseURL}/admin`,
      token,
    }),
  };

  // Create DataLoaders
  const loaders = createDataLoaders(dataSources);

  // Create context
  const context: Context = {
    user,
    token,
    req,
    dataSources,
    loaders,
    cache,
    pubsub,
    requestId: generateRequestId(),
    startTime: Date.now(),
  };

  return context;
}

/**
 * Require authentication - throws error if user not authenticated
 */
export function requireAuth(context: Context): User {
  if (!context.user) {
    throw new Error('Authentication required');
  }
  return context.user;
}

/**
 * Require specific role - throws error if user doesn't have required role
 */
export function requireRole(context: Context, requiredRole: User['role']): User {
  const user = requireAuth(context);

  const roleHierarchy: Record<User['role'], number> = {
    USER: 1,
    PROVIDER: 2,
    ADMIN: 3,
    SUPER_ADMIN: 4,
  };

  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  if (userLevel < requiredLevel) {
    throw new Error(`Insufficient permissions. Required role: ${requiredRole}`);
  }

  return user;
}

/**
 * Check if user has permission
 */
export function hasPermission(context: Context, permission: string): boolean {
  if (!context.user) return false;

  // Super admins have all permissions
  if (context.user.role === 'SUPER_ADMIN') return true;

  return context.user.permissions?.includes(permission) || false;
}
