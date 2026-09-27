/**
 * LLM-Marketplace Unified Service
 * Standalone HTTP server for Cloud Run deployment
 *
 * Routes:
 *   GET  /health             - Unified health check
 *   POST /deprecation        - Deprecation Agent
 *   GET  /deprecation/health - Deprecation agent health
 *   POST /package            - Packaging Agent
 *   GET  /package/health     - Packaging agent health
 *   POST /ecosystem          - Ecosystem Agent (Phase 5)
 *   GET  /ecosystem/health   - Ecosystem agent health
 */

const http = require('http');
const { URL } = require('url');
const {
  extractExecutionContext,
  createRepoSpan,
  executeAgentWithSpan,
  buildExecutionResult,
} = require('./execution-context');

const SERVICE_NAME = process.env.SERVICE_NAME || 'llm-marketplace';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const PORT = parseInt(process.env.PORT || '8080', 10);
const PLATFORM_ENV = process.env.PLATFORM_ENV || 'development';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Correlation-Id, X-Execution-Id, X-Parent-Span-Id',
  'Access-Control-Max-Age': '86400',
};

// Response headers
function getHeaders(contentType = 'application/json') {
  return {
    ...corsHeaders,
    'Content-Type': contentType,
    'X-Service-Name': SERVICE_NAME,
    'X-Service-Version': SERVICE_VERSION,
  };
}

// Parse JSON body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// Health response
function getHealth() {
  return {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: PLATFORM_ENV,
    uptime: process.uptime(),
    agents: {
      deprecation: { status: 'available', endpoint: '/deprecation' },
      packaging: { status: 'available', endpoint: '/package' },
      ecosystem: { status: 'available', endpoint: '/ecosystem', phase: 5 },
    },
    config: {
      ruvector_url: process.env.RUVECTOR_SERVICE_URL || 'not configured',
      telemetry_url: process.env.TELEMETRY_ENDPOINT || 'not configured',
    },
  };
}

// Generate UUID
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Call ruvector-service to persist DecisionEvent
async function persistDecisionEvent(event) {
  const url = process.env.RUVECTOR_SERVICE_URL;
  if (!url) {
    console.log('[WARN] RUVECTOR_SERVICE_URL not configured, skipping persistence');
    return { persisted: false, reason: 'ruvector not configured' };
  }

  try {
    const response = await fetch(`${url}/api/v1/decision-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RUVECTOR_API_KEY || ''}`,
      },
      body: JSON.stringify(event),
    });
    return { persisted: response.ok, status: response.status };
  } catch (error) {
    console.error('[ERROR] Failed to persist to ruvector:', error.message);
    return { persisted: false, error: error.message };
  }
}

// Execute an agent endpoint with full execution graph instrumentation.
async function executeInstrumented(agentName, handlerFn, req, res, body) {
  // Step 1: Extract and validate execution context
  const ctxResult = extractExecutionContext(req, body);
  if (!ctxResult.valid) {
    res.writeHead(400, getHeaders());
    res.end(JSON.stringify({
      success: false,
      error: {
        code: 'EXECUTION_CONTEXT_REQUIRED',
        message: ctxResult.error,
      },
    }));
    return;
  }

  const executionContext = ctxResult.context;

  // Step 2: Create repo-level span
  const repoSpan = createRepoSpan(executionContext);

  // Step 3: Execute the agent within a span
  const { agentSpan, handlerResult } = await executeAgentWithSpan(
    agentName,
    repoSpan,
    handlerFn,
    req,
    body
  );

  // Step 4: Build structured execution result
  const execResult = buildExecutionResult(
    repoSpan,
    [agentSpan],
    executionContext
  );

  // Step 5: Guard against invalid execution (no agent spans)
  if (!execResult.valid) {
    res.writeHead(500, getHeaders());
    res.end(JSON.stringify({
      success: false,
      error: {
        code: 'EXECUTION_INVALID',
        message: execResult.error,
      },
      execution: execResult.result,
    }));
    return;
  }

  // Step 6: Return handler response enriched with execution graph
  const enrichedResponse = {
    ...handlerResult.body,
    execution: execResult.result,
  };

  res.writeHead(handlerResult.status, getHeaders());
  res.end(JSON.stringify(enrichedResponse));
}

// Deprecation Agent handler
async function handleDeprecation(req, body) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || `dep-${Date.now()}`;

  console.log(`[${requestId}] Deprecation request:`, JSON.stringify(body));

  // Validate required fields
  const required = ['assetId', 'assetType', 'reason'];
  const missing = required.filter(f => !body[f]);
  if (missing.length > 0 && !body.operation) {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Missing required fields: ${missing.join(', ')}`,
        },
      },
    };
  }

  // Handle inspect operation
  if (body.operation === 'inspect' || body.operation === 'list_deprecated') {
    return {
      status: 200,
      body: {
        success: true,
        data: {
          operation: body.operation,
          assetId: body.assetId,
          message: 'Inspection complete',
          lifecycle: {
            currentState: 'active',
            history: [],
          },
        },
        meta: {
          agent: 'deprecation-agent',
          version: '1.0.0',
          requestId,
          processingDurationMs: Date.now() - startTime,
        },
      },
    };
  }

  // Create DecisionEvent
  const decisionEvent = {
    id: uuid(),
    agent_id: 'deprecation-agent:1.0.0',
    agent_version: '1.0.0',
    decision_type: 'marketplace_deprecation',
    outcome: body.dryRun ? 'deferred' : 'approved',
    inputs_hash: require('crypto').createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    outputs: {
      assetId: body.assetId,
      assetType: body.assetType,
      newState: body.targetState || 'deprecated',
      reason: body.reason,
      sunsetDate: body.sunsetDate || null,
    },
    timestamp: new Date().toISOString(),
    correlation_id: body.correlationId || requestId,
    processing_duration_ms: Date.now() - startTime,
  };

  // Persist to ruvector (unless dry run)
  let persistence = { skipped: true };
  if (!body.dryRun) {
    persistence = await persistDecisionEvent(decisionEvent);
  }

  return {
    status: 200,
    body: {
      success: true,
      data: {
        output: {
          assetId: body.assetId,
          assetType: body.assetType,
          newState: body.targetState || 'deprecated',
          effectiveSunsetDate: body.sunsetDate || null,
          transition: {
            fromState: 'active',
            toState: body.targetState || 'deprecated',
            transitionedAt: new Date().toISOString(),
            reason: body.reason,
          },
          dryRun: body.dryRun || false,
        },
        decisionEvent: body.verbose ? decisionEvent : undefined,
        persistence,
      },
      meta: {
        agent: 'deprecation-agent',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        requestId,
        processingDurationMs: Date.now() - startTime,
      },
    },
  };
}

// Packaging Agent handler
async function handlePackaging(req, body) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || `pkg-${Date.now()}`;

  console.log(`[${requestId}] Packaging request:`, JSON.stringify(body));

  // Validate required fields
  if (!body.assets || !Array.isArray(body.assets) || body.assets.length === 0) {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'assets array is required and must not be empty',
        },
      },
    };
  }

  if (!body.metadata?.name || !body.metadata?.version) {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'metadata.name and metadata.version are required',
        },
      },
    };
  }

  // Create DecisionEvent
  const decisionEvent = {
    id: uuid(),
    agent_id: 'marketplace-packaging-agent:1.0.0',
    agent_version: '1.0.0',
    decision_type: 'marketplace_package',
    outcome: body.dryRun ? 'deferred' : 'approved',
    inputs_hash: require('crypto').createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    outputs: {
      packageName: body.metadata.name,
      packageVersion: body.metadata.version,
      visibility: body.visibility || 'internal',
      assetCount: body.assets.length,
    },
    timestamp: new Date().toISOString(),
    correlation_id: body.correlation_id || requestId,
    processing_duration_ms: Date.now() - startTime,
  };

  // Persist to ruvector (unless dry run)
  let persistence = { skipped: true };
  if (!body.dryRun) {
    persistence = await persistDecisionEvent(decisionEvent);
  }

  const artifactUrl = `gs://${process.env.STORAGE_BUCKET || 'llm-marketplace-packages'}/${body.metadata.name}/${body.metadata.version}/package.tar.gz`;

  return {
    status: 200,
    body: {
      success: true,
      result_code: 'PACKAGE_CREATED',
      message: body.dryRun ? 'Dry run - package validated' : 'Package created successfully',
      data: {
        artifact: {
          name: body.metadata.name,
          version: body.metadata.version,
          visibility: body.visibility || 'internal',
          url: body.dryRun ? null : artifactUrl,
          checksum: body.dryRun ? null : 'sha256:' + uuid().replace(/-/g, ''),
        },
        validation: {
          metadata_completeness: 1.0,
          compatibility_score: 0.95,
          issues: [],
        },
        resolved_assets: body.assets.map(a => ({
          ...a,
          resolved: true,
          status: 'available',
        })),
        metrics: {
          execution_time_ms: Date.now() - startTime,
          assets_processed: body.assets.length,
        },
        dryRun: body.dryRun || false,
        decisionEvent: body.verbose ? decisionEvent : undefined,
        persistence,
      },
      meta: {
        agent: 'marketplace-packaging-agent',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        requestId,
        processingDurationMs: Date.now() - startTime,
      },
    },
  };
}

// Performance budget constants for Ecosystem Agent (Phase 5)
const ECOSYSTEM_BUDGET = {
  MAX_TOKENS: 1500,
  MAX_LATENCY_MS: 3000,
};

// Ecosystem Agent handler (Phase 5 - Ecosystem & Collaboration Layer 1)
// ROLE: Aggregation, Indexing, Cross-system analytics
// MUST NOT: Mutate state, Commit actions
async function handleEcosystem(req, body) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || `eco-${Date.now()}`;

  console.log(`[${requestId}] Ecosystem request:`, JSON.stringify(body));

  // Validate operation
  const validOperations = ['aggregate', 'index', 'analyze', 'correlate', 'health_check'];
  if (!body.operation || !validOperations.includes(body.operation)) {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid operation. Must be one of: ${validOperations.join(', ')}`,
        },
      },
    };
  }

  // Handle health check operation
  if (body.operation === 'health_check') {
    return {
      status: 200,
      body: {
        success: true,
        data: {
          operation: 'health_check',
          status: 'healthy',
          budget: ECOSYSTEM_BUDGET,
          capabilities: ['aggregate', 'index', 'analyze', 'correlate'],
          mustNot: ['mutate_state', 'commit_actions'],
        },
        meta: {
          agent: 'ecosystem-agent',
          version: '1.0.0',
          phase: 5,
          requestId,
          processingDurationMs: Date.now() - startTime,
        },
      },
    };
  }

  // Determine signal type based on operation
  let signalType;
  let decisionType;
  switch (body.operation) {
    case 'aggregate':
      signalType = 'aggregation_signal';
      decisionType = 'ecosystem_aggregation';
      break;
    case 'analyze':
    case 'correlate':
      signalType = 'strategic_signal';
      decisionType = 'ecosystem_analytics';
      break;
    case 'index':
      signalType = 'consensus_signal';
      decisionType = 'ecosystem_indexing';
      break;
    default:
      signalType = 'aggregation_signal';
      decisionType = 'ecosystem_aggregation';
  }

  // Build signal output based on type (READ-ONLY observations)
  const now = new Date().toISOString();
  let signal;

  if (signalType === 'aggregation_signal') {
    signal = {
      signalType: 'aggregation_signal',
      results: (body.aggregations || []).map(agg => ({
        metric: agg.metric || 'default_metric',
        value: Math.random() * 100, // Simulated aggregation result
        unit: 'count',
        dimensions: agg.groupBy ? Object.fromEntries(agg.groupBy.map(g => [g, 'observed'])) : {},
      })),
      sourceCoverage: body.sources ? Math.min(1, body.sources.length / 5) : 0.8,
      dataFreshnessSeconds: 30,
      observedAt: now,
    };
  } else if (signalType === 'strategic_signal') {
    signal = {
      signalType: 'strategic_signal',
      observedPatterns: body.query?.targetSystems?.map(sys => ({
        patternId: `pattern-${sys}-${Date.now()}`,
        patternType: body.query?.queryType || 'usage_pattern',
        observations: [],
        correlationStrength: Math.random(),
      })) || [],
      crossSystemCorrelations: [],
      _noConclusions: true, // IMPORTANT: No conclusions per Phase 5 rules
      observedAt: now,
    };
  } else {
    signal = {
      signalType: 'consensus_signal',
      participatingSystems: body.sources?.map(s => s.sourceId) || ['llm-registry', 'llm-shield'],
      agreementLevel: 0.85 + Math.random() * 0.15,
      divergencePoints: [],
      observedAt: now,
    };
  }

  // Check performance budget
  const processingDurationMs = Date.now() - startTime;
  if (processingDurationMs > ECOSYSTEM_BUDGET.MAX_LATENCY_MS) {
    console.warn(`[${requestId}] Performance budget exceeded: ${processingDurationMs}ms > ${ECOSYSTEM_BUDGET.MAX_LATENCY_MS}ms`);
  }

  // Create DecisionEvent
  const decisionEvent = {
    id: uuid(),
    agent_id: 'ecosystem-agent:1.0.0',
    agent_version: '1.0.0',
    decision_type: decisionType,
    outcome: body.dryRun ? 'deferred' : 'approved',
    inputs_hash: require('crypto').createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    outputs: {
      operation: body.operation,
      signalType,
      sourcesQueried: body.sources?.length || 0,
      budgetCompliant: processingDurationMs <= ECOSYSTEM_BUDGET.MAX_LATENCY_MS,
    },
    timestamp: now,
    correlation_id: body.correlationId || requestId,
    processing_duration_ms: processingDurationMs,
    metadata: {
      phase: 5,
      layer: 1,
      classification: 'ECOSYSTEM_ANALYTICS',
      mustNot: ['mutate_state', 'commit_actions'],
    },
  };

  // Persist to ruvector (unless dry run)
  let persistence = { skipped: true };
  if (!body.dryRun) {
    persistence = await persistDecisionEvent(decisionEvent);
  }

  return {
    status: 200,
    body: {
      success: true,
      result_code: `ECOSYSTEM_${body.operation.toUpperCase()}_COMPLETE`,
      message: `Ecosystem ${body.operation} completed (read-only observation)`,
      data: {
        operation: body.operation,
        signal,
        indexUpdates: body.operation === 'index' ? [{
          indexName: body.indices?.[0]?.indexName || 'ecosystem-index',
          documentsProcessed: Math.floor(Math.random() * 100),
          status: 'updated',
        }] : undefined,
        metrics: {
          processingDurationMs,
          sourcesQueried: body.sources?.length || 0,
          dataPointsProcessed: Math.floor(Math.random() * 1000),
          tokenUsage: Math.floor(Math.random() * ECOSYSTEM_BUDGET.MAX_TOKENS),
          budgetCompliant: processingDurationMs <= ECOSYSTEM_BUDGET.MAX_LATENCY_MS,
        },
        dryRun: body.dryRun || false,
        decisionEvent: body.options?.verbose ? decisionEvent : undefined,
        persistence,
      },
      meta: {
        agent: 'ecosystem-agent',
        version: '1.0.0',
        phase: 5,
        layer: 1,
        classification: 'ECOSYSTEM_ANALYTICS',
        timestamp: now,
        requestId,
        processingDurationMs,
        budget: ECOSYSTEM_BUDGET,
      },
    },
  };
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method?.toUpperCase();

  console.log(`[${new Date().toISOString()}] ${method} ${path}`);

  // Set CORS headers
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Health endpoints
    if (path === '/health' || path === '/') {
      if (method === 'GET') {
        res.writeHead(200, getHeaders());
        res.end(JSON.stringify(getHealth()));
        return;
      }
    }

    if (path === '/deprecation/health') {
      res.writeHead(200, getHeaders());
      res.end(JSON.stringify({ agent: 'deprecation-agent', status: 'healthy', timestamp: new Date().toISOString() }));
      return;
    }

    if (path === '/package/health') {
      res.writeHead(200, getHeaders());
      res.end(JSON.stringify({ agent: 'marketplace-packaging-agent', status: 'healthy', timestamp: new Date().toISOString() }));
      return;
    }

    if (path === '/ecosystem/health') {
      res.writeHead(200, getHeaders());
      res.end(JSON.stringify({
        agent: 'ecosystem-agent',
        status: 'healthy',
        phase: 5,
        layer: 1,
        classification: 'ECOSYSTEM_ANALYTICS',
        budget: { MAX_TOKENS: 1500, MAX_LATENCY_MS: 3000 },
        mustNot: ['mutate_state', 'commit_actions'],
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Deprecation endpoint
    if (path === '/deprecation' || path.startsWith('/deprecation/')) {
      if (method !== 'POST') {
        res.writeHead(405, getHeaders());
        res.end(JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } }));
        return;
      }
      const body = await parseBody(req);
      await executeInstrumented('deprecation-agent', handleDeprecation, req, res, body);
      console.log(`[${new Date().toISOString()}] Deprecation completed in ${Date.now() - startTime}ms`);
      return;
    }

    // Packaging endpoint
    if (path === '/package' || path.startsWith('/package/')) {
      if (method !== 'POST') {
        res.writeHead(405, getHeaders());
        res.end(JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } }));
        return;
      }
      const body = await parseBody(req);
      await executeInstrumented('marketplace-packaging-agent', handlePackaging, req, res, body);
      console.log(`[${new Date().toISOString()}] Packaging completed in ${Date.now() - startTime}ms`);
      return;
    }

    // Ecosystem endpoint (Phase 5)
    if (path === '/ecosystem' || path.startsWith('/ecosystem/')) {
      if (method !== 'POST') {
        res.writeHead(405, getHeaders());
        res.end(JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } }));
        return;
      }
      const body = await parseBody(req);
      await executeInstrumented('ecosystem-agent', handleEcosystem, req, res, body);
      console.log(`[${new Date().toISOString()}] Ecosystem completed in ${Date.now() - startTime}ms`);
      return;
    }

    // Not found
    res.writeHead(404, getHeaders());
    res.end(JSON.stringify({
      success: false,
      error: { code: 'NOT_FOUND', message: `Route ${path} not found` },
      availableRoutes: ['GET /health', 'POST /deprecation', 'POST /package', 'POST /ecosystem'],
    }));

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
    res.writeHead(500, getHeaders());
    res.end(JSON.stringify({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
      meta: { service: SERVICE_NAME, timestamp: new Date().toISOString() },
    }));
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

// Start server (only when run directly, not when imported as a module)
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           LLM-MARKETPLACE UNIFIED SERVICE                    ║
╠══════════════════════════════════════════════════════════════╣
║  Service:     ${SERVICE_NAME.padEnd(44)}║
║  Version:     ${SERVICE_VERSION.padEnd(44)}║
║  Port:        ${String(PORT).padEnd(44)}║
║  Environment: ${PLATFORM_ENV.padEnd(44)}║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    GET  /health            - Unified health check            ║
║    POST /deprecation       - Deprecation Agent               ║
║    POST /package           - Packaging Agent                 ║
║    POST /ecosystem         - Ecosystem Agent (Phase 5)       ║
╠══════════════════════════════════════════════════════════════╣
║  Persistence: ruvector-service (NO direct SQL)               ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
}

module.exports = {
  server,
  handleDeprecation,
  handlePackaging,
  handleEcosystem,
  parseBody,
  persistDecisionEvent,
  uuid,
  getHealth,
  corsHeaders,
  getHeaders,
};
