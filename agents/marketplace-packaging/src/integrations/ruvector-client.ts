/**
 * RuVector Service Client
 *
 * Client for persisting DecisionEvents to ruvector-service.
 * ALL persistence operations MUST go through this client.
 *
 * IMPORTANT: This agent NEVER connects directly to Google SQL.
 * All persistence is via ruvector-service client calls only.
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import type { DecisionEvent } from '@llm-marketplace/agentics-contracts';

/**
 * Response from ruvector-service
 */
interface RuVectorResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Decision event persistence result
 */
interface PersistResult {
  id: string;
  persisted_at: string;
}

/**
 * RuVector Service Client
 */
export class RuVectorClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly apiKey?: string;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.ruvector.baseUrl;
    this.timeout = config.ruvector.timeout;
    this.retryAttempts = config.ruvector.retryAttempts;
    this.retryDelayMs = config.ruvector.retryDelayMs;
    this.apiKey = config.ruvector.apiKey;
  }

  /**
   * Persist a DecisionEvent to ruvector-service
   *
   * This is the ONLY way to persist data from this agent.
   */
  async persistDecisionEvent(event: DecisionEvent): Promise<PersistResult> {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.makeRequest<PersistResult>(
          '/api/v1/decisions',
          'POST',
          event
        );

        if (!response.success || !response.data) {
          throw new Error(response.error?.message || 'Failed to persist decision event');
        }

        logger.info('Decision event persisted', {
          event_id: event.id,
          decision_type: event.decision_type,
          duration_ms: Date.now() - startTime,
          attempt,
        });

        return response.data;
      } catch (error) {
        const isLastAttempt = attempt === this.retryAttempts;

        logger.warn('Failed to persist decision event', {
          event_id: event.id,
          attempt,
          max_attempts: this.retryAttempts,
          error: error instanceof Error ? error.message : String(error),
          will_retry: !isLastAttempt,
        });

        if (isLastAttempt) {
          throw error;
        }

        // Exponential backoff
        await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
      }
    }

    // This should never be reached due to throw in loop
    throw new Error('Unexpected: exceeded retry attempts without throwing');
  }

  /**
   * Health check for ruvector-service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest<{ status: string }>('/health', 'GET');
      return response.success && response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Make HTTP request to ruvector-service
   */
  private async makeRequest<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown
  ): Promise<RuVectorResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || response.statusText,
          },
        };
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `Request timed out after ${this.timeout}ms`,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Delay helper for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let clientInstance: RuVectorClient | null = null;

/**
 * Get RuVector client instance
 */
export function getRuVectorClient(): RuVectorClient {
  if (!clientInstance) {
    clientInstance = new RuVectorClient();
  }
  return clientInstance;
}

/**
 * Reset client instance (for testing)
 */
export function resetRuVectorClient(): void {
  clientInstance = null;
}
