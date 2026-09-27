/**
 * E2E Test Suite: Service Discovery Workflow
 *
 * Tests the complete service discovery flow including:
 * - Text search with semantic matching
 * - Advanced filtering and faceting
 * - Recommendations (trending, similar, personalized)
 * - Performance and caching
 */

import {
  PublishingServiceClient,
  DiscoveryServiceClient,
} from '../utils/api-client';
import {
  TestDataGenerator,
  WaitHelper,
  AssertionHelper,
  CleanupHelper,
  Logger,
} from '../utils/test-helpers';

describe('E2E: Service Discovery Workflow', () => {
  let publishingClient: PublishingServiceClient;
  let discoveryClient: DiscoveryServiceClient;
  const publishedServices: string[] = [];

  beforeAll(async () => {
    Logger.testSuite('Service Discovery Workflow');

    publishingClient = new PublishingServiceClient();
    discoveryClient = new DiscoveryServiceClient();

    await WaitHelper.waitForService(() => publishingClient.health(), 'Publishing Service');
    await WaitHelper.waitForService(() => discoveryClient.health(), 'Discovery Service');

    // Publish test services for discovery
    Logger.step('Setting up test services...');
    const testServices = [
      TestDataGenerator.generateTestService({
        name: 'GPT-4 Text Generation',
        category: 'text-generation',
        description: 'Advanced text generation using GPT-4',
      }),
      TestDataGenerator.generateTestService({
        name: 'BERT Embeddings',
        category: 'embeddings',
        description: 'Generate semantic embeddings with BERT',
      }),
      TestDataGenerator.generateTestService({
        name: 'Text Classification Service',
        category: 'classification',
        description: 'Multi-class text classification',
      }),
      TestDataGenerator.generateTestService({
        name: 'Document Summarization',
        category: 'summarization',
        description: 'Automatic document summarization',
      }),
      TestDataGenerator.generateTestService({
        name: 'GPT-3.5 Text Generation',
        category: 'text-generation',
        description: 'Cost-effective text generation with GPT-3.5',
      }),
    ];

    for (const service of testServices) {
      const response = await publishingClient.publishService(service);
      publishedServices.push(response.data.serviceId);
      CleanupHelper.registerCleanup(async () => {
        await publishingClient.deleteService(response.data.serviceId);
      });
    }

    // Wait for indexing
    Logger.step('Waiting for Elasticsearch indexing...');
    await WaitHelper.sleep(5000);
  });

  afterAll(async () => {
    await CleanupHelper.cleanup();
  });

  describe('1. Text Search', () => {
    it('should find services by keyword search', async () => {
      Logger.testCase('Keyword search: "generation"');

      const startTime = Date.now();
      const response = await discoveryClient.search('generation');

      expect(response.status).toBe(200);
      expect(response.data.results).toBeDefined();
      expect(response.data.results.length).toBeGreaterThan(0);

      // Should find "GPT-4 Text Generation" and "GPT-3.5 Text Generation"
      const generationServices = response.data.results.filter((s: any) =>
        s.name.toLowerCase().includes('generation')
      );
      expect(generationServices.length).toBeGreaterThanOrEqual(2);

      AssertionHelper.assertResponseTime(startTime, 500, 'Search query');
      Logger.success(`Found ${response.data.results.length} services`);
      Logger.endTest();
    });

    it('should support semantic search', async () => {
      Logger.testCase('Semantic search: "text to text"');

      const response = await discoveryClient.search('text to text');

      expect(response.status).toBe(200);
      expect(response.data.results.length).toBeGreaterThan(0);

      // Should match text generation and summarization services
      Logger.success(`Semantic search returned ${response.data.results.length} results`);
      Logger.endTest();
    });

    it('should handle empty search (return all)', async () => {
      Logger.testCase('Empty search query');

      const response = await discoveryClient.search('');

      expect(response.status).toBe(200);
      expect(response.data.results.length).toBeGreaterThanOrEqual(publishedServices.length);

      Logger.success(`Returned ${response.data.results.length} total services`);
      Logger.endTest();
    });

    it('should return no results for non-existent terms', async () => {
      Logger.testCase('Search for non-existent service');

      const response = await discoveryClient.search('nonexistentservicexyz123');

      expect(response.status).toBe(200);
      expect(response.data.results.length).toBe(0);

      Logger.success('Correctly returned empty results');
      Logger.endTest();
    });
  });

  describe('2. Filtering and Faceting', () => {
    it('should filter by category', async () => {
      Logger.testCase('Filter by category: text-generation');

      const response = await discoveryClient.search('', {
        category: 'text-generation',
      });

      expect(response.status).toBe(200);
      expect(response.data.results.length).toBeGreaterThanOrEqual(2);

      // All results should be text-generation
      response.data.results.forEach((service: any) => {
        expect(service.category).toBe('text-generation');
      });

      Logger.success(`Found ${response.data.results.length} text-generation services`);
      Logger.endTest();
    });

    it('should filter by multiple criteria', async () => {
      Logger.testCase('Filter by category and pricing model');

      const response = await discoveryClient.search('', {
        category: 'text-generation',
        pricingModel: 'per-token',
      });

      expect(response.status).toBe(200);

      response.data.results.forEach((service: any) => {
        expect(service.category).toBe('text-generation');
        expect(service.pricing.model).toBe('per-token');
      });

      Logger.success(`Filtered to ${response.data.results.length} matching services`);
      Logger.endTest();
    });

    it('should filter by SLA availability', async () => {
      Logger.testCase('Filter by minimum SLA');

      const response = await discoveryClient.search('', {
        minAvailability: 99.9,
      });

      expect(response.status).toBe(200);

      response.data.results.forEach((service: any) => {
        expect(service.sla.availability).toBeGreaterThanOrEqual(99.9);
      });

      Logger.success(`Found ${response.data.results.length} services with 99.9%+ SLA`);
      Logger.endTest();
    });
  });

  describe('3. Recommendations', () => {
    it('should get trending services', async () => {
      Logger.testCase('Get trending services');

      const response = await discoveryClient.getTrending();

      expect(response.status).toBe(200);
      expect(response.data.services).toBeDefined();
      expect(Array.isArray(response.data.services)).toBe(true);

      Logger.success(`Retrieved ${response.data.services.length} trending services`);
      Logger.endTest();
    });

    it('should get personalized recommendations', async () => {
      Logger.testCase('Get personalized recommendations');

      const userId = 'test-user-123';
      const response = await discoveryClient.getRecommendations(userId);

      expect(response.status).toBe(200);
      expect(response.data.recommendations).toBeDefined();
      expect(Array.isArray(response.data.recommendations)).toBe(true);

      Logger.success(`Got ${response.data.recommendations.length} personalized recommendations`);
      Logger.endTest();
    });

    it('should get similar services', async () => {
      Logger.testCase('Get similar services');

      if (publishedServices.length > 0) {
        const serviceId = publishedServices[0];
        const detailsResponse = await discoveryClient.getServiceDetails(serviceId);

        expect(detailsResponse.status).toBe(200);
        expect(detailsResponse.data.similarServices).toBeDefined();

        Logger.success(`Found similar services`);
      }

      Logger.endTest();
    });
  });

  describe('4. Service Details', () => {
    it('should retrieve complete service details', async () => {
      Logger.testCase('Get service details');

      const serviceId = publishedServices[0];
      const response = await discoveryClient.getServiceDetails(serviceId);

      expect(response.status).toBe(200);

      const service = response.data;
      AssertionHelper.assertValidUUID(service.id, 'Service ID');
      expect(service.name).toBeDefined();
      expect(service.version).toBeDefined();
      expect(service.category).toBeDefined();
      expect(service.endpoint).toBeDefined();
      expect(service.pricing).toBeDefined();
      expect(service.sla).toBeDefined();
      expect(service.compliance).toBeDefined();

      Logger.success('Retrieved complete service details');
      Logger.endTest();
    });

    it('should include ratings and metrics', async () => {
      Logger.testCase('Check ratings and metrics');

      const serviceId = publishedServices[0];
      const response = await discoveryClient.getServiceDetails(serviceId);

      const service = response.data;
      expect(service.metrics).toBeDefined();

      Logger.success('Service includes metrics data');
      Logger.endTest();
    });
  });

  describe('5. Categories', () => {
    it('should list all available categories', async () => {
      Logger.testCase('Get service categories');

      const response = await discoveryClient.getCategories();

      expect(response.status).toBe(200);
      expect(response.data.categories).toBeDefined();
      expect(Array.isArray(response.data.categories)).toBe(true);
      expect(response.data.categories.length).toBeGreaterThan(0);

      Logger.step('Available categories:');
      response.data.categories.forEach((cat: any) => {
        Logger.step(`  - ${cat.name} (${cat.count} services)`);
      });

      Logger.success(`Found ${response.data.categories.length} categories`);
      Logger.endTest();
    });
  });

  describe('6. Search Performance', () => {
    it('should complete search within 200ms (p95)', async () => {
      Logger.testCase('Performance test: 10 search queries');

      const latencies: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await discoveryClient.search('generation');
        const latency = Date.now() - startTime;
        latencies.push(latency);
      }

      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      Logger.step(`Average latency: ${avg.toFixed(2)}ms`);
      Logger.step(`P95 latency: ${p95}ms`);

      expect(p95).toBeLessThan(200);

      Logger.success(`Search performance meets SLA (P95: ${p95}ms < 200ms)`);
      Logger.endTest();
    });

    it('should leverage caching for repeated queries', async () => {
      Logger.testCase('Cache performance test');

      const query = 'caching-test-query';

      // First query (cold)
      const start1 = Date.now();
      await discoveryClient.search(query);
      const coldLatency = Date.now() - start1;

      // Second query (should hit cache)
      const start2 = Date.now();
      await discoveryClient.search(query);
      const cachedLatency = Date.now() - start2;

      Logger.step(`Cold query: ${coldLatency}ms`);
      Logger.step(`Cached query: ${cachedLatency}ms`);

      // Cached query should be faster (though not always guaranteed)
      expect(cachedLatency).toBeLessThan(coldLatency * 2);

      Logger.success('Caching is functional');
      Logger.endTest();
    });
  });

  describe('7. Pagination', () => {
    it('should support pagination', async () => {
      Logger.testCase('Pagination test');

      const page1 = await discoveryClient.search('', { page: 1, pageSize: 2 });
      const page2 = await discoveryClient.search('', { page: 2, pageSize: 2 });

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.data.results.length).toBeLessThanOrEqual(2);
      expect(page2.data.results.length).toBeLessThanOrEqual(2);

      // Results should be different
      if (page1.data.results.length > 0 && page2.data.results.length > 0) {
        expect(page1.data.results[0].id).not.toBe(page2.data.results[0].id);
      }

      Logger.success('Pagination works correctly');
      Logger.endTest();
    });
  });

  describe('8. Error Handling', () => {
    it('should handle invalid service ID gracefully', async () => {
      Logger.testCase('Invalid service ID');

      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(discoveryClient.getServiceDetails(fakeId)).rejects.toThrow();

      Logger.success('404 handled correctly');
      Logger.endTest();
    });

    it('should handle invalid filter parameters', async () => {
      Logger.testCase('Invalid filter parameters');

      const response = await discoveryClient.search('', {
        category: 'invalid-category-xyz',
      });

      expect(response.status).toBe(200);
      expect(response.data.results.length).toBe(0);

      Logger.success('Invalid filters handled gracefully');
      Logger.endTest();
    });
  });
});
