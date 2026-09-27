/**
 * @llm-marketplace/infra - Rate Limiting Module
 *
 * Provides distributed rate limiting using Redis for LLM-Dev-Ops services.
 * Supports token bucket and sliding window algorithms.
 */

import Redis from 'ioredis';
import { RateLimitError } from '../errors';
import { getLogger, InfraLogger } from '../logging';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Key prefix for Redis keys */
  keyPrefix?: string;
  /** Skip rate limiting for certain conditions */
  skip?: (identifier: string) => boolean;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterMs?: number;
}

/**
 * Token bucket configuration
 */
export interface TokenBucketConfig {
  /** Maximum tokens in bucket (burst capacity) */
  capacity: number;
  /** Tokens refilled per second */
  refillRate: number;
  /** Key prefix for Redis keys */
  keyPrefix?: string;
}

/**
 * Token bucket status
 */
export interface TokenBucketStatus {
  allowed: boolean;
  remaining: number;
  capacity: number;
  retryAfterMs?: number;
}

/**
 * Sliding window rate limiter using Redis
 */
export class SlidingWindowRateLimiter {
  private redis: Redis;
  private config: Required<RateLimitConfig>;
  private logger: InfraLogger;

  constructor(redis: Redis, config: RateLimitConfig, logger?: InfraLogger) {
    this.redis = redis;
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      keyPrefix: config.keyPrefix ?? 'ratelimit:sliding:',
      skip: config.skip ?? (() => false),
    };
    this.logger = logger ?? getLogger();
  }

  /**
   * Check and consume rate limit for an identifier
   */
  async check(identifier: string): Promise<RateLimitStatus> {
    // Skip check if configured
    if (this.config.skip(identifier)) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        limit: this.config.maxRequests,
        resetAt: new Date(Date.now() + this.config.windowMs),
      };
    }

    const key = `${this.config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Use a Redis transaction to atomically check and update
    const results = await this.redis
      .multi()
      // Remove entries outside the window
      .zremrangebyscore(key, '-inf', windowStart)
      // Count entries in the window
      .zcard(key)
      // Add current request
      .zadd(key, now, `${now}:${Math.random()}`)
      // Set expiry on the key
      .pexpire(key, this.config.windowMs)
      .exec();

    if (!results) {
      throw new Error('Redis transaction failed');
    }

    const currentCount = (results[1][1] as number) + 1; // +1 for the request we just added
    const allowed = currentCount <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - currentCount);
    const resetAt = new Date(now + this.config.windowMs);

    const status: RateLimitStatus = {
      allowed,
      remaining,
      limit: this.config.maxRequests,
      resetAt,
    };

    if (!allowed) {
      // Calculate retry after based on oldest entry in window
      const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      if (oldestEntry.length >= 2) {
        const oldestTimestamp = parseInt(oldestEntry[1], 10);
        status.retryAfterMs = Math.max(0, oldestTimestamp + this.config.windowMs - now);
      }

      this.logger.warn(`Rate limit exceeded for ${identifier}`, {
        identifier,
        currentCount,
        limit: this.config.maxRequests,
      });
    }

    return status;
  }

  /**
   * Get current status without consuming
   */
  async getStatus(identifier: string): Promise<RateLimitStatus> {
    const key = `${this.config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    const currentCount = await this.redis.zcard(key);

    return {
      allowed: currentCount < this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - currentCount),
      limit: this.config.maxRequests,
      resetAt: new Date(now + this.config.windowMs),
    };
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `${this.config.keyPrefix}${identifier}`;
    await this.redis.del(key);
    this.logger.info(`Rate limit reset for ${identifier}`);
  }
}

/**
 * Token bucket rate limiter using Redis with Lua script
 */
export class TokenBucketRateLimiter {
  private redis: Redis;
  private config: Required<TokenBucketConfig>;
  private logger: InfraLogger;

  // Lua script for atomic token bucket operations
  private static readonly LUA_SCRIPT = `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local requested = tonumber(ARGV[4])

    local bucket = redis.call('HMGET', key, 'tokens', 'lastUpdate')
    local tokens = tonumber(bucket[1])
    local lastUpdate = tonumber(bucket[2])

    if tokens == nil then
      tokens = capacity
      lastUpdate = now
    end

    -- Calculate tokens to add based on time passed
    local delta = math.max(0, now - lastUpdate)
    local tokensToAdd = delta / 1000 * refillRate
    tokens = math.min(capacity, tokens + tokensToAdd)

    local allowed = 0
    local retryAfter = 0

    if tokens >= requested then
      tokens = tokens - requested
      allowed = 1
    else
      retryAfter = math.ceil((requested - tokens) / refillRate * 1000)
    end

    redis.call('HSET', key, 'tokens', tokens, 'lastUpdate', now)
    redis.call('PEXPIRE', key, 3600000)

    return {allowed, math.floor(tokens), retryAfter}
  `;

  constructor(redis: Redis, config: TokenBucketConfig, logger?: InfraLogger) {
    this.redis = redis;
    this.config = {
      capacity: config.capacity,
      refillRate: config.refillRate,
      keyPrefix: config.keyPrefix ?? 'ratelimit:bucket:',
    };
    this.logger = logger ?? getLogger();
  }

  /**
   * Check and consume tokens from the bucket
   */
  async consume(identifier: string, tokens: number = 1): Promise<TokenBucketStatus> {
    const key = `${this.config.keyPrefix}${identifier}`;
    const now = Date.now();

    const result = (await this.redis.eval(
      TokenBucketRateLimiter.LUA_SCRIPT,
      1,
      key,
      this.config.capacity,
      this.config.refillRate,
      now,
      tokens
    )) as [number, number, number];

    const [allowed, remaining, retryAfterMs] = result;

    const status: TokenBucketStatus = {
      allowed: allowed === 1,
      remaining,
      capacity: this.config.capacity,
    };

    if (!status.allowed) {
      status.retryAfterMs = retryAfterMs;
      this.logger.warn(`Token bucket exhausted for ${identifier}`, {
        identifier,
        remaining,
        requested: tokens,
      });
    }

    return status;
  }

  /**
   * Get current bucket status without consuming
   */
  async getStatus(identifier: string): Promise<TokenBucketStatus> {
    const key = `${this.config.keyPrefix}${identifier}`;
    const now = Date.now();

    const bucket = await this.redis.hmget(key, 'tokens', 'lastUpdate');
    let tokens = bucket[0] ? parseFloat(bucket[0]) : this.config.capacity;
    const lastUpdate = bucket[1] ? parseInt(bucket[1], 10) : now;

    // Calculate current tokens
    const delta = Math.max(0, now - lastUpdate);
    const tokensToAdd = (delta / 1000) * this.config.refillRate;
    tokens = Math.min(this.config.capacity, tokens + tokensToAdd);

    return {
      allowed: tokens >= 1,
      remaining: Math.floor(tokens),
      capacity: this.config.capacity,
    };
  }

  /**
   * Reset bucket for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `${this.config.keyPrefix}${identifier}`;
    await this.redis.del(key);
    this.logger.info(`Token bucket reset for ${identifier}`);
  }
}

/**
 * Create a rate limit middleware function for Express/Fastify
 */
export function createRateLimitMiddleware(
  limiter: SlidingWindowRateLimiter | TokenBucketRateLimiter,
  options?: {
    identifierFn?: (req: unknown) => string;
    onLimitReached?: (identifier: string, status: RateLimitStatus | TokenBucketStatus) => void;
  }
): (req: unknown, res: unknown, next: () => void) => Promise<void> {
  const getIdentifier = options?.identifierFn ?? ((req: unknown) => {
    const r = req as { ip?: string; headers?: { 'x-forwarded-for'?: string } };
    return r.ip ?? r.headers?.['x-forwarded-for'] ?? 'unknown';
  });

  return async (req: unknown, res: unknown, next: () => void) => {
    const identifier = getIdentifier(req);

    try {
      let status: RateLimitStatus | TokenBucketStatus;

      if (limiter instanceof SlidingWindowRateLimiter) {
        status = await limiter.check(identifier);
      } else {
        status = await limiter.consume(identifier);
      }

      // Set rate limit headers
      const r = res as {
        setHeader?: (name: string, value: string | number) => void;
        set?: (name: string, value: string | number) => void;
      };
      const setHeader = r.setHeader ?? r.set;
      if (setHeader) {
        if ('limit' in status) {
          setHeader.call(r, 'X-RateLimit-Limit', status.limit);
          setHeader.call(r, 'X-RateLimit-Remaining', status.remaining);
          setHeader.call(r, 'X-RateLimit-Reset', Math.floor(status.resetAt.getTime() / 1000));
        } else {
          setHeader.call(r, 'X-RateLimit-Limit', status.capacity);
          setHeader.call(r, 'X-RateLimit-Remaining', status.remaining);
        }
      }

      if (!status.allowed) {
        options?.onLimitReached?.(identifier, status);
        throw new RateLimitError(
          'Rate limit exceeded',
          status.retryAfterMs ? Math.ceil(status.retryAfterMs / 1000) : undefined
        );
      }

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      // Log error but don't block request (fail-open)
      getLogger().error('Rate limit check failed', error);
      next();
    }
  };
}
