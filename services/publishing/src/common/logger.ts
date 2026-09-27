/**
 * Logging Utility Module
 * Provides structured JSON logging with Winston
 */

import winston from 'winston';
import { config } from '../config';

/**
 * Custom log levels
 */
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

/**
 * Colors for console output
 */
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'gray',
};

winston.addColors(colors);

/**
 * JSON format for production
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] }),
  winston.format.json()
);

/**
 * Human-readable format for development
 */
const simpleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, ...metadata }) => {
    let msg = `${timestamp} [${service}] ${level}: ${message}`;

    if (Object.keys(metadata).length > 0) {
      msg += `\n${JSON.stringify(metadata, null, 2)}`;
    }

    return msg;
  })
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: config.logging.level,
  levels,
  defaultMeta: {
    service: config.server.name,
    version: config.server.version,
    environment: config.server.env,
  },
  format: config.logging.format === 'json' ? jsonFormat : simpleFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  // Don't exit on handled exceptions
  exitOnError: false,
});

/**
 * Add file transports in production
 */
if (config.server.env === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    })
  );
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(meta: Record<string, any>): winston.Logger {
  return logger.child(meta);
}

/**
 * Log HTTP request
 */
export function logRequest(req: any): void {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    correlationId: req.get('x-correlation-id'),
  });
}

/**
 * Log HTTP response
 */
export function logResponse(req: any, res: any, duration: number): void {
  logger.http('HTTP Response', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
    correlationId: req.get('x-correlation-id'),
  });
}

/**
 * Log database query
 */
export function logQuery(query: string, duration: number, rows?: number): void {
  logger.debug('Database Query', {
    query,
    duration,
    rows,
  });
}

/**
 * Log cache operation
 */
export function logCache(operation: string, key: string, hit?: boolean): void {
  logger.debug('Cache Operation', {
    operation,
    key,
    hit,
  });
}

/**
 * Log external service call
 */
export function logExternalCall(
  service: string,
  method: string,
  url: string,
  duration: number,
  statusCode?: number
): void {
  logger.debug('External Service Call', {
    service,
    method,
    url,
    duration,
    statusCode,
  });
}

/**
 * Log authentication event
 */
export function logAuth(
  event: 'login' | 'logout' | 'register' | 'token_refresh',
  userId?: string,
  success: boolean = true
): void {
  logger.info('Authentication Event', {
    event,
    userId,
    success,
  });
}

/**
 * Log audit event
 */
export function logAudit(
  action: string,
  actorId: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, any>
): void {
  logger.info('Audit Event', {
    action,
    actorId,
    resourceType,
    resourceId,
    ...metadata,
  });
}

/**
 * Log performance metric
 */
export function logMetric(
  metric: string,
  value: number,
  unit: string,
  tags?: Record<string, any>
): void {
  logger.verbose('Performance Metric', {
    metric,
    value,
    unit,
    ...tags,
  });
}

/**
 * Log error with context
 */
export function logError(
  error: Error,
  context?: Record<string, any>
): void {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  });
}

/**
 * Stream for Morgan HTTP logger
 */
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export { logger };
