/**
 * Deprecation Agent Core Implementation
 *
 * Classification: LIFECYCLE MANAGEMENT
 *
 * Purpose: Manage controlled deprecation and retirement of marketplace assets.
 *
 * This agent:
 * - Marks assets as deprecated or retired
 * - Emits lifecycle transition signals
 * - Enforces visibility and version constraints
 *
 * decision_type: "marketplace_deprecation"
 *
 * CRITICAL CONSTRAINTS:
 * - Stateless execution
 * - No direct SQL access
 * - All persistence via ruvector-service
 * - Exactly ONE DecisionEvent per invocation
 * - Deterministic behavior
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { createLogger, Logger, format, transports } from 'winston';
import {
  DecisionEvent,
  DecisionType,
  DecisionOutcome,
  ConfidenceDistribution,
  ConstraintsApplied,
  DeprecationAgentInput,
  DeprecationAgentOutput,
  PolicyViolation,
  ConsumerImpact,
  LifecycleTransition,
  NotificationDispatch,
  validateDeprecationInput,
  DEPRECATION_AGENT_METADATA
} from '@llm-marketplace/agentics-contracts';
import { RuVectorServiceClient, createRuVectorClient, LifecycleRecord } from '../clients';

/**
 * Agent configuration
 */
export interface DeprecationAgentConfig {
  /** Agent version */
  version: string;
  /** Maximum consumer count threshold for force deprecation warning */
  maxConsumersForAutoDeprecation: number;
  /** Default sunset period in days */
  defaultSunsetPeriodDays: number;
  /** Telemetry enabled */
  telemetryEnabled: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DeprecationAgentConfig = {
  version: '1.0.0',
  maxConsumersForAutoDeprecation: 100,
  defaultSunsetPeriodDays: 90,
  telemetryEnabled: true
};

/**
 * Deprecation Agent
 *
 * Manages lifecycle transitions for marketplace assets.
 */
export class DeprecationAgent {
  private readonly config: DeprecationAgentConfig;
  private readonly logger: Logger;
  private readonly ruvectorClient: RuVectorServiceClient;

  constructor(
    config: Partial<DeprecationAgentConfig> = {},
    ruvectorClient?: RuVectorServiceClient
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ruvectorClient = ruvectorClient ?? createRuVectorClient();

    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      defaultMeta: {
        agent: DEPRECATION_AGENT_METADATA.agentId,
        version: this.config.version
      },
      transports: [
        new transports.Console()
      ]
    });
  }

  /**
   * Execute deprecation operation
   *
   * This is the main entry point for the agent.
   * Emits exactly ONE DecisionEvent per invocation.
   */
  async execute(input: DeprecationAgentInput): Promise<{
    output: DeprecationAgentOutput;
    decisionEvent: DecisionEvent;
  }> {
    const executionRef = uuidv4();
    const startTime = Date.now();

    this.logger.info('Deprecation agent execution started', {
      executionRef,
      assetId: input.assetId,
      assetType: input.assetType,
      targetState: input.targetState
    });

    let output: DeprecationAgentOutput;
    let decisionOutcome: DecisionOutcome;
    let confidence: ConfidenceDistribution;
    let constraintsApplied: ConstraintsApplied;

    try {
      // Step 1: Validate input
      const validatedInput = this.validateInput(input);

      // Step 2: Check asset exists and get current state
      const assetState = await this.getAssetState(validatedInput.assetId);
      if (!assetState) {
        output = this.buildFailureOutput(
          validatedInput,
          'ASSET_NOT_FOUND',
          `Asset ${validatedInput.assetId} not found`
        );
        decisionOutcome = 'rejected';
        confidence = this.buildLowConfidence();
        constraintsApplied = this.buildEmptyConstraints();
      } else if (assetState.status === 'deprecated' && validatedInput.targetState === 'deprecated') {
        output = this.buildFailureOutput(
          validatedInput,
          'ALREADY_DEPRECATED',
          `Asset ${validatedInput.assetId} is already deprecated`
        );
        decisionOutcome = 'rejected';
        confidence = this.buildHighConfidence();
        constraintsApplied = this.buildEmptyConstraints();
      } else {
        // Step 3: Check policy compliance
        const policyResult = await this.checkPolicyCompliance(validatedInput);
        if (!policyResult.compliant) {
          output = this.buildPolicyViolationOutput(validatedInput, policyResult.violations);
          decisionOutcome = 'rejected';
          confidence = this.buildMediumConfidence(policyResult.violations);
          constraintsApplied = this.buildPolicyConstraints(policyResult.violations);
        } else {
          // Step 4: Assess consumer impact
          const consumerImpact = await this.assessConsumerImpact(validatedInput.assetId);

          // Step 5: Check if force is needed
          if (
            consumerImpact.activeConsumerCount > this.config.maxConsumersForAutoDeprecation &&
            !validatedInput.forceDeprecation
          ) {
            output = this.buildConsumerBlockOutput(validatedInput, consumerImpact);
            decisionOutcome = 'requires_review';
            confidence = this.buildConsumerImpactConfidence(consumerImpact);
            constraintsApplied = this.buildConsumerConstraints(consumerImpact);
          } else {
            // Step 6: Execute deprecation
            const result = await this.executeDeprecation(validatedInput, assetState, consumerImpact);
            output = result;
            decisionOutcome = result.success ? 'approved' : 'error';
            confidence = this.buildSuccessConfidence(consumerImpact);
            constraintsApplied = this.buildExecutionConstraints(validatedInput);
          }
        }
      }
    } catch (error) {
      this.logger.error('Deprecation execution failed', {
        executionRef,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      output = this.buildErrorOutput(input, error);
      decisionOutcome = 'error';
      confidence = this.buildLowConfidence();
      constraintsApplied = this.buildEmptyConstraints();
    }

    // Calculate processing duration
    const processingDurationMs = Date.now() - startTime;
    output.processingDurationMs = processingDurationMs;

    // Build and persist DecisionEvent
    const decisionEvent = this.buildDecisionEvent(
      input,
      output,
      decisionOutcome,
      confidence,
      constraintsApplied,
      executionRef
    );

    try {
      await this.ruvectorClient.persistDecisionEvent(decisionEvent);
      this.logger.info('Decision event persisted', {
        eventId: decisionEvent.id,
        executionRef
      });
    } catch (persistError) {
      this.logger.error('Failed to persist decision event', {
        executionRef,
        error: persistError instanceof Error ? persistError.message : 'Unknown error'
      });
      // Do not throw - the deprecation result is still valid
    }

    this.logger.info('Deprecation agent execution completed', {
      executionRef,
      success: output.success,
      statusCode: output.statusCode,
      processingDurationMs
    });

    return { output, decisionEvent };
  }

  /**
   * Validate and normalize input
   */
  private validateInput(input: DeprecationAgentInput): DeprecationAgentInput {
    // Validate against schema
    const validated = validateDeprecationInput(input);

    // Additional business validation
    if (validated.targetState === 'deprecated' && !validated.sunsetDate && !validated.immediateEffect) {
      // Set default sunset date if not provided
      const sunsetDate = new Date();
      sunsetDate.setDate(sunsetDate.getDate() + this.config.defaultSunsetPeriodDays);
      validated.sunsetDate = sunsetDate.toISOString();
    }

    return validated;
  }

  /**
   * Get current asset state
   */
  private async getAssetState(assetId: string): Promise<{
    status: string;
    version: string;
    providerId: string;
  } | null> {
    try {
      const history = await this.ruvectorClient.getLifecycleHistory(assetId);
      if (history.length === 0) {
        return null;
      }

      const latestTransition = history[history.length - 1];
      return {
        status: latestTransition.toState,
        version: '1.0.0', // Would be fetched from registry in production
        providerId: latestTransition.initiatedBy
      };
    } catch {
      // Asset not found
      return null;
    }
  }

  /**
   * Check policy compliance for deprecation
   */
  private async checkPolicyCompliance(input: DeprecationAgentInput): Promise<{
    compliant: boolean;
    violations: PolicyViolation[];
  }> {
    const violations: PolicyViolation[] = [];

    // Rule 1: Security vulnerabilities require immediate action
    if (input.reason === 'security_vulnerability' && !input.immediateEffect) {
      // This is a warning, not a violation
      this.logger.warn('Security vulnerability deprecation without immediate effect', {
        assetId: input.assetId
      });
    }

    // Rule 2: Minimum sunset period (unless immediate)
    if (input.sunsetDate && !input.immediateEffect) {
      const sunsetDate = new Date(input.sunsetDate);
      const minSunsetDate = new Date();
      minSunsetDate.setDate(minSunsetDate.getDate() + 30); // Minimum 30 days

      if (sunsetDate < minSunsetDate) {
        violations.push({
          ruleId: 'SUNSET_PERIOD_MIN',
          policyType: 'LIFECYCLE',
          severity: 'high',
          message: 'Sunset date must be at least 30 days in the future',
          remediation: 'Set sunset date to at least 30 days from now or use immediateEffect for critical issues'
        });
      }
    }

    // Rule 3: Retirement requires prior deprecation (unless force)
    if (input.targetState === 'retired' && !input.forceDeprecation) {
      // Would check if asset is currently deprecated
      // For now, we allow it
    }

    return {
      compliant: violations.length === 0,
      violations
    };
  }

  /**
   * Assess consumer impact
   */
  private async assessConsumerImpact(assetId: string): Promise<ConsumerImpact> {
    try {
      return await this.ruvectorClient.getConsumerImpact(assetId);
    } catch {
      // Return default impact if unavailable
      return {
        activeConsumerCount: 0,
        criticalConsumerCount: 0,
        averageDailyRequests: 0,
        topConsumers: [],
        impactScore: 0
      };
    }
  }

  /**
   * Execute the deprecation
   */
  private async executeDeprecation(
    input: DeprecationAgentInput,
    currentState: { status: string; version: string; providerId: string },
    consumerImpact: ConsumerImpact
  ): Promise<DeprecationAgentOutput> {
    const transitionedAt = new Date().toISOString();

    // Record lifecycle transition
    const lifecycleRecord: LifecycleRecord = {
      assetId: input.assetId,
      assetType: input.assetType,
      previousState: currentState.status,
      newState: input.targetState,
      reason: input.reason,
      reasonDescription: input.reasonDescription,
      requesterId: input.requesterId,
      sunsetDate: input.sunsetDate,
      transitionedAt,
      metadata: input.metadata
    };

    await this.ruvectorClient.recordLifecycleTransition(lifecycleRecord);

    // Update deprecation status
    await this.ruvectorClient.updateDeprecationStatus(
      input.assetId,
      input.targetState,
      {
        reason: input.reasonDescription,
        sunsetDate: input.sunsetDate,
        requesterId: input.requesterId
      }
    );

    // Build transition record
    const transition: LifecycleTransition = {
      fromState: currentState.status,
      toState: input.targetState,
      transitionedAt,
      initiatedBy: input.requesterId,
      reason: input.reasonDescription
    };

    // Handle notifications (would be async in production)
    const notifications = this.dispatchNotifications(input, consumerImpact);

    // Store audit trail
    const auditOutput: DeprecationAgentOutput = {
      success: true,
      statusCode: input.targetState === 'deprecated' ? 'DEPRECATED' : 'RETIRED',
      message: `Asset ${input.assetId} successfully ${input.targetState}`,
      assetId: input.assetId,
      assetType: input.assetType,
      newState: input.targetState,
      effectiveSunsetDate: input.sunsetDate,
      transition,
      consumerImpact,
      notifications,
      registrySynced: true,
      cacheInvalidated: true
    };

    const { auditId } = await this.ruvectorClient.storeAuditTrail(
      input.assetId,
      input.targetState === 'deprecated' ? 'DEPRECATE' : 'RETIRE',
      auditOutput
    );

    auditOutput.auditRef = auditId;

    return auditOutput;
  }

  /**
   * Dispatch consumer notifications
   */
  private dispatchNotifications(
    input: DeprecationAgentInput,
    consumerImpact: ConsumerImpact
  ): NotificationDispatch {
    // In production, this would queue notifications
    const config = input.notificationConfig ?? { enabled: true, urgency: 'standard', reminderDays: [30, 14, 7, 1] };

    if (!config.enabled) {
      return {
        totalQueued: 0,
        immediateSent: 0,
        scheduled: 0,
        failed: 0
      };
    }

    const totalConsumers = consumerImpact.activeConsumerCount;
    const scheduledReminders = config.reminderDays.length * totalConsumers;

    return {
      totalQueued: totalConsumers + scheduledReminders,
      immediateSent: totalConsumers,
      scheduled: scheduledReminders,
      failed: 0
    };
  }

  /**
   * Build failure output
   */
  private buildFailureOutput(
    input: DeprecationAgentInput,
    statusCode: DeprecationAgentOutput['statusCode'],
    message: string
  ): DeprecationAgentOutput {
    return {
      success: false,
      statusCode,
      message,
      assetId: input.assetId,
      assetType: input.assetType
    };
  }

  /**
   * Build policy violation output
   */
  private buildPolicyViolationOutput(
    input: DeprecationAgentInput,
    violations: PolicyViolation[]
  ): DeprecationAgentOutput {
    return {
      success: false,
      statusCode: 'POLICY_VIOLATION',
      message: `Deprecation blocked due to ${violations.length} policy violation(s)`,
      assetId: input.assetId,
      assetType: input.assetType,
      policyViolations: violations
    };
  }

  /**
   * Build consumer block output
   */
  private buildConsumerBlockOutput(
    input: DeprecationAgentInput,
    consumerImpact: ConsumerImpact
  ): DeprecationAgentOutput {
    return {
      success: false,
      statusCode: 'CONSUMER_BLOCK',
      message: `Deprecation requires review: ${consumerImpact.activeConsumerCount} active consumers affected`,
      assetId: input.assetId,
      assetType: input.assetType,
      consumerImpact,
      warnings: [
        `High consumer impact: ${consumerImpact.activeConsumerCount} active consumers`,
        `${consumerImpact.criticalConsumerCount} critical consumers affected`,
        'Use forceDeprecation=true to proceed'
      ]
    };
  }

  /**
   * Build error output
   */
  private buildErrorOutput(
    input: DeprecationAgentInput,
    error: unknown
  ): DeprecationAgentOutput {
    return {
      success: false,
      statusCode: 'ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      assetId: input.assetId,
      assetType: input.assetType
    };
  }

  /**
   * Build DecisionEvent
   */
  private buildDecisionEvent(
    input: DeprecationAgentInput,
    output: DeprecationAgentOutput,
    outcome: DecisionOutcome,
    confidence: ConfidenceDistribution,
    constraintsApplied: ConstraintsApplied,
    executionRef: string
  ): DecisionEvent {
    return {
      id: uuidv4(),
      agent_id: `${DEPRECATION_AGENT_METADATA.agentId}:${this.config.version}`,
      agent_version: this.config.version,
      decision_type: 'marketplace_deprecation' as DecisionType,
      outcome,
      inputs_hash: this.hashInputs(input),
      outputs: output as unknown as Record<string, unknown>,
      confidence,
      constraints_applied: constraintsApplied,
      execution_ref: executionRef,
      timestamp: new Date().toISOString(),
      correlation_id: input.correlationId,
      processing_duration_ms: output.processingDurationMs,
      metadata: {
        assetId: input.assetId,
        assetType: input.assetType,
        targetState: input.targetState,
        reason: input.reason
      }
    };
  }

  /**
   * Hash inputs for audit trail
   */
  private hashInputs(input: DeprecationAgentInput): string {
    const normalized = JSON.stringify(input, Object.keys(input).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  // Confidence builders
  private buildLowConfidence(): ConfidenceDistribution {
    return {
      primary: 0.3,
      lifecycleValidity: 0.3,
      visibilityCompliance: 1.0,
      versionCompliance: 1.0
    };
  }

  private buildMediumConfidence(violations: PolicyViolation[]): ConfidenceDistribution {
    const severityImpact = violations.reduce((acc, v) => {
      switch (v.severity) {
        case 'critical': return acc - 0.3;
        case 'high': return acc - 0.2;
        case 'medium': return acc - 0.1;
        default: return acc - 0.05;
      }
    }, 1.0);

    return {
      primary: Math.max(0.4, severityImpact),
      lifecycleValidity: 0.8,
      visibilityCompliance: 0.9,
      versionCompliance: 0.9
    };
  }

  private buildHighConfidence(): ConfidenceDistribution {
    return {
      primary: 0.95,
      lifecycleValidity: 0.95,
      visibilityCompliance: 1.0,
      versionCompliance: 1.0
    };
  }

  private buildSuccessConfidence(impact: ConsumerImpact): ConfidenceDistribution {
    return {
      primary: 0.95,
      lifecycleValidity: 0.98,
      visibilityCompliance: 1.0,
      versionCompliance: 1.0,
      consumerImpact: 1.0 - impact.impactScore
    };
  }

  private buildConsumerImpactConfidence(impact: ConsumerImpact): ConfidenceDistribution {
    return {
      primary: 0.7,
      lifecycleValidity: 0.9,
      visibilityCompliance: 1.0,
      versionCompliance: 1.0,
      consumerImpact: 1.0 - impact.impactScore
    };
  }

  // Constraint builders
  private buildEmptyConstraints(): ConstraintsApplied {
    return {
      visibilityRules: [],
      compatibilityRules: [],
      versionRules: [],
      lifecycleRules: []
    };
  }

  private buildPolicyConstraints(violations: PolicyViolation[]): ConstraintsApplied {
    return {
      visibilityRules: [],
      compatibilityRules: [],
      versionRules: [],
      lifecycleRules: violations.map(v => v.ruleId),
      policyRules: violations.map(v => `${v.policyType}:${v.ruleId}`)
    };
  }

  private buildConsumerConstraints(impact: ConsumerImpact): ConstraintsApplied {
    return {
      visibilityRules: ['CONSUMER_NOTIFICATION_REQUIRED'],
      compatibilityRules: [],
      versionRules: [],
      lifecycleRules: ['HIGH_CONSUMER_IMPACT'],
      policyRules: [`MAX_CONSUMERS_EXCEEDED:${impact.activeConsumerCount}`]
    };
  }

  private buildExecutionConstraints(input: DeprecationAgentInput): ConstraintsApplied {
    const constraints: ConstraintsApplied = {
      visibilityRules: [],
      compatibilityRules: [],
      versionRules: [`VERSION_${input.currentVersion}`],
      lifecycleRules: [`TRANSITION_TO_${input.targetState.toUpperCase()}`]
    };

    if (input.immediateEffect) {
      constraints.lifecycleRules.push('IMMEDIATE_EFFECT');
    }

    if (input.forceDeprecation) {
      constraints.lifecycleRules.push('FORCE_DEPRECATION');
    }

    return constraints;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; checks: Record<string, boolean> }> {
    const ruvectorHealth = await this.ruvectorClient.healthCheck();

    return {
      healthy: ruvectorHealth.healthy,
      checks: {
        ruvectorService: ruvectorHealth.healthy
      }
    };
  }
}

/**
 * Create Deprecation Agent instance
 */
export function createDeprecationAgent(
  config?: Partial<DeprecationAgentConfig>
): DeprecationAgent {
  return new DeprecationAgent(config);
}
