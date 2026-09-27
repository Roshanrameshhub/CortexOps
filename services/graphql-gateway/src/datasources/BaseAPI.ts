import fetch, { Response } from 'node-fetch';

/**
 * Base configuration for API data sources
 */
export interface APIConfig {
  baseURL: string;
  token?: string;
  timeout?: number;
}

/**
 * Base API client for REST data sources
 */
export class BaseAPI {
  protected baseURL: string;
  protected token?: string;
  protected timeout: number;

  constructor(config: APIConfig) {
    this.baseURL = config.baseURL;
    this.token = config.token;
    this.timeout = config.timeout || 30000; // 30 second default
  }

  /**
   * Make HTTP GET request
   */
  protected async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    const url = this.buildURL(path, params);
    const response = await this.fetch(url, { method: 'GET' });
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP POST request
   */
  protected async post<T>(path: string, body?: any): Promise<T> {
    const url = this.buildURL(path);
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP PUT request
   */
  protected async put<T>(path: string, body?: any): Promise<T> {
    const url = this.buildURL(path);
    const response = await this.fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP PATCH request
   */
  protected async patch<T>(path: string, body?: any): Promise<T> {
    const url = this.buildURL(path);
    const response = await this.fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP DELETE request
   */
  protected async delete<T>(path: string): Promise<T> {
    const url = this.buildURL(path);
    const response = await this.fetch(url, { method: 'DELETE' });
    return this.handleResponse<T>(response);
  }

  /**
   * Build full URL with query parameters
   */
  private buildURL(path: string, params?: Record<string, any>): string {
    const url = new URL(path, this.baseURL);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => url.searchParams.append(key, String(v)));
          } else {
            url.searchParams.append(key, String(value));
          }
        }
      });
    }

    return url.toString();
  }

  /**
   * Make HTTP request with authentication and timeout
   */
  private async fetch(url: string, options: any = {}): Promise<Response> {
    const headers: Record<string, string> = {
      ...(options.headers || {}),
    };

    // Add authorization header if token is available
    if (this.token) {
      headers['Authorization'] = this.token.startsWith('Bearer ')
        ? this.token
        : `Bearer ${this.token}`;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response as Response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Handle HTTP response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await this.parseError(response);
      throw error;
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (!contentType || response.status === 204) {
      return {} as T;
    }

    // Parse JSON response
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data as T;
    }

    // Return text for non-JSON responses
    const text = await response.text();
    return text as unknown as T;
  }

  /**
   * Parse error from response
   */
  private async parseError(response: Response): Promise<Error> {
    const contentType = response.headers.get('content-type');

    try {
      if (contentType?.includes('application/json')) {
        const errorData: any = await response.json();
        return new APIError(
          errorData?.message || response.statusText,
          response.status,
          errorData?.code,
          errorData
        );
      }

      const text = await response.text();
      return new APIError(text || response.statusText, response.status);
    } catch (error) {
      return new APIError(response.statusText, response.status);
    }
  }
}

/**
 * Custom API error class
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
    Object.setPrototypeOf(this, APIError.prototype);
  }
}
