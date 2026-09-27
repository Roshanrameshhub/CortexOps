/**
 * marketplace-agents — Google Cloud Function Entry Point
 *
 * Cloud Function name : marketplace-agents
 * Runtime             : nodejs20
 * Entry point         : handler
 * Region              : us-central1
 *
 * Routes:
 *   GET  /health                          → Health check
 *   POST /v1/marketplace/package          → Marketplace Packaging Agent
 *   POST /v1/marketplace/deprecation      → Deprecation Agent
 *
 * Every response includes execution_metadata and layers_executed.
 *
 * Deploy:
 *   gcloud functions deploy marketplace-agents \
 *     --runtime nodejs20 --trigger-http --region us-central1 \
 *     --project agentics-dev --entry-point handler \
 *     --memory 512MB --timeout 60s --no-allow-unauthenticated
 */

'use strict';

const crypto = require('crypto');

// Import agent handlers — business logic is NOT duplicated.
const {
  handleDeprecation,
  handlePackaging,
} = require('./src/unified-service/server');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE = 'marketplace-agents';
const VERSION = '1.0.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Request-Id, X-Correlation-Id, X-Execution-Id, X-Parent-Span-Id',
  'Access-Control-Max-Age': '86400',
};

// ---------------------------------------------------------------------------
// Agent routing table — only the 2 owned agents
// ---------------------------------------------------------------------------

const AGENTS = {
  '/v1/marketplace/package': {
    handler: handlePackaging,
    layerName: 'MARKETPLACE_PACKAGE',
  },
  '/v1/marketplace/deprecation': {
    handler: handleDeprecation,
    layerName: 'MARKETPLACE_DEPRECATION',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply CORS and standard headers to the response.
 */
function setCors(res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
  res.set('Content-Type', 'application/json');
  res.set('X-Service-Name', SERVICE);
}

/**
 * Build the execution_metadata block required on every response.
 */
function buildExecutionMetadata(req) {
  return {
    trace_id: req.headers['x-correlation-id'] || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    service: SERVICE,
    execution_id: crypto.randomUUID(),
  };
}

/**
 * Send a JSON response enriched with execution_metadata + layers_executed.
 */
function sendResponse(res, statusCode, body, layers, req) {
  res.status(statusCode).json({
    ...body,
    execution_metadata: buildExecutionMetadata(req),
    layers_executed: layers,
  });
}

// ---------------------------------------------------------------------------
// Cloud Function handler
// ---------------------------------------------------------------------------

/**
 * HTTP entry point for Google Cloud Functions.
 *
 * @param {import('@google-cloud/functions-framework').Request}  req
 * @param {import('@google-cloud/functions-framework').Response} res
 */
exports.handler = async (req, res) => {
  setCors(res);

  // ---- CORS preflight ----
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  const path = req.path || '/';

  // ---- Health check ----
  if ((path === '/' || path === '/health') && req.method === 'GET') {
    return sendResponse(
      res,
      200,
      {
        service: SERVICE,
        version: VERSION,
        status: 'healthy',
        agents: ['package', 'deprecation'],
        timestamp: new Date().toISOString(),
      },
      [{ layer: 'HEALTH_CHECK', status: 'completed' }],
      req,
    );
  }

  // ---- Agent routing ----
  const agent = AGENTS[path];

  if (!agent) {
    return sendResponse(
      res,
      404,
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${path} not found`,
        },
        available_routes: [
          'GET  /health',
          'POST /v1/marketplace/package',
          'POST /v1/marketplace/deprecation',
        ],
      },
      [{ layer: 'AGENT_ROUTING', status: 'error' }],
      req,
    );
  }

  if (req.method !== 'POST') {
    return sendResponse(
      res,
      405,
      {
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' },
      },
      [{ layer: 'AGENT_ROUTING', status: 'error' }],
      req,
    );
  }

  // ---- Execute agent ----
  const body = req.body || {};
  const agentStart = Date.now();

  try {
    const result = await agent.handler(req, body);
    const duration_ms = Date.now() - agentStart;

    return sendResponse(
      res,
      result.status,
      result.body,
      [
        { layer: 'AGENT_ROUTING', status: 'completed' },
        { layer: agent.layerName, status: 'completed', duration_ms },
      ],
      req,
    );
  } catch (error) {
    const duration_ms = Date.now() - agentStart;

    return sendResponse(
      res,
      500,
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      [
        { layer: 'AGENT_ROUTING', status: 'completed' },
        { layer: agent.layerName, status: 'error', duration_ms },
      ],
      req,
    );
  }
};
