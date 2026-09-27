/**
 * Deprecation Agent Contract Schema
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
 */

import { z } from 'zod';

// ============================================================================
// ENUMS AND CONSTANTS
// ============================================================================

/**
 * Deprecation reason categories
 */
export const DeprecationReasonSchema = z.enum([
  'end_of_life',
  'security_vulnerability',
  'replaced_by_newer_version',
  'compliance_violation',
  'provider_request',
  'inactivity',
  'quality_concerns',
  'licensing_change',
  'business_decision',
  'other'
]);

export type DeprecationReason = z.infer<typeof DeprecationReasonSchema>;

/**
 * Target lifecycle states for deprecation
 */
export const TargetLifecycleStateSchema = z.enum([
  'deprecated',
  'retired'
]);

export type TargetLifecycleState = z.infer<typeof TargetLifecycleStateSchema>;

/**
 * Asset types that can be deprecated
 */
export const DeprecatableAssetTypeSchema = z.enum([
  'service',
  'agent',
  'template',
  'workflow',
  'bundle',
  'plugin'
]);

export type DeprecatableAssetType = z.infer<typeof DeprecatableAssetTypeSchema>;

/**
 * Notification urgency levels
 */
export const NotificationUrgencySchema = z.enum([
  'immediate',
  'standard',
  'low'
]);

export type NotificationUrgency = z.infer<typeof NotificationUrgencySchema>;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Consumer notification configuration
 */
export const ConsumerNotificationConfigSchema = z.object({
  /** Whether to notify consumers */
  enabled: z.boolean().default(true),
  /** Urgency level for notifications */
  urgency: NotificationUrgencySchema.default('standard'),
  /** Custom message to include */
  customMessage: z.string().max(1000).optional(),
  /** Days before sunset to send reminder */
  reminderDays: z.array(z.number().int().positive()).default([30, 14, 7, 1])
});

export type ConsumerNotificationConfig = z.infer<typeof ConsumerNotificationConfigSchema>;

/**
 * Migration guidance for consumers
 */
export const MigrationGuidanceSchema = z.object({
  /** Suggested replacement asset ID */
  replacementAssetId: z.string().optional(),
  /** Migration guide URL */
  migrationGuideUrl: z.string().url().optional(),
  /** API compatibility notes */
  compatibilityNotes: z.string().max(2000).optional(),
  /** Breaking changes summary */
  breakingChanges: z.array(z.string()).optional()
});

export type MigrationGuidance = z.infer<typeof MigrationGuidanceSchema>;

/**
 * Deprecation Agent Input Schema
 *
 * All inputs required to process a deprecation request.
 */
export const DeprecationAgentInputSchema = z.object({
  /** Unique identifier of the asset to deprecate */
  assetId: z.string().uuid(),

  /** Type of asset being deprecated */
  assetType: DeprecatableAssetTypeSchema,

  /** Current version of the asset (for validation) */
  currentVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),

  /** Target lifecycle state */
  targetState: TargetLifecycleStateSchema,

  /** Reason for deprecation */
  reason: DeprecationReasonSchema,

  /** Detailed reason description */
  reasonDescription: z.string().min(10).max(2000),

  /** Provider/owner ID requesting deprecation */
  requesterId: z.string().uuid(),

  /** Scheduled sunset date (ISO 8601) - required for deprecation */
  sunsetDate: z.string().datetime().optional(),

  /** Immediate effect (bypasses sunset period) */
  immediateEffect: z.boolean().default(false),

  /** Consumer notification configuration */
  notificationConfig: ConsumerNotificationConfigSchema.optional(),

  /** Migration guidance for consumers */
  migrationGuidance: MigrationGuidanceSchema.optional(),

  /** Force deprecation even with active consumers */
  forceDeprecation: z.boolean().default(false),

  /** Request correlation ID */
  correlationId: z.string().uuid().optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional()
});

export type DeprecationAgentInput = z.infer<typeof DeprecationAgentInputSchema>;

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * Policy violation details
 */
export const PolicyViolationSchema = z.object({
  /** Policy rule ID */
  ruleId: z.string(),
  /** Policy type */
  policyType: z.string(),
  /** Violation severity */
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  /** Violation message */
  message: z.string(),
  /** Remediation suggestion */
  remediation: z.string().optional()
});

export type PolicyViolation = z.infer<typeof PolicyViolationSchema>;

/**
 * Consumer impact assessment
 */
export const ConsumerImpactSchema = z.object({
  /** Total number of active consumers */
  activeConsumerCount: z.number().int().nonnegative(),
  /** Critical consumers (high-volume or priority) */
  criticalConsumerCount: z.number().int().nonnegative(),
  /** Average daily requests across all consumers */
  averageDailyRequests: z.number().nonnegative(),
  /** Top consumer IDs by usage */
  topConsumers: z.array(z.string().uuid()).max(10),
  /** Impact score (0.0 - 1.0) */
  impactScore: z.number().min(0).max(1)
});

export type ConsumerImpact = z.infer<typeof ConsumerImpactSchema>;

/**
 * Lifecycle transition record
 */
export const LifecycleTransitionSchema = z.object({
  /** Previous state */
  fromState: z.string(),
  /** New state */
  toState: z.string(),
  /** Transition timestamp */
  transitionedAt: z.string().datetime(),
  /** Who initiated the transition */
  initiatedBy: z.string().uuid(),
  /** Transition reason */
  reason: z.string()
});

export type LifecycleTransition = z.infer<typeof LifecycleTransitionSchema>;

/**
 * Notification dispatch result
 */
export const NotificationDispatchSchema = z.object({
  /** Total notifications queued */
  totalQueued: z.number().int().nonnegative(),
  /** Immediate notifications sent */
  immediateSent: z.number().int().nonnegative(),
  /** Scheduled notifications */
  scheduled: z.number().int().nonnegative(),
  /** Failed notifications */
  failed: z.number().int().nonnegative()
});

export type NotificationDispatch = z.infer<typeof NotificationDispatchSchema>;

/**
 * Deprecation Agent Output Schema
 *
 * Result of a deprecation operation.
 */
export const DeprecationAgentOutputSchema = z.object({
  /** Whether deprecation was successful */
  success: z.boolean(),

  /** Operation status code */
  statusCode: z.enum([
    'DEPRECATED',
    'RETIRED',
    'POLICY_VIOLATION',
    'VALIDATION_FAILED',
    'INSUFFICIENT_PERMISSIONS',
    'ASSET_NOT_FOUND',
    'ALREADY_DEPRECATED',
    'CONSUMER_BLOCK',
    'ERROR'
  ]),

  /** Human-readable status message */
  message: z.string(),

  /** Asset ID that was processed */
  assetId: z.string().uuid(),

  /** Asset type that was processed */
  assetType: DeprecatableAssetTypeSchema,

  /** New lifecycle state (if changed) */
  newState: TargetLifecycleStateSchema.optional(),

  /** Effective sunset date (if applicable) */
  effectiveSunsetDate: z.string().datetime().optional(),

  /** Lifecycle transition record */
  transition: LifecycleTransitionSchema.optional(),

  /** Policy violations (if any) */
  policyViolations: z.array(PolicyViolationSchema).optional(),

  /** Consumer impact assessment */
  consumerImpact: ConsumerImpactSchema.optional(),

  /** Notification dispatch results */
  notifications: NotificationDispatchSchema.optional(),

  /** Registry sync status */
  registrySynced: z.boolean().optional(),

  /** Cache invalidation status */
  cacheInvalidated: z.boolean().optional(),

  /** Processing duration in milliseconds */
  processingDurationMs: z.number().int().positive().optional(),

  /** Warnings generated during processing */
  warnings: z.array(z.string()).optional(),

  /** Audit trail reference */
  auditRef: z.string().optional()
});

export type DeprecationAgentOutput = z.infer<typeof DeprecationAgentOutputSchema>;

// ============================================================================
// CLI CONTRACT
// ============================================================================

/**
 * CLI command shape for deprecation operations
 */
export const DeprecationCLICommandSchema = z.discriminatedUnion('command', [
  z.object({
    command: z.literal('deprecate'),
    assetId: z.string().uuid(),
    assetType: DeprecatableAssetTypeSchema,
    reason: DeprecationReasonSchema,
    reasonDescription: z.string(),
    sunsetDate: z.string().datetime().optional(),
    immediate: z.boolean().optional(),
    force: z.boolean().optional(),
    notify: z.boolean().optional(),
    dryRun: z.boolean().optional()
  }),
  z.object({
    command: z.literal('retire'),
    assetId: z.string().uuid(),
    assetType: DeprecatableAssetTypeSchema,
    reason: DeprecationReasonSchema,
    reasonDescription: z.string(),
    force: z.boolean().optional(),
    dryRun: z.boolean().optional()
  }),
  z.object({
    command: z.literal('inspect'),
    assetId: z.string().uuid(),
    assetType: DeprecatableAssetTypeSchema.optional()
  }),
  z.object({
    command: z.literal('impact'),
    assetId: z.string().uuid()
  }),
  z.object({
    command: z.literal('list-deprecated'),
    assetType: DeprecatableAssetTypeSchema.optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional()
  })
]);

export type DeprecationCLICommand = z.infer<typeof DeprecationCLICommandSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate deprecation input
 */
export function validateDeprecationInput(input: unknown): DeprecationAgentInput {
  return DeprecationAgentInputSchema.parse(input);
}

/**
 * Validate deprecation output
 */
export function validateDeprecationOutput(output: unknown): DeprecationAgentOutput {
  return DeprecationAgentOutputSchema.parse(output);
}

/**
 * Safe input validation
 */
export function safeValidateDeprecationInput(input: unknown): {
  success: boolean;
  data?: DeprecationAgentInput;
  error?: z.ZodError;
} {
  const result = DeprecationAgentInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Safe output validation
 */
export function safeValidateDeprecationOutput(output: unknown): {
  success: boolean;
  data?: DeprecationAgentOutput;
  error?: z.ZodError;
} {
  const result = DeprecationAgentOutputSchema.safeParse(output);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// AGENT METADATA
// ============================================================================

/**
 * Deprecation Agent metadata constant
 */
export const DEPRECATION_AGENT_METADATA = {
  agentId: 'deprecation-agent',
  agentVersion: '1.0.0',
  classification: 'LIFECYCLE_MANAGEMENT' as const,
  decisionType: 'marketplace_deprecation' as const,
  capabilities: [
    'deprecate_asset',
    'retire_asset',
    'assess_consumer_impact',
    'enforce_visibility_constraints',
    'enforce_version_constraints',
    'emit_lifecycle_signals',
    'notify_consumers'
  ],
  inputs: ['DeprecationAgentInput'],
  outputs: ['DeprecationAgentOutput'],
  cliCommands: ['deprecate', 'retire', 'inspect', 'impact', 'list-deprecated'],
  consumers: [
    'LLM-Governance-Dashboard',
    'LLM-Policy-Engine',
    'LLM-Registry',
    'Publishing Service'
  ],
  mustNot: [
    'Execute workflows',
    'Modify runtime behavior',
    'Enforce policies or approvals',
    'Trigger external workflows',
    'Execute other agents',
    'Apply optimizations',
    'Emit anomaly detections',
    'Connect directly to SQL'
  ]
} as const;
