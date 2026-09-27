import { createClient } from 'redis';
import { logger } from '../utils/logger';

const redisConfig = {
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB || '0', 10),
};

export const redisClient = createClient(redisConfig);

redisClient.on('connect', () => {
  logger.info('Redis connection established');
});

redisClient.on('error', (err) => {
  logger.error('Redis error', { error: err.message });
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

export async function initializeRedis(): Promise<void> {
  try {
    await redisClient.connect();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis', { error });
    throw error;
  }
}

export async function closeRedis(): Promise<void> {
  await redisClient.quit();
  logger.info('Redis connection closed');
}

// Cache helper functions
export async function cacheSet(
  key: string,
  value: string | object,
  expirationSeconds?: number
): Promise<void> {
  const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;

  if (expirationSeconds) {
    await redisClient.setEx(key, expirationSeconds, valueStr);
  } else {
    await redisClient.set(key, valueStr);
  }
}

export async function cacheGet<T = string>(key: string): Promise<T | null> {
  const value = await redisClient.get(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export async function cacheDelete(key: string): Promise<void> {
  await redisClient.del(key);
}

export async function cacheExists(key: string): Promise<boolean> {
  const result = await redisClient.exists(key);
  return result === 1;
}
