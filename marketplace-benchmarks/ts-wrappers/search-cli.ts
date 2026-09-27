#!/usr/bin/env node

/**
 * CLI wrapper for benchmarking discovery search operations
 * Simulates full-text search, faceted search, and recommendation queries
 */

interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  rating: number;
  downloads: number;
  provider: string;
}

interface SearchResult {
  service: Service;
  score: number;
  matchedFields: string[];
}

interface BenchmarkMetrics {
  operation: string;
  durationMs: number;
  itemsProcessed: number;
  success: boolean;
  timestamp: string;
  searchStats?: {
    totalResults: number;
    topScore: number;
    avgScore: number;
  };
}

// Mock service catalog for search
const SERVICE_CATALOG: Service[] = Array.from({ length: 2000 }, (_, i) => ({
  id: `svc_${i.toString().padStart(6, '0')}`,
  name: `${['GPT', 'BERT', 'Vision', 'Audio', 'Translation'][i % 5]} Service ${i}`,
  description: `Advanced ${['text generation', 'image processing', 'speech recognition', 'data analysis', 'translation'][i % 5]} service for ${['enterprise', 'research', 'production', 'development'][i % 4]} use cases`,
  category: ['ai-models', 'data-processing', 'analytics', 'storage', 'compute'][i % 5],
  tags: [
    `tag${i % 20}`,
    `type${i % 10}`,
    ['nlp', 'vision', 'audio', 'multimodal', 'analytics'][i % 5],
  ],
  rating: 3.0 + (i % 20) / 10,
  downloads: i * 50,
  provider: ['openai', 'anthropic', 'huggingface', 'google', 'meta'][i % 5],
}));

function calculateSearchScore(service: Service, query: string): number {
  let score = 0;
  const queryLower = query.toLowerCase();

  // Name match (highest weight)
  if (service.name.toLowerCase().includes(queryLower)) {
    score += 10;
  }

  // Description match
  if (service.description.toLowerCase().includes(queryLower)) {
    score += 5;
  }

  // Tag match
  if (service.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
    score += 3;
  }

  // Category match
  if (service.category.toLowerCase().includes(queryLower)) {
    score += 2;
  }

  // Boost by popularity
  score += Math.log10(service.downloads + 1) * 0.1;
  score += service.rating * 0.5;

  return score;
}

async function fullTextSearch(query: string, limit: number = 20): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    // Simulate search index overhead
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));

    const results: SearchResult[] = [];

    for (const service of SERVICE_CATALOG) {
      const score = calculateSearchScore(service, query);
      if (score > 0) {
        const matchedFields: string[] = [];
        const queryLower = query.toLowerCase();

        if (service.name.toLowerCase().includes(queryLower)) matchedFields.push('name');
        if (service.description.toLowerCase().includes(queryLower)) matchedFields.push('description');
        if (service.tags.some(t => t.toLowerCase().includes(queryLower))) matchedFields.push('tags');

        results.push({ service, score, matchedFields });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    const endTime = performance.now();

    const avgScore = topResults.length > 0
      ? topResults.reduce((sum, r) => sum + r.score, 0) / topResults.length
      : 0;

    return {
      operation: 'full_text_search',
      durationMs: endTime - startTime,
      itemsProcessed: topResults.length,
      success: true,
      timestamp: new Date().toISOString(),
      searchStats: {
        totalResults: results.length,
        topScore: topResults[0]?.score || 0,
        avgScore,
      },
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'full_text_search',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function facetedSearch(
  category?: string,
  tags?: string[],
  minRating?: number
): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 4));

    let filtered = SERVICE_CATALOG.slice();

    if (category) {
      filtered = filtered.filter(s => s.category === category);
    }

    if (tags && tags.length > 0) {
      filtered = filtered.filter(s =>
        tags.some(tag => s.tags.includes(tag))
      );
    }

    if (minRating !== undefined) {
      filtered = filtered.filter(s => s.rating >= minRating);
    }

    // Sort by relevance (downloads * rating)
    filtered.sort((a, b) => (b.downloads * b.rating) - (a.downloads * a.rating));

    const endTime = performance.now();

    return {
      operation: 'faceted_search',
      durationMs: endTime - startTime,
      itemsProcessed: filtered.length,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'faceted_search',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function recommendationQuery(
  userId: string,
  limit: number = 10
): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    // Simulate ML model inference overhead
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));

    // Simple recommendation: top-rated popular services
    const recommendations = SERVICE_CATALOG
      .filter(s => s.rating >= 4.0)
      .sort((a, b) => (b.rating * Math.log10(b.downloads + 1)) - (a.rating * Math.log10(a.downloads + 1)))
      .slice(0, limit);

    const endTime = performance.now();

    return {
      operation: 'recommendation_query',
      durationMs: endTime - startTime,
      itemsProcessed: recommendations.length,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'recommendation_query',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function categoryAggregation(): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3));

    const categoryCounts = new Map<string, number>();

    for (const service of SERVICE_CATALOG) {
      categoryCounts.set(
        service.category,
        (categoryCounts.get(service.category) || 0) + 1
      );
    }

    const endTime = performance.now();

    return {
      operation: 'category_aggregation',
      durationMs: endTime - startTime,
      itemsProcessed: categoryCounts.size,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'category_aggregation',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function multiQuerySearch(queries: string[]): Promise<BenchmarkMetrics> {
  const startTime = performance.now();
  let totalResults = 0;

  try {
    for (const query of queries) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2));

      const results = SERVICE_CATALOG.filter(service =>
        calculateSearchScore(service, query) > 0
      );

      totalResults += results.length;
    }

    const endTime = performance.now();

    return {
      operation: 'multi_query_search',
      durationMs: endTime - startTime,
      itemsProcessed: totalResults,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'multi_query_search',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const operation = args[0] || 'search';

  let result: BenchmarkMetrics;

  switch (operation) {
    case 'search':
      const query = args[1] || 'text generation';
      const limit = parseInt(args[2] || '20', 10);
      result = await fullTextSearch(query, limit);
      break;
    case 'faceted':
      const category = args[1];
      const tags = args[2] ? args[2].split(',') : undefined;
      const minRating = args[3] ? parseFloat(args[3]) : undefined;
      result = await facetedSearch(category, tags, minRating);
      break;
    case 'recommendations':
      const userId = args[1] || 'user_123';
      const recLimit = parseInt(args[2] || '10', 10);
      result = await recommendationQuery(userId, recLimit);
      break;
    case 'aggregate':
      result = await categoryAggregation();
      break;
    case 'multi':
      const queries = args.slice(1);
      if (queries.length === 0) {
        queries.push('text', 'image', 'audio');
      }
      result = await multiQuerySearch(queries);
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
