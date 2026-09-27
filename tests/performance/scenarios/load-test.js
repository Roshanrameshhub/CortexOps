/**
 * Load Test Scenario
 *
 * Simulates realistic production load to test system capacity and stability.
 * Gradually increases load to identify performance degradation points.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import {
  getServiceURL,
  generateTestData,
  createTags,
  standardThresholds,
  loadTestStages,
} from '../config/k6.config.js';

// Custom metrics
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');

// Test configuration
export const options = {
  stages: loadTestStages,
  thresholds: {
    ...standardThresholds,
    'http_req_duration': ['p(95)<800', 'p(99)<1500'],  // More relaxed for load test
    'http_req_failed': ['rate<0.05'],  // Allow up to 5% errors under load
  },
  tags: {
    test_type: 'load_test',
    environment: __ENV.TEST_ENV || 'local',
  },
};

export function setup() {
  console.log('🔥 Starting Load Test');
  console.log(`📊 Max Virtual Users: 100`);
  console.log(`⏱️  Duration: ${loadTestStages.reduce((acc, stage) => acc + parseInt(stage.duration), 0)}s`);
  console.log('');

  return { startTime: Date.now() };
}

export default function () {
  const testData = generateTestData();

  // Simulate realistic user behavior
  group('User Journey: Browse and Search', function () {
    // 1. User visits homepage / health check
    const healthUrl = getServiceURL('discovery', '/health');
    let response = http.get(healthUrl, { tags: createTags('load_test', 'health') });
    check(response, { 'health check ok': (r) => r.status === 200 });
    sleep(1);

    // 2. User searches for services
    const searchUrl = getServiceURL('discovery', `/api/v1/search?q=${testData.searchQuery}`);
    const startTime = Date.now();
    response = http.get(searchUrl, { tags: createTags('load_test', 'search') });
    const duration = Date.now() - startTime;

    const success = check(response, {
      'search status ok': (r) => r.status === 200,
      'search has results': (r) => {
        try {
          return JSON.parse(r.body).results !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    requestDuration.add(duration);
    errorRate.add(!success);
    sleep(2);

    // 3. User views categories
    const categoriesUrl = getServiceURL('discovery', '/api/v1/categories');
    response = http.get(categoriesUrl, { tags: createTags('load_test', 'categories') });
    check(response, { 'categories ok': (r) => r.status === 200 });
    sleep(1);

    // 4. User filters by category
    const filterUrl = getServiceURL('discovery', `/api/v1/search?category=${testData.category}`);
    response = http.get(filterUrl, { tags: createTags('load_test', 'filter') });
    check(response, { 'filter ok': (r) => r.status === 200 });
    sleep(1);
  });

  // Simulate different user behaviors with weighted distribution
  const userBehavior = Math.random();

  if (userBehavior < 0.6) {
    // 60% of users just browse
    sleep(3);
  } else if (userBehavior < 0.9) {
    // 30% of users check service details
    group('User Journey: View Service Details', function () {
      const listUrl = getServiceURL('publishing', '/api/v1/services');
      const response = http.get(listUrl, { tags: createTags('load_test', 'list_services') });
      check(response, { 'list services ok': (r) => r.status === 200 });
      sleep(2);
    });
  } else {
    // 10% of users check usage/quota
    group('User Journey: Check Usage', function () {
      const apiKey = __ENV.TEST_API_KEY || 'test-api-key';
      const usageUrl = getServiceURL('consumption', '/api/v1/usage');
      const response = http.get(usageUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        tags: createTags('load_test', 'usage'),
      });
      check(response, { 'usage check ok': (r) => [200, 401].includes(r.status) });
      sleep(1);
    });
  }

  // Random think time between 1-5 seconds
  sleep(Math.random() * 4 + 1);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('');
  console.log('✅ Load Test Complete');
  console.log(`⏱️  Total Duration: ${duration.toFixed(2)}s`);
}

export function handleSummary(data) {
  return {
    'stdout': generateTextSummary(data),
    './reports/load-test-summary.json': JSON.stringify(data, null, 2),
  };
}

function generateTextSummary(data) {
  let summary = '\n📊 Load Test Summary\n';
  summary += '='.repeat(50) + '\n\n';

  if (data.metrics.http_reqs) {
    summary += `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
    summary += `Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s\n`;
    summary += `Average Latency: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += `P95 Latency: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `P99 Latency: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
    summary += `Max Latency: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n`;
    summary += `Error Rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
    summary += `Data Received: ${(data.metrics.data_received.values.count / 1024 / 1024).toFixed(2)} MB\n`;
    summary += `Data Sent: ${(data.metrics.data_sent.values.count / 1024 / 1024).toFixed(2)} MB\n`;
  }

  summary += '\n';
  return summary;
}
