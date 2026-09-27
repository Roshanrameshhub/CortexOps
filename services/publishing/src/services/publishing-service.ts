import { v4 as uuidv4 } from 'uuid';
import { Service, ServiceStatus, ServiceCategory, PublishingWorkflowContext } from '../types';
import { ServiceValidator } from '../validators/service-validator';
import { OpenAPIValidator } from '../validators/openapi-validator';
import { RegistryClient } from '../integrations/registry-client';
import { PolicyEngineClient } from '../integrations/policy-engine-client';
import { AnalyticsClient } from '../integrations/analytics-client';
import { GovernanceClient } from '../integrations/governance-client';
import { pool } from '../config/database';
import { cacheSet, cacheGet, cacheDelete } from '../config/redis';
import { logger } from '../utils/logger';
import * as semver from 'semver';

/**
 * Core Publishing Service implementing the publishing pipeline
 */
export class PublishingService {
  private readonly serviceValidator: ServiceValidator;
  private readonly openApiValidator: OpenAPIValidator;
  private readonly registryClient: RegistryClient;
  private readonly policyEngineClient: PolicyEngineClient;
  private readonly analyticsClient: AnalyticsClient;
  private readonly governanceClient: GovernanceClient;

  constructor() {
    this.serviceValidator = new ServiceValidator();
    this.openApiValidator = new OpenAPIValidator(
      process.env.OPENAPI_VALIDATION_STRICT === 'true'
    );
    this.registryClient = new RegistryClient();
    this.policyEngineClient = new PolicyEngineClient();
    this.analyticsClient = new AnalyticsClient();
    this.governanceClient = new GovernanceClient();
  }

  /**
   * Publish a new service following the complete pipeline
   */
  async publishService(
    providerId: string,
    serviceSpec: Partial<Service>
  ): Promise<{ serviceId: string; status: ServiceStatus; message: string }> {
    const serviceId = uuidv4();
    const startTime = new Date();

    logger.info('Starting service publishing workflow', {
      serviceId,
      providerId,
      serviceName: serviceSpec.name,
    });

    try {
      // Phase 1: Validation
      const validationResult = await this.serviceValidator.validate(serviceSpec);

      if (!validationResult.isValid) {
        logger.warn('Service validation failed', {
          serviceId,
          errors: validationResult.errors,
        });

        await this.analyticsClient.trackValidationFailure(
          serviceId,
          providerId,
          validationResult.errors
        );

        return {
          serviceId,
          status: ServiceStatus.FAILED_VALIDATION,
          message: `Validation failed: ${validationResult.errors.map((e) => e.message).join(', ')}`,
        };
      }

      // Phase 2: OpenAPI Validation (if provided)
      if (serviceSpec.openApiSpec) {
        const openApiResult = await this.openApiValidator.validate(serviceSpec.openApiSpec);

        if (!openApiResult.isValid) {
          logger.warn('OpenAPI validation failed', {
            serviceId,
            errors: openApiResult.errors,
          });

          return {
            serviceId,
            status: ServiceStatus.FAILED_VALIDATION,
            message: `OpenAPI validation failed: ${openApiResult.errors.map((e) => e.message).join(', ')}`,
          };
        }
      }

      // Phase 3: Policy Compliance Check
      const policyResult = await this.policyEngineClient.validateService(serviceSpec);

      if (!policyResult.compliant) {
        logger.warn('Policy compliance check failed', {
          serviceId,
          violations: policyResult.violations,
        });

        return {
          serviceId,
          status: ServiceStatus.SUSPENDED,
          message: `Policy violations: ${policyResult.violations.map((v) => v.message).join(', ')}`,
        };
      }

      // Phase 4: Registry Synchronization
      const registryEntry = await this.registryClient.registerService(serviceSpec);

      // Phase 5: Marketplace Publication
      const service: Service = {
        id: serviceId,
        registryId: registryEntry.id,
        name: serviceSpec.name!,
        version: serviceSpec.version!,
        description: serviceSpec.description!,
        providerId,
        category: serviceSpec.category!,
        capabilities: serviceSpec.capabilities!,
        endpoint: serviceSpec.endpoint!,
        pricing: serviceSpec.pricing!,
        sla: serviceSpec.sla!,
        compliance: serviceSpec.compliance!,
        status: ServiceStatus.PENDING_APPROVAL,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          publishedAt: new Date(),
          tags: serviceSpec.metadata?.tags,
          documentation: serviceSpec.metadata?.documentation,
          exampleUsage: serviceSpec.metadata?.exampleUsage,
        },
        openApiSpec: serviceSpec.openApiSpec,
      };

      // Save to database
      await this.saveService(service);

      // Phase 6: Automated Testing (mock)
      const testsPassed = await this.runAutomatedTests(service);

      if (!testsPassed) {
        service.status = ServiceStatus.FAILED_VALIDATION;
        await this.updateServiceStatus(serviceId, ServiceStatus.FAILED_VALIDATION);

        return {
          serviceId,
          status: ServiceStatus.FAILED_VALIDATION,
          message: 'Automated tests failed',
        };
      }

      // Phase 7: Approval Workflow (if required)
      const requiresApproval = this.requiresManualApproval(serviceSpec);

      if (requiresApproval) {
        const workflowContext: PublishingWorkflowContext = {
          serviceId,
          providerId,
          serviceSpec,
          validationResult,
          policyResult,
          approvalRequired: true,
          approvalStatus: 'pending',
          registryId: registryEntry.id,
          startTime,
        };

        await this.governanceClient.createApprovalWorkflow(workflowContext);

        logger.info('Service pending manual approval', {
          serviceId,
          serviceName: service.name,
        });
      } else {
        service.status = ServiceStatus.ACTIVE;
        await this.updateServiceStatus(serviceId, ServiceStatus.ACTIVE);
      }

      // Phase 8: Cache the service
      await cacheSet(`service:${serviceId}`, service, 300); // 5 minute TTL

      // Phase 9: Event Publishing
      await this.analyticsClient.trackServicePublished(
        serviceId,
        providerId,
        service.category,
        service.pricing.model
      );

      await this.governanceClient.notifyServicePublished(service);

      logger.info('Service published successfully', {
        serviceId,
        serviceName: service.name,
        status: service.status,
        duration: Date.now() - startTime.getTime(),
      });

      return {
        serviceId,
        status: service.status,
        message: requiresApproval
          ? 'Service published successfully and pending approval'
          : 'Service published successfully and is now active',
      };
    } catch (error) {
      logger.error('Service publishing failed', {
        serviceId,
        providerId,
        error,
      });

      await this.analyticsClient.track('publish_failed', {
        serviceId,
        providerId,
        error: (error as Error).message,
      });

      throw new Error(`Publishing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Update an existing service
   */
  async updateService(
    serviceId: string,
    providerId: string,
    updates: Partial<Service>
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('Updating service', {
        serviceId,
        providerId,
      });

      // Retrieve existing service
      const existingService = await this.getService(serviceId);

      if (!existingService) {
        throw new Error('Service not found');
      }

      if (existingService.providerId !== providerId) {
        throw new Error('Unauthorized: You do not own this service');
      }

      // Validate version update if version is being changed
      if (updates.version && updates.version !== existingService.version) {
        const versionValidation = this.serviceValidator.validateVersionUpdate(
          existingService.version,
          updates.version
        );

        if (!versionValidation.isValid) {
          throw new Error(
            `Version update invalid: ${versionValidation.errors.map((e) => e.message).join(', ')}`
          );
        }
      }

      // Merge updates with existing service
      const updatedService: Service = {
        ...existingService,
        ...updates,
        metadata: {
          ...existingService.metadata,
          ...updates.metadata,
          updatedAt: new Date(),
        },
      };

      // Validate updated service
      const validationResult = await this.serviceValidator.validate(updatedService);

      if (!validationResult.isValid) {
        throw new Error(
          `Validation failed: ${validationResult.errors.map((e) => e.message).join(', ')}`
        );
      }

      // Update in database
      await this.saveService(updatedService);

      // Update in registry
      if (existingService.registryId) {
        await this.registryClient.updateService(existingService.registryId, updatedService);
      }

      // Clear cache
      await cacheDelete(`service:${serviceId}`);

      // Track update
      const changes = Object.keys(updates);
      await this.analyticsClient.trackServiceUpdated(serviceId, providerId, changes);

      logger.info('Service updated successfully', {
        serviceId,
        changes,
      });

      return {
        success: true,
        message: 'Service updated successfully',
      };
    } catch (error) {
      logger.error('Service update failed', {
        serviceId,
        error,
      });

      throw error;
    }
  }

  /**
   * Create a new version of a service
   */
  async createVersion(
    serviceId: string,
    providerId: string,
    newVersion: string,
    changes?: Partial<Service>
  ): Promise<{ serviceId: string; version: string }> {
    try {
      logger.info('Creating new service version', {
        serviceId,
        newVersion,
      });

      const existingService = await this.getService(serviceId);

      if (!existingService) {
        throw new Error('Service not found');
      }

      if (existingService.providerId !== providerId) {
        throw new Error('Unauthorized: You do not own this service');
      }

      // Validate version increment
      if (!semver.gt(newVersion, existingService.version)) {
        throw new Error('New version must be greater than current version');
      }

      // Create new service with updated version
      const newService: Partial<Service> = {
        ...existingService,
        ...changes,
        version: newVersion,
        metadata: {
          ...existingService.metadata,
          ...changes?.metadata,
        },
      };

      // Publish as new service
      const result = await this.publishService(providerId, newService);

      logger.info('New service version created', {
        originalServiceId: serviceId,
        newServiceId: result.serviceId,
        version: newVersion,
      });

      return {
        serviceId: result.serviceId,
        version: newVersion,
      };
    } catch (error) {
      logger.error('Version creation failed', {
        serviceId,
        newVersion,
        error,
      });

      throw error;
    }
  }

  /**
   * Deprecate a service
   */
  async deprecateService(
    serviceId: string,
    providerId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('Deprecating service', {
        serviceId,
        providerId,
        reason,
      });

      const service = await this.getService(serviceId);

      if (!service) {
        throw new Error('Service not found');
      }

      if (service.providerId !== providerId) {
        throw new Error('Unauthorized: You do not own this service');
      }

      // Update status to deprecated
      await this.updateServiceStatus(serviceId, ServiceStatus.DEPRECATED, reason);

      // Update in registry
      if (service.registryId) {
        await this.registryClient.updateServiceStatus(service.registryId, 'deprecated');
      }

      // Clear cache
      await cacheDelete(`service:${serviceId}`);

      // Track deprecation
      await this.analyticsClient.trackServiceDeprecated(serviceId, providerId, reason);

      logger.info('Service deprecated successfully', {
        serviceId,
      });

      return {
        success: true,
        message: 'Service deprecated successfully',
      };
    } catch (error) {
      logger.error('Service deprecation failed', {
        serviceId,
        error,
      });

      throw error;
    }
  }

  /**
   * Get service by ID (with caching)
   */
  async getService(serviceId: string): Promise<Service | null> {
    try {
      // Try cache first
      const cached = await cacheGet<Service>(`service:${serviceId}`);

      if (cached) {
        logger.debug('Service retrieved from cache', { serviceId });
        return cached;
      }

      // Fetch from database
      const result = await pool.query(
        'SELECT * FROM services WHERE id = $1',
        [serviceId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const service = this.mapDbRowToService(result.rows[0]);

      // Cache for 5 minutes
      await cacheSet(`service:${serviceId}`, service, 300);

      return service;
    } catch (error) {
      logger.error('Failed to get service', {
        serviceId,
        error,
      });

      throw error;
    }
  }

  /**
   * Get service publishing status
   */
  async getPublishingStatus(
    serviceId: string
  ): Promise<{
    status: ServiceStatus;
    message: string;
    publishedAt?: Date;
    approvalRequired: boolean;
  }> {
    try {
      const service = await this.getService(serviceId);

      if (!service) {
        throw new Error('Service not found');
      }

      return {
        status: service.status,
        message: this.getStatusMessage(service.status),
        publishedAt: service.metadata.publishedAt,
        approvalRequired: service.status === ServiceStatus.PENDING_APPROVAL,
      };
    } catch (error) {
      logger.error('Failed to get publishing status', {
        serviceId,
        error,
      });

      throw error;
    }
  }

  // Private helper methods

  private async saveService(service: Service): Promise<void> {
    const query = `
      INSERT INTO services (
        id, registry_id, name, version, description, provider_id,
        category, tags, capabilities, endpoint, pricing, sla,
        compliance, status, created_at, updated_at, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        version = EXCLUDED.version,
        description = EXCLUDED.description,
        capabilities = EXCLUDED.capabilities,
        endpoint = EXCLUDED.endpoint,
        pricing = EXCLUDED.pricing,
        sla = EXCLUDED.sla,
        compliance = EXCLUDED.compliance,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    `;

    await pool.query(query, [
      service.id,
      service.registryId,
      service.name,
      service.version,
      service.description,
      service.providerId,
      service.category,
      service.metadata.tags || [],
      JSON.stringify(service.capabilities),
      JSON.stringify(service.endpoint),
      JSON.stringify(service.pricing),
      JSON.stringify(service.sla),
      JSON.stringify(service.compliance),
      service.status,
      service.metadata.createdAt,
      service.metadata.updatedAt,
      service.metadata.publishedAt,
    ]);
  }

  private async updateServiceStatus(
    serviceId: string,
    status: ServiceStatus,
    reason?: string
  ): Promise<void> {
    await pool.query(
      'UPDATE services SET status = $1, suspension_reason = $2, updated_at = NOW() WHERE id = $3',
      [status, reason || null, serviceId]
    );
  }

  private async runAutomatedTests(service: Service): Promise<boolean> {
    // Mock implementation - in production, this would run actual tests
    logger.info('Running automated tests', {
      serviceId: service.id,
    });

    // Simulate test execution
    await new Promise((resolve) => setTimeout(resolve, 100));

    return true;
  }

  private requiresManualApproval(serviceSpec: Partial<Service>): boolean {
    // Require approval for confidential services
    if (serviceSpec.compliance?.level === 'confidential' ||
        serviceSpec.compliance?.level === 'restricted') {
      return true;
    }

    // Require approval for enterprise support level
    if (serviceSpec.sla?.supportLevel === 'enterprise') {
      return true;
    }

    return false;
  }

  private mapDbRowToService(row: Record<string, unknown>): Service {
    return {
      id: row.id as string,
      registryId: row.registry_id as string,
      name: row.name as string,
      version: row.version as string,
      description: row.description as string,
      providerId: row.provider_id as string,
      category: row.category as ServiceCategory,
      capabilities: JSON.parse(row.capabilities as string),
      endpoint: JSON.parse(row.endpoint as string),
      pricing: JSON.parse(row.pricing as string),
      sla: JSON.parse(row.sla as string),
      compliance: JSON.parse(row.compliance as string),
      status: row.status as ServiceStatus,
      metadata: {
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
        publishedAt: row.published_at as Date | undefined,
        deprecatedAt: row.deprecated_at as Date | undefined,
        suspensionReason: row.suspension_reason as string | undefined,
        tags: row.tags as string[] | undefined,
      },
    };
  }

  private getStatusMessage(status: ServiceStatus): string {
    const messages: Record<ServiceStatus, string> = {
      [ServiceStatus.PENDING_APPROVAL]: 'Service is pending manual approval',
      [ServiceStatus.ACTIVE]: 'Service is active and available',
      [ServiceStatus.DEPRECATED]: 'Service is deprecated',
      [ServiceStatus.SUSPENDED]: 'Service is suspended due to policy violations',
      [ServiceStatus.RETIRED]: 'Service has been retired',
      [ServiceStatus.FAILED_VALIDATION]: 'Service failed validation checks',
    };

    return messages[status] || 'Unknown status';
  }
}
