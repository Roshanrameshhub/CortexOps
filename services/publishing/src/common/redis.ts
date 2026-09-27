/**
 * Redis Client Module
 * Provides Redis connection with automatic reconnection and helper methods
 */

import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from './logger';
import { CacheError } from './errors';

/**
 * Redis client instance
 */
let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<void> {
  if (redisClient) {
    logger.warn('Redis client already initialized');
    return;
  }

  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
    database: config.redis.db,
  });

  // Error handling
  redisClient.on('error', (err: Error) => {
    logger.error('Redis client error', { error: err.message, stack: err.stack });
  });

  // Connection events
  redisClient.on('connect', () => {
    logger.debug('Redis client connecting');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready', {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
    });
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis client reconnecting');
  });

  redisClient.on('end', () => {
    logger.info('Redis client connection closed');
  });

  try {
    await redisClient.connect();
    logger.info('Redis client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis client', { error });
    throw new CacheError('Redis connection failed', error as Error);
  }
}

/**
 * Get Redis client instance
 * @throws {CacheError} If client is not initialized
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new CacheError('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

/**
 * Generate cache key with prefix
 */
function getCacheKey(key: string): string {
  return `${config.redis.keyPrefix}${key}`;
}

/**
 * Set a value in cache with optional TTL
 */
export async function setCache(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  const client = getRedisClient();
  const cacheKey = getCacheKey(key);

  try {
    if (ttlSeconds) {
      await client.setEx(cacheKey, ttlSeconds, value);
    } else {
      await client.set(cacheKey, value);
    }
    logger.debug('Cache set', { key: cacheKey, ttl: ttlSeconds });
  } catch (error) {
    logger.error('Failed to set cache', { key: cacheKey, error });
    throw new CacheError('Cache set operation failed', error as Error);
  }
}

/**
 * Set a JSON object in cache
 */
export async function setCacheJSON<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const serialized = JSON.stringify(value);
  await setCache(key, serialized, ttlSeconds);
}

/**
 * Get a value from cache
 */
export async function getCache(key: string): Promise<string | null> {
  const client = getRedisClient();
  const cacheKey = getCacheKey(key);

  try {
    const value = await client.get(cacheKey);
    logger.debug('Cache get', { key: cacheKey, hit: value !== null });
    return value;
  } catch (error) {
    logger.error('Failed to get cache', { key: cacheKey, error });
    throw new CacheError('Cache get operation failed', error as Error);
  }
}

/**
 * Get a JSON object from cache
 */
export async function getCacheJSON<T>(key: string): Promise<T | null> {
  const value = await getCache(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error('Failed to parse cached JSON', { key, error });
    return null;
  }
}

/**
 * Delete a key from cache
 */
export async function deleteCache(key: string): Promise<void> {
  const client = getRedisClient();
  const cacheKey = getCacheKey(key);

  try {
    await client.del(cacheKey);
    logger.debug('Cache deleted', { key: cacheKey });
  } catch (error) {
    logger.error('Failed to delete cache', { key: cacheKey, error });
    throw new CacheError('Cache delete operation failed', error as Error);
  }
}

/**
 * Check if a key exists in cache
 */
export async function existsCache(key: string): Promise<boolean> {
  const client = getRedisClient();
  const cacheKey = getCacheKey(key);

  try {
    const exists = await client.exists(cacheKey);
    return exists === 1;
  } catch (error) {
    logger.error('Failed to check cache existence', { key: cacheKey, error });
    throw new CacheError('Cache exists operation failed', error as Error);
  }
}

/**
 * Increment a counter in cache
 */
export async function incrementCache(key: string, amount: number = 1): Promise<number> {
  const client = getRedisClient();
  const cacheKey = getCacheKey(key);

  try {
    const result = await client.incrBy(cacheKey, amount);
    logger.debug('Cache incremented', { key: cacheKey, amount, result });
    return result;
  } catch (error) {
    logger.error('Failed to increment cache', { key: cacheKey, error });
    throw new CacheError('Cache increment operation failed', error as Error);
  }
}

/**
 * Set expiration on a key
 */
export async function expireCache(key: string, ttlSeconds: number): Promise<void> {
  const client = getRedisClient();
  const cacheKey = getCacheKey(key);

  try {
    await client.expire(cacheKey, ttlSeconds);
    logger.debug('Cache expiration set', { key: cacheKey, ttl: ttlSeconds });
  } catch (error) {
    logger.error('Failed to set cache expiration', { key: cacheKey, error });
    throw new CacheError('Cache expire operation failed', error as Error);
  }
}

/**
 * Get multiple values from cache
 */
export async function getCacheMultiple(keys: string[]): Promise<(string | null)[]> {
  const client = getRedisClient();
  const cacheKeys = keys.map(getCacheKey);

  try {
    const values = await client.mGet(cacheKeys);
    logger.debug('Cache multi-get', { count: keys.length });
    return values;
  } catch (error) {
    logger.error('Failed to get multiple cache values', { keys, error });
    throw new CacheError('Cache multi-get operation failed', error as Error);
  }
}

/**
 * Delete all keys matching a pattern
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  const cachePattern = getCacheKey(pattern);

  try {
    const keys = await client.keys(cachePattern);
    if (keys.length === 0) return 0;

    const deleted = await client.del(keys);
    logger.debug('Cache pattern deleted', { pattern: cachePattern, deleted });
    return deleted;
  } catch (error) {
    logger.error('Failed to delete cache pattern', { pattern: cachePattern, error });
    throw new CacheError('Cache pattern delete operation failed', error as Error);
  }
}

/**
 * Check Redis health
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', { error });
    return false;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}

/**
 * Rate limiting helper using Redis
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const client = getRedisClient();
  const key = getCacheKey(`ratelimit:${identifier}`);

  try {
    const current = await client.incr(key);

    // Set expiration on first request
    if (current === 1) {
      await client.expire(key, windowSeconds);
    }

    const ttl = await client.ttl(key);
    const resetAt = new Date(Date.now() + ttl * 1000);

    return {
      allowed: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
      resetAt,
    };
  } catch (error) {
    logger.error('Rate limit check failed', { identifier, error });
    // Fail open on error
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }
}

/**
 * Session management helper
 */
export async function setSession(
  sessionId: string,
  data: Record<string, any>,
  ttlSeconds: number = 86400
): Promise<void> {
  await setCacheJSON(`session:${sessionId}`, data, ttlSeconds);
}

/**
 * Get session data
 */
export async function getSession(sessionId: string): Promise<Record<string, any> | null> {
  return getCacheJSON<Record<string, any>>(`session:${sessionId}`);
}

/**
 * Delete session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await deleteCache(`session:${sessionId}`);
}
