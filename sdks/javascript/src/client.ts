import { ClientConfig } from './types';
import { HttpClient } from './http-client';
import { PublishingServiceClient } from './services/publishing';
import { DiscoveryServiceClient } from './services/discovery';
import { ConsumptionServiceClient } from './services/consumption';
import { AdminServiceClient } from './services/admin';

/**
 * LLM Marketplace Client
 *
 * Main client for interacting with the LLM Marketplace API
 *
 * @example
 * ```typescript
 * import { LLMMarketplaceClient } from '@llm-marketplace/sdk';
 *
 * const client = new LLMMarketplaceClient({
 *   apiKey: process.env.LLM_MARKETPLACE_API_KEY
 * });
 *
 * // Publishing service
 * const service = await client.publishing.createService({
 *   name: 'My Service',
 *   description: 'An amazing service',
 *   category: 'text-generation',
 *   version: '1.0.0',
 *   pricing: { model: 'free' },
 *   endpoints: []
 * });
 *
 * // Discovery service
 * const results = await client.discovery.searchServices({
 *   query: 'text generation',
 *   limit: 10
 * });
 *
 * // Consumption service
 * const usage = await client.consumption.getUsage('svc_123', {
 *   start: '2024-11-01T00:00:00Z',
 *   end: '2024-11-30T23:59:59Z'
 * });
 * ```
 */
export class LLMMarketplaceClient {
  /**
   * HTTP client instance
   */
  private readonly http: HttpClient;

  /**
   * Publishing service client
   */
  public readonly publishing: PublishingServiceClient;

  /**
   * Discovery service client
   */
  public readonly discovery: DiscoveryServiceClient;

  /**
   * Consumption service client
   */
  public readonly consumption: ConsumptionServiceClient;

  /**
   * Admin service client
   */
  public readonly admin: AdminServiceClient;

  /**
   * Create a new LLM Marketplace client
   *
   * @param config - Client configuration
   *
   * @example
   * ```typescript
   * // Basic usage
   * const client = new LLMMarketplaceClient({
   *   apiKey: 'your-api-key'
   * });
   *
   * // With custom configuration
   * const client = new LLMMarketplaceClient({
   *   apiKey: 'your-api-key',
   *   baseUrl: 'https://api.llm-marketplace.com',
   *   timeout: 60000,
   *   retryConfig: {
   *     maxRetries: 5,
   *     backoff: 'exponential'
   *   }
   * });
   *
   * // Using environment variable
   * const client = new LLMMarketplaceClient({
   *   apiKey: process.env.LLM_MARKETPLACE_API_KEY!
   * });
   * ```
   */
  constructor(config: ClientConfig) {
    // If API key not provided, try environment variable
    if (!config.apiKey) {
      config.apiKey = process.env.LLM_MARKETPLACE_API_KEY || '';
    }

    this.http = new HttpClient(config);

    // Initialize service clients
    this.publishing = new PublishingServiceClient(this.http);
    this.discovery = new DiscoveryServiceClient(this.http);
    this.consumption = new ConsumptionServiceClient(this.http);
    this.admin = new AdminServiceClient(this.http);
  }

  /**
   * Test API connectivity
   *
   * @returns True if connection successful
   *
   * @example
   * ```typescript
   * const isConnected = await client.testConnection();
   * if (isConnected) {
   *   console.log('Connected to LLM Marketplace API');
   * }
   * ```
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.http.get('/health');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get API version
   *
   * @returns API version information
   *
   * @example
   * ```typescript
   * const version = await client.getVersion();
   * console.log(`API Version: ${version.version}`);
   * ```
   */
  async getVersion(): Promise<{
    version: string;
    buildDate: string;
    environment: string;
  }> {
    return this.http.get('/version');
  }
}
