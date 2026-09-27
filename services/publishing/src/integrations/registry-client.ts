import axios, { AxiosInstance } from 'axios';
import { Service } from '../types';
import { logger } from '../utils/logger';

export interface RegistryServiceRequest {
  name: string;
  version: string;
  provider: string;
  capabilities: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
}

export interface RegistryServiceResponse {
  id: string;
  name: string;
  version: string;
  status: string;
  createdAt: string;
}

/**
 * Client for LLM-Registry integration (REST API)
 */
export class RegistryClient {
  private readonly client: AxiosInstance;
  private readonly baseURL: string;

  constructor() {
    this.baseURL = process.env.REGISTRY_API_URL || 'http://localhost:3010/api/v1';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Registry API request', {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error) => {
        logger.error('Registry API request error', { error });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Registry API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('Registry API response error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Register a new service with the Registry
   */
  async registerService(service: Partial<Service>): Promise<RegistryServiceResponse> {
    try {
      const request: RegistryServiceRequest = {
        name: service.name!,
        version: service.version!,
        provider: service.providerId!,
        capabilities: service.capabilities!.map((cap) => ({
          name: cap.name,
          description: cap.description,
          parameters: cap.parameters,
        })),
        metadata: {
          category: service.category,
          endpoint: service.endpoint,
          pricing: service.pricing,
          sla: service.sla,
          compliance: service.compliance,
        },
      };

      const response = await this.client.post<RegistryServiceResponse>(
        '/services',
        request
      );

      logger.info('Service registered with Registry', {
        registryId: response.data.id,
        serviceName: service.name,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to register service with Registry', {
        serviceName: service.name,
        error,
      });
      throw new Error(`Registry registration failed: ${(error as Error).message}`);
    }
  }

  /**
   * Update service metadata in Registry
   */
  async updateService(
    registryId: string,
    updates: Partial<Service>
  ): Promise<RegistryServiceResponse> {
    try {
      const response = await this.client.put<RegistryServiceResponse>(
        `/services/${registryId}`,
        updates
      );

      logger.info('Service updated in Registry', {
        registryId,
        serviceName: updates.name,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to update service in Registry', {
        registryId,
        error,
      });
      throw new Error(`Registry update failed: ${(error as Error).message}`);
    }
  }

  /**
   * Update service status in Registry
   */
  async updateServiceStatus(registryId: string, status: string): Promise<void> {
    try {
      await this.client.patch(`/services/${registryId}/status`, { status });

      logger.info('Service status updated in Registry', {
        registryId,
        status,
      });
    } catch (error) {
      logger.error('Failed to update service status in Registry', {
        registryId,
        status,
        error,
      });
      throw new Error(`Registry status update failed: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve service information from Registry
   */
  async getService(registryId: string): Promise<RegistryServiceResponse> {
    try {
      const response = await this.client.get<RegistryServiceResponse>(
        `/services/${registryId}`
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to get service from Registry', {
        registryId,
        error,
      });
      throw new Error(`Registry retrieval failed: ${(error as Error).message}`);
    }
  }

  /**
   * Delete service from Registry
   */
  async deleteService(registryId: string): Promise<void> {
    try {
      await this.client.delete(`/services/${registryId}`);

      logger.info('Service deleted from Registry', {
        registryId,
      });
    } catch (error) {
      logger.error('Failed to delete service from Registry', {
        registryId,
        error,
      });
      throw new Error(`Registry deletion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check Registry health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch (error) {
      logger.warn('Registry health check failed', { error });
      return false;
    }
  }
}
