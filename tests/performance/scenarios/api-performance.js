/**
 * API Performance Test
 *
 * Tests the performance of individual API endpoints across all services.
 * Measures response times, throughput, and error rates.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import {
  getServiceURL,
  generateTestData,
  createTags,
  apiThresholds,
  loadTestStages,
} from '../config/k6.config.js';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const publishLatency = new Trend('publish_latency');
const searchLatency = new Trend('search_latency');
const consumeLatency = new Trend('consume_latency');
const requestCounter = new Counter('request_count');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Warm up
    { duration: '1m', target: 50 },    // Normal load
    { duration: '2m', target: 50 },    // Sustain
    { duration: '30s', target: 0 },    // Cool down
  ],

  thresholds: apiThresholds,

  tags: {
    test_type: 'api_performance',
    environment: __ENV.TEST_ENV || 'local',
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// Test setup (runs once)
export function setup() {
  console.log('🚀 Starting API Performance Test');
  console.log(`📊 Target: ${__ENV.BASE_URL || 'localhost'}`);
  console.log(`👥 Virtual Users: ${__VU}`);
  console.log('');

  // Warm up services
  const warmupEndpoints = [
    getServiceURL('publishing', '/health'),
    getServiceURL('discovery', '/health'),
    getServiceURL('consumption', '/health'),
    getServiceURL('admin', '/health'),
  ];

  warmupEndpoints.forEach(url => {
    http.get(url);
  });

  return {
    startTime: Date.now(),
  };
}

// Main test scenario
export default function (data) {
  const testData = generateTestData();

  // Test 1: Health Check Endpoints
  group('Health Checks', function () {
    testHealthEndpoints();
  });

  sleep(0.5);

  // Test 2: Publishing Service API
  group('Publishing Service', function () {
    testPublishingAPI(testData);
  });

  sleep(0.5);

  // Test 3: Discovery Service API
  group('Discovery Service', function () {
    testDiscoveryAPI(testData);
  });

  sleep(0.5);

  // Test 4: Consumption Service API
  group('Consumption Service', function () {
    testConsumptionAPI(testData);
  });

  sleep(1);
}

/**
 * Test health check endpoints
 */
function testHealthEndpoints() {
  const services = ['publishing', 'discovery', 'consumption', 'admin'];

  services.forEach(service => {
    const url = getServiceURL(service, '/health');
    const tags = createTags('api_health', `${service}_health`);

    const startTime = Date.now();
    const response = http.get(url, { tags });
    const duration = Date.now() - startTime;

    const success = check(response, {
      [`${service}: status is 200`]: (r) => r.status === 200,
      [`${service}: response time < 100ms`]: () => duration < 100,
      [`${service}: has status field`]: (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status !== undefined;
        } catch (e) {
          return false;
        }
      },
    }, tags);

    apiLatency.add(duration, tags);
    errorRate.add(!success);
    requestCounter.add(1, tags);
  });
}

/**
 * Test Publishing Service endpoints
 */
function testPublishingAPI(testData) {
  const baseUrl = getServiceURL('publishing');
  const tags = createTags('api_publish', 'publishing');

  // Test: List services
  group('List Services', function () {
    const startTime = Date.now();
    const response = http.get(`${baseUrl}/api/v1/services`, {
      tags: { ...tags, operation: 'list' },
    });
    const duration = Date.now() - startTime;

    check(response, {
      'list services: status is 200': (r) => r.status === 200,
      'list services: response time < 300ms': () => duration < 300,
      'list services: has services array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.services);
        } catch (e) {
          return false;
        }
      },
    }, tags);

    publishLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });

  // Test: Get service by ID (simulate with known ID)
  group('Get Service', function () {
    const serviceId = '123e4567-e89b-12d3-a456-426614174000';  // Example UUID
    const startTime = Date.now();
    const response = http.get(`${baseUrl}/api/v1/services/${serviceId}`, {
      tags: { ...tags, operation: 'get' },
    });
    const duration = Date.now() - startTime;

    check(response, {
      'get service: status is 200 or 404': (r) => [200, 404].includes(r.status),
      'get service: response time < 200ms': () => duration < 200,
    }, tags);

    publishLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });

  // Test: Create service (without actual creation in perf test)
  group('Validate Service Data', function () {
    const serviceData = {
      name: testData.serviceName,
      version: testData.version,
      category: testData.category,
      description: 'Performance test service',
      endpoint: 'https://example.com/api',
      pricing: {
        model: 'per-token',
        price: 0.001,
        currency: 'USD',
      },
      sla: {
        availability: 99.9,
        latency: 200,
        support: '24/7',
      },
    };

    const startTime = Date.now();
    const response = http.post(
      `${baseUrl}/api/v1/services/validate`,
      JSON.stringify(serviceData),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { ...tags, operation: 'validate' },
      }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'validate service: status is 200 or 400': (r) => [200, 400].includes(r.status),
      'validate service: response time < 500ms': () => duration < 500,
    }, tags);

    publishLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });
}

/**
 * Test Discovery Service endpoints
 */
function testDiscoveryAPI(testData) {
  const baseUrl = getServiceURL('discovery');
  const tags = createTags('api_search', 'discovery');

  // Test: Search services
  group('Search Services', function () {
    const startTime = Date.now();
    const response = http.get(
      `${baseUrl}/api/v1/search?q=${testData.searchQuery}`,
      { tags: { ...tags, operation: 'search' } }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'search: status is 200': (r) => r.status === 200,
      'search: response time < 300ms': () => duration < 300,
      'search: has results array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.results);
        } catch (e) {
          return false;
        }
      },
    }, tags);

    searchLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });

  // Test: Get recommendations
  group('Get Recommendations', function () {
    const startTime = Date.now();
    const response = http.get(
      `${baseUrl}/api/v1/recommendations`,
      { tags: { ...tags, operation: 'recommendations' } }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'recommendations: status is 200': (r) => r.status === 200,
      'recommendations: response time < 400ms': () => duration < 400,
    }, tags);

    searchLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });

  // Test: Get categories
  group('Get Categories', function () {
    const startTime = Date.now();
    const response = http.get(
      `${baseUrl}/api/v1/categories`,
      { tags: { ...tags, operation: 'categories' } }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'categories: status is 200': (r) => r.status === 200,
      'categories: response time < 200ms': () => duration < 200,
      'categories: has categories array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.categories);
        } catch (e) {
          return false;
        }
      },
    }, tags);

    searchLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });

  // Test: Filter by category
  group('Filter by Category', function () {
    const startTime = Date.now();
    const response = http.get(
      `${baseUrl}/api/v1/search?category=${testData.category}`,
      { tags: { ...tags, operation: 'filter' } }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'filter: status is 200': (r) => r.status === 200,
      'filter: response time < 300ms': () => duration < 300,
    }, tags);

    searchLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });
}

/**
 * Test Consumption Service endpoints
 */
function testConsumptionAPI(testData) {
  const baseUrl = getServiceURL('consumption');
  const tags = createTags('api_consume', 'consumption');
  const apiKey = __ENV.TEST_API_KEY || 'test-api-key';

  // Test: Get usage statistics
  group('Get Usage Stats', function () {
    const startTime = Date.now();
    const response = http.get(
      `${baseUrl}/api/v1/usage`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        tags: { ...tags, operation: 'usage' },
      }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'usage: status is 200 or 401': (r) => [200, 401].includes(r.status),
      'usage: response time < 200ms': () => duration < 200,
    }, tags);

    consumeLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });

  // Test: Get quota information
  group('Get Quota', function () {
    const startTime = Date.now();
    const response = http.get(
      `${baseUrl}/api/v1/quota`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        tags: { ...tags, operation: 'quota' },
      }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'quota: status is 200 or 401': (r) => [200, 401].includes(r.status),
      'quota: response time < 200ms': () => duration < 200,
    }, tags);

    consumeLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });

  // Test: Get SLA metrics
  group('Get SLA Metrics', function () {
    const startTime = Date.now();
    const response = http.get(
      `${baseUrl}/api/v1/sla`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        tags: { ...tags, operation: 'sla' },
      }
    );
    const duration = Date.now() - startTime;

    check(response, {
      'sla: status is 200 or 401': (r) => [200, 401].includes(r.status),
      'sla: response time < 300ms': () => duration < 300,
    }, tags);

    consumeLatency.add(duration, tags);
    requestCounter.add(1, tags);
  });
}

// Teardown (runs once at the end)
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('');
  console.log('✅ API Performance Test Complete');
  console.log(`⏱️  Total Duration: ${duration.toFixed(2)}s`);
  console.log('');
}

/**
 * Custom summary handler
 */
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    './reports/api-performance-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors !== false;

  let summary = '\n';
  summary += `${indent}📊 API Performance Test Summary\n`;
  summary += `${indent}${'='.repeat(50)}\n\n`;

  if (data.metrics.http_reqs) {
    summary += `${indent}📈 Total Requests: ${data.metrics.http_reqs.values.count}\n`;
    summary += `${indent}⏱️  Average Latency: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}📊 P95 Latency: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}📊 P99 Latency: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
    summary += `${indent}✅ Success Rate: ${((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2)}%\n`;
  }

  summary += '\n';
  return summary;
}
