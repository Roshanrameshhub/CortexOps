/**
 * Agent Registry Contract
 *
 * Registration contracts for LLM-Marketplace agents.
 * All agents must be registered here for platform discovery.
 */

import { z } from 'zod';

/**
 * Agent classification types
 */
export const AgentClassificationSchema = z.enum([
  'PACKAGING',
  'DISTRIBUTION',
  'LIFECYCLE_MANAGEMENT',
  'ECOSYSTEM_ANALYTICS'
]);

export type AgentClassification = z.infer<typeof AgentClassificationSchema>;

/**
 * Agent health status
 */
export const AgentHealthStatusSchema = z.enum([
  'healthy',
  'degraded',
  'unhealthy',
  'unknown'
]);

export type AgentHealthStatus = z.infer<typeof AgentHealthStatusSchema>;

/**
 * Agent endpoint configuration
 */
export const AgentEndpointSchema = z.object({
  /** HTTP endpoint URL */
  url: z.string().url(),
  /** HTTP method */
  method: z.enum(['POST', 'PUT']).default('POST'),
  /** Timeout in milliseconds */
  timeoutMs: z.number().int().positive().default(30000),
  /** Retry configuration */
  retry: z.object({
    maxAttempts: z.number().int().positive().default(3),
    backoffMs: z.number().int().positive().default(1000),
    exponential: z.boolean().default(true)
  }).optional()
});

export type AgentEndpoint = z.infer<typeof AgentEndpointSchema>;

/**
 * Agent registration schema
 */
export const AgentRegistrationSchema = z.object({
  /** Unique agent identifier */
  agentId: z.string().regex(/^[a-z0-9-]+$/),

  /** Agent display name */
  displayName: z.string().min(1).max(100),

  /** Agent description */
  description: z.string().max(500),

  /** Semantic version */
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),

  /** Agent classification */
  classification: AgentClassificationSchema,

  /** Decision type this agent produces */
  decisionType: z.string(),

  /** Agent capabilities */
  capabilities: z.array(z.string()),

  /** Endpoint configuration */
  endpoint: AgentEndpointSchema,

  /** CLI commands exposed */
  cliCommands: z.array(z.string()),

  /** Input schema reference */
  inputSchemaRef: z.string(),

  /** Output schema reference */
  outputSchemaRef: z.string(),

  /** Systems that may consume this agent's output */
  consumers: z.array(z.string()),

  /** Explicit non-responsibilities */
  mustNot: z.array(z.string()),

  /** Agent owner/maintainer */
  owner: z.string(),

  /** Health check endpoint (optional) */
  healthCheckEndpoint: z.string().url().optional(),

  /** Documentation URL */
  documentationUrl: z.string().url().optional(),

  /** Tags for discovery */
  tags: z.array(z.string()).optional(),

  /** Enabled status */
  enabled: z.boolean().default(true),

  /** Registration timestamp */
  registeredAt: z.string().datetime(),

  /** Last updated timestamp */
  updatedAt: z.string().datetime()
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

/**
 * Agent registry collection
 */
export const AgentRegistrySchema = z.object({
  /** Registry version */
  version: z.string(),
  /** Last updated */
  updatedAt: z.string().datetime(),
  /** Registered agents */
  agents: z.array(AgentRegistrationSchema)
});

export type AgentRegistry = z.infer<typeof AgentRegistrySchema>;

/**
 * Predefined agent registrations
 */
export const REGISTERED_AGENTS: AgentRegistration[] = [
  {
    agentId: 'deprecation-agent',
    displayName: 'Deprecation Agent',
    description: 'Manage controlled deprecation and retirement of marketplace assets',
    version: '1.0.0',
    classification: 'LIFECYCLE_MANAGEMENT',
    decisionType: 'marketplace_deprecation',
    capabilities: [
      'deprecate_asset',
      'retire_asset',
      'assess_consumer_impact',
      'enforce_visibility_constraints',
      'enforce_version_constraints',
      'emit_lifecycle_signals',
      'notify_consumers'
    ],
    endpoint: {
      url: 'https://marketplace-agents.run.app/deprecation',
      method: 'POST',
      timeoutMs: 30000,
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
        exponential: true
      }
    },
    cliCommands: ['deprecate', 'retire', 'inspect', 'impact', 'list-deprecated'],
    inputSchemaRef: '@llm-marketplace/agentics-contracts/schemas#DeprecationAgentInput',
    outputSchemaRef: '@llm-marketplace/agentics-contracts/schemas#DeprecationAgentOutput',
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
    ],
    owner: 'marketplace-team',
    healthCheckEndpoint: 'https://marketplace-agents.run.app/deprecation/health',
    documentationUrl: 'https://docs.marketplace.example.com/agents/deprecation',
    tags: ['lifecycle', 'deprecation', 'retirement', 'asset-management'],
    enabled: true,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    agentId: 'marketplace-packaging-agent',
    displayName: 'Marketplace Packaging Agent',
    description: 'Package agents, templates, and workflows into distributable marketplace artifacts',
    version: '1.0.0',
    classification: 'PACKAGING',
    decisionType: 'marketplace_package',
    capabilities: [
      'package_assets',
      'validate_compatibility',
      'validate_metadata_completeness',
      'generate_manifest',
      'emit_marketplace_artifacts',
      'resolve_asset_versions'
    ],
    endpoint: {
      url: 'https://marketplace-agents.run.app/package',
      method: 'POST',
      timeoutMs: 300000, // 5 minutes for large packages
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
        exponential: true
      }
    },
    cliCommands: ['create', 'package', 'validate', 'inspect'],
    inputSchemaRef: '@llm-marketplace/agentics-contracts/schemas#PackagingAgentInput',
    outputSchemaRef: '@llm-marketplace/agentics-contracts/schemas#PackagingAgentOutput',
    consumers: [
      'LLM-Registry',
      'LLM-Orchestrator',
      'LLM-Governance-Dashboard',
      'Discovery Service'
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
    ],
    owner: 'marketplace-team',
    healthCheckEndpoint: 'https://marketplace-agents.run.app/package/health',
    documentationUrl: 'https://docs.marketplace.example.com/agents/packaging',
    tags: ['packaging', 'distribution', 'bundling', 'artifact-management'],
    enabled: true,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    agentId: 'ecosystem-agent',
    displayName: 'Ecosystem Agent',
    description: 'Phase 5 - Aggregation, indexing, and cross-system analytics for ecosystem collaboration',
    version: '1.0.0',
    classification: 'ECOSYSTEM_ANALYTICS',
    decisionType: 'ecosystem_analytics',
    capabilities: [
      'aggregate_cross_system_data',
      'index_ecosystem_artifacts',
      'analyze_usage_patterns',
      'correlate_system_metrics',
      'emit_consensus_signals',
      'emit_aggregation_signals',
      'emit_strategic_signals'
    ],
    endpoint: {
      url: 'https://marketplace-agents.run.app/ecosystem',
      method: 'POST',
      timeoutMs: 3000, // MAX_LATENCY_MS budget
      retry: {
        maxAttempts: 2,
        backoffMs: 500,
        exponential: true
      }
    },
    cliCommands: ['aggregate', 'index', 'analyze', 'correlate', 'health'],
    inputSchemaRef: '@llm-marketplace/agentics-contracts/schemas#EcosystemAgentInput',
    outputSchemaRef: '@llm-marketplace/agentics-contracts/schemas#EcosystemAgentOutput',
    consumers: [
      'LLM-Governance-Dashboard',
      'LLM-Analytics-Hub',
      'LLM-Federation-Gateway',
      'Discovery Service'
    ],
    mustNot: [
      'Mutate state',
      'Commit actions',
      'Execute workflows',
      'Modify runtime behavior',
      'Enforce policies or approvals',
      'Draw conclusions from strategic signals',
      'Trigger external workflows',
      'Execute other agents',
      'Connect directly to SQL'
    ],
    owner: 'marketplace-team',
    healthCheckEndpoint: 'https://marketplace-agents.run.app/ecosystem/health',
    documentationUrl: 'https://docs.marketplace.example.com/agents/ecosystem',
    tags: ['ecosystem', 'aggregation', 'indexing', 'analytics', 'phase-5', 'collaboration'],
    enabled: true,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

/**
 * Get agent registration by ID
 */
export function getAgentRegistration(agentId: string): AgentRegistration | undefined {
  return REGISTERED_AGENTS.find(agent => agent.agentId === agentId);
}

/**
 * Get all agents by classification
 */
export function getAgentsByClassification(classification: AgentClassification): AgentRegistration[] {
  return REGISTERED_AGENTS.filter(agent => agent.classification === classification);
}

/**
 * Validate agent registration
 */
export function validateAgentRegistration(registration: unknown): AgentRegistration {
  return AgentRegistrationSchema.parse(registration);
}
