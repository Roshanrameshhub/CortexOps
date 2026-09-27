/**
 * Agentics Contracts - Schema Exports
 *
 * All schema definitions for LLM-Marketplace agents.
 */

// Decision Event schemas (core to all agents)
export {
  DecisionTypeSchema,
  DecisionType,
  ConfidenceDistributionSchema,
  ConfidenceDistribution,
  ConstraintsAppliedSchema,
  ConstraintsApplied,
  DecisionOutcomeSchema,
  DecisionOutcome,
  DecisionEventSchema,
  DecisionEvent,
  validateDecisionEvent,
  safeValidateDecisionEvent
} from './decision-event.schema';

// Deprecation Agent schemas
export {
  // Enums
  DeprecationReasonSchema,
  DeprecationReason,
  TargetLifecycleStateSchema,
  TargetLifecycleState,
  DeprecatableAssetTypeSchema,
  DeprecatableAssetType,
  NotificationUrgencySchema,
  NotificationUrgency,

  // Input schemas
  ConsumerNotificationConfigSchema,
  ConsumerNotificationConfig,
  MigrationGuidanceSchema,
  MigrationGuidance,
  DeprecationAgentInputSchema,
  DeprecationAgentInput,

  // Output schemas
  PolicyViolationSchema,
  PolicyViolation,
  ConsumerImpactSchema,
  ConsumerImpact,
  LifecycleTransitionSchema,
  LifecycleTransition,
  NotificationDispatchSchema,
  NotificationDispatch,
  DeprecationAgentOutputSchema,
  DeprecationAgentOutput,

  // CLI contract
  DeprecationCLICommandSchema,
  DeprecationCLICommand,

  // Validation helpers
  validateDeprecationInput,
  validateDeprecationOutput,
  safeValidateDeprecationInput,
  safeValidateDeprecationOutput,

  // Metadata
  DEPRECATION_AGENT_METADATA
} from './deprecation-agent.schema';

// Packaging Agent schemas
export {
  // Enums
  PackageableAssetTypeSchema,
  PackageableAssetType,
  PackageVisibilitySchema,
  PackageVisibility,
  PackageStatusSchema,
  PackageStatus,
  PlatformTargetSchema,
  PlatformTarget,

  // Input schemas
  AssetReferenceSchema,
  AssetReference,
  PackageMetadataSchema,
  PackageMetadata,
  CompatibilityRequirementsSchema,
  CompatibilityRequirements,
  PackagingAgentInputSchema,
  PackagingAgentInput,

  // Output schemas
  ValidationResultSchema,
  ValidationResult,
  ManifestEntrySchema,
  ManifestEntry,
  PackageArtifactSchema,
  PackageArtifact,
  PackagingAgentOutputSchema,
  PackagingAgentOutput,

  // CLI contract
  PackagingAgentCLISchema,
  PackagingAgentCLI,

  // Agent metadata
  PackagingAgentMetadataSchema,
  PackagingAgentMetadata,

  // Validation helpers
  validateInput as validatePackagingInput,
  validateOutput as validatePackagingOutput,
  safeValidateInput as safeValidatePackagingInput,
  safeValidateOutput as safeValidatePackagingOutput,
  isValidPackageName,
  isValidSemver,

  // Metadata
  PACKAGING_AGENT_METADATA
} from './packaging-agent';

// Execution Span schemas (Foundational Execution Unit)
export {
  SpanStatusSchema,
  type SpanStatus,
  SpanTypeSchema,
  type SpanType,
  ExecutionSpanSchema,
  type ExecutionSpan,
  RepoSpanSchema,
  type RepoSpan,
  ArtifactSchema,
  type Artifact,
  AgentSpanSchema,
  type AgentSpan,
  ExecutionContextSchema,
  type ExecutionContext,
  RepoExecutionResultSchema,
  type RepoExecutionResult,
} from './execution-span.schema';

// Ecosystem Agent schemas (Phase 5)
export {
  // Constants
  ECOSYSTEM_PERFORMANCE_BUDGET,

  // Enums
  EcosystemSignalTypeSchema,
  EcosystemSignalType,
  EcosystemOperationSchema,
  EcosystemOperation,
  EcosystemDecisionTypeSchema,
  EcosystemDecisionType,

  // Input schemas
  DataSourceSchema,
  DataSource,
  AggregationTargetSchema,
  AggregationTarget,
  IndexSpecSchema,
  IndexSpec,
  AnalyticsQuerySchema,
  AnalyticsQuery,
  EcosystemAgentInputSchema,
  EcosystemAgentInput,

  // Signal schemas
  ConsensusSignalSchema,
  ConsensusSignal,
  AggregationSignalSchema,
  AggregationSignal,
  StrategicSignalSchema,
  StrategicSignal,
  EcosystemSignalSchema,
  EcosystemSignal,

  // Output schemas
  EcosystemAgentOutputSchema,
  EcosystemAgentOutput,

  // Validation helpers
  validateEcosystemInput,
  validateEcosystemOutput,
  safeValidateEcosystemInput,
  validatePerformanceBudget
} from './ecosystem-agent.schema';
