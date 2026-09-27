/**
 * Google Cloud Edge Function Handler
 *
 * Stateless HTTP handler for the Deprecation Agent.
 * Deployed as part of the unified Marketplace agents service.
 *
 * CRITICAL CONSTRAINTS:
 * - Stateless execution
 * - No local persistence
 * - Deterministic behavior
 * - All persistence via ruvector-service
 */

import { Request, Response } from '@google-cloud/functions-framework';
import { createLogger, format, transports } from 'winston';
import {
  DeprecationAgentInput,
  safeValidateDeprecationInput,
  DEPRECATION_AGENT_METADATA
} from '@llm-marketplace/agentics-contracts';
import { createDeprecationAgent } from '../core';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: {
    service: 'deprecation-agent-handler',
    version: DEPRECATION_AGENT_METADATA.agentVersion
  },
  transports: [
    new transports.Console()
  ]
});

/**
 * Request body structure
 */
interface DeprecationRequest {
  input: DeprecationAgentInput;
  options?: {
    dryRun?: boolean;
    verbose?: boolean;
  };
}

/**
 * Response structure
 */
interface DeprecationResponse {
  success: boolean;
  data?: {
    output: unknown;
    decisionEvent?: unknown;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    agent: string;
    version: string;
    timestamp: string;
    requestId: string;
    processingDurationMs?: number;
  };
}

/**
 * Main HTTP handler
 */
export async function handler(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  const startTime = Date.now();

  logger.info('Request received', {
    requestId,
    method: req.method,
    path: req.path
  });

  // Set response headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Agent-Id', DEPRECATION_AGENT_METADATA.agentId);
  res.setHeader('X-Agent-Version', DEPRECATION_AGENT_METADATA.agentVersion);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
    res.status(204).send('');
    return;
  }

  // Health check endpoint
  if (req.path === '/health' || req.path === '/deprecation/health') {
    await handleHealthCheck(req, res, requestId);
    return;
  }

  // Only accept POST for deprecation operations
  if (req.method !== 'POST') {
    sendErrorResponse(res, requestId, startTime, {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only POST method is allowed'
    }, 405);
    return;
  }

  try {
    const body = req.body as DeprecationRequest;

    // Validate request body
    if (!body || !body.input) {
      sendErrorResponse(res, requestId, startTime, {
        code: 'INVALID_REQUEST',
        message: 'Request body must contain an "input" field'
      }, 400);
      return;
    }

    // Validate input against schema
    const validationResult = safeValidateDeprecationInput(body.input);
    if (!validationResult.success) {
      sendErrorResponse(res, requestId, startTime, {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: validationResult.error?.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message
        }))
      }, 400);
      return;
    }

    // Add correlation ID from request if not provided
    const input: DeprecationAgentInput = {
      ...validationResult.data!,
      correlationId: validationResult.data!.correlationId || requestId
    };

    // Create agent and execute
    const agent = createDeprecationAgent();

    // Check for dry run mode
    if (body.options?.dryRun) {
      logger.info('Dry run mode - skipping execution', { requestId });
      sendSuccessResponse(res, requestId, startTime, {
        output: {
          success: true,
          statusCode: 'DRY_RUN',
          message: 'Dry run - no changes made',
          assetId: input.assetId,
          assetType: input.assetType
        },
        dryRun: true
      });
      return;
    }

    // Execute deprecation
    const result = await agent.execute(input);

    // Send response
    const responseData: DeprecationResponse['data'] = {
      output: result.output
    };

    // Include decision event in verbose mode
    if (body.options?.verbose) {
      responseData.decisionEvent = result.decisionEvent;
    }

    sendSuccessResponse(res, requestId, startTime, responseData);

  } catch (error) {
    logger.error('Handler error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    sendErrorResponse(res, requestId, startTime, {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error'
    }, 500);
  }
}

/**
 * Handle health check
 */
async function handleHealthCheck(
  req: Request,
  res: Response,
  requestId: string
): Promise<void> {
  const agent = createDeprecationAgent();
  const health = await agent.healthCheck();

  const status = health.healthy ? 200 : 503;
  res.status(status).json({
    status: health.healthy ? 'healthy' : 'unhealthy',
    agent: DEPRECATION_AGENT_METADATA.agentId,
    version: DEPRECATION_AGENT_METADATA.agentVersion,
    timestamp: new Date().toISOString(),
    checks: health.checks
  });
}

/**
 * Send success response
 */
function sendSuccessResponse(
  res: Response,
  requestId: string,
  startTime: number,
  data: unknown
): void {
  const response: DeprecationResponse = {
    success: true,
    data: data as DeprecationResponse['data'],
    meta: {
      agent: DEPRECATION_AGENT_METADATA.agentId,
      version: DEPRECATION_AGENT_METADATA.agentVersion,
      timestamp: new Date().toISOString(),
      requestId,
      processingDurationMs: Date.now() - startTime
    }
  };

  logger.info('Request completed successfully', {
    requestId,
    processingDurationMs: response.meta.processingDurationMs
  });

  res.status(200).json(response);
}

/**
 * Send error response
 */
function sendErrorResponse(
  res: Response,
  requestId: string,
  startTime: number,
  error: DeprecationResponse['error'],
  statusCode: number
): void {
  const response: DeprecationResponse = {
    success: false,
    error,
    meta: {
      agent: DEPRECATION_AGENT_METADATA.agentId,
      version: DEPRECATION_AGENT_METADATA.agentVersion,
      timestamp: new Date().toISOString(),
      requestId,
      processingDurationMs: Date.now() - startTime
    }
  };

  logger.warn('Request failed', {
    requestId,
    errorCode: error?.code,
    statusCode,
    processingDurationMs: response.meta.processingDurationMs
  });

  res.status(statusCode).json(response);
}

/**
 * Generate request ID
 */
function generateRequestId(): string {
  return `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Export handler for Google Cloud Functions
 */
export const deprecationHandler = handler;
