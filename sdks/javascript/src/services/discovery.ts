import { HttpClient } from '../http-client';
import {
  Service,
  SearchServicesParams,
  PaginationResponse,
  Category,
  Tag,
} from '../types';

/**
 * Discovery Service Client
 *
 * Handles service discovery, search, and recommendations
 */
export class DiscoveryServiceClient {
  private readonly http: HttpClient;
  private readonly basePath = '/discovery/v1';

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Search for services
   *
   * @param params - Search parameters
   * @returns Paginated search results
   *
   * @example
   * ```typescript
   * const results = await client.discovery.searchServices({
   *   query: 'text generation',
   *   category: 'ai-models',
   *   tags: ['gpt', 'nlp'],
   *   limit: 20
   * });
   *
   * for (const service of results.data) {
   *   console.log(`${service.name}: ${service.description}`);
   * }
   * ```
   */
  async searchServices(params: SearchServicesParams): Promise<PaginationResponse<Service>> {
    return this.http.get<PaginationResponse<Service>>(`${this.basePath}/services/search`, params as unknown as Record<string, unknown>);
  }

  /**
   * Iterate through search results
   *
   * @param params - Search parameters (excluding cursor)
   * @yields Service objects
   *
   * @example
   * ```typescript
   * for await (const service of client.discovery.iterateSearchResults({ query: 'chat' })) {
   *   console.log(service.name);
   * }
   * ```
   */
  async *iterateSearchResults(
    params: Omit<SearchServicesParams, 'cursor'>
  ): AsyncIterableIterator<Service> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.searchServices({ ...params, cursor });

      for (const service of response.data) {
        yield service;
      }

      cursor = response.pagination.nextCursor;
      hasMore = response.pagination.hasMore;
    }
  }

  /**
   * Get service by ID
   *
   * @param id - Service ID
   * @returns Service details
   *
   * @example
   * ```typescript
   * const service = await client.discovery.getServiceById('svc_123');
   * ```
   */
  async getServiceById(id: string): Promise<Service> {
    return this.http.get<Service>(`${this.basePath}/services/${id}`);
  }

  /**
   * Get personalized recommendations
   *
   * @param userId - User ID (optional, uses current user if not provided)
   * @param limit - Number of recommendations
   * @returns Recommended services
   *
   * @example
   * ```typescript
   * const recommendations = await client.discovery.getRecommendations(undefined, 5);
   * ```
   */
  async getRecommendations(userId?: string, limit = 10): Promise<Service[]> {
    const params: Record<string, unknown> = { limit };
    if (userId) {
      params.userId = userId;
    }

    const response = await this.http.get<{ data: Service[] }>(
      `${this.basePath}/recommendations`,
      params
    );
    return response.data;
  }

  /**
   * Get all categories
   *
   * @returns List of categories
   *
   * @example
   * ```typescript
   * const categories = await client.discovery.getCategories();
   * for (const category of categories) {
   *   console.log(`${category.name}: ${category.serviceCount} services`);
   * }
   * ```
   */
  async getCategories(): Promise<Category[]> {
    const response = await this.http.get<{ data: Category[] }>(`${this.basePath}/categories`);
    return response.data;
  }

  /**
   * Get popular tags
   *
   * @param limit - Number of tags to return
   * @returns List of tags
   *
   * @example
   * ```typescript
   * const tags = await client.discovery.getTags(20);
   * ```
   */
  async getTags(limit = 50): Promise<Tag[]> {
    const response = await this.http.get<{ data: Tag[] }>(`${this.basePath}/tags`, { limit });
    return response.data;
  }

  /**
   * Get services by category
   *
   * @param category - Category ID or name
   * @param limit - Number of services to return
   * @param cursor - Pagination cursor
   * @returns Paginated list of services
   *
   * @example
   * ```typescript
   * const services = await client.discovery.getServicesByCategory('text-generation', 10);
   * ```
   */
  async getServicesByCategory(
    category: string,
    limit = 10,
    cursor?: string
  ): Promise<PaginationResponse<Service>> {
    return this.http.get<PaginationResponse<Service>>(
      `${this.basePath}/services/category/${encodeURIComponent(category)}`,
      { limit, cursor }
    );
  }

  /**
   * Get services by tag
   *
   * @param tag - Tag name
   * @param limit - Number of services to return
   * @param cursor - Pagination cursor
   * @returns Paginated list of services
   *
   * @example
   * ```typescript
   * const services = await client.discovery.getServicesByTag('gpt', 10);
   * ```
   */
  async getServicesByTag(
    tag: string,
    limit = 10,
    cursor?: string
  ): Promise<PaginationResponse<Service>> {
    return this.http.get<PaginationResponse<Service>>(
      `${this.basePath}/services/tag/${encodeURIComponent(tag)}`,
      { limit, cursor }
    );
  }
}
