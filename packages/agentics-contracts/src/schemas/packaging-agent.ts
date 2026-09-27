/**
 * Marketplace Packaging Agent Contract
 *
 * Agent Classification: PACKAGING / DISTRIBUTION
 *
 * Purpose: Package agents, templates, and workflows into distributable
 * marketplace artifacts with validated metadata and compatibility checks.
 */

import { z } from 'zod';

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

/**
 * Asset types that can be packaged
 */
export const PackageableAssetTypeSchema = z.enum([
  'agent',
  'template',
  'workflow',
  'bundle',
  'plugin',
  'extension',
]);

export type PackageableAssetType = z.infer<typeof PackageableAssetTypeSchema>;

/**
 * Package visibility levels
 */
export const PackageVisibilitySchema = z.enum([
  'public',      // Available to all marketplace users
  'private',     // Only visible to owner/organization
  'internal',    // Visible within organization only
  'restricted',  // Requires explicit access grant
]);

export type PackageVisibility = z.infer<typeof PackageVisibilitySchema>;

/**
 * Package status in marketplace
 */
export const PackageStatusSchema = z.enum([
  'draft',           // Being prepared
  'pending_review',  // Awaiting validation
  'validated',       // Passed validation
  'published',       // Live in marketplace
  'deprecated',      // Marked for retirement
  'retired',         // No longer available
  'withdrawn',       // Removed by publisher
]);

export type PackageStatus = z.infer<typeof PackageStatusSchema>;

/**
 * Compatibility platform targets
 */
export const PlatformTargetSchema = z.enum([
  'universal',
  'cloud',
  'edge',
  'on-premise',
  'hybrid',
]);

export type PlatformTarget = z.infer<typeof PlatformTargetSchema>;

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/**
 * Asset reference for packaging
 */
export const AssetReferenceSchema = z.object({
  /** Registry ID of the asset */
  registry_id: z.string().min(1).max(255),

  /** Asset type */
  type: PackageableAssetTypeSchema,

  /** Specific version (semver) or 'latest' */
  version: z.string().regex(/^(\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?|latest)$/),

  /** Asset name for display */
  name: z.string().min(1).max(255),

  /** Optional namespace/scope */
  namespace: z.string().max(255).optional(),
});

export type AssetReference = z.infer<typeof AssetReferenceSchema>;

/**
 * Package metadata
 */
export const PackageMetadataSchema = z.object({
  /** Package name */
  name: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),

  /** Package version (semver) */
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/),

  /** Human-readable description */
  description: z.string().min(1).max(2000),

  /** Package author/organization */
  author: z.object({
    name: z.string().min(1).max(255),
    email: z.string().email().optional(),
    organization: z.string().max(255).optional(),
  }),

  /** Package license */
  license: z.string().min(1).max(100),

  /** Keywords for search/discovery */
  keywords: z.array(z.string().max(50)).max(20).optional(),

  /** Category for marketplace organization */
  category: z.string().max(100).optional(),

  /** Homepage URL */
  homepage: z.string().url().optional(),

  /** Repository URL */
  repository: z.string().url().optional(),

  /** Documentation URL */
  documentation: z.string().url().optional(),

  /** Support contact/URL */
  support: z.string().max(500).optional(),
});

export type PackageMetadata = z.infer<typeof PackageMetadataSchema>;

/**
 * Compatibility requirements
 */
export const CompatibilityRequirementsSchema = z.object({
  /** Minimum platform version */
  min_platform_version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),

  /** Maximum platform version (exclusive) */
  max_platform_version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),

  /** Target platforms */
  platforms: z.array(PlatformTargetSchema).min(1),

  /** Required dependencies */
  dependencies: z.array(z.object({
    package: z.string(),
    version: z.string(),
    optional: z.boolean().default(false),
  })).optional(),

  /** Incompatible packages */
  conflicts: z.array(z.string()).optional(),

  /** Required runtime features */
  required_features: z.array(z.string()).optional(),
});

export type CompatibilityRequirements = z.infer<typeof CompatibilityRequirementsSchema>;

/**
 * Packaging Agent Input Schema
 */
export const PackagingAgentInputSchema = z.object({
  /** Request correlation ID */
  correlation_id: z.string().uuid().optional(),

  /** Assets to package */
  assets: z.array(AssetReferenceSchema).min(1).max(100),

  /** Package metadata */
  metadata: PackageMetadataSchema,

  /** Desired visibility */
  visibility: PackageVisibilitySchema.default('private'),

  /** Compatibility requirements */
  compatibility: CompatibilityRequirementsSchema,

  /** Include source artifacts */
  include_sources: z.boolean().default(false),

  /** Generate checksum manifest */
  generate_manifest: z.boolean().default(true),

  /** Validation strictness level */
  validation_level: z.enum(['strict', 'standard', 'permissive']).default('standard'),

  /** Custom tags for organization */
  tags: z.record(z.string(), z.string()).optional(),
});

export type PackagingAgentInput = z.infer<typeof PackagingAgentInputSchema>;

// =============================================================================
// OUTPUT SCHEMAS
// =============================================================================

/**
 * Validation result details
 */
export const ValidationResultSchema = z.object({
  /** Overall validation passed */
  valid: z.boolean(),

  /** Validation errors (if any) */
  errors: z.array(z.object({
    code: z.string(),
    field: z.string().optional(),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
  })).default([]),

  /** Validation warnings */
  warnings: z.array(z.object({
    code: z.string(),
    field: z.string().optional(),
    message: z.string(),
  })).default([]),

  /** Metadata completeness score (0-100) */
  metadata_completeness: z.number().min(0).max(100),

  /** Compatibility score (0-100) */
  compatibility_score: z.number().min(0).max(100),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Package manifest entry
 */
export const ManifestEntrySchema = z.object({
  /** File path within package */
  path: z.string(),

  /** File size in bytes */
  size: z.number().int().min(0),

  /** SHA-256 checksum */
  checksum: z.string().regex(/^[a-f0-9]{64}$/),

  /** File type */
  type: z.enum(['asset', 'metadata', 'source', 'config', 'documentation']),
});

export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

/**
 * Package artifact details
 */
export const PackageArtifactSchema = z.object({
  /** Unique artifact ID */
  id: z.string().uuid(),

  /** Package name@version */
  package_ref: z.string(),

  /** Artifact format */
  format: z.enum(['tar.gz', 'zip', 'oci', 'npm']),

  /** Total size in bytes */
  size: z.number().int().min(0),

  /** SHA-256 checksum of artifact */
  checksum: z.string().regex(/^[a-f0-9]{64}$/),

  /** Storage location (signed URL or path) */
  storage_uri: z.string().optional(),

  /** Manifest entries */
  manifest: z.array(ManifestEntrySchema),

  /** Creation timestamp */
  created_at: z.string().datetime(),
});

export type PackageArtifact = z.infer<typeof PackageArtifactSchema>;

/**
 * Packaging Agent Output Schema
 */
export const PackagingAgentOutputSchema = z.object({
  /** Operation success */
  success: z.boolean(),

  /** Result code */
  result_code: z.enum([
    'PACKAGE_CREATED',
    'VALIDATION_FAILED',
    'ASSET_NOT_FOUND',
    'COMPATIBILITY_ERROR',
    'METADATA_INCOMPLETE',
    'SIZE_LIMIT_EXCEEDED',
    'INTERNAL_ERROR',
  ]),

  /** Human-readable message */
  message: z.string(),

  /** Package artifact (if successful) */
  artifact: PackageArtifactSchema.optional(),

  /** Validation result */
  validation: ValidationResultSchema,

  /** Resolved asset versions */
  resolved_assets: z.array(z.object({
    registry_id: z.string(),
    requested_version: z.string(),
    resolved_version: z.string(),
    name: z.string(),
  })).optional(),

  /** Execution metrics */
  metrics: z.object({
    /** Total execution time in ms */
    execution_time_ms: z.number(),

    /** Assets processed */
    assets_processed: z.number(),

    /** Total input size in bytes */
    total_input_size: z.number(),

    /** Compression ratio (if applicable) */
    compression_ratio: z.number().optional(),
  }).optional(),
});

export type PackagingAgentOutput = z.infer<typeof PackagingAgentOutputSchema>;

// =============================================================================
// CLI CONTRACT
// =============================================================================

/**
 * CLI invocation shape for the Packaging Agent
 */
export const PackagingAgentCLISchema = z.object({
  /** Command name */
  command: z.literal('package'),

  /** Subcommand */
  subcommand: z.enum(['create', 'validate', 'inspect']),

  /** Input file path (JSON) */
  input: z.string().optional(),

  /** Output directory */
  output: z.string().optional(),

  /** Asset references (alternative to input file) */
  assets: z.array(z.string()).optional(),

  /** Flags */
  flags: z.object({
    /** Verbose output */
    verbose: z.boolean().default(false),

    /** Dry run (validate only) */
    dry_run: z.boolean().default(false),

    /** Output format */
    format: z.enum(['json', 'yaml', 'text']).default('json'),

    /** Skip validation */
    skip_validation: z.boolean().default(false),
  }).optional(),
});

export type PackagingAgentCLI = z.infer<typeof PackagingAgentCLISchema>;

// =============================================================================
// AGENT METADATA
// =============================================================================

/**
 * Agent registration metadata
 */
export const PackagingAgentMetadataSchema = z.object({
  /** Agent ID */
  id: z.literal('marketplace-packaging-agent'),

  /** Agent version */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),

  /** Agent classification */
  classification: z.literal('PACKAGING'),

  /** Supported decision types */
  decision_types: z.array(z.string()),

  /** Deployment target */
  deployment: z.literal('google-cloud-edge-function'),

  /** Max execution time in seconds */
  max_execution_time: z.number().default(300),

  /** Memory limit in MB */
  memory_limit_mb: z.number().default(512),
});

export type PackagingAgentMetadata = z.infer<typeof PackagingAgentMetadataSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateInput(input: unknown): PackagingAgentInput {
  return PackagingAgentInputSchema.parse(input);
}

export function validateOutput(output: unknown): PackagingAgentOutput {
  return PackagingAgentOutputSchema.parse(output);
}

export function isValidPackageName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name) && name.length >= 1 && name.length <= 255;
}

export function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version);
}

/**
 * Safe input validation returning result or error
 */
export function safeValidateInput(input: unknown): {
  success: boolean;
  data?: PackagingAgentInput;
  error?: z.ZodError;
} {
  const result = PackagingAgentInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Safe output validation returning result or error
 */
export function safeValidateOutput(output: unknown): {
  success: boolean;
  data?: PackagingAgentOutput;
  error?: z.ZodError;
} {
  const result = PackagingAgentOutputSchema.safeParse(output);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Agent metadata constant
 */
export const PACKAGING_AGENT_METADATA: PackagingAgentMetadata = {
  id: 'marketplace-packaging-agent',
  version: '1.0.0',
  classification: 'PACKAGING',
  decision_types: ['marketplace_package'],
  deployment: 'google-cloud-edge-function',
  max_execution_time: 300,
  memory_limit_mb: 512,
};
