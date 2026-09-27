/**
 * Execution Span Schemas
 *
 * Domain-level execution graph data model for the Agentics system.
 * These schemas define the structured span hierarchy that every
 * Foundational Execution Unit (repo) must produce.
 *
 * Invariant: Core -> Repo -> Agent (at least one agent span required)
 */

import { z } from 'zod';

/**
 * Terminal status of an execution span
 */
export const SpanStatusSchema = z.enum([
  'ok',
  'error',
  'invalid',
]);

export type SpanStatus = z.infer<typeof SpanStatusSchema>;

/**
 * Span type discriminator
 */
export const SpanTypeSchema = z.enum([
  'repo',
  'agent',
]);

export type SpanType = z.infer<typeof SpanTypeSchema>;

/**
 * Base execution span shared by all span types
 */
export const ExecutionSpanSchema = z.object({
  /** Unique span identifier */
  span_id: z.string().uuid(),
  /** Parent span identifier (establishes causal ordering) */
  parent_span_id: z.string().uuid(),
  /** Span type discriminator */
  type: SpanTypeSchema,
  /** UTC ISO timestamp when span started */
  start_time: z.string().datetime(),
  /** UTC ISO timestamp when span ended (null while open) */
  end_time: z.string().datetime().nullable(),
  /** Terminal status */
  status: SpanStatusSchema,
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type ExecutionSpan = z.infer<typeof ExecutionSpanSchema>;

/**
 * Repo-level span: entry span for the entire repository execution
 */
export const RepoSpanSchema = ExecutionSpanSchema.extend({
  type: z.literal('repo'),
  /** Repository name */
  repo_name: z.string(),
  /** Execution identifier from the Core */
  execution_id: z.string().uuid(),
  /** Number of agent spans produced */
  agent_count: z.number().int().nonnegative(),
});

export type RepoSpan = z.infer<typeof RepoSpanSchema>;

/**
 * Artifact produced by an agent execution
 */
export const ArtifactSchema = z.object({
  /** Unique artifact identifier */
  artifact_id: z.string().uuid(),
  /** Type discriminator (e.g. 'DecisionEvent', 'AgentOutput') */
  artifact_type: z.string(),
  /** UTC ISO timestamp when artifact was produced */
  produced_at: z.string().datetime(),
  /** Artifact payload */
  data: z.record(z.unknown()),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

/**
 * Agent-level span: one per agent execution within the repo
 */
export const AgentSpanSchema = ExecutionSpanSchema.extend({
  type: z.literal('agent'),
  /** Registered agent name */
  agent_name: z.string(),
  /** Repository this agent executed within */
  repo_name: z.string(),
  /** Artifacts produced by this agent */
  artifacts: z.array(ArtifactSchema).default([]),
  /** Machine-verifiable evidence */
  evidence: z.array(ArtifactSchema).default([]),
});

export type AgentSpan = z.infer<typeof AgentSpanSchema>;

/**
 * Inbound execution context from the Core orchestrator
 */
export const ExecutionContextSchema = z.object({
  /** Execution identifier */
  execution_id: z.string().uuid(),
  /** Parent span from the Core (required, non-negotiable) */
  parent_span_id: z.string().uuid(),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

/**
 * Complete structured output from a repo execution.
 * agent_spans must contain at least one entry.
 */
export const RepoExecutionResultSchema = z.object({
  /** Repo-level span */
  repo_span: RepoSpanSchema,
  /** Agent-level spans (at least one required) */
  agent_spans: z.array(AgentSpanSchema).min(1),
  /** All artifacts flattened from agent spans */
  artifacts: z.array(ArtifactSchema),
  /** The execution context that initiated this execution */
  execution_context: ExecutionContextSchema,
});

export type RepoExecutionResult = z.infer<typeof RepoExecutionResultSchema>;
