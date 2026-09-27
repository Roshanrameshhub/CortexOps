/**
 * Configuration Management Module
 * Centralizes all application configuration with validation and type safety
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  // Server configuration
  server: z.object({
    env: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    port: z.number().int().positive().default(3000),
    apiVersion: z.string().default('v1'),
    name: z.string().default('publishing-service'),
    version: z.string().default('1.0.0'),
  }),

  // Database configuration
  database: z.object({
    host: z.string(),
    port: z.number().int().positive().default(5432),
    name: z.string(),
    user: z.string(),
    password: z.string(),
    pool: z.object({
      min: z.number().int().nonnegative().default(2),
      max: z.number().int().positive().default(10),
      idleTimeoutMillis: z.number().int().positive().default(30000),
      connectionTimeoutMillis: z.number().int().positive().default(2000),
    }),
  }),

  // Redis configuration
  redis: z.object({
    host: z.string(),
    port: z.number().int().positive().default(6379),
    password: z.string().optional(),
    db: z.number().int().nonnegative().default(0),
    keyPrefix: z.string().default('llm-marketplace:'),
  }),

  // JWT configuration
  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('24h'),
    refreshExpiresIn: z.string().default('7d'),
    issuer: z.string().default('llm-marketplace'),
    audience: z.string().default('llm-marketplace-api'),
  }),

  // API Key configuration
  apiKey: z.object({
    prefix: z.string().default('llm_'),
    length: z.number().int().positive().default(32),
    expiresIn: z.number().int().positive().default(365), // days
  }),

  // OAuth2 configuration
  oauth2: z.object({
    enabled: z.boolean().default(false),
    issuer: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
  }),

  // Rate limiting configuration
  rateLimit: z.object({
    windowMs: z.number().int().positive().default(60000), // 1 minute
    maxRequests: z.number().int().positive().default(100),
  }),

  // External services configuration
  externalServices: z.object({
    registry: z.object({
      url: z.string().url(),
      timeout: z.number().int().positive().default(5000),
    }),
    policyEngine: z.object({
      grpcUrl: z.string(),
      timeout: z.number().int().positive().default(5000),
    }),
    analyticsHub: z.object({
      kafkaBrokers: z.string(),
      timeout: z.number().int().positive().default(5000),
    }),
    governanceDashboard: z.object({
      url: z.string().url(),
      timeout: z.number().int().positive().default(5000),
    }),
  }),

  // Logging configuration
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
  }),
});

/**
 * Load and validate configuration from environment variables
 */
function loadConfig() {
  const rawConfig = {
    server: {
      env: process.env.NODE_ENV,
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      apiVersion: process.env.API_VERSION,
      name: process.env.SERVICE_NAME,
      version: process.env.SERVICE_VERSION,
    },
    database: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      pool: {
        min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN, 10) : undefined,
        max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : undefined,
      },
    },
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    },
    apiKey: {
      prefix: process.env.API_KEY_PREFIX,
      length: process.env.API_KEY_LENGTH ? parseInt(process.env.API_KEY_LENGTH, 10) : undefined,
    },
    oauth2: {
      enabled: process.env.OAUTH2_ENABLED === 'true',
      issuer: process.env.OAUTH2_ISSUER,
      clientId: process.env.OAUTH2_CLIENT_ID,
      clientSecret: process.env.OAUTH2_CLIENT_SECRET,
    },
    rateLimit: {
      windowMs: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) : undefined,
      maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) : undefined,
    },
    externalServices: {
      registry: {
        url: process.env.REGISTRY_API_URL,
      },
      policyEngine: {
        grpcUrl: process.env.POLICY_ENGINE_GRPC_URL,
      },
      analyticsHub: {
        kafkaBrokers: process.env.ANALYTICS_HUB_KAFKA_BROKERS,
      },
      governanceDashboard: {
        url: process.env.GOVERNANCE_DASHBOARD_URL,
      },
    },
    logging: {
      level: process.env.LOG_LEVEL,
      format: process.env.LOG_FORMAT,
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid configuration. Please check your environment variables.');
    }
    throw error;
  }
}

/**
 * Type-safe configuration object
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Global configuration instance
 */
export const config: Config = loadConfig();

/**
 * Check if running in production environment
 */
export const isProduction = (): boolean => config.server.env === 'production';

/**
 * Check if running in development environment
 */
export const isDevelopment = (): boolean => config.server.env === 'development';

/**
 * Check if running in test environment
 */
export const isTest = (): boolean => config.server.env === 'test';
