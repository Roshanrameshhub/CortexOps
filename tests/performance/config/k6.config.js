/**
 * k6 Performance Test Configuration
 *
 * This file contains shared configuration and thresholds for all k6 tests.
 */

import { URL } from 'https://jslib.k6.io/url/1.0.0/index.js';

// Load environment variables
const env = {
  BASE_URL: __ENV.BASE_URL || 'http://localhost:3000',
  PUBLISHING_SERVICE_URL: __ENV.PUBLISHING_SERVICE_URL || 'http://localhost:3001',
  DISCOVERY_SERVICE_URL: __ENV.DISCOVERY_SERVICE_URL || 'http://localhost:3002',
  CONSUMPTION_SERVICE_URL: __ENV.CONSUMPTION_SERVICE_URL || 'http://localhost:3003',
  ADMIN_SERVICE_URL: __ENV.ADMIN_SERVICE_URL || 'http://localhost:3004',

  // Thresholds
  P95_LATENCY_THRESHOLD: parseInt(__ENV.P95_LATENCY_THRESHOLD) || 500,
  P99_LATENCY_THRESHOLD: parseInt(__ENV.P99_LATENCY_THRESHOLD) || 1000,
  ERROR_RATE_THRESHOLD: parseFloat(__ENV.ERROR_RATE_THRESHOLD) || 1,
  SUCCESS_RATE_THRESHOLD: parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) || 99,
};

/**
 * Standard k6 thresholds for all tests
 */
export const standardThresholds = {
  // HTTP request duration
  'http_req_duration': [
    `p(95)<${env.P95_LATENCY_THRESHOLD}`,  // 95% of requests must complete below threshold
    `p(99)<${env.P99_LATENCY_THRESHOLD}`,  // 99% of requests must complete below threshold
  ],

  // HTTP request failed rate
  'http_req_failed': [
    `rate<${env.ERROR_RATE_THRESHOLD / 100}`,  // Error rate must be below threshold
  ],

  // Success rate
  'checks': [
    `rate>${env.SUCCESS_RATE_THRESHOLD / 100}`,  // Success rate must be above threshold
  ],

  // Request rate
  'http_reqs': ['count>0'],  // At least some requests were made

  // Data transfer
  'data_received': ['count>0'],
  'data_sent': ['count>0'],
};

/**
 * Load test stages configuration
 */
export const loadTestStages = [
  { duration: '30s', target: 10 },   // Ramp up to 10 users
  { duration: '1m', target: 50 },    // Ramp up to 50 users
  { duration: '3m', target: 50 },    // Stay at 50 users
  { duration: '1m', target: 100 },   // Ramp up to 100 users
  { duration: '3m', target: 100 },   // Stay at 100 users
  { duration: '30s', target: 0 },    // Ramp down to 0
];

/**
 * Spike test stages configuration
 */
export const spikeTestStages = [
  { duration: '10s', target: 10 },   // Ramp up to 10 users
  { duration: '10s', target: 500 },  // Spike to 500 users
  { duration: '1m', target: 500 },   // Stay at 500 users
  { duration: '10s', target: 10 },   // Drop back to 10 users
  { duration: '30s', target: 0 },    // Ramp down to 0
];

/**
 * Soak test stages configuration
 */
export const soakTestStages = [
  { duration: '2m', target: 50 },    // Ramp up to 50 users
  { duration: '2h', target: 50 },    // Stay at 50 users for 2 hours
  { duration: '2m', target: 0 },     // Ramp down to 0
];

/**
 * Stress test stages configuration
 */
export const stressTestStages = [
  { duration: '2m', target: 100 },   // Ramp up to 100 users
  { duration: '2m', target: 200 },   // Ramp up to 200 users
  { duration: '2m', target: 400 },   // Ramp up to 400 users
  { duration: '2m', target: 600 },   // Ramp up to 600 users
  { duration: '2m', target: 800 },   // Ramp up to 800 users
  { duration: '2m', target: 1000 },  // Ramp up to 1000 users
  { duration: '5m', target: 1000 },  // Stay at 1000 users
  { duration: '2m', target: 0 },     // Ramp down to 0
];

/**
 * Custom thresholds for specific scenarios
 */
export const apiThresholds = {
  ...standardThresholds,
  'http_req_duration{scenario:api_health}': ['p(95)<100'],
  'http_req_duration{scenario:api_search}': ['p(95)<300'],
  'http_req_duration{scenario:api_publish}': ['p(95)<500'],
  'http_req_duration{scenario:api_consume}': ['p(95)<200'],
};

export const workflowThresholds = {
  ...standardThresholds,
  'http_req_duration{scenario:workflow_publish}': ['p(95)<800'],
  'http_req_duration{scenario:workflow_search}': ['p(95)<400'],
  'http_req_duration{scenario:workflow_consume}': ['p(95)<300'],
};

/**
 * Test configuration options
 */
export const testOptions = {
  // Discard response bodies by default to save memory
  discardResponseBodies: true,

  // Connection settings
  noConnectionReuse: false,
  noVUConnectionReuse: false,

  // HTTP settings
  userAgent: 'k6-performance-test/1.0.0',

  // Batch settings
  batch: 10,
  batchPerHost: 5,

  // Rate limiting
  rps: 1000,  // Max requests per second

  // Timeout settings
  httpDebug: 'full',
  insecureSkipTLSVerify: true,
};

/**
 * Helper function to build service URL
 */
export function getServiceURL(service, path = '') {
  const baseUrls = {
    publishing: env.PUBLISHING_SERVICE_URL,
    discovery: env.DISCOVERY_SERVICE_URL,
    consumption: env.CONSUMPTION_SERVICE_URL,
    admin: env.ADMIN_SERVICE_URL,
  };

  const baseUrl = baseUrls[service] || env.BASE_URL;
  return new URL(path, baseUrl).toString();
}

/**
 * Helper function to generate random test data
 */
export function generateTestData() {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);

  return {
    serviceName: `perf-test-service-${randomId}`,
    version: '1.0.0',
    category: ['text-generation', 'embeddings', 'classification', 'summarization'][Math.floor(Math.random() * 4)],
    searchQuery: ['generation', 'embedding', 'classification', 'summarization', 'text'][Math.floor(Math.random() * 5)],
    timestamp: timestamp,
    randomId: randomId,
  };
}

/**
 * Helper function to create custom tags
 */
export function createTags(scenario, endpoint) {
  return {
    scenario: scenario,
    endpoint: endpoint,
    test_run: __ENV.TEST_RUN_ID || 'local',
  };
}

export { env };
