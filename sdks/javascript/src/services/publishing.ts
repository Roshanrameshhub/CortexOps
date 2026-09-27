import { HttpClient } from '../http-client';
import {
  Service,
  CreateServiceRequest,
  UpdateServiceRequest,
  ListServicesParams,
  PaginationResponse,
} from '../types';

/**
 * Publishing Service Client
 *
 * Manages service publishing operations including creation, updates, and validation
 */
export class PublishingServiceClient {
  private readonly http: HttpClient;
  private readonly basePath = '/publishing/v1';

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Create a new service
   *
   * @param data - Service data
   * @returns Created service
   *
   * @example
   * ```typescript
   * const service = await client.publishing.createService({
   *   name: 'My LLM Service',
   *   description: 'An amazing LLM service',
   *   category: 'text-generation',
   *   version: '1.0.0',
   *   pricing: { model: 'free' },
   *   endpoints: [{
   *     url: 'https://api.example.com/v1/generate',
   *     method: 'POST',
   *     description: 'Generate text'
   *   }]
   * });
   * ```
   */
  async createService(data: CreateServiceRequest): Promise<Service> {
    return this.http.post<Service>(`${this.basePath}/services`, data);
  }

  /**
   * Get service by ID
   *
   * @param id - Service ID
   * @returns Service details
   *
   * @example
   * ```typescript
   * const service = await client.publishing.getService('svc_123');
   * console.log(service.name);
   * ```
   */
  async getService(id: string): Promise<Service> {
    return this.http.get<Service>(`${this.basePath}/services/${id}`);
  }

  /**
   * Update service
   *
   * @param id - Service ID
   * @param data - Update data
   * @returns Updated service
   *
   * @example
   * ```typescript
   * const service = await client.publishing.updateService('svc_123', {
   *   description: 'Updated description'
   * });
   * ```
   */
  async updateService(id: string, data: UpdateServiceRequest): Promise<Service> {
    return this.http.put<Service>(`${this.basePath}/services/${id}`, data);
  }

  /**
   * Delete service
   *
   * @param id - Service ID
   *
   * @example
   * ```typescript
   * await client.publishing.deleteService('svc_123');
   * ```
   */
  async deleteService(id: string): Promise<void> {
    await this.http.delete<void>(`${this.basePath}/services/${id}`);
  }

  /**
   * List services with pagination
   *
   * @param params - List parameters
   * @returns Paginated list of services
   *
   * @example
   * ```typescript
   * // Get first page
   * const response = await client.publishing.listServices({ limit: 10 });
   *
   * // Get next page
   * if (response.pagination.hasMore) {
   *   const nextPage = await client.publishing.listServices({
   *     limit: 10,
   *     cursor: response.pagination.nextCursor
   *   });
   * }
   * ```
   */
  async listServices(params?: ListServicesParams): Promise<PaginationResponse<Service>> {
    return this.http.get<PaginationResponse<Service>>(`${this.basePath}/services`, params as Record<string, unknown>);
  }

  /**
   * Iterate through all services
   *
   * @param params - List parameters (excluding cursor)
   * @yields Service objects
   *
   * @example
   * ```typescript
   * for await (const service of client.publishing.iterateServices({ category: 'text-generation' })) {
   *   console.log(service.name);
   * }
   * ```
   */
  async *iterateServices(
    params?: Omit<ListServicesParams, 'cursor'>
  ): AsyncIterableIterator<Service> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listServices({ ...params, cursor });

      for (const service of response.data) {
        yield service;
      }

      cursor = response.pagination.nextCursor;
      hasMore = response.pagination.hasMore;
    }
  }

  /**
   * Validate service data before publishing
   *
   * @param data - Service data to validate
   * @returns Validation result
   *
   * @example
   * ```typescript
   * const validation = await client.publishing.validateService({
   *   name: 'My Service',
   *   description: 'Test',
   *   category: 'invalid-category',  // Will fail validation
   *   version: '1.0.0',
   *   pricing: { model: 'free' },
   *   endpoints: []
   * });
   *
   * if (!validation.valid) {
   *   console.error('Validation errors:', validation.errors);
   * }
   * ```
   */
  async validateService(data: CreateServiceRequest): Promise<{
    valid: boolean;
    errors?: Array<{ field: string; message: string }>;
  }> {
    return this.http.post<{
      valid: boolean;
      errors?: Array<{ field: string; message: string }>;
    }>(`${this.basePath}/services/validate`, data);
  }
}
