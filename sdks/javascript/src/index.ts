/**
 * LLM Marketplace SDK for JavaScript/TypeScript
 *
 * Official SDK for interacting with the LLM Marketplace API
 *
 * @packageDocumentation
 */

// Main client
export { LLMMarketplaceClient } from './client';

// Service clients
export { PublishingServiceClient } from './services/publishing';
export { DiscoveryServiceClient } from './services/discovery';
export { ConsumptionServiceClient } from './services/consumption';
export { AdminServiceClient } from './services/admin';

// Types
export type {
  ClientConfig,
  RetryConfig,
  PaginationParams,
  PaginationResponse,
  Service,
  CreateServiceRequest,
  UpdateServiceRequest,
  ListServicesParams,
  SearchServicesParams,
  Usage,
  Quota,
  SLAMetrics,
  Category,
  Tag,
  Analytics,
  AuditLog,
  ErrorResponse,
} from './types';

// Errors
export {
  LLMMarketplaceError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  NetworkError,
  ConfigurationError,
} from './errors';

// Version
export const VERSION = '1.0.0';

/**
 * Create a new LLM Marketplace client
 *
 * @param apiKey - Your API key
 * @param options - Additional configuration options
 * @returns LLM Marketplace client instance
 *
 * @example
 * ```typescript
 * import { createClient } from '@llm-marketplace/sdk';
 *
 * const client = createClient('your-api-key');
 *
 * // Or with options
 * const client = createClient('your-api-key', {
 *   timeout: 60000,
 *   retryConfig: { maxRetries: 5 }
 * });
 * ```
 */
export function createClient(
  apiKey: string,
  options?: Omit<import('./types').ClientConfig, 'apiKey'>
) {
  const { LLMMarketplaceClient } = require('./client');
  return new LLMMarketplaceClient({ apiKey, ...options });
}
