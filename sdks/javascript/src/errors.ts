/**
 * Base error class for all SDK errors
 */
export class LLMMarketplaceError extends Error {
  /**
   * Error code
   */
  public readonly code: string;

  /**
   * HTTP status code (if applicable)
   */
  public readonly statusCode?: number;

  /**
   * Request ID for debugging
   */
  public readonly requestId?: string;

  /**
   * Additional error details
   */
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LLMMarketplaceError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends LLMMarketplaceError {
  constructor(message = 'Invalid or missing API key', requestId?: string) {
    super(message, 'AUTHENTICATION_ERROR', 401, requestId);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends LLMMarketplaceError {
  constructor(message = 'Insufficient permissions', requestId?: string) {
    super(message, 'AUTHORIZATION_ERROR', 403, requestId);
    this.name = 'AuthorizationError';
  }
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends LLMMarketplaceError {
  constructor(
    message = 'Resource not found',
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'NOT_FOUND', 404, requestId, details);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends LLMMarketplaceError {
  constructor(
    message = 'Invalid request data',
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', 400, requestId, details);
    this.name = 'ValidationError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends LLMMarketplaceError {
  /**
   * Time when rate limit resets (Unix timestamp)
   */
  public readonly retryAfter?: number;

  /**
   * Rate limit
   */
  public readonly limit?: number;

  /**
   * Remaining requests
   */
  public readonly remaining?: number;

  constructor(
    message = 'Rate limit exceeded',
    requestId?: string,
    retryAfter?: number,
    limit?: number,
    remaining?: number
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, requestId);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
  }
}

/**
 * Server error (500-599)
 */
export class ServerError extends LLMMarketplaceError {
  constructor(
    message = 'Internal server error',
    statusCode = 500,
    requestId?: string
  ) {
    super(message, 'SERVER_ERROR', statusCode, requestId);
    this.name = 'ServerError';
  }
}

/**
 * Network error (timeout, connection refused, etc.)
 */
export class NetworkError extends LLMMarketplaceError {
  constructor(message = 'Network error occurred', originalError?: Error) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';

    if (originalError && originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends LLMMarketplaceError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

/**
 * Parse error response from API
 */
export function parseErrorResponse(
  statusCode: number,
  data: unknown,
  requestId?: string
): LLMMarketplaceError {
  // Type guard for error response
  const isErrorResponse = (obj: unknown): obj is { error: { code: string; message: string; details?: Record<string, unknown> } } => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'error' in obj &&
      typeof (obj as { error: unknown }).error === 'object' &&
      (obj as { error: { code?: unknown } }).error !== null &&
      'code' in (obj as { error: { code: unknown } }).error &&
      'message' in (obj as { error: { message: unknown } }).error
    );
  };

  let message = 'An error occurred';
  let code = 'UNKNOWN_ERROR';
  let details: Record<string, unknown> | undefined;

  if (isErrorResponse(data)) {
    message = data.error.message;
    code = data.error.code;
    details = data.error.details;
  } else if (typeof data === 'string') {
    message = data;
  }

  // Create appropriate error based on status code
  switch (statusCode) {
    case 400:
      return new ValidationError(message, requestId, details);
    case 401:
      return new AuthenticationError(message, requestId);
    case 403:
      return new AuthorizationError(message, requestId);
    case 404:
      return new NotFoundError(message, requestId, details);
    case 429: {
      // Extract rate limit info from details if available
      const retryAfter = details?.retryAfter as number | undefined;
      const limit = details?.limit as number | undefined;
      const remaining = details?.remaining as number | undefined;
      return new RateLimitError(message, requestId, retryAfter, limit, remaining);
    }
    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError(message, statusCode, requestId);
    default:
      return new LLMMarketplaceError(message, code, statusCode, requestId, details);
  }
}
