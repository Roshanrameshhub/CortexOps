/**
 * E2E Test Suite: Service Publishing Workflow
 *
 * Tests the complete service publishing flow including:
 * - Service registration
 * - Policy validation
 * - Registry synchronization
 * - Approval workflows
 * - Service lifecycle management
 */

import {
  PublishingServiceClient,
  DiscoveryServiceClient,
  AdminServiceClient,
} from '../utils/api-client';
import {
  TestDataGenerator,
  WaitHelper,
  AssertionHelper,
  CleanupHelper,
  Logger,
} from '../utils/test-helpers';

describe('E2E: Service Publishing Workflow', () => {
  let publishingClient: PublishingServiceClient;
  let discoveryClient: DiscoveryServiceClient;
  let adminClient: AdminServiceClient;

  beforeAll(async () => {
    Logger.testSuite('Service Publishing Workflow');

    publishingClient = new PublishingServiceClient();
    discoveryClient = new DiscoveryServiceClient();
    adminClient = new AdminServiceClient();

    // Wait for services to be ready
    await WaitHelper.waitForService(() => publishingClient.health(), 'Publishing Service');
    await WaitHelper.waitForService(() => discoveryClient.health(), 'Discovery Service');
    await WaitHelper.waitForService(() => adminClient.health(), 'Admin Service');
  });

  afterAll(async () => {
    await CleanupHelper.cleanup();
  });

  describe('1. Complete Publishing Flow - Compliant Service', () => {
    let serviceId: string;
    const startTime = Date.now();

    it('should publish a compliant service successfully', async () => {
      Logger.testCase('Publishing compliant service');

      const serviceData = TestDataGenerator.generateTestService();
      Logger.step(`Creating service: ${serviceData.name}`);

      const response = await publishingClient.publishService(serviceData);

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.serviceId).toBeDefined();

      serviceId = response.data.serviceId;
      AssertionHelper.assertValidUUID(serviceId, 'Service ID');

      CleanupHelper.registerCleanup(async () => {
        try {
          await publishingClient.deleteService(serviceId);
        } catch (error) {
          // Service might already be deleted
        }
      });

      Logger.success(`Service published with ID: ${serviceId}`);
      Logger.endTest();
    });

    it('should validate service against policies', async () => {
      Logger.testCase('Validating service policies');

      const response = await publishingClient.getService(serviceId);

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(serviceId);

      // Check policy validation results
      const service = response.data;
      expect(service.policyValidation).toBeDefined();
      expect(service.policyValidation.compliant).toBe(true);
      expect(service.policyValidation.violations).toHaveLength(0);

      Logger.success(`Service passed all policy validations`);
      Logger.endTest();
    });

    it('should have service in active status', async () => {
      Logger.testCase('Checking service status');

      const response = await publishingClient.getPublishingStatus(serviceId);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('active');

      Logger.success(`Service status: ${response.data.status}`);
      Logger.endTest();
    });

    it('should be discoverable via search', async () => {
      Logger.testCase('Verifying service is discoverable');

      // Wait for indexing
      await WaitHelper.sleep(2000);

      const response = await WaitHelper.retry(async () => {
        const searchResponse = await discoveryClient.search(serviceId);
        if (searchResponse.data.results.length === 0) {
          throw new Error('Service not yet indexed');
        }
        return searchResponse;
      }, 5, 2000);

      expect(response.data.results.length).toBeGreaterThan(0);

      const foundService = response.data.results.find((s: any) => s.id === serviceId);
      expect(foundService).toBeDefined();

      Logger.success(`Service is discoverable in search`);
      Logger.endTest();
    });

    it('should complete publishing workflow in acceptable time', async () => {
      Logger.testCase('Checking workflow performance');

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(60000); // 60 seconds max

      Logger.success(`Complete workflow completed in ${duration}ms`);
      Logger.endTest();
    });
  });

  describe('2. Policy Validation - Non-Compliant Service', () => {
    let serviceId: string;

    it('should reject non-compliant service', async () => {
      Logger.testCase('Publishing non-compliant service');

      const invalidService = TestDataGenerator.generateInvalidService();
      Logger.step(`Creating service with policy violations: ${invalidService.name}`);

      const response = await publishingClient.publishService(invalidService);

      expect(response.status).toBe(201);
      serviceId = response.data.serviceId;

      CleanupHelper.registerCleanup(async () => {
        try {
          await publishingClient.deleteService(serviceId);
        } catch (error) {
          // Service might already be deleted
        }
      });

      Logger.success(`Service created with ID: ${serviceId}`);
      Logger.endTest();
    });

    it('should have failed validation status', async () => {
      Logger.testCase('Checking validation failure');

      const response = await publishingClient.getService(serviceId);

      expect(response.status).toBe(200);
      const service = response.data;

      expect(service.status).toBe('failed_validation');
      expect(service.policyValidation.compliant).toBe(false);
      expect(service.policyValidation.violations.length).toBeGreaterThan(0);

      Logger.step(`Found ${service.policyValidation.violations.length} policy violations:`);
      service.policyValidation.violations.forEach((v: any) => {
        Logger.step(`  - ${v.policy} (${v.severity}): ${v.message}`);
      });

      Logger.success(`Service correctly failed validation`);
      Logger.endTest();
    });

    it('should NOT be discoverable in search', async () => {
      Logger.testCase('Verifying failed service is not discoverable');

      await WaitHelper.sleep(2000);

      const response = await discoveryClient.search(serviceId);

      const foundService = response.data.results.find((s: any) => s.id === serviceId);
      expect(foundService).toBeUndefined();

      Logger.success(`Failed service is not discoverable`);
      Logger.endTest();
    });
  });

  describe('3. Service Versioning', () => {
    let baseServiceId: string;
    let v2ServiceId: string;

    it('should publish initial version 1.0.0', async () => {
      Logger.testCase('Publishing version 1.0.0');

      const serviceData = TestDataGenerator.generateTestService({
        version: '1.0.0',
      });

      const response = await publishingClient.publishService(serviceData);

      expect(response.status).toBe(201);
      baseServiceId = response.data.serviceId;

      CleanupHelper.registerCleanup(async () => {
        await publishingClient.deleteService(baseServiceId);
      });

      Logger.success(`Version 1.0.0 published: ${baseServiceId}`);
      Logger.endTest();
    });

    it('should publish version 2.0.0 of same service', async () => {
      Logger.testCase('Publishing version 2.0.0');

      const baseService = (await publishingClient.getService(baseServiceId)).data;

      const v2ServiceData = {
        ...baseService,
        version: '2.0.0',
        description: 'Version 2.0.0 with improvements',
      };

      const response = await publishingClient.publishService(v2ServiceData);

      expect(response.status).toBe(201);
      v2ServiceId = response.data.serviceId;

      CleanupHelper.registerCleanup(async () => {
        await publishingClient.deleteService(v2ServiceId);
      });

      Logger.success(`Version 2.0.0 published: ${v2ServiceId}`);
      Logger.endTest();
    });

    it('should have both versions discoverable', async () => {
      Logger.testCase('Verifying multiple versions');

      await WaitHelper.sleep(2000);

      const response = await discoveryClient.search(baseServiceId.split('-')[0]);

      const versions = response.data.results.filter((s: any) =>
        [baseServiceId, v2ServiceId].includes(s.id)
      );

      expect(versions.length).toBe(2);

      Logger.success(`Both versions are discoverable`);
      Logger.endTest();
    });
  });

  describe('4. Service Lifecycle Management', () => {
    let serviceId: string;

    beforeAll(async () => {
      const serviceData = TestDataGenerator.generateTestService();
      const response = await publishingClient.publishService(serviceData);
      serviceId = response.data.serviceId;

      CleanupHelper.registerCleanup(async () => {
        try {
          await publishingClient.deleteService(serviceId);
        } catch (error) {
          // Already deleted
        }
      });
    });

    it('should update service successfully', async () => {
      Logger.testCase('Updating service');

      const updates = {
        description: 'Updated description for E2E test',
        sla: {
          availability: 99.95,
          maxLatency: 300,
          supportLevel: 'premium',
        },
      };

      const response = await publishingClient.updateService(serviceId, updates);

      expect(response.status).toBe(200);
      expect(response.data.description).toBe(updates.description);
      expect(response.data.sla.availability).toBe(updates.sla.availability);

      Logger.success(`Service updated successfully`);
      Logger.endTest();
    });

    it('should deprecate service', async () => {
      Logger.testCase('Deprecating service');

      const response = await publishingClient.updateService(serviceId, {
        status: 'deprecated',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('deprecated');

      Logger.success(`Service deprecated`);
      Logger.endTest();
    });

    it('should delete service', async () => {
      Logger.testCase('Deleting service');

      const response = await publishingClient.deleteService(serviceId);

      expect(response.status).toBe(200);

      // Verify service is deleted
      await expect(publishingClient.getService(serviceId)).rejects.toThrow();

      Logger.success(`Service deleted successfully`);
      Logger.endTest();
    });
  });

  describe('5. Confidential Service Publishing', () => {
    let serviceId: string;

    it('should publish confidential service with required certifications', async () => {
      Logger.testCase('Publishing confidential service');

      const confidentialService = TestDataGenerator.generateConfidentialService();

      const response = await publishingClient.publishService(confidentialService);

      expect(response.status).toBe(201);
      serviceId = response.data.serviceId;

      CleanupHelper.registerCleanup(async () => {
        await publishingClient.deleteService(serviceId);
      });

      Logger.success(`Confidential service published: ${serviceId}`);
      Logger.endTest();
    });

    it('should pass confidential compliance validation', async () => {
      Logger.testCase('Validating confidential compliance');

      const response = await publishingClient.getService(serviceId);

      const service = response.data;
      expect(service.compliance.level).toBe('confidential');
      expect(service.compliance.certifications).toContain('SOC2');
      expect(service.compliance.certifications).toContain('ISO27001');
      expect(service.policyValidation.compliant).toBe(true);

      Logger.success(`Confidential service is compliant`);
      Logger.endTest();
    });
  });

  describe('6. Error Handling and Edge Cases', () => {
    it('should reject duplicate service name and version', async () => {
      Logger.testCase('Testing duplicate service rejection');

      const serviceData = TestDataGenerator.generateTestService();

      // Publish first time
      const response1 = await publishingClient.publishService(serviceData);
      const serviceId = response1.data.serviceId;

      CleanupHelper.registerCleanup(async () => {
        await publishingClient.deleteService(serviceId);
      });

      // Try to publish duplicate
      await expect(publishingClient.publishService(serviceData)).rejects.toThrow();

      Logger.success(`Duplicate service correctly rejected`);
      Logger.endTest();
    });

    it('should reject invalid endpoint URL', async () => {
      Logger.testCase('Testing invalid endpoint rejection');

      const invalidService = TestDataGenerator.generateTestService({
        endpoint: {
          url: 'not-a-valid-url',
          protocol: 'rest',
          authentication: 'api-key',
        },
      });

      await expect(publishingClient.publishService(invalidService)).rejects.toThrow();

      Logger.success(`Invalid endpoint correctly rejected`);
      Logger.endTest();
    });

    it('should handle service not found', async () => {
      Logger.testCase('Testing 404 handling');

      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(publishingClient.getService(fakeId)).rejects.toThrow();

      Logger.success(`404 handled correctly`);
      Logger.endTest();
    });
  });
});
