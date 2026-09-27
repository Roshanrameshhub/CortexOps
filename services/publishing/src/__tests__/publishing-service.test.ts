/**
 * Unit Tests for Publishing Service
 * Tests the core publishing workflow functionality
 */

import { PublishingService } from '../services/publishing-service';
import {
  ServiceCategory,
  ServiceStatus,
  PricingModel,
  SupportLevel,
  ComplianceLevel,
  ProtocolType,
  AuthenticationType,
} from '../types';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeIn(expected: any[]): R;
    }
  }
}

// Mock dependencies
jest.mock('../validators/service-validator', () => ({
  ServiceValidator: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockImplementation(async (spec: any) => {
      if (spec.version === 'invalid-version') {
        throw new Error('Validation failed: Version must be valid semver');
      }
      return { isValid: true, errors: [] };
    }),
  })),
}));

jest.mock('../validators/openapi-validator', () => ({
  OpenAPIValidator: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
  })),
}));

jest.mock('../integrations/registry-client', () => ({
  RegistryClient: jest.fn().mockImplementation(() => ({
    registerService: jest.fn().mockResolvedValue({ id: 'test-registry-id' }),
  })),
}));

jest.mock('../integrations/policy-engine-client', () => ({
  PolicyEngineClient: jest.fn().mockImplementation(() => ({
    validateService: jest.fn().mockImplementation(async (spec: any) => {
      if (spec.endpoint?.url?.startsWith('http://')) {
        throw new Error('Policy violation: Production services must use HTTPS');
      }
      return { compliant: true, violations: [] };
    }),
  })),
}));

jest.mock('../integrations/analytics-client', () => ({
  AnalyticsClient: jest.fn().mockImplementation(() => ({
    track: jest.fn().mockResolvedValue(true),
    trackServicePublished: jest.fn().mockResolvedValue(true),
    trackValidationFailure: jest.fn().mockResolvedValue(true),
    trackServiceDeprecated: jest.fn().mockResolvedValue(true),
    trackServiceUpdated: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../integrations/governance-client', () => ({
  GovernanceClient: jest.fn().mockImplementation(() => ({
    createApprovalWorkflow: jest.fn().mockResolvedValue({ id: 'test-workflow-id' }),
    notifyServicePublished: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../config/database', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

jest.mock('../config/redis', () => ({
  cacheSet: jest.fn().mockResolvedValue(true),
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheDelete: jest.fn().mockResolvedValue(true),
}));

describe('PublishingService', () => {
  let publishingService: PublishingService;

  beforeEach(() => {
    publishingService = new PublishingService();
    jest.clearAllMocks();
  });

  const validServiceSpec = {
    name: 'Test LLM Service',
    version: '1.0.0',
    description: 'A test LLM service for unit testing purposes',
    category: ServiceCategory.TEXT_GENERATION,
    capabilities: [
      {
        name: 'text-completion',
        description: 'Generate text completions',
        parameters: {
          prompt: { type: 'string', required: true },
          max_tokens: { type: 'integer', default: 100 },
        },
      },
    ],
    endpoint: {
      url: 'https://api.test.com/v1/completions',
      protocol: ProtocolType.REST,
      authentication: AuthenticationType.API_KEY,
    },
    pricing: {
      model: PricingModel.PER_TOKEN,
      rates: [
        {
          tier: 'standard',
          rate: 0.001,
          unit: 'tokens',
        },
      ],
      currency: 'USD',
    },
    sla: {
      availability: 99.9,
      maxLatency: 2000,
      supportLevel: SupportLevel.PREMIUM,
    },
    compliance: {
      level: ComplianceLevel.INTERNAL,
      certifications: ['SOC2'],
      dataResidency: ['US'],
    },
  };

  describe('publishService', () => {
    it('should successfully publish a valid service', async () => {
      const providerId = 'test-provider-id';

      const result = await publishingService.publishService(providerId, validServiceSpec);

      expect(result).toBeDefined();
      expect(result.serviceId).toBeDefined();
      expect(result.status).toBeIn([ServiceStatus.ACTIVE, ServiceStatus.PENDING_APPROVAL]);
      expect(result.message).toContain('successfully');
    });

    it('should fail validation for invalid service spec', async () => {
      const invalidServiceSpec = {
        ...validServiceSpec,
        version: 'invalid-version', // Invalid semver
      };

      const providerId = 'test-provider-id';

      await expect(
        publishingService.publishService(providerId, invalidServiceSpec)
      ).rejects.toThrow();
    });

    it('should require approval for confidential services', async () => {
      const confidentialServiceSpec = {
        ...validServiceSpec,
        compliance: {
          ...validServiceSpec.compliance,
          level: ComplianceLevel.CONFIDENTIAL,
        },
      };

      const providerId = 'test-provider-id';

      const result = await publishingService.publishService(providerId, confidentialServiceSpec);

      expect(result.status).toBe(ServiceStatus.PENDING_APPROVAL);
      expect(result.message).toContain('pending approval');
    });

    it('should reject services with policy violations', async () => {
      const violatingServiceSpec = {
        ...validServiceSpec,
        endpoint: {
          ...validServiceSpec.endpoint,
          url: 'http://insecure.com/api', // HTTP instead of HTTPS
        },
      };

      const providerId = 'test-provider-id';

      await expect(
        publishingService.publishService(providerId, violatingServiceSpec)
      ).rejects.toThrow();
    });
  });

  describe('updateService', () => {
    it('should successfully update an existing service', async () => {
      const serviceId = 'test-service-id';
      const providerId = 'test-provider-id';
      const updates = {
        description: 'Updated description',
      };

      // Mock getService to return a valid service
      jest.spyOn(publishingService, 'getService').mockResolvedValue({
        id: serviceId,
        providerId,
        // ... other required fields
      } as any);

      const result = await publishingService.updateService(serviceId, providerId, updates);

      expect(result.success).toBe(true);
      expect(result.message).toContain('updated successfully');
    });

    it('should reject updates from non-owners', async () => {
      const serviceId = 'test-service-id';
      const providerId = 'test-provider-id';
      const wrongProviderId = 'wrong-provider-id';

      jest.spyOn(publishingService, 'getService').mockResolvedValue({
        id: serviceId,
        providerId,
      } as any);

      await expect(
        publishingService.updateService(serviceId, wrongProviderId, {})
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('createVersion', () => {
    it('should create a new version with incremented semver', async () => {
      const serviceId = 'test-service-id';
      const providerId = 'test-provider-id';
      const currentVersion = '1.0.0';
      const newVersion = '1.1.0';

      jest.spyOn(publishingService, 'getService').mockResolvedValue({
        ...validServiceSpec,
        id: serviceId,
        providerId,
        version: currentVersion,
      } as any);

      const result = await publishingService.createVersion(
        serviceId,
        providerId,
        newVersion
      );

      expect(result.version).toBe(newVersion);
      expect(result.serviceId).toBeDefined();
    });

    it('should reject version downgrade', async () => {
      const serviceId = 'test-service-id';
      const providerId = 'test-provider-id';
      const currentVersion = '2.0.0';
      const newVersion = '1.9.0'; // Lower than current

      jest.spyOn(publishingService, 'getService').mockResolvedValue({
        id: serviceId,
        providerId,
        version: currentVersion,
      } as any);

      await expect(
        publishingService.createVersion(serviceId, providerId, newVersion)
      ).rejects.toThrow('must be greater');
    });
  });

  describe('deprecateService', () => {
    it('should successfully deprecate a service', async () => {
      const serviceId = 'test-service-id';
      const providerId = 'test-provider-id';
      const reason = 'Replaced by v2.0';

      jest.spyOn(publishingService, 'getService').mockResolvedValue({
        id: serviceId,
        providerId,
        status: ServiceStatus.ACTIVE,
      } as any);

      const result = await publishingService.deprecateService(
        serviceId,
        providerId,
        reason
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('deprecated successfully');
    });
  });

  describe('getPublishingStatus', () => {
    it('should return correct status for active service', async () => {
      const serviceId = 'test-service-id';

      jest.spyOn(publishingService, 'getService').mockResolvedValue({
        id: serviceId,
        status: ServiceStatus.ACTIVE,
        metadata: {
          publishedAt: new Date(),
        },
      } as any);

      const result = await publishingService.getPublishingStatus(serviceId);

      expect(result.status).toBe(ServiceStatus.ACTIVE);
      expect(result.approvalRequired).toBe(false);
      expect(result.publishedAt).toBeDefined();
    });

    it('should return correct status for pending approval', async () => {
      const serviceId = 'test-service-id';

      jest.spyOn(publishingService, 'getService').mockResolvedValue({
        id: serviceId,
        status: ServiceStatus.PENDING_APPROVAL,
        metadata: {},
      } as any);

      const result = await publishingService.getPublishingStatus(serviceId);

      expect(result.status).toBe(ServiceStatus.PENDING_APPROVAL);
      expect(result.approvalRequired).toBe(true);
    });
  });
});

// Custom Jest matcher
expect.extend({
  toBeIn(received: any, array: any[]) {
    const pass = array.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be in [${array.join(', ')}]`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be in [${array.join(', ')}]`,
        pass: false,
      };
    }
  },
});
