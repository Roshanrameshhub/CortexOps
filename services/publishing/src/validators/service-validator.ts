import { z } from 'zod';
import {
  Service,
  ServiceCategory,
  ProtocolType,
  AuthenticationType,
  PricingModel,
  SupportLevel,
  ComplianceLevel,
  ValidationResult,
  ValidationError,
} from '../types';
import { logger } from '../utils/logger';
import * as semver from 'semver';

/**
 * JSON Schema validation for service metadata
 */
export class ServiceValidator {
  private readonly maxServiceSizeMB: number;

  constructor() {
    this.maxServiceSizeMB = parseInt(process.env.MAX_SERVICE_SIZE_MB || '100', 10);
  }

  // Zod schemas for validation
  private readonly capabilitySchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().min(1).max(2000),
    parameters: z.record(z.unknown()),
  });

  private readonly endpointSchema = z.object({
    url: z.string().url(),
    protocol: z.nativeEnum(ProtocolType),
    authentication: z.nativeEnum(AuthenticationType),
  });

  private readonly pricingTierSchema = z.object({
    tier: z.string().min(1).max(100),
    rate: z.number().min(0),
    unit: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  });

  private readonly pricingSchema = z.object({
    model: z.nativeEnum(PricingModel),
    rates: z.array(this.pricingTierSchema).min(1),
    currency: z.string().length(3).optional().default('USD'),
  });

  private readonly slaSchema = z.object({
    availability: z.number().min(0).max(100),
    maxLatency: z.number().min(0),
    supportLevel: z.nativeEnum(SupportLevel),
    responseTime: z.string().max(100).optional(),
  });

  private readonly complianceSchema = z.object({
    level: z.nativeEnum(ComplianceLevel),
    certifications: z.array(z.string()).default([]),
    dataResidency: z.array(z.string().length(2)),
    gdprCompliant: z.boolean().optional(),
    hipaaCompliant: z.boolean().optional(),
  });

  private readonly serviceSchema = z.object({
    name: z.string().min(1).max(255),
    version: z.string().refine((v) => semver.valid(v) !== null, {
      message: 'Version must be valid semver',
    }),
    description: z.string().min(10).max(5000),
    category: z.nativeEnum(ServiceCategory),
    capabilities: z.array(this.capabilitySchema).min(1),
    endpoint: this.endpointSchema,
    pricing: this.pricingSchema,
    sla: this.slaSchema,
    compliance: this.complianceSchema,
    openApiSpec: z.record(z.unknown()).optional(),
  });

  async validate(service: Partial<Service>): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // Validate using Zod schema
      this.serviceSchema.parse(service);

      // Additional custom validations
      this.validateServiceSize(service, errors);
      this.validateVersionFormat(service.version!, errors);
      this.validateEndpointAccessibility(service.endpoint!, errors);
      this.validatePricingConsistency(service.pricing!, errors);
      this.validateComplianceRequirements(service.compliance!, errors);

      logger.info('Service validation completed', {
        serviceName: service.name,
        errors: errors.length,
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Service validation failed', {
          serviceName: service.name,
          errors: error.errors,
        });

        error.errors.forEach((err) => {
          errors.push({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          });
        });
      } else {
        logger.error('Unexpected validation error', { error });
        errors.push({
          field: 'root',
          message: `Validation error: ${(error as Error).message}`,
          code: 'UNKNOWN_ERROR',
        });
      }

      return {
        isValid: false,
        errors,
        warnings: [],
      };
    }
  }

  private validateServiceSize(service: Partial<Service>, errors: ValidationError[]): void {
    const sizeInBytes = JSON.stringify(service).length;
    const sizeInMB = sizeInBytes / (1024 * 1024);

    if (sizeInMB > this.maxServiceSizeMB) {
      errors.push({
        field: 'root',
        message: `Service specification size (${sizeInMB.toFixed(2)}MB) exceeds maximum allowed size (${this.maxServiceSizeMB}MB)`,
        code: 'SERVICE_TOO_LARGE',
      });
    }
  }

  private validateVersionFormat(version: string, errors: ValidationError[]): void {
    if (!semver.valid(version)) {
      errors.push({
        field: 'version',
        message: 'Version must follow semantic versioning (e.g., 1.0.0)',
        code: 'INVALID_VERSION_FORMAT',
      });
      return;
    }

    // Ensure no prerelease or build metadata in production versions
    const parsed = semver.parse(version);
    if (parsed && (parsed.prerelease.length > 0 || parsed.build.length > 0)) {
      errors.push({
        field: 'version',
        message: 'Prerelease and build metadata not allowed in production versions',
        code: 'INVALID_VERSION_METADATA',
      });
    }
  }

  private validateEndpointAccessibility(
    endpoint: Service['endpoint'],
    errors: ValidationError[]
  ): void {
    // Validate URL format
    try {
      const url = new URL(endpoint.url);

      // Ensure HTTPS in production
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        errors.push({
          field: 'endpoint.url',
          message: 'HTTPS is required for production endpoints',
          code: 'INSECURE_ENDPOINT',
        });
      }

      // Ensure no localhost/127.0.0.1
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        errors.push({
          field: 'endpoint.url',
          message: 'Localhost endpoints are not allowed',
          code: 'LOCALHOST_ENDPOINT',
        });
      }
    } catch (error) {
      errors.push({
        field: 'endpoint.url',
        message: 'Invalid URL format',
        code: 'INVALID_URL',
      });
    }

    // Validate protocol matches URL
    const url = endpoint.url.toLowerCase();
    if (endpoint.protocol === ProtocolType.WEBSOCKET && !url.startsWith('ws')) {
      errors.push({
        field: 'endpoint.protocol',
        message: 'WebSocket protocol requires ws:// or wss:// URL',
        code: 'PROTOCOL_MISMATCH',
      });
    }
  }

  private validatePricingConsistency(
    pricing: Service['pricing'],
    errors: ValidationError[]
  ): void {
    // Validate pricing model consistency
    if (pricing.model === PricingModel.FREE && pricing.rates.length > 0) {
      errors.push({
        field: 'pricing.rates',
        message: 'Free pricing model should not have rates',
        code: 'INCONSISTENT_PRICING',
      });
    }

    if (pricing.model !== PricingModel.FREE && pricing.rates.length === 0) {
      errors.push({
        field: 'pricing.rates',
        message: 'Paid pricing model must have at least one rate',
        code: 'MISSING_PRICING_RATES',
      });
    }

    // Validate rate values
    pricing.rates.forEach((rate, index) => {
      if (rate.rate < 0) {
        errors.push({
          field: `pricing.rates[${index}].rate`,
          message: 'Rate must be non-negative',
          code: 'NEGATIVE_RATE',
        });
      }

      if (pricing.model === PricingModel.PER_TOKEN && !['token', 'tokens'].includes(rate.unit.toLowerCase())) {
        errors.push({
          field: `pricing.rates[${index}].unit`,
          message: 'Per-token pricing must use token-based units',
          code: 'INVALID_PRICING_UNIT',
        });
      }
    });
  }

  private validateComplianceRequirements(
    compliance: Service['compliance'],
    errors: ValidationError[]
  ): void {
    // Validate data residency codes (ISO 3166-1 alpha-2)
    const validCountryCodes = /^[A-Z]{2}$/;
    compliance.dataResidency.forEach((country, index) => {
      if (!validCountryCodes.test(country)) {
        errors.push({
          field: `compliance.dataResidency[${index}]`,
          message: 'Data residency must use ISO 3166-1 alpha-2 country codes',
          code: 'INVALID_COUNTRY_CODE',
        });
      }
    });

    // Validate GDPR compliance for EU countries
    const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
    const hasEUResidency = compliance.dataResidency.some((country) =>
      euCountries.includes(country)
    );

    if (hasEUResidency && !compliance.gdprCompliant) {
      errors.push({
        field: 'compliance.gdprCompliant',
        message: 'GDPR compliance required for services with EU data residency',
        code: 'GDPR_REQUIRED',
      });
    }
  }

  /**
   * Validates version compatibility for updates
   */
  validateVersionUpdate(currentVersion: string, newVersion: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (!semver.valid(currentVersion) || !semver.valid(newVersion)) {
      errors.push({
        field: 'version',
        message: 'Invalid version format',
        code: 'INVALID_VERSION',
      });
      return { isValid: false, errors, warnings: [] };
    }

    if (semver.lte(newVersion, currentVersion)) {
      errors.push({
        field: 'version',
        message: 'New version must be greater than current version',
        code: 'VERSION_NOT_INCREMENTED',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
    };
  }
}
