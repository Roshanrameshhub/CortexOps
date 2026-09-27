/**
 * Authentication Service
 * Handles user authentication, registration, JWT generation, and API key management
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { config } from '../config';
import { logger, logAuth, logAudit } from '../common/logger';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '../common/errors';
import { setSession } from '../common/redis';
import {
  User,
  UserRole,
  UserStatus,
  UserDTO,
  ApiKeyDTO,
  JWTPayload,
  AuthResponse,
  toUserDTO,
  toApiKeyDTO,
  createUserSchema,
  loginSchema,
  createApiKeySchema,
} from '../models/user.model';
import * as userRepository from '../repositories/user.repository';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Register a new user
 */
export async function register(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}): Promise<UserDTO> {
  // Validate input
  const validated = createUserSchema.parse(input);

  // Check if user already exists
  const existingUser = await userRepository.findByEmail(validated.email);
  if (existingUser) {
    throw new ConflictError('User with this email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(validated.password, BCRYPT_ROUNDS);

  // Create user
  const user = await userRepository.create({
    email: validated.email,
    passwordHash,
    firstName: validated.firstName,
    lastName: validated.lastName,
    role: validated.role,
  });

  logAuth('register', user.id, true);
  logAudit('user_registered', user.id, 'user', user.id, { email: user.email });

  return toUserDTO(user);
}

/**
 * Authenticate user with email and password
 */
export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResponse> {
  // Validate input
  const validated = loginSchema.parse({ email, password });

  // Find user
  const user = await userRepository.findByEmail(validated.email);
  if (!user) {
    logAuth('login', undefined, false);
    throw new AuthenticationError('Invalid email or password');
  }

  // Check user status
  if (user.status !== UserStatus.ACTIVE) {
    logAuth('login', user.id, false);
    throw new AuthenticationError(`Account is ${user.status}`);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(validated.password, user.passwordHash);
  if (!isPasswordValid) {
    logAuth('login', user.id, false);
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last login
  await userRepository.updateLastLogin(user.id);

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store session
  const sessionId = uuidv4();
  await setSession(
    sessionId,
    {
      userId: user.id,
      refreshToken,
      ipAddress,
      userAgent,
      createdAt: new Date().toISOString(),
    },
    SESSION_TTL
  );

  logAuth('login', user.id, true);
  logAudit('user_login', user.id, 'user', user.id, { ipAddress, userAgent });

  return {
    user: toUserDTO(user),
    accessToken,
    refreshToken,
    expiresIn: parseExpiration(config.jwt.expiresIn),
  };
}

/**
 * Logout user by invalidating session
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = jwt.verify(refreshToken, config.jwt.secret) as JWTPayload;

    if (payload.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    // Find and delete session
    // Note: In a real implementation, you'd maintain a mapping of tokens to sessions
    // For simplicity, we're just logging the logout
    logAuth('logout', payload.sub, true);
    logAudit('user_logout', payload.sub, 'user', payload.sub);
  } catch (error) {
    logger.warn('Logout with invalid token', { error });
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  try {
    const payload = jwt.verify(refreshToken, config.jwt.secret) as JWTPayload;

    if (payload.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    // Get user
    const user = await userRepository.findById(payload.sub);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AuthenticationError(`Account is ${user.status}`);
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    logAuth('token_refresh', user.id, true);

    return {
      accessToken,
      expiresIn: parseExpiration(config.jwt.expiresIn),
    };
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }
    throw error;
  }
}

/**
 * Verify and decode access token
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JWTPayload;

    if (payload.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid or expired access token');
    }
    throw error;
  }
}

/**
 * Generate access token
 */
function generateAccessToken(user: User): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  } as jwt.SignOptions);
}

/**
 * Generate refresh token
 */
function generateRefreshToken(user: User): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  } as jwt.SignOptions);
}

/**
 * Parse expiration string to seconds
 */
function parseExpiration(exp: string): number {
  const units: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  const match = exp.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 3600; // Default 1 hour
  }

  const [, value, unit] = match;
  return parseInt(value, 10) * (units[unit] || 1);
}

/**
 * Create API key for user
 */
export async function createApiKey(
  userId: string,
  input: {
    name: string;
    scopes: string[];
    expiresInDays?: number;
  }
): Promise<{ apiKey: ApiKeyDTO; key: string }> {
  // Validate input
  const validated = createApiKeySchema.parse(input);

  // Generate API key
  const key = `${config.apiKey.prefix}${crypto.randomBytes(config.apiKey.length).toString('hex')}`;
  const keyHash = await bcrypt.hash(key, BCRYPT_ROUNDS);
  const keyPrefix = key.substring(0, config.apiKey.prefix.length + 8);

  // Calculate expiration
  const expiresAt = validated.expiresInDays
    ? new Date(Date.now() + validated.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // Create API key record
  const apiKey = await userRepository.createApiKey({
    userId,
    keyHash,
    keyPrefix,
    name: validated.name,
    scopes: validated.scopes,
    expiresAt,
  });

  logAudit('api_key_created', userId, 'api_key', apiKey.id, {
    name: apiKey.name,
    scopes: apiKey.scopes,
  });

  return {
    apiKey: toApiKeyDTO(apiKey),
    key, // Return the actual key only once
  };
}

/**
 * Verify API key
 */
export async function verifyApiKey(key: string): Promise<{ userId: string; scopes: string[] }> {
  const keyPrefix = key.substring(0, config.apiKey.prefix.length + 8);

  // Find API key by prefix
  const apiKey = await userRepository.findApiKeyByPrefix(keyPrefix);
  if (!apiKey) {
    throw new AuthenticationError('Invalid API key');
  }

  // Check if revoked
  if (apiKey.revokedAt) {
    throw new AuthenticationError('API key has been revoked');
  }

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw new AuthenticationError('API key has expired');
  }

  // Verify key hash
  const isValid = await bcrypt.compare(key, apiKey.keyHash);
  if (!isValid) {
    throw new AuthenticationError('Invalid API key');
  }

  // Update last used timestamp
  await userRepository.updateApiKeyLastUsed(apiKey.id);

  return {
    userId: apiKey.userId,
    scopes: apiKey.scopes,
  };
}

/**
 * List API keys for user
 */
export async function listApiKeys(userId: string): Promise<ApiKeyDTO[]> {
  const apiKeys = await userRepository.findApiKeysByUserId(userId);
  return apiKeys.map(toApiKeyDTO);
}

/**
 * Revoke API key
 */
export async function revokeApiKey(userId: string, apiKeyId: string): Promise<void> {
  const apiKey = await userRepository.findApiKeyById(apiKeyId);

  if (!apiKey) {
    throw new NotFoundError('API key', apiKeyId);
  }

  if (apiKey.userId !== userId) {
    throw new AuthorizationError('You do not have permission to revoke this API key');
  }

  await userRepository.revokeApiKey(apiKeyId);

  logAudit('api_key_revoked', userId, 'api_key', apiKeyId);
}

/**
 * Check if user has required role
 */
export function hasRole(user: User | UserDTO, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.ADMIN]: 4,
    [UserRole.PROVIDER]: 3,
    [UserRole.CONSUMER]: 2,
    [UserRole.VIEWER]: 1,
  };

  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
}

/**
 * Check if user has required permission
 */
export function hasPermission(userRole: UserRole, requiredPermission: string): boolean {
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

  const userPermissions = permissions[userRole] || [];

  return userPermissions.includes('*') || userPermissions.includes(requiredPermission);
}
