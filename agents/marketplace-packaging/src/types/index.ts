/**
 * Type definitions for Marketplace Packaging Agent
 *
 * Re-exports from agentics-contracts and adds internal types.
 */

// Re-export all types from agentics-contracts
export {
  // Decision Event types
  DecisionType,
  DecisionOutcome,
  ConfidenceDistribution,
  ConstraintsApplied,
  DecisionEvent,

  // Packaging Agent types
  PackageableAssetType,
  PackageVisibility,
  PackageStatus,
  PlatformTarget,
  AssetReference,
  PackageMetadata,
  CompatibilityRequirements,
  PackagingAgentInput,
  ValidationResult,
  ManifestEntry,
  PackageArtifact,
  PackagingAgentOutput,
  PackagingAgentCLI,
  PackagingAgentMetadata,
} from '@llm-marketplace/agentics-contracts';

/**
 * Internal error types
 */
export interface AgentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  cause?: Error;
}

/**
 * Result type for operations
 */
export type Result<T, E = AgentError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Resolved asset from registry
 */
export interface ResolvedAsset {
  registry_id: string;
  name: string;
  type: string;
  requested_version: string;
  resolved_version: string;
  checksum: string;
  size: number;
  content_uri: string;
  metadata: Record<string, unknown>;
}

/**
 * Packaging context for tracking state during execution
 */
export interface PackagingContext {
  correlation_id: string;
  execution_ref: string;
  start_time: number;
  input: import('@llm-marketplace/agentics-contracts').PackagingAgentInput;
  resolved_assets: ResolvedAsset[];
  validation_result?: import('@llm-marketplace/agentics-contracts').ValidationResult;
  artifact?: import('@llm-marketplace/agentics-contracts').PackageArtifact;
}

/**
 * HTTP request context for Edge Function
 */
export interface RequestContext {
  method: string;
  path: string;
  headers: Record<string, string>;
  correlation_id: string;
}

/**
 * Telemetry event
 */
export interface TelemetryEvent {
  event_type: string;
  timestamp: string;
  agent_id: string;
  agent_version: string;
  correlation_id: string;
  data: Record<string, unknown>;
}
