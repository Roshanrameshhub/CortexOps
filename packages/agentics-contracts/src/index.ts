/**
 * @llm-marketplace/agentics-contracts
 *
 * Contract schemas and types for LLM-Marketplace agents.
 *
 * This package defines the NON-NEGOTIABLE contracts that all
 * LLM-Marketplace agents must adhere to.
 *
 * @example
 * ```typescript
 * import {
 *   DecisionEventSchema,
 *   DeprecationAgentInputSchema,
 *   validateDecisionEvent
 * } from '@llm-marketplace/agentics-contracts';
 * ```
 */

// Re-export all schemas
export * from './schemas';

// Re-export all agent contracts
export * from './agents';
