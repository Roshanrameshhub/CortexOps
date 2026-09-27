/**
 * @llm-marketplace/infra - Logging Module
 *
 * Provides structured logging with Pino for LLM-Dev-Ops services.
 * Supports child loggers, request/response logging, and metric logging.
 */

import pino, { Logger, LoggerOptions, Level } from 'pino';

export type LogLevel = Level;

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  name: string;
  level?: LogLevel;
  prettyPrint?: boolean;
  redactPaths?: string[];
}

/**
 * Request log context
 */
export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  ip?: string;
  userAgent?: string;
}

/**
 * Response log context
 */
export interface ResponseLogContext {
  requestId: string;
  statusCode: number;
  durationMs: number;
  contentLength?: number;
}

/**
 * External call log context
 */
export interface ExternalCallLogContext {
  service: string;
  method: string;
  url: string;
  durationMs: number;
  statusCode?: number;
  success: boolean;
  error?: string;
}

/**
 * Cache operation log context
 */
export interface CacheLogContext {
  operation: 'get' | 'set' | 'delete' | 'expire';
  key: string;
  hit?: boolean;
  ttlMs?: number;
  durationMs: number;
}

/**
 * Authentication log context
 */
export interface AuthLogContext {
  userId?: string;
  tenantId?: string;
  action: 'login' | 'logout' | 'refresh' | 'verify' | 'deny';
  success: boolean;
  reason?: string;
}

/**
 * Audit log context
 */
export interface AuditLogContext {
  userId: string;
  tenantId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

/**
 * Metric log context
 */
export interface MetricLogContext {
  metric: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
}

/**
 * Default paths to redact from logs (security-sensitive)
 */
const DEFAULT_REDACT_PATHS = [
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.secret',
  'headers.authorization',
  'headers.cookie',
];

/**
 * Create a configured Pino logger instance
 */
export function createLogger(config: LoggerConfig): Logger {
  const options: LoggerOptions = {
    name: config.name,
    level: config.level ?? 'info',
    redact: {
      paths: [...DEFAULT_REDACT_PATHS, ...(config.redactPaths ?? [])],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        host: bindings.hostname,
        service: config.name,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (config.prettyPrint && process.env.NODE_ENV !== 'production') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}

/**
 * Extended logger with convenience methods for common log patterns
 */
export class InfraLogger {
  private logger: Logger;

  constructor(config: LoggerConfig) {
    this.logger = createLogger(config);
  }

  /**
   * Get the underlying Pino logger
   */
  get pino(): Logger {
    return this.logger;
  }

  /**
   * Create a child logger with additional context
   */
  child(bindings: Record<string, unknown>): InfraLogger {
    const childLogger = new InfraLogger({ name: '', level: this.logger.level as LogLevel });
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }

  // Standard log levels
  trace(msg: string, ...args: unknown[]): void {
    this.logger.trace(args[0] as object ?? {}, msg);
  }

  debug(msg: string, ...args: unknown[]): void {
    this.logger.debug(args[0] as object ?? {}, msg);
  }

  info(msg: string, ...args: unknown[]): void {
    this.logger.info(args[0] as object ?? {}, msg);
  }

  warn(msg: string, ...args: unknown[]): void {
    this.logger.warn(args[0] as object ?? {}, msg);
  }

  error(msg: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.error({
        err: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        ...context,
      }, msg);
    } else {
      this.logger.error({ error, ...context }, msg);
    }
  }

  fatal(msg: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.fatal({
        err: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        ...context,
      }, msg);
    } else {
      this.logger.fatal({ error, ...context }, msg);
    }
  }

  /**
   * Log an incoming request
   */
  logRequest(ctx: RequestLogContext): void {
    this.logger.info({
      type: 'request',
      ...ctx,
    }, `${ctx.method} ${ctx.path}`);
  }

  /**
   * Log an outgoing response
   */
  logResponse(ctx: ResponseLogContext): void {
    const level = ctx.statusCode >= 500 ? 'error' : ctx.statusCode >= 400 ? 'warn' : 'info';
    this.logger[level]({
      type: 'response',
      ...ctx,
    }, `Response ${ctx.statusCode} in ${ctx.durationMs}ms`);
  }

  /**
   * Log an external service call
   */
  logExternalCall(ctx: ExternalCallLogContext): void {
    const level = ctx.success ? 'info' : 'error';
    this.logger[level]({
      type: 'external_call',
      ...ctx,
    }, `${ctx.service}: ${ctx.method} ${ctx.url} - ${ctx.success ? 'success' : 'failed'} in ${ctx.durationMs}ms`);
  }

  /**
   * Log a cache operation
   */
  logCache(ctx: CacheLogContext): void {
    this.logger.debug({
      type: 'cache',
      ...ctx,
    }, `Cache ${ctx.operation} ${ctx.key}${ctx.hit !== undefined ? ` (${ctx.hit ? 'HIT' : 'MISS'})` : ''}`);
  }

  /**
   * Log an authentication event
   */
  logAuth(ctx: AuthLogContext): void {
    const level = ctx.success ? 'info' : 'warn';
    this.logger[level]({
      type: 'auth',
      ...ctx,
    }, `Auth ${ctx.action}: ${ctx.success ? 'success' : 'failed'}${ctx.reason ? ` - ${ctx.reason}` : ''}`);
  }

  /**
   * Log an audit event
   */
  logAudit(ctx: AuditLogContext): void {
    this.logger.info({
      type: 'audit',
      ...ctx,
    }, `Audit: ${ctx.action} on ${ctx.resource}${ctx.resourceId ? `/${ctx.resourceId}` : ''}`);
  }

  /**
   * Log a metric
   */
  logMetric(ctx: MetricLogContext): void {
    this.logger.info({
      type: 'metric',
      ...ctx,
    }, `Metric: ${ctx.metric}=${ctx.value}${ctx.unit ? ctx.unit : ''}`);
  }
}

/**
 * Create a singleton logger instance
 */
let defaultLogger: InfraLogger | null = null;

export function getLogger(config?: LoggerConfig): InfraLogger {
  if (!defaultLogger && config) {
    defaultLogger = new InfraLogger(config);
  }
  if (!defaultLogger) {
    defaultLogger = new InfraLogger({
      name: 'llm-dev-ops',
      level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
      prettyPrint: process.env.NODE_ENV !== 'production',
    });
  }
  return defaultLogger;
}

export { Logger };
