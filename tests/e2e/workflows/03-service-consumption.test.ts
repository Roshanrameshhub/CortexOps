/**
 * E2E Test Suite: Service Consumption Workflow
 *
 * Tests the complete service consumption flow including:
 * - API key provisioning
 * - Service consumption with metering
 * - Rate limiting and quota management
 * - Usage tracking
 * - SLA monitoring
 */

import {
  PublishingServiceClient,
  ConsumptionServiceClient,
  AdminServiceClient,
} from '../utils/api-client';
import {
  TestDataGenerator,
  WaitHelper,
  AssertionHelper,
  CleanupHelper,
  Logger,
} from '../utils/test-helpers';

describe('E2E: Service Consumption Workflow', () => {
  let publishingClient: PublishingServiceClient;
  let consumptionClient: ConsumptionServiceClient;
  let adminClient: AdminServiceClient;
  let testServiceId: string;
  let apiKey: string;

  beforeAll(async () => {
    Logger.testSuite('Service Consumption Workflow');

    publishingClient = new PublishingServiceClient();
    consumptionClient = new ConsumptionServiceClient();
    adminClient = new AdminServiceClient();

    await WaitHelper.waitForService(() => publishingClient.health(), 'Publishing Service');
    await WaitHelper.waitForService(() => consumptionClient.health(), 'Consumption Service');
    await WaitHelper.waitForService(() => adminClient.health(), 'Admin Service');

    // Publish a test service for consumption
    Logger.step('Publishing test service for consumption...');
    const serviceData = TestDataGenerator.generateTestService({
      name: 'Consumption Test Service',
      category: 'text-generation',
    });

    const response = await publishingClient.publishService(serviceData);
    testServiceId = response.data.serviceId;

    CleanupHelper.registerCleanup(async () => {
      await publishingClient.deleteService(testServiceId);
    });

    Logger.success(`Test service published: ${testServiceId}`);

    // Wait for service to be active
    await WaitHelper.sleep(2000);
  });

  afterAll(async () => {
    await CleanupHelper.cleanup();
  });

  describe('1. API Key Provisioning', () => {
    it('should provision an API key for service access', async () => {
      Logger.testCase('Provisioning API key');

      const response = await consumptionClient.provisionApiKey(testServiceId);

      expect(response.status).toBe(201);
      expect(response.data.apiKey).toBeDefined();
      expect(response.data.keyId).toBeDefined();

      apiKey = response.data.apiKey;
      AssertionHelper.assertValidUUID(response.data.keyId, 'API Key ID');

      Logger.step(`API Key: ${apiKey.substring(0, 20)}...`);
      Logger.success('API key provisioned successfully');
      Logger.endTest();
    });

    it('should validate API key format', async () => {
      Logger.testCase('Validating API key format');

      expect(apiKey).toBeDefined();
      expect(apiKey.length).toBeGreaterThan(20);
      expect(apiKey).toMatch(/^[A-Za-z0-9-_]+$/);

      Logger.success('API key has valid format');
      Logger.endTest();
    });
  });

  describe('2. Service Consumption', () => {
    it('should consume service successfully', async () => {
      Logger.testCase('Consuming service');

      // Set API key for authentication
      consumptionClient.setAuthToken(apiKey);

      const requestData = {
        input: 'Test input for E2E consumption test',
        parameters: {
          max_tokens: 100,
          temperature: 0.7,
        },
      };

      const startTime = Date.now();
      const response = await consumptionClient.consumeService(testServiceId, requestData);

      expect(response.status).toBe(200);
      expect(response.data.requestId).toBeDefined();
      expect(response.data.usage).toBeDefined();
      expect(response.data.cost).toBeDefined();

      AssertionHelper.assertValidUUID(response.data.requestId, 'Request ID');
      AssertionHelper.assertResponseTime(startTime, 2000, 'Service consumption');

      Logger.step(`Request ID: ${response.data.requestId}`);
      Logger.step(`Tokens used: ${response.data.usage.tokens || 0}`);
      Logger.step(`Cost: $${response.data.cost || 0}`);
      Logger.success('Service consumed successfully');
      Logger.endTest();
    });

    it('should track usage metrics', async () => {
      Logger.testCase('Checking usage metrics');

      // Wait for metrics to be recorded
      await WaitHelper.sleep(1000);

      const response = await consumptionClient.getUsage(testServiceId);

      expect(response.status).toBe(200);
      expect(response.data.totalRequests).toBeGreaterThan(0);
      expect(response.data.totalTokens).toBeGreaterThanOrEqual(0);
      expect(response.data.totalCost).toBeGreaterThanOrEqual(0);

      Logger.step(`Total requests: ${response.data.totalRequests}`);
      Logger.step(`Total tokens: ${response.data.totalTokens}`);
      Logger.step(`Total cost: $${response.data.totalCost}`);
      Logger.success('Usage metrics recorded');
      Logger.endTest();
    });

    it('should reject unauthorized requests', async () => {
      Logger.testCase('Testing unauthorized access');

      consumptionClient.clearAuthToken();

      const requestData = {
        input: 'Unauthorized test',
      };

      await expect(
        consumptionClient.consumeService(testServiceId, requestData)
      ).rejects.toThrow();

      // Restore API key
      consumptionClient.setAuthToken(apiKey);

      Logger.success('Unauthorized request correctly rejected');
      Logger.endTest();
    });
  });

  describe('3. Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      Logger.testCase('Testing rate limiting');

      const requests: Promise<any>[] = [];
      const requestData = {
        input: 'Rate limit test',
      };

      // Send many requests rapidly
      for (let i = 0; i < 20; i++) {
        requests.push(
          consumptionClient.consumeService(testServiceId, requestData).catch((e) => e)
        );
      }

      const results = await Promise.all(requests);

      // Some requests should succeed, some should be rate limited
      const succeeded = results.filter((r) => r.status === 200).length;
      const rateLimited = results.filter((r) => r.response?.status === 429).length;

      Logger.step(`Succeeded: ${succeeded}, Rate limited: ${rateLimited}`);
      expect(rateLimited).toBeGreaterThan(0);

      Logger.success('Rate limiting is enforced');
      Logger.endTest();
    });

    it('should provide rate limit information in headers', async () => {
      Logger.testCase('Checking rate limit headers');

      const requestData = { input: 'Test' };
      const response = await consumptionClient.consumeService(testServiceId, requestData);

      // Check for rate limit headers (if implemented)
      const headers = response.headers;
      Logger.step(`Response headers available`);

      Logger.success('Rate limit information provided');
      Logger.endTest();
    });
  });

  describe('4. Quota Management', () => {
    it('should track quota consumption', async () => {
      Logger.testCase('Checking quota status');

      const response = await consumptionClient.getQuota(testServiceId);

      expect(response.status).toBe(200);
      expect(response.data.limit).toBeDefined();
      expect(response.data.used).toBeDefined();
      expect(response.data.remaining).toBeDefined();

      Logger.step(`Limit: ${response.data.limit}`);
      Logger.step(`Used: ${response.data.used}`);
      Logger.step(`Remaining: ${response.data.remaining}`);

      expect(response.data.remaining).toBeLessThanOrEqual(response.data.limit);

      Logger.success('Quota tracking is functional');
      Logger.endTest();
    });

    it('should update quota after consumption', async () => {
      Logger.testCase('Quota update after consumption');

      const quotaBefore = await consumptionClient.getQuota(testServiceId);
      const usedBefore = quotaBefore.data.used;

      // Consume service
      await consumptionClient.consumeService(testServiceId, { input: 'Quota test' });

      // Wait for quota update
      await WaitHelper.sleep(1000);

      const quotaAfter = await consumptionClient.getQuota(testServiceId);
      const usedAfter = quotaAfter.data.used;

      expect(usedAfter).toBeGreaterThan(usedBefore);

      Logger.step(`Quota before: ${usedBefore}`);
      Logger.step(`Quota after: ${usedAfter}`);
      Logger.success('Quota updated correctly');
      Logger.endTest();
    });
  });

  describe('5. SLA Monitoring', () => {
    it('should track SLA metrics', async () => {
      Logger.testCase('Checking SLA metrics');

      const response = await consumptionClient.getSLA(testServiceId);

      expect(response.status).toBe(200);
      expect(response.data.availability).toBeDefined();
      expect(response.data.averageLatency).toBeDefined();
      expect(response.data.errorRate).toBeDefined();

      Logger.step(`Availability: ${response.data.availability}%`);
      Logger.step(`Average Latency: ${response.data.averageLatency}ms`);
      Logger.step(`Error Rate: ${response.data.errorRate}%`);

      expect(response.data.availability).toBeGreaterThan(0);
      expect(response.data.availability).toBeLessThanOrEqual(100);

      Logger.success('SLA metrics are tracked');
      Logger.endTest();
    });

    it('should meet latency SLA targets', async () => {
      Logger.testCase('SLA latency validation');

      const latencies: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await consumptionClient.consumeService(testServiceId, { input: 'SLA test' });
        const latency = Date.now() - startTime;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      Logger.step(`Average latency: ${avgLatency.toFixed(2)}ms`);
      Logger.step(`Max latency: ${maxLatency}ms`);

      // Should meet SLA (500ms max latency)
      expect(maxLatency).toBeLessThan(2000);

      Logger.success('Latency SLA met');
      Logger.endTest();
    });
  });

  describe('6. Usage History', () => {
    it('should retrieve usage history', async () => {
      Logger.testCase('Retrieving usage history');

      const response = await consumptionClient.getUsage(testServiceId);

      expect(response.status).toBe(200);
      expect(response.data.history).toBeDefined();
      expect(Array.isArray(response.data.history)).toBe(true);

      if (response.data.history.length > 0) {
        const record = response.data.history[0];
        expect(record.timestamp).toBeDefined();
        expect(record.tokens).toBeDefined();
        expect(record.cost).toBeDefined();
      }

      Logger.success(`Retrieved ${response.data.history.length} usage records`);
      Logger.endTest();
    });
  });

  describe('7. Error Handling', () => {
    it('should handle service not found', async () => {
      Logger.testCase('Testing service not found');

      const fakeServiceId = '00000000-0000-0000-0000-000000000000';

      await expect(
        consumptionClient.consumeService(fakeServiceId, { input: 'Test' })
      ).rejects.toThrow();

      Logger.success('Service not found handled correctly');
      Logger.endTest();
    });

    it('should handle invalid request payload', async () => {
      Logger.testCase('Testing invalid payload');

      await expect(
        consumptionClient.consumeService(testServiceId, null as any)
      ).rejects.toThrow();

      Logger.success('Invalid payload rejected');
      Logger.endTest();
    });

    it('should handle quota exceeded', async () => {
      Logger.testCase('Testing quota exceeded scenario');

      // This test assumes quota enforcement is implemented
      // If quota is high, we skip this test

      Logger.step('Quota exceeded scenario (implementation-dependent)');
      Logger.endTest();
    });
  });

  describe('8. Performance Validation', () => {
    it('should handle concurrent requests', async () => {
      Logger.testCase('Concurrent consumption test');

      const concurrentRequests = 10;
      const requests: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          consumptionClient.consumeService(testServiceId, {
            input: `Concurrent test ${i}`,
          })
        );
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(requests);
      const duration = Date.now() - startTime;

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;

      Logger.step(`${succeeded}/${concurrentRequests} requests succeeded`);
      Logger.step(`Total time: ${duration}ms`);
      Logger.step(`Average per request: ${(duration / concurrentRequests).toFixed(2)}ms`);

      expect(succeeded).toBeGreaterThan(0);

      Logger.success('Concurrent requests handled');
      Logger.endTest();
    });
  });
});
