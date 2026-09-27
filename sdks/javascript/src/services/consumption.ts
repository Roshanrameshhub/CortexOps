import { HttpClient } from '../http-client';
import { Usage, Quota, SLAMetrics } from '../types';

/**
 * Consumption Service Client
 *
 * Handles usage tracking, quota management, and SLA monitoring
 */
export class ConsumptionServiceClient {
  private readonly http: HttpClient;
  private readonly basePath = '/consumption/v1';

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get usage metrics
   *
   * @param serviceId - Service ID
   * @param timeRange - Time range for metrics
   * @returns Usage data
   *
   * @example
   * ```typescript
   * const usage = await client.consumption.getUsage('svc_123', {
   *   start: '2024-11-01T00:00:00Z',
   *   end: '2024-11-30T23:59:59Z'
   * });
   *
   * console.log(`Total requests: ${usage.totalRequests}`);
   * console.log(`Total cost: $${usage.totalCost}`);
   * ```
   */
  async getUsage(
    serviceId: string,
    timeRange: { start: string; end: string }
  ): Promise<{
    serviceId: string;
    timeRange: { start: string; end: string };
    totalRequests: number;
    totalTokens?: number;
    totalCost?: number;
    avgResponseTime: number;
    errorRate: number;
    details: Usage[];
  }> {
    return this.http.get(`${this.basePath}/usage`, {
      serviceId,
      start: timeRange.start,
      end: timeRange.end,
    });
  }

  /**
   * Get quota information
   *
   * @param serviceId - Service ID
   * @returns Quota details
   *
   * @example
   * ```typescript
   * const quota = await client.consumption.getQuota('svc_123');
   *
   * console.log(`Used: ${quota.used}/${quota.limit}`);
   * console.log(`Remaining: ${quota.remaining}`);
   * console.log(`Resets at: ${quota.resetAt}`);
   * ```
   */
  async getQuota(serviceId: string): Promise<Quota> {
    return this.http.get<Quota>(`${this.basePath}/quota`, { serviceId });
  }

  /**
   * Track API usage
   *
   * @param serviceId - Service ID
   * @param usage - Usage data
   *
   * @example
   * ```typescript
   * await client.consumption.trackUsage('svc_123', {
   *   requests: 1,
   *   tokens: 150,
   *   responseTime: 234,
   *   status: 'success'
   * });
   * ```
   */
  async trackUsage(
    serviceId: string,
    usage: {
      requests: number;
      tokens?: number;
      responseTime?: number;
      status: 'success' | 'error';
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.http.post<void>(`${this.basePath}/usage/track`, {
      serviceId,
      ...usage,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get SLA metrics
   *
   * @param serviceId - Service ID
   * @param period - Time period (optional)
   * @returns SLA metrics
   *
   * @example
   * ```typescript
   * const sla = await client.consumption.getSLA('svc_123', {
   *   start: '2024-11-01T00:00:00Z',
   *   end: '2024-11-30T23:59:59Z'
   * });
   *
   * console.log(`Uptime: ${sla.uptime}%`);
   * console.log(`Avg response time: ${sla.avgResponseTime}ms`);
   * console.log(`Error rate: ${sla.errorRate}%`);
   * ```
   */
  async getSLA(
    serviceId: string,
    period?: { start: string; end: string }
  ): Promise<SLAMetrics> {
    const params: Record<string, unknown> = { serviceId };
    if (period) {
      params.start = period.start;
      params.end = period.end;
    }

    return this.http.get<SLAMetrics>(`${this.basePath}/sla`, params);
  }

  /**
   * Get billing information
   *
   * @param serviceId - Service ID
   * @param period - Billing period (optional)
   * @returns Billing details
   *
   * @example
   * ```typescript
   * const billing = await client.consumption.getBillingInfo('svc_123', {
   *   start: '2024-11-01T00:00:00Z',
   *   end: '2024-11-30T23:59:59Z'
   * });
   *
   * console.log(`Total cost: $${billing.totalCost}`);
   * console.log(`Breakdown:`, billing.breakdown);
   * ```
   */
  async getBillingInfo(
    serviceId: string,
    period?: { start: string; end: string }
  ): Promise<{
    serviceId: string;
    period: { start: string; end: string };
    totalCost: number;
    currency: string;
    breakdown: Array<{
      date: string;
      requests: number;
      cost: number;
    }>;
  }> {
    const params: Record<string, unknown> = { serviceId };
    if (period) {
      params.start = period.start;
      params.end = period.end;
    }

    return this.http.get(`${this.basePath}/billing`, params);
  }
}
