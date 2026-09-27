import { BaseAPI } from './BaseAPI';

/**
 * Discovery Service API client
 */
export class DiscoveryAPI extends BaseAPI {
  /**
   * Search for services
   */
  async searchServices(params: {
    query: string;
    filter?: any;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    return this.get('/search', params);
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(params: {
    userId?: string;
    limit?: number;
  }): Promise<any> {
    return this.get('/recommendations', params);
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<any> {
    return this.get('/categories');
  }

  /**
   * Get category by ID or name
   */
  async getCategory(identifier: string): Promise<any> {
    return this.get(`/categories/${identifier}`);
  }

  /**
   * Get popular tags
   */
  async getTags(limit?: number): Promise<any> {
    return this.get('/tags', { limit });
  }

  /**
   * Get services by category
   */
  async getServicesByCategory(params: {
    category: string;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    return this.get('/categories/services', params);
  }

  /**
   * Get trending services
   */
  async getTrendingServices(limit?: number): Promise<any> {
    return this.get('/trending', { limit });
  }

  /**
   * Get related services
   */
  async getRelatedServices(serviceId: string, limit?: number): Promise<any> {
    return this.get(`/services/${serviceId}/related`, { limit });
  }
}
