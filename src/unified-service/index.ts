/**
 * LLM-Marketplace Unified Service Entrypoint
 *
 * Single Google Cloud Run service exposing all marketplace agents:
 * - POST /deprecation - Deprecation Agent
 * - POST /package - Marketplace Packaging Agent
 * - GET /health - Unified health check
 * - GET /deprecation/health - Deprecation agent health
 * - GET /package/health - Packaging agent health
 *
 * All persistence via ruvector-service ONLY - NO direct SQL access.
 */

import http from 'http';
import { URL } from 'url';

// Agent handlers (lazy loaded)
let deprecationHandler: any = null;
let packagingHandler: any = null;

const SERVICE_NAME = process.env.SERVICE_NAME || 'llm-marketplace';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const PORT = parseInt(process.env.PORT || '8080', 10);

interface ServiceHealth {
  service: string;
  version: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  agents: {
    deprecation: { status: string; loaded: boolean };
    packaging: { status: string; loaded: boolean };
  };
  environment: string;
  uptime: number;
}

// Lazy load handlers to improve cold start
async function getDeprecationHandler() {
  if (!deprecationHandler) {
    const module = await import('../../agents/deprecation-agent/src/handler/edge-function');
    deprecationHandler = module.handler || module.deprecationHandler;
  }
  return deprecationHandler;
}

async function getPackagingHandler() {
  if (!packagingHandler) {
    const module = await import('../../agents/marketplace-packaging/src/handlers/edge-function-handler');
    packagingHandler = module.marketplacePackagingAgent || module.handleRequest;
  }
  return packagingHandler;
}

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Correlation-Id',
  'Access-Control-Max-Age': '86400',
};

// Standard response headers
function getResponseHeaders(contentType = 'application/json'): Record<string, string> {
  return {
    ...corsHeaders,
    'Content-Type': contentType,
    'X-Service-Name': SERVICE_NAME,
    'X-Service-Version': SERVICE_VERSION,
  };
}

// Parse request body
async function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
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

// Health check response
function getHealthResponse(): ServiceHealth {
  return {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agents: {
      deprecation: {
        status: 'available',
        loaded: deprecationHandler !== null,
      },
      packaging: {
        status: 'available',
        loaded: packagingHandler !== null,
      },
    },
    environment: process.env.PLATFORM_ENV || 'development',
    uptime: process.uptime(),
  };
}

// Create mock request/response for Cloud Functions compatibility
function createCloudFunctionContext(req: http.IncomingMessage, body: any) {
  return {
    method: req.method,
    headers: req.headers,
    body,
    query: {},
    rawBody: Buffer.from(JSON.stringify(body)),
  };
}

// Main request handler
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method?.toUpperCase();

  console.log(`[${new Date().toISOString()}] ${method} ${path}`);

  // Set CORS headers for all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Route: Health checks
    if (path === '/health' || path === '/') {
      if (method === 'GET') {
        const health = getHealthResponse();
        res.writeHead(200, getResponseHeaders());
        res.end(JSON.stringify(health));
        return;
      }
    }

    // Route: Deprecation agent health
    if (path === '/deprecation/health') {
      if (method === 'GET') {
        res.writeHead(200, getResponseHeaders());
        res.end(JSON.stringify({
          agent: 'deprecation-agent',
          status: 'healthy',
          timestamp: new Date().toISOString(),
        }));
        return;
      }
    }

    // Route: Packaging agent health
    if (path === '/package/health') {
      if (method === 'GET') {
        res.writeHead(200, getResponseHeaders());
        res.end(JSON.stringify({
          agent: 'marketplace-packaging-agent',
          status: 'healthy',
          timestamp: new Date().toISOString(),
        }));
        return;
      }
    }

    // Route: Deprecation agent
    if (path === '/deprecation' || path.startsWith('/deprecation/')) {
      if (method !== 'POST') {
        res.writeHead(405, getResponseHeaders());
        res.end(JSON.stringify({
          success: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' },
        }));
        return;
      }

      const body = await parseBody(req);
      const handler = await getDeprecationHandler();

      // Create compatible request object
      const cloudReq = createCloudFunctionContext(req, body);

      // Capture response
      let responseData: any = null;
      let responseStatus = 200;

      const cloudRes = {
        status: (code: number) => {
          responseStatus = code;
          return cloudRes;
        },
        json: (data: any) => {
          responseData = data;
          return cloudRes;
        },
        send: (data: any) => {
          responseData = data;
          return cloudRes;
        },
        set: (key: string, value: string) => {
          res.setHeader(key, value);
          return cloudRes;
        },
        setHeader: (key: string, value: string) => {
          res.setHeader(key, value);
          return cloudRes;
        },
      };

      await handler(cloudReq, cloudRes);

      res.writeHead(responseStatus, getResponseHeaders());
      res.end(JSON.stringify(responseData));

      console.log(`[${new Date().toISOString()}] Deprecation agent completed in ${Date.now() - startTime}ms`);
      return;
    }

    // Route: Packaging agent
    if (path === '/package' || path.startsWith('/package/')) {
      if (method !== 'POST') {
        res.writeHead(405, getResponseHeaders());
        res.end(JSON.stringify({
          success: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' },
        }));
        return;
      }

      const body = await parseBody(req);
      const handler = await getPackagingHandler();

      const cloudReq = createCloudFunctionContext(req, body);

      let responseData: any = null;
      let responseStatus = 200;

      const cloudRes = {
        status: (code: number) => {
          responseStatus = code;
          return cloudRes;
        },
        json: (data: any) => {
          responseData = data;
          return cloudRes;
        },
        send: (data: any) => {
          responseData = data;
          return cloudRes;
        },
        set: (key: string, value: string) => {
          res.setHeader(key, value);
          return cloudRes;
        },
        setHeader: (key: string, value: string) => {
          res.setHeader(key, value);
          return cloudRes;
        },
      };

      await handler(cloudReq, cloudRes);

      res.writeHead(responseStatus, getResponseHeaders());
      res.end(JSON.stringify(responseData));

      console.log(`[${new Date().toISOString()}] Packaging agent completed in ${Date.now() - startTime}ms`);
      return;
    }

    // Route: Not found
    res.writeHead(404, getResponseHeaders());
    res.end(JSON.stringify({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${path} not found`,
        availableRoutes: [
          'GET /health',
          'POST /deprecation',
          'GET /deprecation/health',
          'POST /package',
          'GET /package/health',
        ],
      },
    }));

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);

    res.writeHead(500, getResponseHeaders());
    res.end(JSON.stringify({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      meta: {
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        processingDurationMs: Date.now() - startTime,
      },
    }));
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           LLM-MARKETPLACE UNIFIED SERVICE                    ║
╠══════════════════════════════════════════════════════════════╣
║  Service:     ${SERVICE_NAME.padEnd(44)}║
║  Version:     ${SERVICE_VERSION.padEnd(44)}║
║  Port:        ${String(PORT).padEnd(44)}║
║  Environment: ${(process.env.PLATFORM_ENV || 'development').padEnd(44)}║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    GET  /health            - Unified health check            ║
║    POST /deprecation       - Deprecation Agent               ║
║    GET  /deprecation/health- Deprecation health              ║
║    POST /package           - Packaging Agent                 ║
║    GET  /package/health    - Packaging health                ║
╠══════════════════════════════════════════════════════════════╣
║  Persistence: ruvector-service (NO direct SQL)               ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

export { server };
