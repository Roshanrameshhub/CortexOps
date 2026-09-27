/**
 * Configuration for Marketplace Packaging Agent
 *
 * Validated configuration using Zod for type safety.
 */

import { z } from 'zod';

/**
 * Configuration schema
 */
const ConfigSchema = z.object({
  // Agent configuration
  agent: z.object({
    id: z.string().default('marketplace-packaging-agent'),
    version: z.string().default('1.0.0'),
    maxExecutionTimeMs: z.number().default(300000), // 5 minutes
    memoryLimitMb: z.number().default(512),
  }),

  // ruvector-service configuration
  ruvector: z.object({
    baseUrl: z.string().url(),
    timeout: z.number().default(30000),
    retryAttempts: z.number().default(3),
    retryDelayMs: z.number().default(1000),
    apiKey: z.string().optional(),
  }),

  // Registry service configuration
  registry: z.object({
    baseUrl: z.string().url(),
    timeout: z.number().default(10000),
  }),

  // Storage configuration (for artifacts)
  storage: z.object({
    bucket: z.string(),
    region: z.string().default('us-central1'),
    signedUrlExpirySeconds: z.number().default(3600),
  }),

  // Validation configuration
  validation: z.object({
    maxPackageSizeBytes: z.number().default(100 * 1024 * 1024), // 100MB
    maxAssetsPerPackage: z.number().default(100),
    strictMode: z.boolean().default(false),
  }),

  // Logging configuration
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'pretty']).default('json'),
  }),

  // Environment
  env: z.enum(['development', 'staging', 'production']).default('development'),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 */
function loadConfig(): Config {
  const rawConfig = {
    agent: {
      id: process.env.AGENT_ID || 'marketplace-packaging-agent',
      version: process.env.AGENT_VERSION || '1.0.0',
      maxExecutionTimeMs: parseInt(process.env.AGENT_MAX_EXECUTION_TIME_MS || '300000', 10),
      memoryLimitMb: parseInt(process.env.AGENT_MEMORY_LIMIT_MB || '512', 10),
    },
    ruvector: {
      baseUrl: process.env.RUVECTOR_SERVICE_URL || 'http://localhost:8080',
      timeout: parseInt(process.env.RUVECTOR_TIMEOUT_MS || '30000', 10),
      retryAttempts: parseInt(process.env.RUVECTOR_RETRY_ATTEMPTS || '3', 10),
      retryDelayMs: parseInt(process.env.RUVECTOR_RETRY_DELAY_MS || '1000', 10),
      apiKey: process.env.RUVECTOR_API_KEY,
    },
    registry: {
      baseUrl: process.env.REGISTRY_SERVICE_URL || 'http://localhost:8081',
      timeout: parseInt(process.env.REGISTRY_TIMEOUT_MS || '10000', 10),
    },
    storage: {
      bucket: process.env.STORAGE_BUCKET || 'llm-marketplace-packages',
      region: process.env.STORAGE_REGION || 'us-central1',
      signedUrlExpirySeconds: parseInt(process.env.SIGNED_URL_EXPIRY_SECONDS || '3600', 10),
    },
    validation: {
      maxPackageSizeBytes: parseInt(process.env.MAX_PACKAGE_SIZE_BYTES || String(100 * 1024 * 1024), 10),
      maxAssetsPerPackage: parseInt(process.env.MAX_ASSETS_PER_PACKAGE || '100', 10),
      strictMode: process.env.VALIDATION_STRICT_MODE === 'true',
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      format: (process.env.LOG_FORMAT as 'json' | 'pretty') || 'json',
    },
    env: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development',
  };

  return ConfigSchema.parse(rawConfig);
}

/**
 * Singleton configuration instance
 */
let configInstance: Config | null = null;

/**
 * Get configuration (lazy loaded)
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Override configuration (for testing)
 */
export function setConfig(config: Partial<Config>): void {
  const baseConfig = loadConfig();
  configInstance = ConfigSchema.parse({ ...baseConfig, ...config });
}

export default getConfig;
