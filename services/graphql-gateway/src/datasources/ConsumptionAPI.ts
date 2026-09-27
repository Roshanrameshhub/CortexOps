import { BaseAPI } from './BaseAPI';

/**
 * Consumption Service API client
 */
export class ConsumptionAPI extends BaseAPI {
  /**
   * Get usage metrics for a service
   */
  async getUsageMetrics(params: {
    serviceId: string;
    startTime: string;
    endTime: string;
  }): Promise<any> {
    return this.get(`/services/${params.serviceId}/usage`, {
      startTime: params.startTime,
      endTime: params.endTime,
    });
  }

  /**
   * Get quota information
   */
  async getQuota(serviceId: string): Promise<any> {
    return this.get(`/services/${serviceId}/quota`);
  }

  /**
   * Get SLA metrics
   */
  async getSLAMetrics(params: {
    serviceId: string;
    startTime?: string;
    endTime?: string;
  }): Promise<any> {
    return this.get(`/services/${params.serviceId}/sla`, {
      startTime: params.startTime,
      endTime: params.endTime,
    });
  }

  /**
   * Get billing information
   */
  async getBillingInfo(params: {
    serviceId: string;
    startTime?: string;
    endTime?: string;
  }): Promise<any> {
    return this.get(`/services/${params.serviceId}/billing`, {
      startTime: params.startTime,
      endTime: params.endTime,
    });
  }

  /**
   * Track service usage
   */
  async trackUsage(serviceId: string, input: any): Promise<any> {
    return this.post(`/services/${serviceId}/track`, input);
  }

  /**
   * Batch get quota for multiple services
   */
  async batchGetQuota(serviceIds: string[]): Promise<any[]> {
    return this.post('/quota/batch', { serviceIds });
  }

  /**
   * Get usage summary
   */
  async getUsageSummary(params: {
    userId?: string;
    startTime: string;
    endTime: string;
  }): Promise<any> {
    return this.get('/usage/summary', params);
  }
}
