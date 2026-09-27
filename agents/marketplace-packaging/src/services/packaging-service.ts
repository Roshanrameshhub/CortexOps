/**
 * Packaging Service
 *
 * Core business logic for the Marketplace Packaging Agent.
 *
 * This service:
 * - Packages assets into distributable units
 * - Validates compatibility and metadata completeness
 * - Emits marketplace readiness artifacts
 *
 * This service MUST NOT:
 * - Modify runtime behavior
 * - Enforce policies or approvals
 * - Trigger workflows
 * - Execute agents
 * - Apply optimizations
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { sha256, hashObject, generateUUID } from '../utils/crypto';
import { getRegistryClient } from '../integrations/registry-client';
import type {
  PackagingAgentInput,
  PackagingAgentOutput,
  ValidationResult,
  PackageArtifact,
  ManifestEntry,
} from '@llm-marketplace/agentics-contracts';
import type { ResolvedAsset, PackagingContext, Result, AgentError } from '../types';

/**
 * Packaging Service
 */
export class PackagingService {
  private readonly registryClient = getRegistryClient();

  /**
   * Create a package from the given input
   */
  async createPackage(input: PackagingAgentInput): Promise<PackagingAgentOutput> {
    const startTime = Date.now();
    const executionRef = generateUUID();

    // Create packaging context
    const context: PackagingContext = {
      correlation_id: input.correlation_id || generateUUID(),
      execution_ref: executionRef,
      start_time: startTime,
      input,
      resolved_assets: [],
    };

    logger.setCorrelationId(context.correlation_id);
    logger.info('Starting package creation', {
      execution_ref: executionRef,
      package_name: input.metadata.name,
      package_version: input.metadata.version,
      asset_count: input.assets.length,
    });

    try {
      // Step 1: Validate input
      const validationResult = await this.validateInput(input);
      context.validation_result = validationResult;

      if (!validationResult.valid && input.validation_level === 'strict') {
        return this.createFailureOutput(
          'VALIDATION_FAILED',
          'Package validation failed with errors',
          validationResult,
          startTime
        );
      }

      // Step 2: Resolve assets from registry
      const resolveResult = await this.resolveAssets(input);
      if (!resolveResult.success) {
        return this.createFailureOutput(
          'ASSET_NOT_FOUND',
          resolveResult.error.message,
          validationResult,
          startTime
        );
      }
      context.resolved_assets = resolveResult.data;

      // Step 3: Check total size
      const totalSize = context.resolved_assets.reduce((sum, asset) => sum + asset.size, 0);
      const config = getConfig();

      if (totalSize > config.validation.maxPackageSizeBytes) {
        return this.createFailureOutput(
          'SIZE_LIMIT_EXCEEDED',
          `Package size ${totalSize} exceeds limit ${config.validation.maxPackageSizeBytes}`,
          validationResult,
          startTime
        );
      }

      // Step 4: Generate manifest
      const manifest = this.generateManifest(context);

      // Step 5: Create artifact
      const artifact = this.createArtifact(context, manifest, totalSize);
      context.artifact = artifact;

      logger.timed('Package created successfully', startTime, {
        artifact_id: artifact.id,
        package_ref: artifact.package_ref,
        assets_processed: context.resolved_assets.length,
        total_size: totalSize,
      });

      return {
        success: true,
        result_code: 'PACKAGE_CREATED',
        message: `Package ${artifact.package_ref} created successfully`,
        artifact,
        validation: validationResult,
        resolved_assets: context.resolved_assets.map(asset => ({
          registry_id: asset.registry_id,
          requested_version: asset.requested_version,
          resolved_version: asset.resolved_version,
          name: asset.name,
        })),
        metrics: {
          execution_time_ms: Date.now() - startTime,
          assets_processed: context.resolved_assets.length,
          total_input_size: totalSize,
        },
      };
    } catch (error) {
      logger.error('Package creation failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return this.createFailureOutput(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Unknown error occurred',
        context.validation_result || this.createEmptyValidation(),
        startTime
      );
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Validate package only (dry run)
   */
  async validatePackage(input: PackagingAgentInput): Promise<ValidationResult> {
    logger.setCorrelationId(input.correlation_id || generateUUID());
    logger.info('Validating package', {
      package_name: input.metadata.name,
      package_version: input.metadata.version,
    });

    try {
      return await this.validateInput(input);
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Validate input and return detailed validation result
   */
  private async validateInput(input: PackagingAgentInput): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];
    let metadataScore = 100;
    let compatibilityScore = 100;

    // Validate assets count
    const config = getConfig();
    if (input.assets.length > config.validation.maxAssetsPerPackage) {
      errors.push({
        code: 'TOO_MANY_ASSETS',
        field: 'assets',
        message: `Number of assets (${input.assets.length}) exceeds maximum (${config.validation.maxAssetsPerPackage})`,
        severity: 'error',
      });
    }

    // Validate metadata completeness
    if (!input.metadata.keywords || input.metadata.keywords.length === 0) {
      warnings.push({
        code: 'MISSING_KEYWORDS',
        field: 'metadata.keywords',
        message: 'Keywords are recommended for marketplace discovery',
      });
      metadataScore -= 10;
    }

    if (!input.metadata.category) {
      warnings.push({
        code: 'MISSING_CATEGORY',
        field: 'metadata.category',
        message: 'Category is recommended for marketplace organization',
      });
      metadataScore -= 10;
    }

    if (!input.metadata.documentation) {
      warnings.push({
        code: 'MISSING_DOCUMENTATION',
        field: 'metadata.documentation',
        message: 'Documentation URL is recommended',
      });
      metadataScore -= 5;
    }

    if (!input.metadata.repository) {
      warnings.push({
        code: 'MISSING_REPOSITORY',
        field: 'metadata.repository',
        message: 'Repository URL is recommended',
      });
      metadataScore -= 5;
    }

    // Validate compatibility
    if (input.compatibility.platforms.length === 0) {
      errors.push({
        code: 'NO_PLATFORMS',
        field: 'compatibility.platforms',
        message: 'At least one target platform must be specified',
        severity: 'error',
      });
      compatibilityScore -= 50;
    }

    if (!input.compatibility.min_platform_version) {
      warnings.push({
        code: 'NO_MIN_VERSION',
        field: 'compatibility.min_platform_version',
        message: 'Minimum platform version is recommended for compatibility',
      });
      compatibilityScore -= 10;
    }

    // Validate asset references (check for duplicates)
    const assetIds = new Set<string>();
    for (const asset of input.assets) {
      const key = `${asset.registry_id}@${asset.version}`;
      if (assetIds.has(key)) {
        errors.push({
          code: 'DUPLICATE_ASSET',
          field: 'assets',
          message: `Duplicate asset reference: ${key}`,
          severity: 'error',
        });
      }
      assetIds.add(key);
    }

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings,
      metadata_completeness: Math.max(0, metadataScore),
      compatibility_score: Math.max(0, compatibilityScore),
    };
  }

  /**
   * Resolve all assets from registry
   */
  private async resolveAssets(input: PackagingAgentInput): Promise<Result<ResolvedAsset[], AgentError>> {
    return this.registryClient.resolveAssets(input.assets);
  }

  /**
   * Generate manifest from resolved assets
   */
  private generateManifest(context: PackagingContext): ManifestEntry[] {
    const entries: ManifestEntry[] = [];

    // Add asset entries
    for (const asset of context.resolved_assets) {
      entries.push({
        path: `assets/${asset.type}/${asset.name}-${asset.resolved_version}`,
        size: asset.size,
        checksum: asset.checksum,
        type: 'asset',
      });
    }

    // Add metadata entry
    const metadataJson = JSON.stringify(context.input.metadata, null, 2);
    entries.push({
      path: 'package.json',
      size: Buffer.byteLength(metadataJson, 'utf-8'),
      checksum: sha256(metadataJson),
      type: 'metadata',
    });

    // Add compatibility entry
    const compatJson = JSON.stringify(context.input.compatibility, null, 2);
    entries.push({
      path: 'compatibility.json',
      size: Buffer.byteLength(compatJson, 'utf-8'),
      checksum: sha256(compatJson),
      type: 'config',
    });

    return entries;
  }

  /**
   * Create package artifact
   */
  private createArtifact(
    context: PackagingContext,
    manifest: ManifestEntry[],
    totalSize: number
  ): PackageArtifact {
    const packageRef = `${context.input.metadata.name}@${context.input.metadata.version}`;

    // Calculate artifact checksum from manifest
    const manifestChecksum = hashObject(manifest);

    return {
      id: generateUUID(),
      package_ref: packageRef,
      format: 'tar.gz',
      size: totalSize,
      checksum: manifestChecksum,
      manifest,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Create failure output
   */
  private createFailureOutput(
    resultCode: PackagingAgentOutput['result_code'],
    message: string,
    validation: ValidationResult,
    startTime: number
  ): PackagingAgentOutput {
    return {
      success: false,
      result_code: resultCode,
      message,
      validation,
      metrics: {
        execution_time_ms: Date.now() - startTime,
        assets_processed: 0,
        total_input_size: 0,
      },
    };
  }

  /**
   * Create empty validation result
   */
  private createEmptyValidation(): ValidationResult {
    return {
      valid: false,
      errors: [],
      warnings: [],
      metadata_completeness: 0,
      compatibility_score: 0,
    };
  }
}

// Singleton instance
let serviceInstance: PackagingService | null = null;

/**
 * Get packaging service instance
 */
export function getPackagingService(): PackagingService {
  if (!serviceInstance) {
    serviceInstance = new PackagingService();
  }
  return serviceInstance;
}

/**
 * Reset service instance (for testing)
 */
export function resetPackagingService(): void {
  serviceInstance = null;
}
