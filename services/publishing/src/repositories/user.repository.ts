/**
 * User Repository
 * Database access layer for user-related operations
 */

import { query, queryOne } from '../common/database';
import { User, UserRole, UserStatus, ApiKey } from '../models/user.model';
import { DatabaseError, NotFoundError } from '../common/errors';

/**
 * Create a new user
 */
export async function create(input: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}): Promise<User> {
  const sql = `
    INSERT INTO users (
      email, password_hash, first_name, last_name, role, status, email_verified
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await queryOne<User>(sql, [
    input.email,
    input.passwordHash,
    input.firstName,
    input.lastName,
    input.role || UserRole.CONSUMER,
    UserStatus.ACTIVE,
    false,
  ]);

  if (!result) {
    throw new DatabaseError('Failed to create user');
  }

  return mapUserRow(result);
}

/**
 * Find user by ID
 */
export async function findById(id: string): Promise<User | null> {
  const sql = 'SELECT * FROM users WHERE id = $1';
  const result = await queryOne<any>(sql, [id]);
  return result ? mapUserRow(result) : null;
}

/**
 * Find user by email
 */
export async function findByEmail(email: string): Promise<User | null> {
  const sql = 'SELECT * FROM users WHERE email = $1';
  const result = await queryOne<any>(sql, [email]);
  return result ? mapUserRow(result) : null;
}

/**
 * Update user last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  const sql = 'UPDATE users SET last_login_at = NOW() WHERE id = $1';
  await query(sql, [userId]);
}

/**
 * Update user
 */
export async function update(
  userId: string,
  input: {
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    status?: UserStatus;
  }
): Promise<User> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (input.firstName !== undefined) {
    updates.push(`first_name = $${paramCount++}`);
    values.push(input.firstName);
  }

  if (input.lastName !== undefined) {
    updates.push(`last_name = $${paramCount++}`);
    values.push(input.lastName);
  }

  if (input.role !== undefined) {
    updates.push(`role = $${paramCount++}`);
    values.push(input.role);
  }

  if (input.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(input.status);
  }

  if (updates.length === 0) {
    throw new DatabaseError('No fields to update');
  }

  values.push(userId);

  const sql = `
    UPDATE users
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await queryOne<any>(sql, values);

  if (!result) {
    throw new NotFoundError('User', userId);
  }

  return mapUserRow(result);
}

/**
 * Delete user (soft delete by setting status to inactive)
 */
export async function deleteUser(userId: string): Promise<void> {
  const sql = 'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2';
  await query(sql, [UserStatus.INACTIVE, userId]);
}

/**
 * Create API key for user
 */
export async function createApiKey(input: {
  userId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
}): Promise<ApiKey> {
  const sql = `
    INSERT INTO api_keys (
      user_id, key_hash, key_prefix, name, scopes, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const result = await queryOne<any>(sql, [
    input.userId,
    input.keyHash,
    input.keyPrefix,
    input.name,
    input.scopes,
    input.expiresAt,
  ]);

  if (!result) {
    throw new DatabaseError('Failed to create API key');
  }

  return mapApiKeyRow(result);
}

/**
 * Find API key by ID
 */
export async function findApiKeyById(id: string): Promise<ApiKey | null> {
  const sql = 'SELECT * FROM api_keys WHERE id = $1';
  const result = await queryOne<any>(sql, [id]);
  return result ? mapApiKeyRow(result) : null;
}

/**
 * Find API key by prefix
 */
export async function findApiKeyByPrefix(keyPrefix: string): Promise<ApiKey | null> {
  const sql = 'SELECT * FROM api_keys WHERE key_prefix = $1 AND revoked_at IS NULL';
  const result = await queryOne<any>(sql, [keyPrefix]);
  return result ? mapApiKeyRow(result) : null;
}

/**
 * Find all API keys for a user
 */
export async function findApiKeysByUserId(userId: string): Promise<ApiKey[]> {
  const sql = `
    SELECT * FROM api_keys
    WHERE user_id = $1 AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;
  const result = await query<any>(sql, [userId]);
  return result.rows.map(mapApiKeyRow);
}

/**
 * Update API key last used timestamp
 */
export async function updateApiKeyLastUsed(apiKeyId: string): Promise<void> {
  const sql = 'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1';
  await query(sql, [apiKeyId]);
}

/**
 * Revoke API key
 */
export async function revokeApiKey(apiKeyId: string): Promise<void> {
  const sql = 'UPDATE api_keys SET revoked_at = NOW() WHERE id = $1';
  await query(sql, [apiKeyId]);
}

/**
 * Map database row to User entity
 */
function mapUserRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    emailVerified: row.email_verified,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata,
  };
}

/**
 * Map database row to ApiKey entity
 */
function mapApiKeyRow(row: any): ApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    name: row.name,
    scopes: row.scopes,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}
