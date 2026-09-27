import { BaseAPI } from './BaseAPI';

/**
 * Admin Service API client
 */
export class AdminAPI extends BaseAPI {
  /**
   * Get platform analytics
   */
  async getAnalytics(params: {
    startTime: string;
    endTime: string;
  }): Promise<any> {
    return this.get('/analytics', params);
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(params: {
    filter?: any;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    return this.get('/audit-logs', params);
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats(): Promise<any> {
    return this.get('/stats');
  }

  /**
   * Approve service
   */
  async approveService(id: string, notes?: string): Promise<any> {
    return this.post(`/services/${id}/approve`, { notes });
  }

  /**
   * Reject service
   */
  async rejectService(id: string, reason: string): Promise<any> {
    return this.post(`/services/${id}/reject`, { reason });
  }

  /**
   * Manage user
   */
  async manageUser(params: {
    userId: string;
    action: string;
    data?: any;
  }): Promise<any> {
    return this.post(`/users/${params.userId}/manage`, {
      action: params.action,
      data: params.data,
    });
  }

  /**
   * Get user details
   */
  async getUser(userId: string): Promise<any> {
    return this.get(`/users/${userId}`);
  }

  /**
   * List users
   */
  async listUsers(params: {
    filter?: any;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    return this.get('/users', params);
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<any> {
    return this.get('/health');
  }

  /**
   * Get incidents
   */
  async getIncidents(params?: {
    status?: string;
    limit?: number;
  }): Promise<any> {
    return this.get('/incidents', params);
  }
}
