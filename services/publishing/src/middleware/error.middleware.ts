/**
 * Error Handling Middleware
 * Centralized error handling for Express application
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, formatErrorResponse, isOperationalError } from '../common/errors';
import { logError } from '../common/logger';
import { isDevelopment } from '../config';
import { ZodError } from 'zod';

/**
 * Error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  logError(err, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userId: req.user?.id,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((error) => ({
      path: error.path.join('.'),
      message: error.message,
    }));

    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'ValidationError',
        statusCode: 400,
        metadata: {
          errors: formattedErrors,
        },
      },
    });
    return;
  }

  // Handle application errors
  if (err instanceof AppError) {
    const includeStack = isDevelopment();
    const errorResponse = formatErrorResponse(err, includeStack);

    res.status(err.statusCode).json(errorResponse);
    return;
  }

  // Handle unexpected errors
  logError(err, {
    operational: isOperationalError(err),
  });

  // Don't expose internal error details in production
  const message = isDevelopment() ? err.message : 'An unexpected error occurred';
  const stack = isDevelopment() ? err.stack : undefined;

  res.status(500).json({
    error: {
      message,
      code: 'InternalServerError',
      statusCode: 500,
      ...(stack && { stack }),
    },
  });
}

/**
 * Not found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.url} not found`,
      code: 'NotFound',
      statusCode: 404,
    },
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
