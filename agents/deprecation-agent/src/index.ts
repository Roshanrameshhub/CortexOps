/**
 * @llm-marketplace/deprecation-agent
 *
 * Deprecation Agent for LLM-Marketplace
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

// Core agent
export {
  DeprecationAgent,
  DeprecationAgentConfig,
  createDeprecationAgent
} from './core';

// Clients
export {
  RuVectorServiceClient,
  RuVectorConfig,
  LifecycleRecord,
  createRuVectorClient
} from './clients';

// Handler (for Google Cloud Functions)
export { handler, deprecationHandler } from './handler';

// Re-export contracts for convenience
export {
  DeprecationAgentInput,
  DeprecationAgentOutput,
  DecisionEvent,
  DEPRECATION_AGENT_METADATA
} from '@llm-marketplace/agentics-contracts';
