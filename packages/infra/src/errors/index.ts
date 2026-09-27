/**
 * @llm-marketplace/infra - Error Utilities Module
 *
 * Provides standardized error classes and error handling utilities
 * for LLM-Dev-Ops services.
 */

/**
 * Base error class for all LLM-Dev-Ops errors
 */
export abstract class InfraError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly isOperational: boolean = true;
  readonly timestamp: Date = new Date();
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable format
   */
  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
    };
  }

  /**
   * Format error for HTTP response
   */
  toResponse(): { status: number; body: Record<string, unknown> } {
    return {
      status: this.statusCode,
      body: this.toJSON(),
    };
  }
}

// ============================================================================
// 4xx Client Errors
// ============================================================================

/**
 * 400 Bad Request - Invalid request data
 */
export class ValidationError extends InfraError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class AuthenticationError extends InfraError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;

  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class AuthorizationError extends InfraError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;

  constructor(message: string = 'Access denied', details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends InfraError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor(resource: string, identifier?: string) {
    super(
      identifier ? `${resource} '${identifier}' not found` : `${resource} not found`,
      { resource, identifier }
    );
  }
}

/**
 * 409 Conflict - Resource conflict
 */
export class ConflictError extends InfraError {
  readonly code = 'CONFLICT';
  readonly statusCode = 409;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 422 Unprocessable Entity - Business logic validation failed
 */
export class BusinessRuleError extends InfraError {
  readonly code = 'BUSINESS_RULE_ERROR';
  readonly statusCode = 422;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends InfraError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  readonly retryAfterSeconds?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfterSeconds?: number) {
    super(message, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 402 Payment Required - Quota exceeded
 */
export class QuotaExceededError extends InfraError {
  readonly code = 'QUOTA_EXCEEDED';
  readonly statusCode = 402;

  constructor(message: string = 'Quota exceeded', details?: Record<string, unknown>) {
    super(message, details);
  }
}

// ============================================================================
// 5xx Server Errors
// ============================================================================

/**
 * 500 Internal Server Error - Unexpected error
 */
export class InternalError extends InfraError {
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;
  override readonly isOperational = false;

  constructor(message: string = 'Internal server error', details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 500 Database Error - Database operation failed
 */
export class DatabaseError extends InfraError {
  readonly code = 'DATABASE_ERROR';
  readonly statusCode = 500;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 500 Cache Error - Cache operation failed
 */
export class CacheError extends InfraError {
  readonly code = 'CACHE_ERROR';
  readonly statusCode = 500;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * 502 Bad Gateway - External service error
 */
export class ExternalServiceError extends InfraError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';
  readonly statusCode = 502;
  readonly service: string;

  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super(`${service}: ${message}`, { service, ...details });
    this.service = service;
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends InfraError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
  readonly retryAfterSeconds?: number;

  constructor(message: string = 'Service temporarily unavailable', retryAfterSeconds?: number) {
    super(message, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 504 Gateway Timeout - Upstream timeout
 */
export class TimeoutError extends InfraError {
  readonly code = 'TIMEOUT';
  readonly statusCode = 504;
  readonly service?: string;

  constructor(message: string = 'Request timeout', service?: string) {
    super(message, { service });
    this.service = service;
  }
}

/**
 * Policy Violation Error - LLM-Dev-Ops policy check failed
 */
export class PolicyViolationError extends InfraError {
  readonly code = 'POLICY_VIOLATION';
  readonly statusCode = 403;
  readonly policyId?: string;
  readonly violations: string[];

  constructor(message: string, violations: string[], policyId?: string) {
    super(message, { policyId, violations });
    this.policyId = policyId;
    this.violations = violations;
  }
}

/**
 * Configuration Error - Invalid configuration
 */
export class ConfigurationError extends InfraError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;
  override readonly isOperational = false;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if an error is an operational error (expected, can be handled gracefully)
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof InfraError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Check if an error is a specific InfraError type
 */
export function isInfraError(error: unknown): error is InfraError {
  return error instanceof InfraError;
}

/**
 * Wrap an unknown error into an InfraError
 */
export function wrapError(error: unknown, context?: string): InfraError {
  if (error instanceof InfraError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(
      context ? `${context}: ${error.message}` : error.message,
      { originalError: error.name, stack: error.stack }
    );
  }

  return new InternalError(
    context ? `${context}: Unknown error` : 'Unknown error',
    { originalError: String(error) }
  );
}

/**
 * Format error for logging
 */
export function formatErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof InfraError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      details: error.details,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { error: String(error) };
}

/**
 * Create error response for Express/Fastify handlers
 */
export function createErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof InfraError) {
    return error.toResponse();
  }

  // Unknown errors should not expose details in production
  const isProduction = process.env.NODE_ENV === 'production';

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        error: 'INTERNAL_ERROR',
        message: isProduction ? 'Internal server error' : error.message,
        timestamp: new Date().toISOString(),
      },
    };
  }

  return {
    status: 500,
    body: {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    },
  };
}
