/**
 * Deprecation Agent Unit Tests
 *
 * Tests for the Deprecation Agent core functionality.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DeprecationAgentInput,
  DeprecationAgentOutput,
  DecisionEvent,
  validateDeprecationInput,
  validateDeprecationOutput,
  validateDecisionEvent,
  DEPRECATION_AGENT_METADATA
} from '@llm-marketplace/agentics-contracts';
import { DeprecationAgent, createDeprecationAgent } from '../core';
import { RuVectorServiceClient } from '../clients';

// Mock the ruvector client
jest.mock('../clients', () => ({
  ...jest.requireActual('../clients'),
  createRuVectorClient: jest.fn(() => mockRuVectorClient)
}));

const mockRuVectorClient = {
  persistDecisionEvent: jest.fn(),
  recordLifecycleTransition: jest.fn(),
  updateDeprecationStatus: jest.fn(),
  getLifecycleHistory: jest.fn(),
  getConsumerImpact: jest.fn(),
  storeAuditTrail: jest.fn(),
  healthCheck: jest.fn()
};

describe('DeprecationAgent', () => {
  let agent: DeprecationAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = createDeprecationAgent();

    // Setup default mock responses
    mockRuVectorClient.persistDecisionEvent.mockResolvedValue({ eventId: uuidv4() });
    mockRuVectorClient.recordLifecycleTransition.mockResolvedValue({ recordId: uuidv4() });
    mockRuVectorClient.updateDeprecationStatus.mockResolvedValue({ updated: true });
    mockRuVectorClient.getLifecycleHistory.mockResolvedValue([
      {
        fromState: 'active',
        toState: 'active',
        transitionedAt: new Date().toISOString(),
        initiatedBy: uuidv4(),
        reason: 'Initial state'
      }
    ]);
    mockRuVectorClient.getConsumerImpact.mockResolvedValue({
      activeConsumerCount: 10,
      criticalConsumerCount: 2,
      averageDailyRequests: 1000,
      topConsumers: [uuidv4(), uuidv4()],
      impactScore: 0.3
    });
    mockRuVectorClient.storeAuditTrail.mockResolvedValue({ auditId: uuidv4() });
    mockRuVectorClient.healthCheck.mockResolvedValue({ healthy: true, latencyMs: 50 });
  });

  describe('Agent Metadata', () => {
    it('should have correct classification', () => {
      expect(DEPRECATION_AGENT_METADATA.classification).toBe('LIFECYCLE_MANAGEMENT');
    });

    it('should have correct decision type', () => {
      expect(DEPRECATION_AGENT_METADATA.decisionType).toBe('marketplace_deprecation');
    });

    it('should define non-responsibilities', () => {
      expect(DEPRECATION_AGENT_METADATA.mustNot).toContain('Execute workflows');
      expect(DEPRECATION_AGENT_METADATA.mustNot).toContain('Modify runtime behavior');
      expect(DEPRECATION_AGENT_METADATA.mustNot).toContain('Connect directly to SQL');
    });
  });

  describe('Input Validation', () => {
    it('should validate correct deprecation input', () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'This service has reached end of life and will be retired.',
        requesterId: uuidv4()
      };

      const validated = validateDeprecationInput(input);
      expect(validated).toBeDefined();
      expect(validated.assetId).toBe(input.assetId);
    });

    it('should reject invalid asset type', () => {
      const input = {
        assetId: uuidv4(),
        assetType: 'invalid_type',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Test description',
        requesterId: uuidv4()
      };

      expect(() => validateDeprecationInput(input)).toThrow();
    });

    it('should reject invalid version format', () => {
      const input = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: 'invalid',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Test description',
        requesterId: uuidv4()
      };

      expect(() => validateDeprecationInput(input)).toThrow();
    });

    it('should reject short reason description', () => {
      const input = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Short',
        requesterId: uuidv4()
      };

      expect(() => validateDeprecationInput(input)).toThrow();
    });
  });

  describe('Deprecation Execution', () => {
    it('should successfully deprecate an asset', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'replaced_by_newer_version',
        reasonDescription: 'This service is being replaced by version 2.0.0.',
        requesterId: uuidv4(),
        sunsetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(true);
      expect(result.output.statusCode).toBe('DEPRECATED');
      expect(result.output.newState).toBe('deprecated');
      expect(result.decisionEvent).toBeDefined();
    });

    it('should successfully retire an asset', async () => {
      // First mark as deprecated
      mockRuVectorClient.getLifecycleHistory.mockResolvedValue([
        {
          fromState: 'active',
          toState: 'deprecated',
          transitionedAt: new Date().toISOString(),
          initiatedBy: uuidv4(),
          reason: 'Deprecated'
        }
      ]);

      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'retired',
        reason: 'end_of_life',
        reasonDescription: 'This service has been retired permanently.',
        requesterId: uuidv4(),
        immediateEffect: true
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(true);
      expect(result.output.statusCode).toBe('RETIRED');
      expect(result.output.newState).toBe('retired');
    });

    it('should reject deprecation for non-existent asset', async () => {
      mockRuVectorClient.getLifecycleHistory.mockResolvedValue([]);

      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Asset does not exist.',
        requesterId: uuidv4()
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(false);
      expect(result.output.statusCode).toBe('ASSET_NOT_FOUND');
    });

    it('should reject already deprecated asset', async () => {
      mockRuVectorClient.getLifecycleHistory.mockResolvedValue([
        {
          fromState: 'active',
          toState: 'deprecated',
          transitionedAt: new Date().toISOString(),
          initiatedBy: uuidv4(),
          reason: 'Already deprecated'
        }
      ]);

      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Trying to deprecate again.',
        requesterId: uuidv4()
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(false);
      expect(result.output.statusCode).toBe('ALREADY_DEPRECATED');
    });

    it('should block deprecation with high consumer count without force', async () => {
      mockRuVectorClient.getConsumerImpact.mockResolvedValue({
        activeConsumerCount: 500,
        criticalConsumerCount: 50,
        averageDailyRequests: 100000,
        topConsumers: [],
        impactScore: 0.9
      });

      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Deprecating high-usage service.',
        requesterId: uuidv4(),
        forceDeprecation: false
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(false);
      expect(result.output.statusCode).toBe('CONSUMER_BLOCK');
      expect(result.output.consumerImpact?.activeConsumerCount).toBe(500);
    });

    it('should allow forced deprecation with high consumer count', async () => {
      mockRuVectorClient.getConsumerImpact.mockResolvedValue({
        activeConsumerCount: 500,
        criticalConsumerCount: 50,
        averageDailyRequests: 100000,
        topConsumers: [],
        impactScore: 0.9
      });

      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'security_vulnerability',
        reasonDescription: 'Critical security vulnerability requires immediate deprecation.',
        requesterId: uuidv4(),
        forceDeprecation: true,
        immediateEffect: true
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(true);
      expect(result.output.statusCode).toBe('DEPRECATED');
    });
  });

  describe('DecisionEvent Generation', () => {
    it('should emit exactly one DecisionEvent per invocation', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing decision event generation.',
        requesterId: uuidv4()
      };

      await agent.execute(input);

      expect(mockRuVectorClient.persistDecisionEvent).toHaveBeenCalledTimes(1);
    });

    it('should generate valid DecisionEvent structure', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing decision event structure.',
        requesterId: uuidv4()
      };

      const result = await agent.execute(input);

      // Validate the decision event
      expect(() => validateDecisionEvent(result.decisionEvent)).not.toThrow();

      // Check required fields
      expect(result.decisionEvent.agent_id).toMatch(/^deprecation-agent:[0-9]+\.[0-9]+\.[0-9]+$/);
      expect(result.decisionEvent.agent_version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
      expect(result.decisionEvent.decision_type).toBe('marketplace_deprecation');
      expect(result.decisionEvent.inputs_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.decisionEvent.confidence).toBeDefined();
      expect(result.decisionEvent.constraints_applied).toBeDefined();
    });

    it('should include correct confidence distribution', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing confidence distribution.',
        requesterId: uuidv4()
      };

      const result = await agent.execute(input);

      expect(result.decisionEvent.confidence.primary).toBeGreaterThanOrEqual(0);
      expect(result.decisionEvent.confidence.primary).toBeLessThanOrEqual(1);
      expect(result.decisionEvent.confidence.lifecycleValidity).toBeDefined();
      expect(result.decisionEvent.confidence.visibilityCompliance).toBeDefined();
      expect(result.decisionEvent.confidence.versionCompliance).toBeDefined();
    });
  });

  describe('Output Validation', () => {
    it('should generate valid output structure', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing output structure.',
        requesterId: uuidv4()
      };

      const result = await agent.execute(input);

      expect(() => validateDeprecationOutput(result.output)).not.toThrow();
    });

    it('should include processing duration', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing processing duration.',
        requesterId: uuidv4()
      };

      const result = await agent.execute(input);

      expect(result.output.processingDurationMs).toBeDefined();
      expect(result.output.processingDurationMs).toBeGreaterThan(0);
    });
  });

  describe('Notification Dispatch', () => {
    it('should dispatch notifications when enabled', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing notification dispatch.',
        requesterId: uuidv4(),
        notificationConfig: {
          enabled: true,
          urgency: 'standard',
          reminderDays: [30, 14, 7, 1]
        }
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(true);
      expect(result.output.notifications).toBeDefined();
      expect(result.output.notifications?.totalQueued).toBeGreaterThan(0);
    });

    it('should not dispatch notifications when disabled', async () => {
      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing notification disabled.',
        requesterId: uuidv4(),
        notificationConfig: {
          enabled: false,
          urgency: 'standard',
          reminderDays: []
        }
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(true);
      expect(result.output.notifications?.totalQueued).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should return healthy when ruvector is healthy', async () => {
      mockRuVectorClient.healthCheck.mockResolvedValue({ healthy: true, latencyMs: 50 });

      const health = await agent.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.checks.ruvectorService).toBe(true);
    });

    it('should return unhealthy when ruvector is down', async () => {
      mockRuVectorClient.healthCheck.mockResolvedValue({ healthy: false, latencyMs: 5000 });

      const health = await agent.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks.ruvectorService).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle ruvector persistence failures gracefully', async () => {
      mockRuVectorClient.persistDecisionEvent.mockRejectedValue(new Error('Connection failed'));

      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing persistence failure handling.',
        requesterId: uuidv4()
      };

      // Should not throw, but log the error
      const result = await agent.execute(input);

      // The deprecation itself should still succeed
      expect(result.output.success).toBe(true);
    });

    it('should handle lifecycle record failures', async () => {
      mockRuVectorClient.recordLifecycleTransition.mockRejectedValue(new Error('Write failed'));

      const input: DeprecationAgentInput = {
        assetId: uuidv4(),
        assetType: 'service',
        currentVersion: '1.0.0',
        targetState: 'deprecated',
        reason: 'end_of_life',
        reasonDescription: 'Testing lifecycle record failure.',
        requesterId: uuidv4()
      };

      const result = await agent.execute(input);

      expect(result.output.success).toBe(false);
      expect(result.output.statusCode).toBe('ERROR');
    });
  });
});
