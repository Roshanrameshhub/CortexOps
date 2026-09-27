/**
 * RuVector Service Client
 *
 * Client for persisting DecisionEvents to ruvector-service.
 * All marketplace records, lifecycle states, and deprecation signals
 * are persisted via this client.
 *
 * CRITICAL: This agent NEVER connects directly to Google SQL.
 * All persistence occurs via ruvector-service client calls only.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { createLogger, Logger } from 'winston';
import {
  DecisionEvent,
  DeprecationAgentOutput,
  LifecycleTransition,
  ConsumerImpact
} from '@llm-marketplace/agentics-contracts';

/**
 * RuVector service configuration
 */
export interface RuVectorConfig {
  /** Base URL of ruvector-service */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Retry configuration */
  retry: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Lifecycle record for persistence
 */
export interface LifecycleRecord {
  assetId: string;
  assetType: string;
  previousState: string;
  newState: string;
  reason: string;
  reasonDescription: string;
  requesterId: string;
  sunsetDate?: string;
  transitionedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * RuVector service response
 */
interface RuVectorResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

/**
 * RuVector Service Client
 *
 * Handles all persistence operations for the Deprecation Agent.
 */
export class RuVectorServiceClient {
  private readonly client: AxiosInstance;
  private readonly logger: Logger;
  private readonly config: RuVectorConfig;

  constructor(config: RuVectorConfig) {
    this.config = config;
    this.logger = createLogger({
      level: 'info',
      defaultMeta: { service: 'ruvector-client' }
    });

    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Client-Agent': 'deprecation-agent:1.0.0'
      }
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (request) => {
        this.logger.debug('RuVector request', {
          method: request.method,
          url: request.url
        });
        return request;
      },
      (error) => {
        this.logger.error('RuVector request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug('RuVector response', {
          status: response.status,
          requestId: response.headers['x-request-id']
        });
        return response;
      },
      (error) => {
        this.logger.error('RuVector response error', {
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Persist a DecisionEvent
   *
   * MUST be called exactly once per agent invocation.
   */
  async persistDecisionEvent(event: DecisionEvent): Promise<{ eventId: string }> {
    this.logger.info('Persisting decision event', {
      agentId: event.agent_id,
      decisionType: event.decision_type,
      outcome: event.outcome
    });

    const response = await this.withRetry(async () => {
      return this.client.post<RuVectorResponse<{ eventId: string }>>(
        '/api/v1/decision-events',
        event
      );
    });

    if (!response.data.success) {
      throw new Error(`Failed to persist decision event: ${response.data.error}`);
    }

    this.logger.info('Decision event persisted', {
      eventId: response.data.data?.eventId
    });

    return { eventId: response.data.data!.eventId };
  }

  /**
   * Record a lifecycle transition
   */
  async recordLifecycleTransition(record: LifecycleRecord): Promise<{ recordId: string }> {
    this.logger.info('Recording lifecycle transition', {
      assetId: record.assetId,
      fromState: record.previousState,
      toState: record.newState
    });

    const response = await this.withRetry(async () => {
      return this.client.post<RuVectorResponse<{ recordId: string }>>(
        '/api/v1/lifecycle-records',
        record
      );
    });

    if (!response.data.success) {
      throw new Error(`Failed to record lifecycle transition: ${response.data.error}`);
    }

    this.logger.info('Lifecycle transition recorded', {
      recordId: response.data.data?.recordId
    });

    return { recordId: response.data.data!.recordId };
  }

  /**
   * Update deprecation status for an asset
   */
  async updateDeprecationStatus(
    assetId: string,
    status: 'deprecated' | 'retired',
    metadata: {
      reason: string;
      sunsetDate?: string;
      requesterId: string;
    }
  ): Promise<{ updated: boolean }> {
    this.logger.info('Updating deprecation status', {
      assetId,
      status
    });

    const response = await this.withRetry(async () => {
      return this.client.put<RuVectorResponse<{ updated: boolean }>>(
        `/api/v1/assets/${assetId}/deprecation-status`,
        {
          status,
          ...metadata,
          updatedAt: new Date().toISOString()
        }
      );
    });

    if (!response.data.success) {
      throw new Error(`Failed to update deprecation status: ${response.data.error}`);
    }

    return { updated: response.data.data?.updated ?? false };
  }

  /**
   * Get asset lifecycle history
   */
  async getLifecycleHistory(assetId: string): Promise<LifecycleTransition[]> {
    this.logger.debug('Fetching lifecycle history', { assetId });

    const response = await this.withRetry(async () => {
      return this.client.get<RuVectorResponse<{ transitions: LifecycleTransition[] }>>(
        `/api/v1/assets/${assetId}/lifecycle-history`
      );
    });

    if (!response.data.success) {
      throw new Error(`Failed to fetch lifecycle history: ${response.data.error}`);
    }

    return response.data.data?.transitions ?? [];
  }

  /**
   * Get consumer impact data for an asset
   */
  async getConsumerImpact(assetId: string): Promise<ConsumerImpact> {
    this.logger.debug('Fetching consumer impact', { assetId });

    const response = await this.withRetry(async () => {
      return this.client.get<RuVectorResponse<ConsumerImpact>>(
        `/api/v1/assets/${assetId}/consumer-impact`
      );
    });

    if (!response.data.success) {
      throw new Error(`Failed to fetch consumer impact: ${response.data.error}`);
    }

    return response.data.data!;
  }

  /**
   * Store deprecation audit trail
   */
  async storeAuditTrail(
    assetId: string,
    operation: string,
    details: DeprecationAgentOutput
  ): Promise<{ auditId: string }> {
    this.logger.info('Storing audit trail', { assetId, operation });

    const response = await this.withRetry(async () => {
      return this.client.post<RuVectorResponse<{ auditId: string }>>(
        '/api/v1/audit-trails',
        {
          assetId,
          operation,
          agentId: 'deprecation-agent:1.0.0',
          details,
          timestamp: new Date().toISOString()
        }
      );
    });

    if (!response.data.success) {
      throw new Error(`Failed to store audit trail: ${response.data.error}`);
    }

    return { auditId: response.data.data!.auditId };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await this.client.get<RuVectorResponse<{ status: string }>>(
        '/health'
      );
      const latencyMs = Date.now() - start;
      return {
        healthy: response.data.success && response.data.data?.status === 'healthy',
        latencyMs
      };
    } catch (error) {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const axiosError = error as AxiosError;

      // Don't retry on client errors (4xx)
      if (axiosError.response?.status && axiosError.response.status < 500) {
        throw error;
      }

      if (attempt >= this.config.retry.maxAttempts) {
        this.logger.error('Max retries exceeded', {
          attempts: attempt,
          error: axiosError.message
        });
        throw error;
      }

      const backoffMs = this.config.retry.backoffMs * Math.pow(2, attempt - 1);
      this.logger.warn('Retrying operation', { attempt, backoffMs });

      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return this.withRetry(operation, attempt + 1);
    }
  }
}

/**
 * Create RuVector client from environment
 */
export function createRuVectorClient(): RuVectorServiceClient {
  const config: RuVectorConfig = {
    baseUrl: process.env.RUVECTOR_SERVICE_URL || 'http://localhost:8080',
    apiKey: process.env.RUVECTOR_API_KEY || '',
    timeoutMs: parseInt(process.env.RUVECTOR_TIMEOUT_MS || '30000', 10),
    retry: {
      maxAttempts: parseInt(process.env.RUVECTOR_RETRY_ATTEMPTS || '3', 10),
      backoffMs: parseInt(process.env.RUVECTOR_RETRY_BACKOFF_MS || '1000', 10)
    }
  };

  return new RuVectorServiceClient(config);
}
