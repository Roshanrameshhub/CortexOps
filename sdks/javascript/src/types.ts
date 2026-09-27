/**
 * LLM Marketplace SDK Types
 * @packageDocumentation
 */

/**
 * Client configuration options
 */
export interface ClientConfig {
  /**
   * API key for authentication
   */
  apiKey: string;

  /**
   * Base URL for API requests
   * @default "https://api.llm-marketplace.com"
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Retry configuration
   */
  retryConfig?: RetryConfig;

  /**
   * Custom headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Enable telemetry (opt-in)
   * @default false
   */
  telemetry?: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Backoff strategy
   * @default "exponential"
   */
  backoff?: 'exponential' | 'linear' | 'none';

  /**
   * Delay between retries in milliseconds
   * @default 1000
   */
  retryDelay?: number;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  /**
   * Maximum number of items to return
   * @default 10
   */
  limit?: number;

  /**
   * Cursor for pagination
   */
  cursor?: string;
}

/**
 * Pagination response
 */
export interface PaginationResponse<T> {
  /**
   * Array of items
   */
  data: T[];

  /**
   * Pagination metadata
   */
  pagination: {
    /**
     * Cursor for next page
     */
    nextCursor?: string;

    /**
     * Whether there are more items
     */
    hasMore: boolean;

    /**
     * Total number of items (if available)
     */
    total?: number;
  };
}

/**
 * Service model
 */
export interface Service {
  /**
   * Unique service identifier
   */
  id: string;

  /**
   * Service name
   */
  name: string;

  /**
   * Service description
   */
  description: string;

  /**
   * Service category
   */
  category: string;

  /**
   * Service version
   */
  version: string;

  /**
   * Provider information
   */
  provider: {
    id: string;
    name: string;
    email: string;
  };

  /**
   * Pricing information
   */
  pricing: {
    model: 'free' | 'pay-per-use' | 'subscription';
    price?: number;
    currency?: string;
  };

  /**
   * Service status
   */
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'deprecated';

  /**
   * Tags
   */
  tags: string[];

  /**
   * Endpoints
   */
  endpoints: {
    url: string;
    method: string;
    description: string;
  }[];

  /**
   * Creation timestamp
   */
  createdAt: string;

  /**
   * Last update timestamp
   */
  updatedAt: string;

  /**
   * Metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Create service request
 */
export interface CreateServiceRequest {
  name: string;
  description: string;
  category: string;
  version: string;
  pricing: {
    model: 'free' | 'pay-per-use' | 'subscription';
    price?: number;
    currency?: string;
  };
  tags?: string[];
  endpoints: {
    url: string;
    method: string;
    description: string;
  }[];
  metadata?: Record<string, unknown>;
}

/**
 * Update service request
 */
export interface UpdateServiceRequest {
  name?: string;
  description?: string;
  category?: string;
  version?: string;
  pricing?: {
    model: 'free' | 'pay-per-use' | 'subscription';
    price?: number;
    currency?: string;
  };
  tags?: string[];
  endpoints?: {
    url: string;
    method: string;
    description: string;
  }[];
  metadata?: Record<string, unknown>;
}

/**
 * List services parameters
 */
export interface ListServicesParams {
  /**
   * Maximum number of items to return
   * @default 10
   */
  limit?: number;

  /**
   * Cursor for pagination
   */
  cursor?: string;

  /**
   * Filter by category
   */
  category?: string;

  /**
   * Filter by status
   */
  status?: Service['status'];

  /**
   * Filter by tags
   */
  tags?: string[];

  /**
   * Sort field
   */
  sortBy?: 'name' | 'createdAt' | 'updatedAt';

  /**
   * Sort order
   */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search services parameters
 */
export interface SearchServicesParams {
  /**
   * Maximum number of items to return
   * @default 10
   */
  limit?: number;

  /**
   * Cursor for pagination
   */
  cursor?: string;

  /**
   * Search query
   */
  query: string;

  /**
   * Filter by category
   */
  category?: string;

  /**
   * Filter by tags
   */
  tags?: string[];

  /**
   * Minimum rating
   */
  minRating?: number;

  /**
   * Pricing model filter
   */
  pricingModel?: 'free' | 'pay-per-use' | 'subscription';
}

/**
 * Usage data
 */
export interface Usage {
  /**
   * Service ID
   */
  serviceId: string;

  /**
   * User ID
   */
  userId: string;

  /**
   * Timestamp
   */
  timestamp: string;

  /**
   * Number of requests
   */
  requests: number;

  /**
   * Total tokens used
   */
  tokens?: number;

  /**
   * Cost
   */
  cost?: number;

  /**
   * Response time (ms)
   */
  responseTime?: number;

  /**
   * Status
   */
  status: 'success' | 'error';

  /**
   * Metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Quota information
 */
export interface Quota {
  /**
   * Service ID
   */
  serviceId: string;

  /**
   * User ID
   */
  userId: string;

  /**
   * Quota limit
   */
  limit: number;

  /**
   * Used quota
   */
  used: number;

  /**
   * Remaining quota
   */
  remaining: number;

  /**
   * Reset time
   */
  resetAt: string;
}

/**
 * SLA metrics
 */
export interface SLAMetrics {
  /**
   * Service ID
   */
  serviceId: string;

  /**
   * Uptime percentage
   */
  uptime: number;

  /**
   * Average response time (ms)
   */
  avgResponseTime: number;

  /**
   * P95 response time (ms)
   */
  p95ResponseTime: number;

  /**
   * P99 response time (ms)
   */
  p99ResponseTime: number;

  /**
   * Error rate percentage
   */
  errorRate: number;

  /**
   * Time period
   */
  period: {
    start: string;
    end: string;
  };
}

/**
 * Category
 */
export interface Category {
  /**
   * Category ID
   */
  id: string;

  /**
   * Category name
   */
  name: string;

  /**
   * Category description
   */
  description: string;

  /**
   * Number of services
   */
  serviceCount: number;
}

/**
 * Tag
 */
export interface Tag {
  /**
   * Tag name
   */
  name: string;

  /**
   * Number of services
   */
  count: number;
}

/**
 * Analytics data
 */
export interface Analytics {
  /**
   * Total services
   */
  totalServices: number;

  /**
   * Active services
   */
  activeServices: number;

  /**
   * Total users
   */
  totalUsers: number;

  /**
   * Total requests
   */
  totalRequests: number;

  /**
   * Average response time
   */
  avgResponseTime: number;

  /**
   * Error rate
   */
  errorRate: number;

  /**
   * Time period
   */
  period: {
    start: string;
    end: string;
  };
}

/**
 * Audit log entry
 */
export interface AuditLog {
  /**
   * Log ID
   */
  id: string;

  /**
   * Timestamp
   */
  timestamp: string;

  /**
   * User ID
   */
  userId: string;

  /**
   * Action performed
   */
  action: string;

  /**
   * Resource type
   */
  resourceType: string;

  /**
   * Resource ID
   */
  resourceId: string;

  /**
   * IP address
   */
  ipAddress: string;

  /**
   * User agent
   */
  userAgent: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}
