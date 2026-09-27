/**
 * Decision Event Emitter
 *
 * Responsible for creating and emitting DecisionEvents to ruvector-service.
 * Every invocation of this agent MUST emit exactly ONE DecisionEvent.
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { hashObject, generateUUID } from '../utils/crypto';
import { getRuVectorClient } from '../integrations/ruvector-client';
import type {
  DecisionEvent,
  PackagingAgentInput,
  PackagingAgentOutput,
} from '@llm-marketplace/agentics-contracts';

/**
 * Emit a DecisionEvent for a packaging operation
 */
export async function emitDecisionEvent(
  input: PackagingAgentInput,
  output: PackagingAgentOutput,
  executionRef: string,
  processingDurationMs: number
): Promise<void> {
  const config = getConfig();
  const ruVectorClient = getRuVectorClient();

  const event: DecisionEvent = {
    id: generateUUID(),
    agent_id: `${config.agent.id}:${config.agent.version}`,
    agent_version: config.agent.version,
    decision_type: 'marketplace_package',
    outcome: mapResultCodeToOutcome(output.result_code),
    inputs_hash: hashObject(input),
    outputs: {
      success: output.success,
      result_code: output.result_code,
      message: output.message,
      artifact_id: output.artifact?.id,
      artifact_checksum: output.artifact?.checksum,
    },
    confidence: calculateConfidence(output),
    constraints_applied: extractConstraints(input, output),
    execution_ref: executionRef,
    timestamp: new Date().toISOString(),
    correlation_id: input.correlation_id,
    processing_duration_ms: processingDurationMs,
    metadata: {
      package_name: input.metadata.name,
      package_version: input.metadata.version,
      asset_count: input.assets.length,
      visibility: input.visibility,
      validation_level: input.validation_level,
    },
  };

  try {
    await ruVectorClient.persistDecisionEvent(event);
    logger.info('Decision event emitted', {
      event_id: event.id,
      outcome: event.outcome,
    });
  } catch (error) {
    // Log error but don't fail the operation
    // DecisionEvent persistence failure should not affect the packaging result
    logger.error('Failed to emit decision event', {
      event_id: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Map result code to decision outcome
 */
function mapResultCodeToOutcome(
  resultCode: PackagingAgentOutput['result_code']
): DecisionEvent['outcome'] {
  switch (resultCode) {
    case 'PACKAGE_CREATED':
      return 'approved';
    case 'VALIDATION_FAILED':
    case 'ASSET_NOT_FOUND':
    case 'COMPATIBILITY_ERROR':
    case 'METADATA_INCOMPLETE':
    case 'SIZE_LIMIT_EXCEEDED':
      return 'rejected';
    case 'INTERNAL_ERROR':
      return 'error';
    default:
      return 'error';
  }
}

/**
 * Calculate confidence distribution for the decision
 */
function calculateConfidence(output: PackagingAgentOutput): DecisionEvent['confidence'] {
  const validation = output.validation;

  // Base confidence on validation results
  const lifecycleValidity = output.success ? 1.0 : 0.0;
  const visibilityCompliance = 1.0; // We always respect visibility constraints
  const versionCompliance = output.success ? 1.0 : 0.5; // Partial if validation issues

  // Calculate primary confidence
  const primary = output.success
    ? Math.min(
        validation.metadata_completeness / 100,
        validation.compatibility_score / 100
      )
    : 0.0;

  return {
    primary,
    lifecycleValidity,
    visibilityCompliance,
    versionCompliance,
    consumerImpact: undefined, // Not applicable for packaging
  };
}

/**
 * Extract constraints that were applied during processing
 */
function extractConstraints(
  input: PackagingAgentInput,
  output: PackagingAgentOutput
): DecisionEvent['constraints_applied'] {
  const visibilityRules: string[] = [];
  const compatibilityRules: string[] = [];
  const versionRules: string[] = [];
  const lifecycleRules: string[] = [];
  const policyRules: string[] = [];

  // Visibility constraints
  visibilityRules.push(`visibility:${input.visibility}`);

  // Compatibility constraints
  if (input.compatibility.min_platform_version) {
    compatibilityRules.push(`min_platform:${input.compatibility.min_platform_version}`);
  }
  if (input.compatibility.max_platform_version) {
    compatibilityRules.push(`max_platform:${input.compatibility.max_platform_version}`);
  }
  for (const platform of input.compatibility.platforms) {
    compatibilityRules.push(`platform:${platform}`);
  }

  // Version constraints
  versionRules.push(`package_version:${input.metadata.version}`);
  for (const asset of input.assets) {
    versionRules.push(`asset:${asset.registry_id}@${asset.version}`);
  }

  // Validation level constraint
  policyRules.push(`validation_level:${input.validation_level}`);

  // Add error-derived constraints
  for (const error of output.validation.errors) {
    policyRules.push(`validation_error:${error.code}`);
  }

  return {
    visibilityRules,
    compatibilityRules,
    versionRules,
    lifecycleRules,
    policyRules,
  };
}
