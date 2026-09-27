/**
 * Custom Error Classes
 * Provides structured error handling with proper inheritance and metadata
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    metadata?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error, metadata?: Record<string, any>) {
    super(message, 500, true, {
      ...metadata,
      originalError: originalError?.message,
      originalStack: originalError?.stack,
    });
  }
}

/**
 * Cache-related errors (Redis)
 */
export class CacheError extends AppError {
  constructor(message: string, originalError?: Error, metadata?: Record<string, any>) {
    super(message, 500, true, {
      ...metadata,
      originalError: originalError?.message,
      originalStack: originalError?.stack,
    });
  }
}

/**
 * Validation errors (input validation)
 */
export class ValidationError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 400, true, metadata);
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', metadata?: Record<string, any>) {
    super(message, 401, true, metadata);
  }
}

/**
 * Authorization errors (permission denied)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', metadata?: Record<string, any>) {
    super(message, 403, true, metadata);
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, metadata?: Record<string, any>) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, true, metadata);
  }
}

/**
 * Conflict errors (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 409, true, metadata);
  }
}

/**
 * Rate limit exceeded errors
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Rate limit exceeded',
    resetAt?: Date,
    metadata?: Record<string, any>
  ) {
    super(message, 429, true, {
      ...metadata,
      resetAt: resetAt?.toISOString(),
    });
  }
}

/**
 * External service errors (integration failures)
 */
export class ExternalServiceError extends AppError {
  constructor(
    serviceName: string,
    message: string,
    originalError?: Error,
    metadata?: Record<string, any>
  ) {
    super(`${serviceName} error: ${message}`, 502, true, {
      ...metadata,
      serviceName,
      originalError: originalError?.message,
      originalStack: originalError?.stack,
    });
  }
}

/**
 * Policy violation errors
 */
export class PolicyViolationError extends AppError {
  constructor(message: string, violations?: string[], metadata?: Record<string, any>) {
    super(message, 403, true, {
      ...metadata,
      violations,
    });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 500, false, metadata);
  }
}

/**
 * Service unavailable errors
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', metadata?: Record<string, any>) {
    super(message, 503, true, metadata);
  }
}

/**
 * Quota exceeded errors
 */
export class QuotaExceededError extends AppError {
  constructor(
    quotaType: string,
    current: number,
    limit: number,
    metadata?: Record<string, any>
  ) {
    super(`${quotaType} quota exceeded`, 429, true, {
      ...metadata,
      quotaType,
      current,
      limit,
    });
  }
}

/**
 * Check if error is operational (expected) or programmer error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Format error for API response
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    metadata?: Record<string, any>;
    stack?: string;
  };
}

/**
 * Convert error to API response format
 */
export function formatErrorResponse(error: Error, includeStack: boolean = false): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: {
        message: error.message,
        code: error.name,
        statusCode: error.statusCode,
        metadata: error.metadata,
        ...(includeStack && { stack: error.stack }),
      },
    };
  }

  // Default error response for unexpected errors
  return {
    error: {
      message: 'An unexpected error occurred',
      code: 'InternalServerError',
      statusCode: 500,
      ...(includeStack && { stack: error.stack }),
    },
  };
}
