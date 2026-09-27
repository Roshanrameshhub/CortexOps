/**
 * Ecosystem Agent Schema
 *
 * Phase 5 - Ecosystem & Collaboration (Layer 1)
 * Classification: ECOSYSTEM_ANALYTICS
 *
 * This agent performs:
 * - Aggregation
 * - Indexing
 * - Cross-system analytics
 *
 * MUST NOT:
 * - Mutate state
 * - Commit actions
 *
 * DecisionEvent signals emitted:
 * - consensus_signal
 * - aggregation_signal
 * - strategic_signal (no conclusions)
 *
 * Performance budgets:
 * - MAX_TOKENS: 1500
 * - MAX_LATENCY_MS: 3000
 */

import { z } from 'zod';

/**
 * Performance budget constraints
 */
export const ECOSYSTEM_PERFORMANCE_BUDGET = {
  MAX_TOKENS: 1500,
  MAX_LATENCY_MS: 3000,
} as const;

/**
 * Signal types for ecosystem operations
 */
export const EcosystemSignalTypeSchema = z.enum([
  'consensus_signal',
  'aggregation_signal',
  'strategic_signal'
]);

export type EcosystemSignalType = z.infer<typeof EcosystemSignalTypeSchema>;

/**
 * Ecosystem operation types
 */
export const EcosystemOperationSchema = z.enum([
  'aggregate',
  'index',
  'analyze',
  'correlate',
  'health_check'
]);

export type EcosystemOperation = z.infer<typeof EcosystemOperationSchema>;

/**
 * Data source for aggregation
 */
export const DataSourceSchema = z.object({
  /** Source identifier */
  sourceId: z.string(),
  /** Source type (registry, shield, policy-engine, etc.) */
  sourceType: z.enum([
    'llm-registry',
    'llm-shield',
    'llm-policy-engine',
    'marketplace-service',
    'external-api'
  ]),
  /** Endpoint URL */
  endpoint: z.string().url().optional(),
  /** Last sync timestamp */
  lastSyncAt: z.string().datetime().optional(),
  /** Data freshness in seconds */
  freshnessSeconds: z.number().int().positive().optional()
});

export type DataSource = z.infer<typeof DataSourceSchema>;

/**
 * Aggregation target specification
 */
export const AggregationTargetSchema = z.object({
  /** Target metric or dimension */
  metric: z.string(),
  /** Aggregation function */
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'median', 'percentile']),
  /** Group by dimensions */
  groupBy: z.array(z.string()).optional(),
  /** Filter conditions */
  filters: z.record(z.unknown()).optional(),
  /** Time window in seconds */
  timeWindowSeconds: z.number().int().positive().optional()
});

export type AggregationTarget = z.infer<typeof AggregationTargetSchema>;

/**
 * Index specification for cross-system data
 */
export const IndexSpecSchema = z.object({
  /** Index name */
  indexName: z.string(),
  /** Fields to index */
  fields: z.array(z.string()),
  /** Index type */
  indexType: z.enum(['vector', 'inverted', 'composite', 'time-series']),
  /** Refresh policy */
  refreshPolicy: z.enum(['immediate', 'lazy', 'scheduled']).default('lazy')
});

export type IndexSpec = z.infer<typeof IndexSpecSchema>;

/**
 * Analytics query specification
 */
export const AnalyticsQuerySchema = z.object({
  /** Query identifier */
  queryId: z.string().optional(),
  /** Query type */
  queryType: z.enum([
    'cross_system_correlation',
    'trend_analysis',
    'anomaly_detection',
    'usage_pattern',
    'health_aggregation'
  ]),
  /** Target systems */
  targetSystems: z.array(z.string()),
  /** Time range */
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }).optional(),
  /** Query parameters */
  parameters: z.record(z.unknown()).optional()
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

/**
 * Ecosystem Agent Input Schema
 */
export const EcosystemAgentInputSchema = z.object({
  /** Operation to perform */
  operation: EcosystemOperationSchema,

  /** Correlation ID for distributed tracing */
  correlationId: z.string().uuid().optional(),

  /** Data sources for aggregation */
  sources: z.array(DataSourceSchema).optional(),

  /** Aggregation targets */
  aggregations: z.array(AggregationTargetSchema).optional(),

  /** Index specifications */
  indices: z.array(IndexSpecSchema).optional(),

  /** Analytics query */
  query: AnalyticsQuerySchema.optional(),

  /** Request options */
  options: z.object({
    /** Include raw data in response */
    includeRawData: z.boolean().default(false),
    /** Max results to return */
    maxResults: z.number().int().positive().max(1000).default(100),
    /** Timeout override (must be <= MAX_LATENCY_MS) */
    timeoutMs: z.number().int().positive().max(ECOSYSTEM_PERFORMANCE_BUDGET.MAX_LATENCY_MS).optional(),
    /** Dry run mode */
    dryRun: z.boolean().default(false),
    /** Verbose output */
    verbose: z.boolean().default(false)
  }).optional()
});

export type EcosystemAgentInput = z.infer<typeof EcosystemAgentInputSchema>;

/**
 * Consensus signal output (READ-ONLY observation)
 */
export const ConsensusSignalSchema = z.object({
  signalType: z.literal('consensus_signal'),
  /** Systems that were queried */
  participatingSystems: z.array(z.string()),
  /** Observed agreement level (0.0-1.0) */
  agreementLevel: z.number().min(0).max(1),
  /** Divergence points observed */
  divergencePoints: z.array(z.object({
    dimension: z.string(),
    values: z.record(z.unknown())
  })).optional(),
  /** Observation timestamp */
  observedAt: z.string().datetime()
});

export type ConsensusSignal = z.infer<typeof ConsensusSignalSchema>;

/**
 * Aggregation signal output (READ-ONLY observation)
 */
export const AggregationSignalSchema = z.object({
  signalType: z.literal('aggregation_signal'),
  /** Aggregation results */
  results: z.array(z.object({
    metric: z.string(),
    value: z.number(),
    unit: z.string().optional(),
    dimensions: z.record(z.string()).optional()
  })),
  /** Source coverage */
  sourceCoverage: z.number().min(0).max(1),
  /** Data freshness */
  dataFreshnessSeconds: z.number().int().nonnegative(),
  /** Observation timestamp */
  observedAt: z.string().datetime()
});

export type AggregationSignal = z.infer<typeof AggregationSignalSchema>;

/**
 * Strategic signal output (READ-ONLY observation, NO CONCLUSIONS)
 */
export const StrategicSignalSchema = z.object({
  signalType: z.literal('strategic_signal'),
  /** Observed patterns (raw observations only) */
  observedPatterns: z.array(z.object({
    patternId: z.string(),
    patternType: z.string(),
    observations: z.array(z.unknown()),
    /** Correlation strength observed */
    correlationStrength: z.number().min(0).max(1).optional()
  })),
  /** Cross-system correlations observed */
  crossSystemCorrelations: z.array(z.object({
    systemA: z.string(),
    systemB: z.string(),
    correlationType: z.string(),
    strength: z.number().min(0).max(1)
  })).optional(),
  /**
   * IMPORTANT: NO conclusions or recommendations.
   * This agent only observes and reports raw signals.
   */
  _noConclusions: z.literal(true).default(true),
  /** Observation timestamp */
  observedAt: z.string().datetime()
});

export type StrategicSignal = z.infer<typeof StrategicSignalSchema>;

/**
 * Union of all ecosystem signals
 */
export const EcosystemSignalSchema = z.discriminatedUnion('signalType', [
  ConsensusSignalSchema,
  AggregationSignalSchema,
  StrategicSignalSchema
]);

export type EcosystemSignal = z.infer<typeof EcosystemSignalSchema>;

/**
 * Ecosystem Agent Output Schema
 */
export const EcosystemAgentOutputSchema = z.object({
  /** Operation that was performed */
  operation: EcosystemOperationSchema,

  /** Signal emitted */
  signal: EcosystemSignalSchema,

  /** Index updates (if applicable) */
  indexUpdates: z.array(z.object({
    indexName: z.string(),
    documentsProcessed: z.number().int().nonnegative(),
    status: z.enum(['updated', 'created', 'unchanged'])
  })).optional(),

  /** Performance metrics */
  metrics: z.object({
    /** Processing duration in ms (must be <= MAX_LATENCY_MS) */
    processingDurationMs: z.number().int().nonnegative(),
    /** Sources queried */
    sourcesQueried: z.number().int().nonnegative(),
    /** Data points processed */
    dataPointsProcessed: z.number().int().nonnegative(),
    /** Token usage (must be <= MAX_TOKENS) */
    tokenUsage: z.number().int().nonnegative().max(ECOSYSTEM_PERFORMANCE_BUDGET.MAX_TOKENS).optional()
  }),

  /** Dry run indicator */
  dryRun: z.boolean(),

  /** Raw data (if requested) */
  rawData: z.unknown().optional()
});

export type EcosystemAgentOutput = z.infer<typeof EcosystemAgentOutputSchema>;

/**
 * Ecosystem DecisionEvent types
 */
export const EcosystemDecisionTypeSchema = z.enum([
  'ecosystem_aggregation',
  'ecosystem_indexing',
  'ecosystem_analytics',
  'ecosystem_correlation'
]);

export type EcosystemDecisionType = z.infer<typeof EcosystemDecisionTypeSchema>;

/**
 * Validation functions
 */
export function validateEcosystemInput(input: unknown): EcosystemAgentInput {
  return EcosystemAgentInputSchema.parse(input);
}

export function validateEcosystemOutput(output: unknown): EcosystemAgentOutput {
  return EcosystemAgentOutputSchema.parse(output);
}

export function safeValidateEcosystemInput(input: unknown): {
  success: boolean;
  data?: EcosystemAgentInput;
  error?: z.ZodError;
} {
  const result = EcosystemAgentInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate performance budget compliance
 */
export function validatePerformanceBudget(
  durationMs: number,
  tokenUsage?: number
): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];

  if (durationMs > ECOSYSTEM_PERFORMANCE_BUDGET.MAX_LATENCY_MS) {
    violations.push(
      `Latency ${durationMs}ms exceeds budget ${ECOSYSTEM_PERFORMANCE_BUDGET.MAX_LATENCY_MS}ms`
    );
  }

  if (tokenUsage !== undefined && tokenUsage > ECOSYSTEM_PERFORMANCE_BUDGET.MAX_TOKENS) {
    violations.push(
      `Token usage ${tokenUsage} exceeds budget ${ECOSYSTEM_PERFORMANCE_BUDGET.MAX_TOKENS}`
    );
  }

  return {
    compliant: violations.length === 0,
    violations
  };
}
