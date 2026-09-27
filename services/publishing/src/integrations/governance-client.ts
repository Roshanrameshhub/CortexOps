import axios, { AxiosInstance } from 'axios';
import { Service, PublishingWorkflowContext } from '../types';
import { logger } from '../utils/logger';

/**
 * GraphQL client for Governance Dashboard integration
 */
export class GovernanceClient {
  private readonly client: AxiosInstance;
  private readonly graphqlEndpoint: string;

  constructor() {
    this.graphqlEndpoint =
      process.env.GOVERNANCE_DASHBOARD_GRAPHQL_URL || 'http://localhost:3020/graphql';

    this.client = axios.create({
      baseURL: this.graphqlEndpoint,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Execute GraphQL query
   */
  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.client.post('', {
        query,
        variables,
      });

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data as T;
    } catch (error) {
      logger.error('GraphQL query failed', {
        query: query.substring(0, 100),
        error,
      });
      throw error;
    }
  }

  /**
   * Notify about new service publication
   */
  async notifyServicePublished(service: Partial<Service>): Promise<void> {
    try {
      const mutation = `
        mutation NotifyServicePublished($input: ServicePublishedInput!) {
          notifyServicePublished(input: $input) {
            success
            notificationId
          }
        }
      `;

      const variables = {
        input: {
          serviceId: service.id,
          serviceName: service.name,
          version: service.version,
          providerId: service.providerId,
          category: service.category,
          status: service.status,
          publishedAt: new Date().toISOString(),
        },
      };

      await this.query(mutation, variables);

      logger.info('Service publication notified to Governance Dashboard', {
        serviceId: service.id,
        serviceName: service.name,
      });
    } catch (error) {
      logger.error('Failed to notify service publication', {
        serviceId: service.id,
        error,
      });
      // Don't throw - notification failures shouldn't break main flow
    }
  }

  /**
   * Create approval workflow
   */
  async createApprovalWorkflow(
    workflowContext: PublishingWorkflowContext
  ): Promise<{ workflowId: string }> {
    try {
      const mutation = `
        mutation CreateApprovalWorkflow($input: ApprovalWorkflowInput!) {
          createApprovalWorkflow(input: $input) {
            workflowId
            status
            assignedTo
            createdAt
          }
        }
      `;

      const variables = {
        input: {
          serviceId: workflowContext.serviceId,
          providerId: workflowContext.providerId,
          serviceName: workflowContext.serviceSpec.name,
          serviceVersion: workflowContext.serviceSpec.version,
          validationResults: {
            passed: workflowContext.validationResult?.isValid,
            errors: workflowContext.validationResult?.errors,
            warnings: workflowContext.validationResult?.warnings,
          },
          policyResults: {
            compliant: workflowContext.policyResult?.compliant,
            violations: workflowContext.policyResult?.violations,
          },
          requestedAt: workflowContext.startTime.toISOString(),
        },
      };

      const result = await this.query<{ createApprovalWorkflow: { workflowId: string } }>(
        mutation,
        variables
      );

      logger.info('Approval workflow created', {
        workflowId: result.createApprovalWorkflow.workflowId,
        serviceId: workflowContext.serviceId,
      });

      return { workflowId: result.createApprovalWorkflow.workflowId };
    } catch (error) {
      logger.error('Failed to create approval workflow', {
        serviceId: workflowContext.serviceId,
        error,
      });
      throw new Error(`Approval workflow creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check approval status
   */
  async checkApprovalStatus(
    workflowId: string
  ): Promise<{ status: 'pending' | 'approved' | 'rejected'; comments?: string }> {
    try {
      const query = `
        query GetApprovalWorkflow($workflowId: ID!) {
          approvalWorkflow(id: $workflowId) {
            id
            status
            comments
            approvedBy
            approvedAt
          }
        }
      `;

      const result = await this.query<{
        approvalWorkflow: {
          status: 'pending' | 'approved' | 'rejected';
          comments?: string;
        };
      }>(query, { workflowId });

      return {
        status: result.approvalWorkflow.status,
        comments: result.approvalWorkflow.comments,
      };
    } catch (error) {
      logger.error('Failed to check approval status', {
        workflowId,
        error,
      });
      throw new Error(`Approval status check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Stream marketplace event
   */
  async streamEvent(
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const mutation = `
        mutation StreamEvent($input: EventInput!) {
          streamEvent(input: $input) {
            success
          }
        }
      `;

      const variables = {
        input: {
          eventType,
          timestamp: new Date().toISOString(),
          data,
        },
      };

      await this.query(mutation, variables);

      logger.debug('Event streamed to Governance Dashboard', {
        eventType,
      });
    } catch (error) {
      logger.error('Failed to stream event', {
        eventType,
        error,
      });
      // Don't throw - event streaming failures shouldn't break main flow
    }
  }

  /**
   * Export audit log
   */
  async exportAuditLog(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const query = `
        query GetAuditLog($serviceId: ID!, $startDate: DateTime!, $endDate: DateTime!) {
          auditLog(serviceId: $serviceId, startDate: $startDate, endDate: $endDate) {
            entries {
              id
              timestamp
              action
              actor
              details
            }
          }
        }
      `;

      const result = await this.query<{
        auditLog: {
          entries: Array<Record<string, unknown>>;
        };
      }>(query, {
        serviceId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      return result.auditLog.entries;
    } catch (error) {
      logger.error('Failed to export audit log', {
        serviceId,
        error,
      });
      throw new Error(`Audit log export failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get marketplace metrics
   */
  async getMetrics(timeRange: string): Promise<Record<string, unknown>> {
    try {
      const query = `
        query GetMetrics($timeRange: String!) {
          marketplaceMetrics(timeRange: $timeRange) {
            totalServices
            activeServices
            pendingApprovals
            avgPublishTime
            successRate
          }
        }
      `;

      const result = await this.query<{
        marketplaceMetrics: Record<string, unknown>;
      }>(query, { timeRange });

      return result.marketplaceMetrics;
    } catch (error) {
      logger.error('Failed to get metrics', {
        timeRange,
        error,
      });
      throw new Error(`Metrics retrieval failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check Governance Dashboard health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const query = `
        query Health {
          health {
            status
          }
        }
      `;

      const result = await this.query<{ health: { status: string } }>(query);
      return result.health.status === 'healthy';
    } catch (error) {
      logger.warn('Governance Dashboard health check failed', { error });
      return false;
    }
  }
}
