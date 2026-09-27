import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class ApiClient {
  private client: AxiosInstance;
  private authToken?: string;

  constructor(config: ApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const errorMessage = error.response?.data?.message || error.message;
        console.error(`API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${errorMessage}`);
        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = undefined;
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

// Service-specific clients
export class PublishingServiceClient extends ApiClient {
  constructor() {
    super({
      baseURL: process.env.PUBLISHING_SERVICE_URL || 'http://localhost:3001',
    });
  }

  async publishService(serviceData: any) {
    return this.post('/api/v1/services', serviceData);
  }

  async getService(serviceId: string) {
    return this.get(`/api/v1/services/${serviceId}`);
  }

  async updateService(serviceId: string, data: any) {
    return this.put(`/api/v1/services/${serviceId}`, data);
  }

  async deleteService(serviceId: string) {
    return this.delete(`/api/v1/services/${serviceId}`);
  }

  async getPublishingStatus(serviceId: string) {
    return this.get(`/api/v1/services/${serviceId}/status`);
  }
}

export class DiscoveryServiceClient extends ApiClient {
  constructor() {
    super({
      baseURL: process.env.DISCOVERY_SERVICE_URL || 'http://localhost:3002',
    });
  }

  async search(query: string, filters?: any) {
    return this.post('/api/v1/search', { query, filters });
  }

  async getServiceDetails(serviceId: string) {
    return this.get(`/api/v1/services/${serviceId}`);
  }

  async getRecommendations(userId?: string) {
    return this.get('/api/v1/recommendations', { params: { userId } });
  }

  async getTrending() {
    return this.get('/api/v1/trending');
  }

  async getCategories() {
    return this.get('/api/v1/categories');
  }
}

export class ConsumptionServiceClient extends ApiClient {
  constructor() {
    super({
      baseURL: process.env.CONSUMPTION_SERVICE_URL || 'http://localhost:3003',
    });
  }

  async consumeService(serviceId: string, request: any) {
    return this.post(`/api/v1/consume/${serviceId}`, request);
  }

  async provisionApiKey(serviceId: string) {
    return this.post(`/api/v1/api-keys`, { serviceId });
  }

  async getUsage(serviceId: string) {
    return this.get(`/api/v1/usage/${serviceId}`);
  }

  async getQuota(serviceId: string) {
    return this.get(`/api/v1/quota/${serviceId}`);
  }

  async getSLA(serviceId: string) {
    return this.get(`/api/v1/sla/${serviceId}`);
  }
}

export class AdminServiceClient extends ApiClient {
  constructor() {
    super({
      baseURL: process.env.ADMIN_SERVICE_URL || 'http://localhost:3004',
    });
  }

  async getHealthStatus() {
    return this.get('/api/v1/health/services');
  }

  async getWorkflows(filter?: any) {
    return this.get('/api/v1/workflows', { params: filter });
  }

  async approveWorkflow(workflowId: string, notes?: string) {
    return this.post(`/api/v1/workflows/${workflowId}/approve`, { notes });
  }

  async rejectWorkflow(workflowId: string, reason: string) {
    return this.post(`/api/v1/workflows/${workflowId}/reject`, { reason });
  }

  async getUsers() {
    return this.get('/api/v1/users');
  }

  async createUser(userData: any) {
    return this.post('/api/v1/users', userData);
  }

  async getDashboardMetrics() {
    return this.get('/api/v1/dashboard/metrics');
  }

  async getAnalytics(timeRange?: string) {
    return this.get('/api/v1/analytics', { params: { timeRange } });
  }
}
