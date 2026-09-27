/**
 * Packaging Service Tests
 *
 * Unit tests for the Marketplace Packaging Agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPackagingService, resetPackagingService } from '../src/services/packaging-service';
import { resetRuVectorClient } from '../src/integrations/ruvector-client';
import { resetRegistryClient } from '../src/integrations/registry-client';
import { resetConfig, setConfig } from '../src/config';
import type { PackagingAgentInput } from '@llm-marketplace/agentics-contracts';

// Mock fetch for external calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PackagingService', () => {
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
      validation: {
        maxPackageSizeBytes: 100 * 1024 * 1024,
        maxAssetsPerPackage: 100,
        strictMode: false,
      },
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('validatePackage', () => {
    it('should validate a complete package input', async () => {
      const input: PackagingAgentInput = createValidInput();

      const service = getPackagingService();
      const result = await service.validatePackage(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata_completeness).toBeGreaterThan(0);
      expect(result.compatibility_score).toBeGreaterThan(0);
    });

    it('should detect missing keywords warning', async () => {
      const input: PackagingAgentInput = createValidInput();
      delete (input.metadata as any).keywords;

      const service = getPackagingService();
      const result = await service.validatePackage(input);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'MISSING_KEYWORDS')).toBe(true);
    });

    it('should detect missing category warning', async () => {
      const input: PackagingAgentInput = createValidInput();
      delete (input.metadata as any).category;

      const service = getPackagingService();
      const result = await service.validatePackage(input);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'MISSING_CATEGORY')).toBe(true);
    });

    it('should detect duplicate assets', async () => {
      const input: PackagingAgentInput = createValidInput();
      input.assets = [
        ...input.assets,
        input.assets[0], // Duplicate
      ];

      const service = getPackagingService();
      const result = await service.validatePackage(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_ASSET')).toBe(true);
    });

    it('should reject too many assets', async () => {
      // Override config for this test
      setConfig({
        validation: {
          maxPackageSizeBytes: 100 * 1024 * 1024,
          maxAssetsPerPackage: 1,
          strictMode: false,
        },
      });

      const input: PackagingAgentInput = createValidInput();
      input.assets = [
        { registry_id: 'asset-1', type: 'agent', version: '1.0.0', name: 'Asset 1' },
        { registry_id: 'asset-2', type: 'agent', version: '1.0.0', name: 'Asset 2' },
      ];

      const service = getPackagingService();
      const result = await service.validatePackage(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'TOO_MANY_ASSETS')).toBe(true);
    });
  });

  describe('createPackage', () => {
    it('should create a package successfully when registry responds', async () => {
      // Mock registry responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' }),
          });
        }

        if (url.includes('/latest')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ version: '1.0.0' }),
          });
        }

        if (url.includes('/versions/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'test-asset-id',
              name: 'test-asset',
              type: 'agent',
              version: '1.0.0',
              checksum: 'a'.repeat(64),
              size: 1024,
              content_uri: 'gs://bucket/asset.tar.gz',
              metadata: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          });
        }

        if (url.includes('/decisions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'decision-id',
              persisted_at: new Date().toISOString(),
            }),
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const input: PackagingAgentInput = createValidInput();

      const service = getPackagingService();
      const result = await service.createPackage(input);

      expect(result.success).toBe(true);
      expect(result.result_code).toBe('PACKAGE_CREATED');
      expect(result.artifact).toBeDefined();
      expect(result.artifact?.package_ref).toBe('test-package@1.0.0');
      expect(result.artifact?.manifest).toBeInstanceOf(Array);
      expect(result.artifact?.manifest.length).toBeGreaterThan(0);
      expect(result.metrics?.execution_time_ms).toBeGreaterThan(0);
    });

    it('should fail when assets cannot be resolved', async () => {
      // Mock registry to return 404 for assets
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/latest')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: () => Promise.resolve({ message: 'Asset not found' }),
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const input: PackagingAgentInput = createValidInput();

      const service = getPackagingService();
      const result = await service.createPackage(input);

      expect(result.success).toBe(false);
      expect(result.result_code).toBe('ASSET_NOT_FOUND');
    });

    it('should fail in strict mode with validation warnings', async () => {
      // Mock registry responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/latest')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ version: '1.0.0' }),
          });
        }

        if (url.includes('/versions/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'test-asset-id',
              name: 'test-asset',
              type: 'agent',
              version: '1.0.0',
              checksum: 'a'.repeat(64),
              size: 1024,
              content_uri: 'gs://bucket/asset.tar.gz',
              metadata: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const input: PackagingAgentInput = createValidInput();
      // Remove required fields for warnings
      delete (input.metadata as any).keywords;
      delete (input.metadata as any).category;
      // Add duplicate asset for error
      input.assets.push(input.assets[0]);
      input.validation_level = 'strict';

      const service = getPackagingService();
      const result = await service.createPackage(input);

      expect(result.success).toBe(false);
      expect(result.result_code).toBe('VALIDATION_FAILED');
    });
  });
});

/**
 * Create a valid test input
 */
function createValidInput(): PackagingAgentInput {
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
      documentation: 'https://docs.example.com',
      repository: 'https://github.com/test/repo',
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
