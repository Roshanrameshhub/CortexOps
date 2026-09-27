import { ServiceValidator } from '../validators/service-validator';
import {
  Service,
  ServiceCategory,
  ProtocolType,
  AuthenticationType,
  PricingModel,
  SupportLevel,
  ComplianceLevel,
} from '../types';

describe('ServiceValidator', () => {
  let validator: ServiceValidator;

  beforeEach(() => {
    validator = new ServiceValidator();
  });

  describe('validate', () => {
    it('should validate a valid service specification', async () => {
      const service: Partial<Service> = {
        name: 'Test LLM Service',
        version: '1.0.0',
        description: 'A test service for validation',
        category: ServiceCategory.TEXT_GENERATION,
        capabilities: [
          {
            name: 'text-generation',
            description: 'Generate text',
            parameters: { maxTokens: 1000 },
          },
        ],
        endpoint: {
          url: 'https://api.example.com/v1',
          protocol: ProtocolType.REST,
          authentication: AuthenticationType.API_KEY,
        },
        pricing: {
          model: PricingModel.PER_TOKEN,
          rates: [
            {
              tier: 'standard',
              rate: 0.001,
              unit: 'token',
            },
          ],
          currency: 'USD',
        },
        sla: {
          availability: 99.9,
          maxLatency: 500,
          supportLevel: SupportLevel.BASIC,
        },
        compliance: {
          level: ComplianceLevel.PUBLIC,
          certifications: [],
          dataResidency: ['US'],
        },
      };

      const result = await validator.validate(service);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for invalid version', async () => {
      const service: Partial<Service> = {
        name: 'Test Service',
        version: 'invalid-version',
        description: 'Test description',
        category: ServiceCategory.TEXT_GENERATION,
        capabilities: [],
        endpoint: {
          url: 'https://api.example.com',
          protocol: ProtocolType.REST,
          authentication: AuthenticationType.API_KEY,
        },
        pricing: {
          model: PricingModel.FREE,
          rates: [],
        },
        sla: {
          availability: 99.9,
          maxLatency: 500,
          supportLevel: SupportLevel.BASIC,
        },
        compliance: {
          level: ComplianceLevel.PUBLIC,
          certifications: [],
          dataResidency: ['US'],
        },
      };

      const result = await validator.validate(service);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('should fail validation for missing capabilities', async () => {
      const service: Partial<Service> = {
        name: 'Test Service',
        version: '1.0.0',
        description: 'Test description',
        category: ServiceCategory.TEXT_GENERATION,
        capabilities: [], // Empty capabilities
        endpoint: {
          url: 'https://api.example.com',
          protocol: ProtocolType.REST,
          authentication: AuthenticationType.API_KEY,
        },
        pricing: {
          model: PricingModel.FREE,
          rates: [],
        },
        sla: {
          availability: 99.9,
          maxLatency: 500,
          supportLevel: SupportLevel.BASIC,
        },
        compliance: {
          level: ComplianceLevel.PUBLIC,
          certifications: [],
          dataResidency: ['US'],
        },
      };

      const result = await validator.validate(service);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'capabilities')).toBe(true);
    });
  });

  describe('validateVersionUpdate', () => {
    it('should validate valid version increment', () => {
      const result = validator.validateVersionUpdate('1.0.0', '1.1.0');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for non-incremented version', () => {
      const result = validator.validateVersionUpdate('1.1.0', '1.0.0');

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'VERSION_NOT_INCREMENTED')).toBe(true);
    });

    it('should fail for equal versions', () => {
      const result = validator.validateVersionUpdate('1.0.0', '1.0.0');

      expect(result.isValid).toBe(false);
    });
  });
});
