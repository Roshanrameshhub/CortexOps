#!/usr/bin/env node

/**
 * CLI wrapper for benchmarking model registry operations
 * Simulates model lookup, version resolution, and metadata queries
 */

interface ModelMetadata {
  id: string;
  name: string;
  slug: string;
  currentVersion: string;
  category: string;
  tags: string[];
  qualityScore: number;
  downloads: number;
  status: string;
}

interface ModelVersion {
  id: string;
  modelId: string;
  version: string;
  artifacts: {
    modelPath: string;
    modelSize: number;
    modelChecksum: string;
  };
  status: string;
}

interface BenchmarkMetrics {
  operation: string;
  durationMs: number;
  itemsProcessed: number;
  success: boolean;
  timestamp: string;
}

// Mock model registry data
const MOCK_MODELS: ModelMetadata[] = Array.from({ length: 500 }, (_, i) => ({
  id: `mdl_${i.toString().padStart(5, '0')}`,
  name: `Model ${i}`,
  slug: `model-${i}`,
  currentVersion: `${Math.floor(i / 50)}.${Math.floor(i / 10) % 5}.${i % 10}`,
  category: ['text-generation', 'image-classification', 'translation', 'summarization'][i % 4],
  tags: [`tag${i % 8}`, `type${i % 4}`],
  qualityScore: 50 + (i % 50),
  downloads: i * 100,
  status: ['published', 'draft', 'archived'][i % 10 < 7 ? 0 : i % 10 < 9 ? 1 : 2],
}));

const MOCK_VERSIONS: Map<string, ModelVersion[]> = new Map();
MOCK_MODELS.forEach(model => {
  const versions = Array.from({ length: 5 }, (_, v) => ({
    id: `ver_${model.id}_${v}`,
    modelId: model.id,
    version: `${Math.floor(v / 2)}.${v % 2}.0`,
    artifacts: {
      modelPath: `models/${model.id}/${v}/model.bin`,
      modelSize: 1024 * 1024 * (100 + v * 10),
      modelChecksum: `sha256_${model.id}_${v}`,
    },
    status: v === 4 ? 'ready' : 'building',
  }));
  MOCK_VERSIONS.set(model.id, versions);
});

async function lookupModelById(modelId: string): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3));

    const model = MOCK_MODELS.find(m => m.id === modelId);
    const endTime = performance.now();

    return {
      operation: 'lookup_by_id',
      durationMs: endTime - startTime,
      itemsProcessed: model ? 1 : 0,
      success: !!model,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'lookup_by_id',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function resolveModelVersion(modelId: string, version: string): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 4));

    const versions = MOCK_VERSIONS.get(modelId);
    const found = versions?.find(v => v.version === version);
    const endTime = performance.now();

    return {
      operation: 'resolve_version',
      durationMs: endTime - startTime,
      itemsProcessed: found ? 1 : 0,
      success: !!found,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'resolve_version',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function searchModels(filters: { category?: string; minQualityScore?: number }): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));

    let filtered = MOCK_MODELS.slice();

    if (filters.category) {
      filtered = filtered.filter(m => m.category === filters.category);
    }

    if (filters.minQualityScore !== undefined) {
      filtered = filtered.filter(m => m.qualityScore >= filters.minQualityScore);
    }

    const endTime = performance.now();

    return {
      operation: 'search_models',
      durationMs: endTime - startTime,
      itemsProcessed: filtered.length,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'search_models',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function getModelVersions(modelId: string): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3));

    const versions = MOCK_VERSIONS.get(modelId) || [];
    const endTime = performance.now();

    return {
      operation: 'get_versions',
      durationMs: endTime - startTime,
      itemsProcessed: versions.length,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'get_versions',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function bulkModelLookup(count: number): Promise<BenchmarkMetrics> {
  const startTime = performance.now();
  let itemsProcessed = 0;

  try {
    for (let i = 0; i < count; i++) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1));
      const modelId = MOCK_MODELS[i % MOCK_MODELS.length].id;
      const model = MOCK_MODELS.find(m => m.id === modelId);
      if (model) itemsProcessed++;
    }

    const endTime = performance.now();

    return {
      operation: 'bulk_lookup',
      durationMs: endTime - startTime,
      itemsProcessed,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'bulk_lookup',
      durationMs: endTime - startTime,
      itemsProcessed,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const operation = args[0] || 'lookup';

  let result: BenchmarkMetrics;

  switch (operation) {
    case 'lookup':
      result = await lookupModelById(args[1] || 'mdl_00000');
      break;
    case 'resolve_version':
      result = await resolveModelVersion(args[1] || 'mdl_00000', args[2] || '0.0.0');
      break;
    case 'search':
      const category = args[1];
      const minScore = args[2] ? parseInt(args[2], 10) : undefined;
      result = await searchModels({ category, minQualityScore: minScore });
      break;
    case 'get_versions':
      result = await getModelVersions(args[1] || 'mdl_00000');
      break;
    case 'bulk_lookup':
      const count = parseInt(args[1] || '100', 10);
      result = await bulkModelLookup(count);
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
