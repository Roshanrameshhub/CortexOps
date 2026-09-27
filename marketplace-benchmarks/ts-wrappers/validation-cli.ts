#!/usr/bin/env node

/**
 * CLI wrapper for benchmarking metadata validation operations
 * Simulates service manifest validation, schema checking, and compliance verification
 */

interface ValidationRule {
  name: string;
  validate: (data: any) => boolean;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface BenchmarkMetrics {
  operation: string;
  durationMs: number;
  itemsProcessed: number;
  success: boolean;
  timestamp: string;
  validationStats?: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

// Validation rules
const VALIDATION_RULES: ValidationRule[] = [
  {
    name: 'required_fields',
    validate: (data) => {
      return !!(data.name && data.description && data.version);
    },
    severity: 'error',
  },
  {
    name: 'version_format',
    validate: (data) => {
      return /^\d+\.\d+\.\d+$/.test(data.version);
    },
    severity: 'error',
  },
  {
    name: 'name_length',
    validate: (data) => {
      return data.name && data.name.length >= 3 && data.name.length <= 100;
    },
    severity: 'error',
  },
  {
    name: 'description_length',
    validate: (data) => {
      return data.description && data.description.length >= 10 && data.description.length <= 500;
    },
    severity: 'warning',
  },
  {
    name: 'tags_present',
    validate: (data) => {
      return Array.isArray(data.tags) && data.tags.length > 0;
    },
    severity: 'warning',
  },
  {
    name: 'category_valid',
    validate: (data) => {
      const validCategories = ['ai-models', 'data-processing', 'analytics', 'storage', 'compute'];
      return validCategories.includes(data.category);
    },
    severity: 'error',
  },
  {
    name: 'license_specified',
    validate: (data) => {
      return !!data.license;
    },
    severity: 'warning',
  },
  {
    name: 'pricing_valid',
    validate: (data) => {
      return data.pricing && typeof data.pricing === 'object';
    },
    severity: 'error',
  },
];

// Generate mock service manifests
function generateMockManifest(index: number, valid: boolean = true): any {
  const base = {
    name: valid ? `Service ${index}` : index % 3 === 0 ? '' : `Service ${index}`,
    description: valid ? `Description for service ${index} with sufficient detail` : index % 5 === 0 ? 'Short' : `Description for service ${index} with sufficient detail`,
    version: valid ? `${Math.floor(index / 100)}.${Math.floor(index / 10) % 10}.${index % 10}` : index % 7 === 0 ? 'invalid' : `${Math.floor(index / 100)}.${Math.floor(index / 10) % 10}.${index % 10}`,
    category: valid ? 'ai-models' : index % 11 === 0 ? 'invalid-category' : 'ai-models',
    tags: valid ? ['tag1', 'tag2'] : index % 13 === 0 ? [] : ['tag1', 'tag2'],
    license: valid ? 'MIT' : index % 17 === 0 ? undefined : 'MIT',
    pricing: valid ? { model: 'free' } : index % 19 === 0 ? null : { model: 'free' },
  };

  return base;
}

async function validateManifest(manifest: any): Promise<ValidationResult> {
  // Simulate validation overhead
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1));

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of VALIDATION_RULES) {
    if (!rule.validate(manifest)) {
      if (rule.severity === 'error') {
        errors.push(`Validation failed: ${rule.name}`);
      } else {
        warnings.push(`Validation warning: ${rule.name}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

async function validateSingleManifest(valid: boolean = true): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    const manifest = generateMockManifest(0, valid);
    const result = await validateManifest(manifest);
    const endTime = performance.now();

    return {
      operation: 'validate_single',
      durationMs: endTime - startTime,
      itemsProcessed: 1,
      success: result.valid,
      timestamp: new Date().toISOString(),
      validationStats: {
        totalChecks: VALIDATION_RULES.length,
        passed: VALIDATION_RULES.length - result.errors.length - result.warnings.length,
        failed: result.errors.length,
        warnings: result.warnings.length,
      },
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'validate_single',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function validateBatch(count: number, validRatio: number = 0.8): Promise<BenchmarkMetrics> {
  const startTime = performance.now();
  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  try {
    for (let i = 0; i < count; i++) {
      const shouldBeValid = Math.random() < validRatio;
      const manifest = generateMockManifest(i, shouldBeValid);
      const result = await validateManifest(manifest);

      if (result.valid) {
        totalPassed++;
      } else {
        totalFailed += result.errors.length;
      }
      totalWarnings += result.warnings.length;
    }

    const endTime = performance.now();

    return {
      operation: 'validate_batch',
      durationMs: endTime - startTime,
      itemsProcessed: count,
      success: true,
      timestamp: new Date().toISOString(),
      validationStats: {
        totalChecks: count * VALIDATION_RULES.length,
        passed: totalPassed,
        failed: totalFailed,
        warnings: totalWarnings,
      },
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'validate_batch',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function validateSchemaCompliance(strictMode: boolean = false): Promise<BenchmarkMetrics> {
  const startTime = performance.now();
  let itemsProcessed = 0;

  try {
    const manifests = Array.from({ length: 50 }, (_, i) => generateMockManifest(i, true));

    for (const manifest of manifests) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 0.5));

      // Additional schema checks for strict mode
      if (strictMode) {
        const hasAllOptionalFields = !!(
          manifest.tags?.length &&
          manifest.license &&
          manifest.pricing
        );
        if (hasAllOptionalFields) itemsProcessed++;
      } else {
        itemsProcessed++;
      }
    }

    const endTime = performance.now();

    return {
      operation: 'schema_compliance',
      durationMs: endTime - startTime,
      itemsProcessed,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'schema_compliance',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const operation = args[0] || 'single';

  let result: BenchmarkMetrics;

  switch (operation) {
    case 'single':
      const valid = args[1] !== 'invalid';
      result = await validateSingleManifest(valid);
      break;
    case 'batch':
      const count = parseInt(args[1] || '100', 10);
      const validRatio = parseFloat(args[2] || '0.8');
      result = await validateBatch(count, validRatio);
      break;
    case 'schema':
      const strictMode = args[1] === 'strict';
      result = await validateSchemaCompliance(strictMode);
      break;
    default:
      console.error(`Unknown operation: ${operation}`);
      process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
