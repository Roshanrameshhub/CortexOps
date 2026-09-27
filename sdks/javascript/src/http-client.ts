import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { ClientConfig } from './types';
import { parseErrorResponse, NetworkError, ConfigurationError } from './errors';

/**
 * HTTP client for making API requests
 */
export class HttpClient {
  private readonly axios: AxiosInstance;
  private readonly apiKey: string;

  constructor(config: ClientConfig) {
    // Validate configuration
    if (!config.apiKey) {
      throw new ConfigurationError('API key is required');
    }

    this.apiKey = config.apiKey;

    const baseURL = config.baseUrl || 'https://api.llm-marketplace.com';

    // Ensure HTTPS
    if (!baseURL.startsWith('https://') && !baseURL.startsWith('http://localhost')) {
      throw new ConfigurationError('Base URL must use HTTPS');
    }

    // Create axios instance
    this.axios = axios.create({
      baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': '@llm-marketplace/sdk/1.0.0',
        Authorization: `Bearer ${this.apiKey}`,
        ...config.headers,
      },
    });

    // Configure retry logic
    const retryConfig = config.retryConfig || {};
    const maxRetries = retryConfig.maxRetries ?? 3;
    const retryDelay = retryConfig.retryDelay ?? 1000;
    const backoff = retryConfig.backoff ?? 'exponential';

    axiosRetry(this.axios, {
      retries: maxRetries,
      retryDelay: (retryCount) => {
        if (backoff === 'exponential') {
          return retryDelay * Math.pow(2, retryCount - 1);
        } else if (backoff === 'linear') {
          return retryDelay * retryCount;
        }
        return retryDelay;
      },
      retryCondition: (error: AxiosError) => {
        // Retry on network errors
        if (!error.response) {
          return true;
        }

        // Retry on 429 (rate limit) and 5xx errors
        const status = error.response.status;
        return status === 429 || (status >= 500 && status < 600);
      },
      shouldResetTimeout: true,
    });

    // Add request interceptor for telemetry (if enabled)
    if (config.telemetry) {
      this.axios.interceptors.request.use((config) => {
        config.headers['X-SDK-Version'] = '1.0.0';
        config.headers['X-SDK-Language'] = 'javascript';
        return config;
      });
    }

    // Add response interceptor for error handling
    this.axios.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          // Server responded with error
          const requestId = error.response.headers['x-request-id'] as string | undefined;
          throw parseErrorResponse(
            error.response.status,
            error.response.data,
            requestId
          );
        } else if (error.request) {
          // Request made but no response
          throw new NetworkError(
            error.code === 'ECONNABORTED'
              ? 'Request timeout'
              : 'Network error: No response from server',
            error
          );
        } else {
          // Error setting up request
          throw new NetworkError('Network error: Failed to send request', error);
        }
      }
    );
  }

  /**
   * Make GET request
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const config: AxiosRequestConfig = {};
    if (params) {
      config.params = params;
    }

    const response: AxiosResponse<T> = await this.axios.get(path, config);
    return response.data;
  }

  /**
   * Make POST request
   */
  async post<T>(path: string, data?: unknown): Promise<T> {
    const response: AxiosResponse<T> = await this.axios.post(path, data);
    return response.data;
  }

  /**
   * Make PUT request
   */
  async put<T>(path: string, data?: unknown): Promise<T> {
    const response: AxiosResponse<T> = await this.axios.put(path, data);
    return response.data;
  }

  /**
   * Make PATCH request
   */
  async patch<T>(path: string, data?: unknown): Promise<T> {
    const response: AxiosResponse<T> = await this.axios.patch(path, data);
    return response.data;
  }

  /**
   * Make DELETE request
   */
  async delete<T>(path: string): Promise<T> {
    const response: AxiosResponse<T> = await this.axios.delete(path);
    return response.data;
  }
}
