/**
 * Logging Middleware
 * HTTP request/response logging
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logRequest, logResponse } from '../common/logger';

/**
 * Add correlation ID to request
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  // Use existing correlation ID or generate new one
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

  // Store in request
  req.headers['x-correlation-id'] = correlationId;

  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}

/**
 * Request/Response logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request
  logRequest(req);

  // Capture response
  const originalSend = res.send;

  res.send = function (data: any): Response {
    const duration = Date.now() - startTime;
    logResponse(req, res, duration);
    res.send = originalSend;
    return originalSend.call(this, data);
  };

  next();
}
