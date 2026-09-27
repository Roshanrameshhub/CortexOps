#!/usr/bin/env node
/**
 * Marketplace Packaging Agent CLI
 *
 * CLI interface for packaging operations.
 *
 * Commands:
 * - create: Create a new package from assets
 * - validate: Validate a package definition without creating
 * - inspect: Inspect an existing package
 */

import { Command } from 'commander';
import { generateUUID } from '../utils/crypto';
import {
  PackagingAgentInput,
  PackageVisibility,
  PlatformTarget,
  PackageableAssetType,
  PACKAGING_AGENT_METADATA,
  safeValidatePackagingInput,
} from '@llm-marketplace/agentics-contracts';
import { getPackagingService } from '../services/packaging-service';
import { emitDecisionEvent } from '../services/decision-event-emitter';

const program = new Command();

program
  .name('packaging-agent')
  .description('LLM Marketplace Packaging Agent CLI')
  .version(PACKAGING_AGENT_METADATA.version);

/**
 * create command
 */
program
  .command('create')
  .alias('package')
  .description('Create a new package from assets')
  .requiredOption('-n, --name <name>', 'Package name (lowercase, alphanumeric, hyphens)')
  .requiredOption('-v, --version <version>', 'Package version (semver)')
  .requiredOption('-d, --description <text>', 'Package description')
  .requiredOption('-a, --assets <assets...>', 'Asset references (format: registry_id:type:version)')
  .option('--author-name <name>', 'Author name', process.env.USER_NAME || 'Unknown')
  .option('--author-email <email>', 'Author email')
  .option('--author-org <org>', 'Author organization')
  .option('-l, --license <license>', 'Package license', 'MIT')
  .option('--visibility <visibility>', 'Package visibility (public|private|internal|restricted)', 'private')
  .option('--platforms <platforms...>', 'Target platforms (universal|cloud|edge|on-premise|hybrid)', ['universal'])
  .option('--min-platform-version <version>', 'Minimum platform version')
  .option('--max-platform-version <version>', 'Maximum platform version')
  .option('--keywords <keywords...>', 'Keywords for discovery')
  .option('--category <category>', 'Marketplace category')
  .option('--homepage <url>', 'Homepage URL')
  .option('--repository <url>', 'Repository URL')
  .option('--documentation <url>', 'Documentation URL')
  .option('--validation-level <level>', 'Validation level (strict|standard|permissive)', 'standard')
  .option('--include-sources', 'Include source artifacts', false)
  .option('--dry-run', 'Dry run (validate only)', false)
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    const startTime = Date.now();
    const executionRef = generateUUID();

    try {
      // Parse assets
      const assets = parseAssetReferences(options.assets);

      // Build input
      const input: PackagingAgentInput = {
        correlation_id: generateUUID(),
        assets,
        metadata: {
          name: options.name,
          version: options.version,
          description: options.description,
          author: {
            name: options.authorName,
            email: options.authorEmail,
            organization: options.authorOrg,
          },
          license: options.license,
          keywords: options.keywords,
          category: options.category,
          homepage: options.homepage,
          repository: options.repository,
          documentation: options.documentation,
        },
        visibility: options.visibility as PackageVisibility,
        compatibility: {
          platforms: options.platforms as PlatformTarget[],
          min_platform_version: options.minPlatformVersion,
          max_platform_version: options.maxPlatformVersion,
        },
        include_sources: options.includeSources,
        generate_manifest: true,
        validation_level: options.validationLevel as 'strict' | 'standard' | 'permissive',
      };

      // Validate input
      const validationResult = safeValidatePackagingInput(input);
      if (!validationResult.success) {
        handleValidationError(validationResult.error!, options.json);
        process.exit(1);
      }

      if (options.dryRun) {
        // Validate only
        const service = getPackagingService();
        const validation = await service.validatePackage(input);

        if (options.json) {
          console.log(JSON.stringify({ dryRun: true, validation }, null, 2));
        } else {
          printValidation(validation);
        }

        process.exit(validation.valid ? 0 : 1);
      }

      // Create package
      const service = getPackagingService();
      const result = await service.createPackage(input);

      // Emit DecisionEvent (REQUIRED)
      const processingDurationMs = Date.now() - startTime;
      await emitDecisionEvent(input, result, executionRef, processingDurationMs);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result);
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * validate command
 */
program
  .command('validate')
  .description('Validate a package definition without creating')
  .requiredOption('-i, --input <file>', 'Input JSON file with package definition')
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      // Read input file
      const fs = await import('fs/promises');
      const inputContent = await fs.readFile(options.input, 'utf-8');
      const input = JSON.parse(inputContent);

      // Validate schema
      const schemaValidation = safeValidatePackagingInput(input);
      if (!schemaValidation.success) {
        handleValidationError(schemaValidation.error!, options.json);
        process.exit(1);
      }

      // Run validation
      const service = getPackagingService();
      const validation = await service.validatePackage(input);

      if (options.json) {
        console.log(JSON.stringify({ schemaValid: true, validation }, null, 2));
      } else {
        console.log('Schema: ✓ Valid');
        printValidation(validation);
      }

      process.exit(validation.valid ? 0 : 1);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * inspect command
 */
program
  .command('inspect')
  .description('Inspect an existing package')
  .requiredOption('-p, --package <ref>', 'Package reference (name@version)')
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      // Parse package reference
      const [name, version] = options.package.split('@');
      if (!name || !version) {
        throw new Error('Invalid package reference. Use format: name@version');
      }

      // This would query ruvector-service or storage for package details
      // For now, output a placeholder structure
      const result = {
        package_ref: options.package,
        name,
        version,
        status: 'not_implemented',
        message: 'Package inspection requires ruvector-service integration',
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nPackage: ${options.package}`);
        console.log('='.repeat(50));
        console.log('Status: Package inspection not yet implemented');
        console.log('Note: Requires ruvector-service integration');
      }

      process.exit(0);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * Parse asset references from CLI format
 * Format: registry_id:type:version
 */
function parseAssetReferences(refs: string[]): PackagingAgentInput['assets'] {
  return refs.map(ref => {
    const parts = ref.split(':');
    if (parts.length < 3) {
      throw new Error(`Invalid asset reference format: ${ref}. Use format: registry_id:type:version`);
    }

    const [registry_id, type, version] = parts;

    // Validate type
    const validTypes: PackageableAssetType[] = ['agent', 'template', 'workflow', 'bundle', 'plugin', 'extension'];
    if (!validTypes.includes(type as PackageableAssetType)) {
      throw new Error(`Invalid asset type: ${type}. Valid types: ${validTypes.join(', ')}`);
    }

    return {
      registry_id,
      type: type as PackageableAssetType,
      version,
      name: registry_id.split('/').pop() || registry_id,
    };
  });
}

/**
 * Print validation result
 */
function printValidation(validation: { valid: boolean; errors: any[]; warnings: any[]; metadata_completeness: number; compatibility_score: number }): void {
  console.log('\n' + '='.repeat(50));
  console.log(`Validation: ${validation.valid ? '✓ PASSED' : '✗ FAILED'}`);
  console.log('='.repeat(50));

  console.log(`\nMetadata Completeness: ${validation.metadata_completeness}%`);
  console.log(`Compatibility Score: ${validation.compatibility_score}%`);

  if (validation.errors.length > 0) {
    console.log('\nErrors:');
    validation.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.severity}] ${e.code}: ${e.message}`);
      if (e.field) {
        console.log(`     Field: ${e.field}`);
      }
    });
  }

  if (validation.warnings.length > 0) {
    console.log('\nWarnings:');
    validation.warnings.forEach((w, i) => {
      console.log(`  ${i + 1}. ⚠ ${w.code}: ${w.message}`);
      if (w.field) {
        console.log(`     Field: ${w.field}`);
      }
    });
  }
}

/**
 * Print result in human-readable format
 */
function printResult(output: {
  success: boolean;
  result_code: string;
  message: string;
  artifact?: any;
  validation: any;
  resolved_assets?: any[];
  metrics?: any;
}): void {
  console.log('\n' + '='.repeat(50));
  console.log(`Status: ${output.success ? '✓ SUCCESS' : '✗ FAILED'}`);
  console.log(`Code: ${output.result_code}`);
  console.log(`Message: ${output.message}`);
  console.log('='.repeat(50));

  if (output.artifact) {
    console.log('\nArtifact:');
    console.log(`  ID: ${output.artifact.id}`);
    console.log(`  Package: ${output.artifact.package_ref}`);
    console.log(`  Format: ${output.artifact.format}`);
    console.log(`  Size: ${formatSize(output.artifact.size)}`);
    console.log(`  Checksum: ${output.artifact.checksum}`);
    console.log(`  Files: ${output.artifact.manifest.length}`);
    console.log(`  Created: ${output.artifact.created_at}`);
  }

  if (output.resolved_assets && output.resolved_assets.length > 0) {
    console.log('\nResolved Assets:');
    output.resolved_assets.forEach((asset, i) => {
      console.log(`  ${i + 1}. ${asset.name}`);
      console.log(`     Registry: ${asset.registry_id}`);
      console.log(`     Requested: ${asset.requested_version} -> Resolved: ${asset.resolved_version}`);
    });
  }

  printValidation(output.validation);

  if (output.metrics) {
    console.log('\nMetrics:');
    console.log(`  Execution Time: ${output.metrics.execution_time_ms}ms`);
    console.log(`  Assets Processed: ${output.metrics.assets_processed}`);
    console.log(`  Total Input Size: ${formatSize(output.metrics.total_input_size)}`);
    if (output.metrics.compression_ratio) {
      console.log(`  Compression Ratio: ${output.metrics.compression_ratio.toFixed(2)}x`);
    }
  }
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Handle validation errors
 */
function handleValidationError(error: { issues: { path: (string | number)[]; message: string }[] }, json: boolean): void {
  const errors = error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

  if (json) {
    console.log(JSON.stringify({
      success: false,
      error: {
        code: 'SCHEMA_VALIDATION_ERROR',
        message: 'Input validation failed',
        details: errors,
      },
    }, null, 2));
  } else {
    console.error('\n✗ Schema Validation Error:');
    errors.forEach((e, i) => {
      console.error(`  ${i + 1}. ${e.path}: ${e.message}`);
    });
  }
}

/**
 * Handle errors
 */
function handleError(error: unknown, json: boolean): void {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  if (json) {
    console.log(JSON.stringify({
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
    }, null, 2));
  } else {
    console.error('\n✗ Error:', errorMessage);
    if (process.env.DEBUG && error instanceof Error) {
      console.error(error.stack);
    }
  }

  process.exit(1);
}

// Parse arguments
program.parse();
