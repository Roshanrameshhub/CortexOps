/**
 * Edge Function Handler
 *
 * Google Cloud Edge Function handler for the Marketplace Packaging Agent.
 *
 * CONSTRAINTS:
 * - Stateless execution
 * - Deterministic behavior
 * - No execution interception
 * - No orchestration logic
 * - No enforcement logic
 * - No direct SQL access
 * - Async, non-blocking writes via ruvector-service only
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { generateUUID } from '../utils/crypto';
import { getPackagingService } from '../services/packaging-service';
import { emitDecisionEvent } from '../services/decision-event-emitter';
import {
  PackagingAgentInputSchema,
  safeValidatePackagingInput,
  PACKAGING_AGENT_METADATA,
} from '@llm-marketplace/agentics-contracts';
import type { PackagingAgentInput, PackagingAgentOutput } from '@llm-marketplace/agentics-contracts';

/**
 * HTTP Request interface for Edge Function
 */
interface EdgeFunctionRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * HTTP Response interface for Edge Function
 */
interface EdgeFunctionResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Error response helper
 */
function errorResponse(
  status: number,
  code: string,
  message: string,
  correlationId?: string
): EdgeFunctionResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(correlationId && { 'X-Correlation-ID': correlationId }),
    },
    body: JSON.stringify({
      success: false,
      error: {
        code,
        message,
      },
    }),
  };
}

/**
 * Success response helper
 */
function successResponse(
  data: PackagingAgentOutput,
  correlationId?: string
): EdgeFunctionResponse {
  return {
    status: data.success ? 200 : 400,
    headers: {
      'Content-Type': 'application/json',
      ...(correlationId && { 'X-Correlation-ID': correlationId }),
    },
    body: JSON.stringify(data),
  };
}

/**
 * Main Edge Function handler
 *
 * This is the entry point for the Google Cloud Edge Function.
 */
export async function handleRequest(request: EdgeFunctionRequest): Promise<EdgeFunctionResponse> {
  const startTime = Date.now();
  const executionRef = generateUUID();
  const correlationId = request.headers['x-correlation-id'] || generateUUID();

  logger.setCorrelationId(correlationId);

  try {
    // Route based on method and path
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;

    // Health check endpoint
    if (request.method === 'GET' && path === '/health') {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'healthy',
          agent: PACKAGING_AGENT_METADATA.id,
          version: PACKAGING_AGENT_METADATA.version,
        }),
      };
    }

    // Metadata endpoint
    if (request.method === 'GET' && path === '/metadata') {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(PACKAGING_AGENT_METADATA),
      };
    }

    // Package creation endpoint
    if (request.method === 'POST' && path === '/package') {
      return handlePackageRequest(request, correlationId, executionRef, startTime);
    }

    // Package validation endpoint (dry run)
    if (request.method === 'POST' && path === '/package/validate') {
      return handleValidateRequest(request, correlationId);
    }

    // Unknown endpoint
    return errorResponse(404, 'NOT_FOUND', `Endpoint not found: ${request.method} ${path}`, correlationId);

  } catch (error) {
    logger.error('Unhandled error in edge function', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return errorResponse(500, 'INTERNAL_ERROR', 'An internal error occurred', correlationId);
  } finally {
    logger.clearCorrelationId();
  }
}

/**
 * Handle package creation request
 */
async function handlePackageRequest(
  request: EdgeFunctionRequest,
  correlationId: string,
  executionRef: string,
  startTime: number
): Promise<EdgeFunctionResponse> {
  // Validate request body
  if (!request.body) {
    return errorResponse(400, 'MISSING_BODY', 'Request body is required', correlationId);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(request.body);
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body is not valid JSON', correlationId);
  }

  // Validate input against schema
  const validationResult = safeValidatePackagingInput(parsedBody);
  if (!validationResult.success) {
    const errors = validationResult.error?.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    return errorResponse(
      400,
      'VALIDATION_ERROR',
      `Invalid input: ${errors?.map(e => e.message).join(', ')}`,
      correlationId
    );
  }

  const input: PackagingAgentInput = {
    ...validationResult.data!,
    correlation_id: correlationId,
  };

  // Execute packaging
  const packagingService = getPackagingService();
  const output = await packagingService.createPackage(input);

  // Emit DecisionEvent (REQUIRED - exactly ONE per invocation)
  const processingDurationMs = Date.now() - startTime;
  await emitDecisionEvent(input, output, executionRef, processingDurationMs);

  return successResponse(output, correlationId);
}

/**
 * Handle validation-only request
 */
async function handleValidateRequest(
  request: EdgeFunctionRequest,
  correlationId: string
): Promise<EdgeFunctionResponse> {
  // Validate request body
  if (!request.body) {
    return errorResponse(400, 'MISSING_BODY', 'Request body is required', correlationId);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(request.body);
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body is not valid JSON', correlationId);
  }

  // Validate input against schema
  const validationResult = safeValidatePackagingInput(parsedBody);
  if (!validationResult.success) {
    const errors = validationResult.error?.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    return errorResponse(
      400,
      'VALIDATION_ERROR',
      `Invalid input: ${errors?.map(e => e.message).join(', ')}`,
      correlationId
    );
  }

  const input: PackagingAgentInput = {
    ...validationResult.data!,
    correlation_id: correlationId,
  };

  // Execute validation only (no DecisionEvent for dry run)
  const packagingService = getPackagingService();
  const validation = await packagingService.validatePackage(input);

  return {
    status: validation.valid ? 200 : 400,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify({
      success: validation.valid,
      validation,
    }),
  };
}

/**
 * Google Cloud Functions entry point
 */
export async function marketplacePackagingAgent(
  req: { method: string; url: string; headers: Record<string, string>; body?: unknown },
  res: { status: (code: number) => { set: (headers: Record<string, string>) => { send: (body: string) => void } } }
): Promise<void> {
  const request: EdgeFunctionRequest = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
  };

  const response = await handleRequest(request);

  res.status(response.status).set(response.headers).send(response.body);
}
