/**
 * DecisionEvent Schema
 *
 * Core contract for all agent decision events persisted to ruvector-service.
 * Every LLM-Marketplace agent MUST emit exactly ONE DecisionEvent per invocation.
 */

import { z } from 'zod';

/**
 * Decision types for marketplace lifecycle management
 */
export const DecisionTypeSchema = z.enum([
  'marketplace_deprecation',
  'marketplace_retirement',
  'marketplace_package',
  'marketplace_publish',
  'marketplace_version_release',
  'marketplace_withdraw',
  'marketplace_visibility_change',
  'marketplace_lifecycle_transition',
  // Phase 5: Ecosystem & Collaboration signals
  'ecosystem_aggregation',
  'ecosystem_indexing',
  'ecosystem_analytics',
  'ecosystem_correlation'
]);

export type DecisionType = z.infer<typeof DecisionTypeSchema>;

/**
 * Confidence distribution for lifecycle decisions
 */
export const ConfidenceDistributionSchema = z.object({
  /** Primary confidence score (0.0 - 1.0) */
  primary: z.number().min(0).max(1),
  /** Confidence in lifecycle state validity */
  lifecycleValidity: z.number().min(0).max(1),
  /** Confidence in visibility constraints being met */
  visibilityCompliance: z.number().min(0).max(1),
  /** Confidence in version constraints being met */
  versionCompliance: z.number().min(0).max(1),
  /** Confidence in consumer impact assessment */
  consumerImpact: z.number().min(0).max(1).optional()
});

export type ConfidenceDistribution = z.infer<typeof ConfidenceDistributionSchema>;

/**
 * Constraints applied during decision
 */
export const ConstraintsAppliedSchema = z.object({
  /** Visibility rules enforced */
  visibilityRules: z.array(z.string()),
  /** Compatibility rules enforced */
  compatibilityRules: z.array(z.string()),
  /** Version rules enforced */
  versionRules: z.array(z.string()),
  /** Lifecycle rules enforced */
  lifecycleRules: z.array(z.string()),
  /** Policy rules enforced */
  policyRules: z.array(z.string()).optional()
});

export type ConstraintsApplied = z.infer<typeof ConstraintsAppliedSchema>;

/**
 * Decision outcome status
 */
export const DecisionOutcomeSchema = z.enum([
  'approved',
  'rejected',
  'deferred',
  'requires_review',
  'error'
]);

export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;

/**
 * Core DecisionEvent schema - MUST be emitted by every agent invocation
 */
export const DecisionEventSchema = z.object({
  /** Unique identifier for this decision event */
  id: z.string().uuid(),

  /** Agent identifier (format: agent_type:version) */
  agent_id: z.string().regex(/^[a-z0-9-]+:[0-9]+\.[0-9]+\.[0-9]+$/),

  /** Agent semantic version */
  agent_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),

  /** Type of decision made */
  decision_type: DecisionTypeSchema,

  /** Decision outcome */
  outcome: DecisionOutcomeSchema,

  /** SHA-256 hash of inputs for audit trail */
  inputs_hash: z.string().regex(/^[a-f0-9]{64}$/),

  /** Decision outputs (typed per agent) */
  outputs: z.record(z.unknown()),

  /** Confidence distribution for the decision */
  confidence: ConfidenceDistributionSchema,

  /** Constraints that were applied during decision */
  constraints_applied: ConstraintsAppliedSchema,

  /** Reference to the execution context */
  execution_ref: z.string(),

  /** UTC timestamp of decision */
  timestamp: z.string().datetime(),

  /** Correlation ID for distributed tracing */
  correlation_id: z.string().uuid().optional(),

  /** Duration of decision processing in milliseconds */
  processing_duration_ms: z.number().int().positive().optional(),

  /** Agent-specific metadata */
  metadata: z.record(z.unknown()).optional()
});

export type DecisionEvent = z.infer<typeof DecisionEventSchema>;

/**
 * Validate a DecisionEvent
 */
export function validateDecisionEvent(event: unknown): DecisionEvent {
  return DecisionEventSchema.parse(event);
}

/**
 * Safe validation returning result or error
 */
export function safeValidateDecisionEvent(event: unknown): {
  success: boolean;
  data?: DecisionEvent;
  error?: z.ZodError
} {
  const result = DecisionEventSchema.safeParse(event);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
