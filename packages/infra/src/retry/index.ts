/**
 * @llm-marketplace/infra - Retry Module
 *
 * Provides retry utilities with exponential backoff for LLM-Dev-Ops services.
 * Supports configurable retry strategies and circuit breaker patterns.
 */

import { getLogger, InfraLogger } from '../logging';

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds (default: 100) */
  initialDelayMs: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Add jitter to delays (default: true) */
  jitter: boolean;
  /** Timeout per attempt in milliseconds (default: 30000) */
  timeoutMs: number;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  timeoutMs: 30000,
};

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateDelay(
  attempt: number,
  config: Pick<RetryConfig, 'initialDelayMs' | 'maxDelayMs' | 'backoffMultiplier' | 'jitter'>
): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);

  if (config.jitter) {
    // Add random jitter between 0% and 25% of the delay
    const jitterFactor = 1 + Math.random() * 0.25;
    return Math.floor(cappedDelay * jitterFactor);
  }

  return cappedDelay;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default function to determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors
    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('socket hang up') ||
      error.message.includes('network error')
    ) {
      return true;
    }

    // HTTP status codes (if available)
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode !== undefined) {
      // Retry on 5xx errors and specific 4xx errors
      return statusCode >= 500 || statusCode === 408 || statusCode === 429;
    }

    // Axios-specific errors
    const code = (error as { code?: string }).code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return true;
    }
  }

  return false;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryConfig>
): Promise<T> {
  const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...options };
  const logger = getLogger();

  let lastError: Error | undefined;
  let totalDelay = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Create a timeout wrapper
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timed out')), config.timeoutMs)
        ),
      ]);

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const isRetryable = config.isRetryable?.(error) ?? isRetryableError(error);

      if (!isRetryable || attempt >= config.maxRetries) {
        throw lastError;
      }

      // Calculate delay before next attempt
      const delayMs = calculateDelay(attempt, config);
      totalDelay += delayMs;

      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(error, attempt + 1, delayMs);
      }

      logger.warn(`Retry attempt ${attempt + 1}/${config.maxRetries} after ${delayMs}ms`, {
        error: lastError.message,
        attempt: attempt + 1,
        delayMs,
      });

      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('Retry failed with no error captured');
}

/**
 * Create a retryable wrapper for a function
 */
export function createRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: Partial<RetryConfig>
): T {
  return ((...args: Parameters<T>) => withRetry(() => fn(...args), options)) as T;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeoutMs: number;
  /** Number of successful calls in half-open to close circuit (default: 3) */
  successThreshold: number;
  /** Timeout per call in milliseconds (default: 10000) */
  timeoutMs: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 3,
  timeoutMs: 10000,
};

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;
  private logger: InfraLogger;

  constructor(
    private readonly name: string,
    options?: Partial<CircuitBreakerConfig>
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...options };
    this.logger = getLogger().child({ circuitBreaker: name });
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
    };
  }

  /**
   * Check if state should transition from OPEN to HALF_OPEN
   */
  private checkStateTransition(): void {
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs
    ) {
      this.state = CircuitState.HALF_OPEN;
      this.successes = 0;
      this.logger.info('Circuit transitioned to HALF_OPEN');
    }
  }

  /**
   * Record a successful call
   */
  private recordSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.logger.info('Circuit transitioned to CLOSED');
      }
    }
  }

  /**
   * Record a failed call
   */
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.logger.warn('Circuit transitioned to OPEN (failure in half-open)');
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.logger.warn(`Circuit transitioned to OPEN (${this.failures} failures)`);
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkStateTransition();

    if (this.state === CircuitState.OPEN) {
      throw new Error(`Circuit breaker ${this.name} is OPEN`);
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Circuit breaker ${this.name} timeout`)),
            this.config.timeoutMs
          )
        ),
      ]);

      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.logger.info('Circuit manually reset to CLOSED');
  }

  /**
   * Manually open the circuit breaker
   */
  trip(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
    this.logger.warn('Circuit manually tripped to OPEN');
  }
}

/**
 * Create a circuit breaker
 */
export function createCircuitBreaker(
  name: string,
  options?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return new CircuitBreaker(name, options);
}
