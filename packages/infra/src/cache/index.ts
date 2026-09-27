/**
 * @llm-marketplace/infra - Cache Module
 *
 * Provides Redis-based caching utilities for LLM-Dev-Ops services.
 * Supports JSON serialization, TTL management, and pattern operations.
 */

import Redis from 'ioredis';
import { CacheError } from '../errors';
import { getLogger, InfraLogger } from '../logging';

/**
 * Cache configuration options
 */
export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  ttlMs?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

/**
 * Redis-based cache client for LLM-Dev-Ops services
 */
export class CacheClient {
  private redis: Redis;
  private keyPrefix: string;
  private logger: InfraLogger;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  constructor(config: CacheConfig, logger?: InfraLogger) {
    this.keyPrefix = config.keyPrefix ?? '';
    this.logger = logger ?? getLogger();

    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db ?? 0,
      keyPrefix: this.keyPrefix,
      maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
      connectTimeout: config.connectTimeoutMs ?? 5000,
      commandTimeout: config.commandTimeoutMs ?? 1000,
      enableReadyCheck: config.enableReadyCheck ?? true,
      lazyConnect: config.lazyConnect ?? false,
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
    });

    this.redis.on('error', (error) => {
      this.stats.errors++;
      this.logger.error('Redis connection error', error);
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected');
    });

    this.redis.on('ready', () => {
      this.logger.info('Redis ready');
    });
  }

  /**
   * Get the underlying Redis client
   */
  get client(): Redis {
    return this.redis;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 };
  }

  /**
   * Build prefixed key
   */
  private buildKey(key: string): string {
    return key; // keyPrefix is handled by ioredis
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    try {
      const data = await this.redis.get(this.buildKey(key));

      if (data === null) {
        this.stats.misses++;
        this.logger.logCache({
          operation: 'get',
          key,
          hit: false,
          durationMs: Date.now() - startTime,
        });
        return null;
      }

      this.stats.hits++;
      this.logger.logCache({
        operation: 'get',
        key,
        hit: true,
        durationMs: Date.now() - startTime,
      });

      return JSON.parse(data) as T;
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to get cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const startTime = Date.now();
    try {
      const serialized = JSON.stringify(value);

      if (ttlMs !== undefined && ttlMs > 0) {
        await this.redis.set(this.buildKey(key), serialized, 'PX', ttlMs);
      } else {
        await this.redis.set(this.buildKey(key), serialized);
      }

      this.stats.sets++;
      this.logger.logCache({
        operation: 'set',
        key,
        ttlMs,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to set cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.redis.del(this.buildKey(key));

      this.stats.deletes++;
      this.logger.logCache({
        operation: 'delete',
        key,
        durationMs: Date.now() - startTime,
      });

      return result > 0;
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to delete cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set TTL on an existing key
   */
  async expire(key: string, ttlMs: number): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.redis.pexpire(this.buildKey(key), ttlMs);

      this.logger.logCache({
        operation: 'expire',
        key,
        ttlMs,
        durationMs: Date.now() - startTime,
      });

      return result === 1;
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to set expire on cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.buildKey(key));
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to check existence of cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get remaining TTL of a key in milliseconds
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.pttl(this.buildKey(key));
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to get TTL of cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Delete keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);
      this.stats.deletes += result;
      return result;
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to delete pattern: ${pattern}`, {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Increment a counter
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(this.buildKey(key), amount);
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to increment cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Decrement a counter
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.decrby(this.buildKey(key), amount);
    } catch (error) {
      this.stats.errors++;
      throw new CacheError(`Failed to decrement cache key: ${key}`, {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set multiple values at once
   */
  async mset(entries: Array<{ key: string; value: unknown }>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      for (const { key, value } of entries) {
        pipeline.set(this.buildKey(key), JSON.stringify(value));
      }
      await pipeline.exec();
      this.stats.sets += entries.length;
    } catch (error) {
      this.stats.errors++;
      throw new CacheError('Failed to set multiple cache keys', {
        keys: entries.map((e) => e.key),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get multiple values at once
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    try {
      const values = await this.redis.mget(keys.map((k) => this.buildKey(k)));
      return values.map((v) => (v === null ? null : JSON.parse(v) as T));
    } catch (error) {
      this.stats.errors++;
      throw new CacheError('Failed to get multiple cache keys', {
        keys,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.logger.info('Redis connection closed');
  }
}

/**
 * Create a cache client from environment configuration
 */
export function createCacheClient(config?: Partial<CacheConfig>): CacheClient {
  const fullConfig: CacheConfig = {
    host: config?.host ?? process.env.REDIS_HOST ?? 'localhost',
    port: config?.port ?? parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: config?.password ?? process.env.REDIS_PASSWORD,
    db: config?.db ?? parseInt(process.env.REDIS_DB ?? '0', 10),
    keyPrefix: config?.keyPrefix ?? process.env.REDIS_KEY_PREFIX ?? '',
    connectTimeoutMs: config?.connectTimeoutMs ?? 5000,
    commandTimeoutMs: config?.commandTimeoutMs ?? 1000,
  };

  return new CacheClient(fullConfig);
}
