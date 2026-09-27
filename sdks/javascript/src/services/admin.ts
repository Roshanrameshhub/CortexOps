import { HttpClient } from '../http-client';
import { Analytics, AuditLog, PaginationResponse } from '../types';

/**
 * Admin Service Client
 *
 * Handles administrative operations including analytics, user management, and audit logs
 */
export class AdminServiceClient {
  private readonly http: HttpClient;
  private readonly basePath = '/admin/v1';

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get platform analytics
   *
   * @param params - Analytics parameters
   * @returns Analytics data
   *
   * @example
   * ```typescript
   * const analytics = await client.admin.getAnalytics({
   *   start: '2024-11-01T00:00:00Z',
   *   end: '2024-11-30T23:59:59Z'
   * });
   *
   * console.log(`Total services: ${analytics.totalServices}`);
   * console.log(`Total users: ${analytics.totalUsers}`);
   * console.log(`Total requests: ${analytics.totalRequests}`);
   * ```
   */
  async getAnalytics(params: { start: string; end: string }): Promise<Analytics> {
    return this.http.get<Analytics>(`${this.basePath}/analytics`, params);
  }

  /**
   * Manage users
   *
   * @param action - Action to perform
   * @param userId - User ID
   * @param data - Additional data for the action
   *
   * @example
   * ```typescript
   * // Suspend user
   * await client.admin.manageUsers('suspend', 'usr_123', {
   *   reason: 'Violation of terms'
   * });
   *
   * // Activate user
   * await client.admin.manageUsers('activate', 'usr_123');
   * ```
   */
  async manageUsers(
    action: 'suspend' | 'activate' | 'delete',
    userId: string,
    data?: { reason?: string }
  ): Promise<void> {
    await this.http.post<void>(`${this.basePath}/users/${userId}/action`, {
      action,
      ...data,
    });
  }

  /**
   * Approve service
   *
   * @param serviceId - Service ID
   * @param notes - Approval notes (optional)
   *
   * @example
   * ```typescript
   * await client.admin.approveService('svc_123', 'Looks good!');
   * ```
   */
  async approveService(serviceId: string, notes?: string): Promise<void> {
    await this.http.post<void>(`${this.basePath}/services/${serviceId}/approve`, { notes });
  }

  /**
   * Reject service
   *
   * @param serviceId - Service ID
   * @param reason - Rejection reason
   *
   * @example
   * ```typescript
   * await client.admin.rejectService('svc_123', 'Does not meet quality standards');
   * ```
   */
  async rejectService(serviceId: string, reason: string): Promise<void> {
    await this.http.post<void>(`${this.basePath}/services/${serviceId}/reject`, { reason });
  }

  /**
   * Get audit logs
   *
   * @param params - Filter parameters
   * @returns Paginated audit logs
   *
   * @example
   * ```typescript
   * const logs = await client.admin.getAuditLogs({
   *   userId: 'usr_123',
   *   action: 'service.create',
   *   limit: 50
   * });
   *
   * for (const log of logs.data) {
   *   console.log(`${log.timestamp}: ${log.action} on ${log.resourceType}:${log.resourceId}`);
   * }
   * ```
   */
  async getAuditLogs(params?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    start?: string;
    end?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PaginationResponse<AuditLog>> {
    return this.http.get<PaginationResponse<AuditLog>>(`${this.basePath}/audit-logs`, params);
  }

  /**
   * Iterate through audit logs
   *
   * @param params - Filter parameters (excluding cursor)
   * @yields Audit log entries
   *
   * @example
   * ```typescript
   * for await (const log of client.admin.iterateAuditLogs({ userId: 'usr_123' })) {
   *   console.log(`${log.timestamp}: ${log.action}`);
   * }
   * ```
   */
  async *iterateAuditLogs(
    params?: Omit<Parameters<typeof this.getAuditLogs>[0], 'cursor'>
  ): AsyncIterableIterator<AuditLog> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getAuditLogs({ ...params, cursor });

      for (const log of response.data) {
        yield log;
      }

      cursor = response.pagination.nextCursor;
      hasMore = response.pagination.hasMore;
    }
  }

  /**
   * Get platform statistics
   *
   * @returns Platform stats
   *
   * @example
   * ```typescript
   * const stats = await client.admin.getPlatformStats();
   * console.log(stats);
   * ```
   */
  async getPlatformStats(): Promise<{
    services: { total: number; active: number; pending: number };
    users: { total: number; active: number };
    requests: { total: number; last24h: number; last7d: number };
    revenue: { total: number; last30d: number };
  }> {
    return this.http.get(`${this.basePath}/stats`);
  }
}
