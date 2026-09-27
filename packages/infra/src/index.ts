/**
 * @llm-marketplace/infra
 *
 * Shared infrastructure utilities for LLM-Dev-Ops ecosystem.
 * Provides configuration, logging, tracing, caching, retry, rate-limiting, and error handling.
 *
 * Phase 2B Infra Module for LLM-Marketplace and other LLM-Dev-Ops repositories.
 *
 * @packageDocumentation
 */

// Configuration module
export {
  // Schemas
  BaseConfigSchema,
  DatabaseConfigSchema,
  RedisConfigSchema,
  TelemetryConfigSchema,
  UpstreamServicesConfigSchema,
  // Types
  type BaseConfig,
  type DatabaseConfig,
  type RedisConfig,
  type TelemetryConfig,
  type UpstreamServicesConfig,
  // Functions
  loadConfig,
  loadBaseConfig,
  loadDatabaseConfig,
  loadRedisConfig,
  loadTelemetryConfig,
  loadUpstreamServicesConfig,
  requireEnv,
  getEnv,
  getBoolEnv,
  getNumEnv,
  // Errors
  ConfigurationError,
} from './config';

// Logging module
export {
  // Types
  type LogLevel,
  type LoggerConfig,
  type RequestLogContext,
  type ResponseLogContext,
  type ExternalCallLogContext,
  type CacheLogContext,
  type AuthLogContext,
  type AuditLogContext,
  type MetricLogContext,
  // Classes
  InfraLogger,
  // Functions
  createLogger,
  getLogger,
  // Re-exports
  type Logger,
} from './logging';

// Error utilities
export {
  // Base class
  InfraError,
  // 4xx errors
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  RateLimitError,
  QuotaExceededError,
  // 5xx errors
  InternalError,
  DatabaseError,
  CacheError,
  ExternalServiceError,
  ServiceUnavailableError,
  TimeoutError,
  PolicyViolationError,
  // Utilities
  isOperationalError,
  isInfraError,
  wrapError,
  formatErrorForLog,
  createErrorResponse,
} from './errors';

// Cache module
export {
  // Types
  type CacheConfig,
  type CacheEntry,
  type CacheStats,
  // Classes
  CacheClient,
  // Functions
  createCacheClient,
} from './cache';

// Retry module
export {
  // Types
  type RetryConfig,
  type RetryResult,
  type CircuitBreakerConfig,
  // Constants
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  // Enums
  CircuitState,
  // Classes
  CircuitBreaker,
  // Functions
  withRetry,
  createRetryable,
  calculateDelay,
  sleep,
  isRetryableError,
  createCircuitBreaker,
} from './retry';

// Rate limiting module
export {
  // Types
  type RateLimitConfig,
  type RateLimitStatus,
  type TokenBucketConfig,
  type TokenBucketStatus,
  // Classes
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  // Functions
  createRateLimitMiddleware,
} from './rate-limit';

// Tracing module
export {
  // Types
  type TracingConfig,
  type SpanAttributes,
  type HttpSpanAttributes,
  type DbSpanAttributes,
  type CacheSpanAttributes,
  // Functions
  initTracing,
  shutdownTracing,
  getTracer,
  withSpan,
  withHttpSpan,
  withDbSpan,
  withCacheSpan,
  extractTraceContext,
  injectTraceContext,
  getTraceId,
  getSpanId,
  addSpanEvent,
  setSpanAttribute,
  recordSpanException,
  createTracingMiddleware,
  // Re-exports from OpenTelemetry
  SpanKind,
  SpanStatusCode,
  type Span,
  type Tracer,
  type Context,
} from './tracing';

/**
 * Version of the @llm-marketplace/infra package
 */
export const VERSION = '1.0.0';

/**
 * Initialize all infrastructure components
 */
export interface InfraInitOptions {
  serviceName: string;
  serviceVersion?: string;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  prettyLogs?: boolean;
  enableTracing?: boolean;
  jaegerEndpoint?: string;
  redisConfig?: Partial<import('./cache').CacheConfig>;
}

/**
 * Initialize infrastructure with common defaults
 */
export function initInfra(options: InfraInitOptions): {
  logger: import('./logging').InfraLogger;
  tracer: import('./tracing').Tracer | null;
  cache: import('./cache').CacheClient | null;
} {
  const { createLogger } = require('./logging');
  const { initTracing, getTracer } = require('./tracing');
  const { createCacheClient } = require('./cache');

  // Initialize logger
  const logger = createLogger({
    name: options.serviceName,
    level: options.logLevel ?? 'info',
    prettyPrint: options.prettyLogs ?? process.env.NODE_ENV !== 'production',
  });

  // Initialize tracing if enabled
  let tracer = null;
  if (options.enableTracing) {
    initTracing({
      serviceName: options.serviceName,
      serviceVersion: options.serviceVersion,
      jaegerEndpoint: options.jaegerEndpoint,
      enabled: true,
    });
    tracer = getTracer(options.serviceName);
  }

  // Initialize cache if config provided
  let cache = null;
  if (options.redisConfig) {
    cache = createCacheClient(options.redisConfig);
  }

  logger.info(`Initialized @llm-marketplace/infra v${VERSION} for ${options.serviceName}`);

  return { logger, tracer, cache };
}
