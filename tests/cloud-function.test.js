/**
 * Tests for marketplace-agents Cloud Function handler.
 *
 * Validates: routing, execution_metadata, layers_executed, CORS, health,
 * and both agent contracts (package + deprecation).
 */

'use strict';

const { handler } = require('../index');

// ---------------------------------------------------------------------------
// Mock helpers — Express-style req/res
// ---------------------------------------------------------------------------

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/health',
    headers: {},
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {
    _status: null,
    _headers: {},
    _body: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
    send(body) {
      res._body = body;
      return res;
    },
    set(keyOrObj, value) {
      if (typeof keyOrObj === 'object') {
        Object.assign(res._headers, keyOrObj);
      } else {
        res._headers[keyOrObj] = value;
      }
      return res;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('marketplace-agents Cloud Function', () => {
  // ------ Health ------

  describe('GET /health', () => {
    it('returns healthy status with both agents listed', async () => {
      const req = mockReq({ method: 'GET', path: '/health' });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('healthy');
      expect(res._body.service).toBe('marketplace-agents');
      expect(res._body.agents).toEqual(['package', 'deprecation']);
    });

    it('includes execution_metadata and layers_executed', async () => {
      const req = mockReq({ method: 'GET', path: '/health' });
      const res = mockRes();
      await handler(req, res);

      expect(res._body.execution_metadata).toBeDefined();
      expect(res._body.execution_metadata.service).toBe('marketplace-agents');
      expect(res._body.execution_metadata.trace_id).toBeDefined();
      expect(res._body.execution_metadata.timestamp).toBeDefined();
      expect(res._body.execution_metadata.execution_id).toBeDefined();
      expect(res._body.layers_executed).toBeDefined();
      expect(res._body.layers_executed.length).toBeGreaterThan(0);
    });

    it('uses x-correlation-id as trace_id when present', async () => {
      const correlationId = 'test-trace-123';
      const req = mockReq({
        method: 'GET',
        path: '/health',
        headers: { 'x-correlation-id': correlationId },
      });
      const res = mockRes();
      await handler(req, res);

      expect(res._body.execution_metadata.trace_id).toBe(correlationId);
    });

    it('GET / also returns health', async () => {
      const req = mockReq({ method: 'GET', path: '/' });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body.agents).toEqual(['package', 'deprecation']);
    });
  });

  // ------ CORS ------

  describe('CORS', () => {
    it('responds 204 to OPTIONS preflight', async () => {
      const req = mockReq({ method: 'OPTIONS', path: '/v1/marketplace/package' });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(204);
      expect(res._headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(res._headers['Access-Control-Allow-Methods']).toContain('POST');
    });

    it('sets CORS headers on all responses', async () => {
      const req = mockReq({ method: 'GET', path: '/health' });
      const res = mockRes();
      await handler(req, res);

      expect(res._headers['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  // ------ Routing ------

  describe('Routing', () => {
    it('returns 404 for unknown paths with execution_metadata', async () => {
      const req = mockReq({ method: 'POST', path: '/v1/unknown' });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
      expect(res._body.error.code).toBe('NOT_FOUND');
      expect(res._body.execution_metadata).toBeDefined();
      expect(res._body.layers_executed).toBeDefined();
    });

    it('returns 405 for non-POST on agent routes', async () => {
      const req = mockReq({ method: 'GET', path: '/v1/marketplace/package' });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(405);
      expect(res._body.error.code).toBe('METHOD_NOT_ALLOWED');
    });
  });

  // ------ Deprecation Agent ------

  describe('POST /v1/marketplace/deprecation', () => {
    it('executes deprecation with valid input and returns execution_metadata', async () => {
      const req = mockReq({
        method: 'POST',
        path: '/v1/marketplace/deprecation',
        headers: { 'x-correlation-id': 'dep-trace-001' },
        body: {
          assetId: 'agent-123',
          assetType: 'agent',
          reason: 'end-of-life',
          targetState: 'deprecated',
          dryRun: true,
        },
      });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);

      // execution_metadata
      expect(res._body.execution_metadata.trace_id).toBe('dep-trace-001');
      expect(res._body.execution_metadata.service).toBe('marketplace-agents');

      // layers_executed
      expect(res._body.layers_executed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ layer: 'AGENT_ROUTING', status: 'completed' }),
          expect.objectContaining({
            layer: 'MARKETPLACE_DEPRECATION',
            status: 'completed',
            duration_ms: expect.any(Number),
          }),
        ]),
      );
    });

    it('returns validation error for missing required fields', async () => {
      const req = mockReq({
        method: 'POST',
        path: '/v1/marketplace/deprecation',
        body: {},
      });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._body.success).toBe(false);
      expect(res._body.error.code).toBe('VALIDATION_ERROR');
      expect(res._body.layers_executed).toBeDefined();
    });
  });

  // ------ Packaging Agent ------

  describe('POST /v1/marketplace/package', () => {
    it('executes packaging with valid input and returns execution_metadata', async () => {
      const req = mockReq({
        method: 'POST',
        path: '/v1/marketplace/package',
        headers: { 'x-correlation-id': 'pkg-trace-001' },
        body: {
          assets: [{ id: 'asset-1', type: 'agent', name: 'test-agent' }],
          metadata: { name: 'test-package', version: '1.0.0' },
          visibility: 'internal',
          dryRun: true,
        },
      });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.result_code).toBe('PACKAGE_CREATED');

      // execution_metadata
      expect(res._body.execution_metadata.trace_id).toBe('pkg-trace-001');
      expect(res._body.execution_metadata.service).toBe('marketplace-agents');

      // layers_executed
      expect(res._body.layers_executed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ layer: 'AGENT_ROUTING', status: 'completed' }),
          expect.objectContaining({
            layer: 'MARKETPLACE_PACKAGE',
            status: 'completed',
            duration_ms: expect.any(Number),
          }),
        ]),
      );
    });

    it('returns validation error for missing assets', async () => {
      const req = mockReq({
        method: 'POST',
        path: '/v1/marketplace/package',
        body: { metadata: { name: 'x', version: '1.0.0' } },
      });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._body.success).toBe(false);
      expect(res._body.layers_executed).toBeDefined();
    });

    it('returns validation error for missing metadata', async () => {
      const req = mockReq({
        method: 'POST',
        path: '/v1/marketplace/package',
        body: { assets: [{ id: '1', type: 'agent' }] },
      });
      const res = mockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._body.success).toBe(false);
    });
  });

  // ------ Response contract ------

  describe('Response contract (all routes)', () => {
    const routes = [
      { method: 'GET', path: '/health' },
      {
        method: 'POST',
        path: '/v1/marketplace/deprecation',
        body: { assetId: 'a', assetType: 'agent', reason: 'test', dryRun: true },
      },
      {
        method: 'POST',
        path: '/v1/marketplace/package',
        body: {
          assets: [{ id: '1', type: 'agent', name: 'a' }],
          metadata: { name: 'p', version: '1.0.0' },
          dryRun: true,
        },
      },
    ];

    test.each(routes)('$method $path includes execution_metadata', async (route) => {
      const req = mockReq({ method: route.method, path: route.path, body: route.body || {} });
      const res = mockRes();
      await handler(req, res);

      const em = res._body.execution_metadata;
      expect(em).toBeDefined();
      expect(em.service).toBe('marketplace-agents');
      expect(typeof em.trace_id).toBe('string');
      expect(typeof em.timestamp).toBe('string');
      expect(typeof em.execution_id).toBe('string');
    });

    test.each(routes)('$method $path includes layers_executed', async (route) => {
      const req = mockReq({ method: route.method, path: route.path, body: route.body || {} });
      const res = mockRes();
      await handler(req, res);

      expect(Array.isArray(res._body.layers_executed)).toBe(true);
      expect(res._body.layers_executed.length).toBeGreaterThan(0);
      res._body.layers_executed.forEach((l) => {
        expect(l.layer).toBeDefined();
        expect(l.status).toBeDefined();
      });
    });
  });
});
