import { BaseAPI } from './BaseAPI';

/**
 * Publishing Service API client
 */
export class PublishingAPI extends BaseAPI {
  /**
   * Get service by ID
   */
  async getService(id: string): Promise<any> {
    return this.get(`/services/${id}`);
  }

  /**
   * List services with filtering and pagination
   */
  async listServices(params: {
    filter?: any;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    return this.get('/services', params);
  }

  /**
   * Create new service
   */
  async createService(input: any): Promise<any> {
    return this.post('/services', input);
  }

  /**
   * Update existing service
   */
  async updateService(id: string, input: any): Promise<any> {
    return this.put(`/services/${id}`, input);
  }

  /**
   * Delete service
   */
  async deleteService(id: string): Promise<any> {
    return this.delete(`/services/${id}`);
  }

  /**
   * Validate service input
   */
  async validateService(input: any): Promise<any> {
    return this.post('/services/validate', input);
  }

  /**
   * Get provider by ID
   */
  async getProvider(id: string): Promise<any> {
    return this.get(`/providers/${id}`);
  }

  /**
   * Batch get services by IDs
   */
  async batchGetServices(ids: string[]): Promise<any[]> {
    return this.post('/services/batch', { ids });
  }
}
