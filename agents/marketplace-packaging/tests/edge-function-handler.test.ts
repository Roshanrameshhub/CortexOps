/**
 * Edge Function Handler Tests
 *
 * Tests for the Google Cloud Edge Function HTTP handler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRequest } from '../src/handlers/edge-function-handler';
import { resetPackagingService } from '../src/services/packaging-service';
import { resetRuVectorClient } from '../src/integrations/ruvector-client';
import { resetRegistryClient } from '../src/integrations/registry-client';
import { resetConfig, setConfig } from '../src/config';

// Mock fetch for external calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Edge Function Handler', () => {
  beforeEach(() => {
    // Reset all singletons
    resetPackagingService();
    resetRuVectorClient();
    resetRegistryClient();
    resetConfig();

    // Set test configuration
    setConfig({
      ruvector: {
        baseUrl: 'http://localhost:8080',
        timeout: 5000,
        retryAttempts: 1,
        retryDelayMs: 100,
      },
      registry: {
        baseUrl: 'http://localhost:8081',
        timeout: 5000,
      },
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await handleRequest({
        method: 'GET',
        url: 'http://localhost/health',
        headers: {},
      });

      expect(response.status).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.agent).toBe('marketplace-packaging-agent');
    });
  });

  describe('Metadata Endpoint', () => {
    it('should return agent metadata', async () => {
      const response = await handleRequest({
        method: 'GET',
        url: 'http://localhost/metadata',
        headers: {},
      });

      expect(response.status).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.id).toBe('marketplace-packaging-agent');
      expect(body.version).toBe('1.0.0');
      expect(body.classification).toBe('PACKAGING');
    });
  });

  describe('Package Endpoint', () => {
    it('should reject requests without body', async () => {
      const response = await handleRequest({
        method: 'POST',
        url: 'http://localhost/package',
        headers: {},
      });

      expect(response.status).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_BODY');
    });

    it('should reject invalid JSON', async () => {
      const response = await handleRequest({
        method: 'POST',
        url: 'http://localhost/package',
        headers: {},
        body: 'not valid json',
      });

      expect(response.status).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_JSON');
    });

    it('should reject invalid input schema', async () => {
      const response = await handleRequest({
        method: 'POST',
        url: 'http://localhost/package',
        headers: {},
        body: JSON.stringify({
          // Missing required fields
          metadata: {
            name: 'test',
          },
        }),
      });

      expect(response.status).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should include correlation ID in response', async () => {
      const correlationId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await handleRequest({
        method: 'POST',
        url: 'http://localhost/package',
        headers: {
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({}),
      });

      expect(response.headers['X-Correlation-ID']).toBe(correlationId);
    });

    it('should generate correlation ID if not provided', async () => {
      const response = await handleRequest({
        method: 'POST',
        url: 'http://localhost/package',
        headers: {},
        body: JSON.stringify({}),
      });

      expect(response.headers['X-Correlation-ID']).toBeDefined();
      expect(response.headers['X-Correlation-ID']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('Validate Endpoint', () => {
    it('should validate package without creating', async () => {
      const input = createValidInput();

      const response = await handleRequest({
        method: 'POST',
        url: 'http://localhost/package/validate',
        headers: {},
        body: JSON.stringify(input),
      });

      expect(response.status).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.validation).toBeDefined();
      expect(body.validation.valid).toBe(true);
    });

    it('should return 400 for invalid package', async () => {
      const input = createValidInput();
      // Add duplicate asset to cause validation failure
      input.assets.push(input.assets[0]);

      const response = await handleRequest({
        method: 'POST',
        url: 'http://localhost/package/validate',
        headers: {},
        body: JSON.stringify(input),
      });

      expect(response.status).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.validation.valid).toBe(false);
    });
  });

  describe('Unknown Endpoints', () => {
    it('should return 404 for unknown paths', async () => {
      const response = await handleRequest({
        method: 'GET',
        url: 'http://localhost/unknown',
        headers: {},
      });

      expect(response.status).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for wrong method', async () => {
      const response = await handleRequest({
        method: 'DELETE',
        url: 'http://localhost/package',
        headers: {},
      });

      expect(response.status).toBe(404);
    });
  });
});

/**
 * Create a valid test input
 */
function createValidInput(): any {
  return {
    correlation_id: '123e4567-e89b-12d3-a456-426614174000',
    assets: [
      {
        registry_id: 'test-asset',
        type: 'agent',
        version: 'latest',
        name: 'Test Asset',
      },
    ],
    metadata: {
      name: 'test-package',
      version: '1.0.0',
      description: 'A test package for unit testing',
      author: {
        name: 'Test Author',
        email: 'test@example.com',
        organization: 'Test Org',
      },
      license: 'MIT',
      keywords: ['test', 'package'],
      category: 'testing',
    },
    visibility: 'private',
    compatibility: {
      platforms: ['universal'],
      min_platform_version: '1.0.0',
    },
    include_sources: false,
    generate_manifest: true,
    validation_level: 'standard',
  };
}
