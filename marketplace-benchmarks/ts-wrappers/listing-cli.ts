#!/usr/bin/env node

/**
 * CLI wrapper for benchmarking service listing operations
 * Simulates service repository search operations
 */

interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  provider: string;
}

interface BenchmarkMetrics {
  operation: string;
  durationMs: number;
  itemsProcessed: number;
  success: boolean;
  timestamp: string;
}

// Mock service data for benchmarking
const MOCK_SERVICES: Service[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `svc_${i.toString().padStart(6, '0')}`,
  name: `Service ${i}`,
  description: `Description for service ${i}`,
  category: ['ai-models', 'data-processing', 'analytics', 'storage'][i % 4],
  tags: [`tag${i % 10}`, `category${i % 5}`, `type${i % 3}`],
  version: `${Math.floor(i / 100)}.${Math.floor(i / 10) % 10}.${i % 10}`,
  provider: ['openai', 'anthropic', 'huggingface', 'custom'][i % 4],
}));

async function listAllServices(): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    // Simulate database query overhead
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));

    const services = MOCK_SERVICES.slice();
    const endTime = performance.now();

    return {
      operation: 'list_all_services',
      durationMs: endTime - startTime,
      itemsProcessed: services.length,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'list_all_services',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function searchServicesByCategory(category: string): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3));

    const filtered = MOCK_SERVICES.filter(s => s.category === category);
    const endTime = performance.now();

    return {
      operation: 'search_by_category',
      durationMs: endTime - startTime,
      itemsProcessed: filtered.length,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'search_by_category',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function getServiceById(id: string): Promise<BenchmarkMetrics> {
  const startTime = performance.now();

  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2));

    const service = MOCK_SERVICES.find(s => s.id === id);
    const endTime = performance.now();

    return {
      operation: 'get_by_id',
      durationMs: endTime - startTime,
      itemsProcessed: service ? 1 : 0,
      success: !!service,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'get_by_id',
      durationMs: endTime - startTime,
      itemsProcessed: 0,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function paginatedListing(pageSize: number, pages: number): Promise<BenchmarkMetrics> {
  const startTime = performance.now();
  let totalItems = 0;

  try {
    for (let i = 0; i < pages; i++) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2));
      const offset = i * pageSize;
      const page = MOCK_SERVICES.slice(offset, offset + pageSize);
      totalItems += page.length;
    }

    const endTime = performance.now();

    return {
      operation: 'paginated_listing',
      durationMs: endTime - startTime,
      itemsProcessed: totalItems,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      operation: 'paginated_listing',
      durationMs: endTime - startTime,
      itemsProcessed: totalItems,
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const operation = args[0] || 'list_all';

  let result: BenchmarkMetrics;

  switch (operation) {
    case 'list_all':
      result = await listAllServices();
      break;
    case 'search_category':
      result = await searchServicesByCategory(args[1] || 'ai-models');
      break;
    case 'get_by_id':
      result = await getServiceById(args[1] || 'svc_000000');
      break;
    case 'paginated':
      const pageSize = parseInt(args[1] || '20', 10);
      const pages = parseInt(args[2] || '10', 10);
      result = await paginatedListing(pageSize, pages);
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
