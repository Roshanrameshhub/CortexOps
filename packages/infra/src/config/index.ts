/**
 * @llm-marketplace/infra - Configuration Module
 *
 * Provides type-safe configuration loading and validation for LLM-Dev-Ops services.
 * Supports environment variables, defaults, and Zod schema validation.
 */

import { z, ZodSchema, ZodError } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Configuration validation error
 */
export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodIssue[] = []
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Base configuration schema for all LLM-Dev-Ops services
 */
export const BaseConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  serviceName: z.string().min(1),
  serviceVersion: z.string().default('1.0.0'),
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;

/**
 * Database configuration schema
 */
export const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().positive().default(5432),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  ssl: z.coerce.boolean().default(false),
  poolMin: z.coerce.number().int().nonnegative().default(2),
  poolMax: z.coerce.number().int().positive().default(20),
  idleTimeoutMs: z.coerce.number().int().positive().default(30000),
  connectionTimeoutMs: z.coerce.number().int().positive().default(5000),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * Redis configuration schema
 */
export const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().positive().default(6379),
  password: z.string().optional(),
  db: z.coerce.number().int().nonnegative().default(0),
  keyPrefix: z.string().default(''),
  maxRetriesPerRequest: z.coerce.number().int().nonnegative().default(3),
  connectTimeoutMs: z.coerce.number().int().positive().default(5000),
  commandTimeoutMs: z.coerce.number().int().positive().default(1000),
});

export type RedisConfig = z.infer<typeof RedisConfigSchema>;

/**
 * Telemetry configuration schema
 */
export const TelemetryConfigSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  serviceName: z.string().min(1),
  jaegerEndpoint: z.string().url().optional(),
  sampleRate: z.coerce.number().min(0).max(1).default(1.0),
  exportIntervalMs: z.coerce.number().int().positive().default(5000),
});

export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

/**
 * LLM-Dev-Ops upstream services configuration
 */
export const UpstreamServicesConfigSchema = z.object({
  registryUrl: z.string().url().default('http://localhost:8081'),
  registryTimeoutMs: z.coerce.number().int().positive().default(500),
  shieldUrl: z.string().url().default('http://localhost:8082'),
  shieldTimeoutMs: z.coerce.number().int().positive().default(200),
  policyEngineUrl: z.string().url().default('http://localhost:8080'),
  policyEngineTimeoutMs: z.coerce.number().int().positive().default(300),
});

export type UpstreamServicesConfig = z.infer<typeof UpstreamServicesConfigSchema>;

/**
 * Load and validate configuration from environment variables
 *
 * @param schema - Zod schema to validate against
 * @param envMapping - Mapping of config keys to environment variable names
 * @returns Validated configuration object
 * @throws ConfigurationError if validation fails
 */
export function loadConfig<T extends ZodSchema>(
  schema: T,
  envMapping: Record<string, string>
): z.infer<T> {
  const configData: Record<string, unknown> = {};

  for (const [configKey, envVar] of Object.entries(envMapping)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      configData[configKey] = value;
    }
  }

  try {
    return schema.parse(configData);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new ConfigurationError(`Configuration validation failed: ${message}`, error.errors);
    }
    throw error;
  }
}

/**
 * Load base configuration from standard environment variables
 */
export function loadBaseConfig(_serviceName: string): BaseConfig {
  return loadConfig(BaseConfigSchema, {
    nodeEnv: 'NODE_ENV',
    serviceName: 'SERVICE_NAME',
    serviceVersion: 'SERVICE_VERSION',
    port: 'PORT',
    host: 'HOST',
    logLevel: 'LOG_LEVEL',
  });
}

/**
 * Load database configuration from standard environment variables
 */
export function loadDatabaseConfig(): DatabaseConfig {
  // Support DATABASE_URL format
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    return DatabaseConfigSchema.parse({
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      username: url.username,
      password: url.password,
      ssl: url.searchParams.get('ssl') === 'true',
    });
  }

  return loadConfig(DatabaseConfigSchema, {
    host: 'DB_HOST',
    port: 'DB_PORT',
    database: 'DB_NAME',
    username: 'DB_USER',
    password: 'DB_PASSWORD',
    ssl: 'DB_SSL',
    poolMin: 'DB_POOL_MIN',
    poolMax: 'DB_POOL_MAX',
    idleTimeoutMs: 'DB_IDLE_TIMEOUT_MS',
    connectionTimeoutMs: 'DB_CONNECTION_TIMEOUT_MS',
  });
}

/**
 * Load Redis configuration from standard environment variables
 */
export function loadRedisConfig(): RedisConfig {
  // Support REDIS_URL format
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const url = new URL(redisUrl);
    return RedisConfigSchema.parse({
      host: url.hostname,
      port: url.port || 6379,
      password: url.password || undefined,
      db: parseInt(url.pathname.slice(1) || '0', 10),
    });
  }

  return loadConfig(RedisConfigSchema, {
    host: 'REDIS_HOST',
    port: 'REDIS_PORT',
    password: 'REDIS_PASSWORD',
    db: 'REDIS_DB',
    keyPrefix: 'REDIS_KEY_PREFIX',
    maxRetriesPerRequest: 'REDIS_MAX_RETRIES',
    connectTimeoutMs: 'REDIS_CONNECT_TIMEOUT_MS',
    commandTimeoutMs: 'REDIS_COMMAND_TIMEOUT_MS',
  });
}

/**
 * Load telemetry configuration from standard environment variables
 */
export function loadTelemetryConfig(_serviceName: string): TelemetryConfig {
  return loadConfig(TelemetryConfigSchema, {
    enabled: 'TELEMETRY_ENABLED',
    serviceName: 'OTEL_SERVICE_NAME',
    jaegerEndpoint: 'OTEL_EXPORTER_JAEGER_ENDPOINT',
    sampleRate: 'OTEL_SAMPLE_RATE',
    exportIntervalMs: 'OTEL_EXPORT_INTERVAL_MS',
  });
}

/**
 * Load LLM-Dev-Ops upstream services configuration
 */
export function loadUpstreamServicesConfig(): UpstreamServicesConfig {
  return loadConfig(UpstreamServicesConfigSchema, {
    registryUrl: 'LLM_REGISTRY_URL',
    registryTimeoutMs: 'LLM_REGISTRY_TIMEOUT_MS',
    shieldUrl: 'LLM_SHIELD_URL',
    shieldTimeoutMs: 'LLM_SHIELD_TIMEOUT_MS',
    policyEngineUrl: 'POLICY_ENGINE_URL',
    policyEngineTimeoutMs: 'POLICY_ENGINE_TIMEOUT_MS',
  });
}

/**
 * Utility to get required environment variable or throw
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new ConfigurationError(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Utility to get optional environment variable with default
 */
export function getEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Utility to get boolean environment variable
 */
export function getBoolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Utility to get numeric environment variable
 */
export function getNumEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}
