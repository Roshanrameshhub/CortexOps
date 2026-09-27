#!/usr/bin/env node

/**
 * Performance Comparison Script
 *
 * Compares current test results with baseline to detect regressions.
 * Generates detailed comparison report and fails if regressions detected.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const Table = require('cli-table3');

// Configuration
const config = {
  baselineFile: process.env.BASELINE_FILE || path.join(__dirname, '../baselines/baseline.json'),
  currentResultsFile: process.env.RESULTS_FILE || path.join(__dirname, '../reports/api-performance-summary.json'),
  regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 10, // 10% regression threshold
  failOnRegression: process.env.FAIL_ON_REGRESSION !== 'false',
  outputReport: process.env.REPORT_OUTPUT || path.join(__dirname, '../reports/performance-comparison.json'),
};

/**
 * Main comparison function
 */
async function comparePerformance() {
  console.log(chalk.blue.bold('\n📊 Performance Comparison Report\n'));
  console.log(chalk.gray('='.repeat(80)));
  console.log('');

  // Load baseline and current results
  const baseline = loadJSON(config.baselineFile);
  const current = loadJSON(config.currentResultsFile);

  if (!baseline) {
    console.log(chalk.yellow('⚠️  No baseline found. Current results will be used as baseline.'));
    saveBaseline(current);
    process.exit(0);
  }

  // Compare metrics
  const comparison = compareMetrics(baseline, current);

  // Generate reports
  printConsoleReport(comparison);
  saveComparisonReport(comparison);

  // Check for regressions
  const hasRegressions = checkForRegressions(comparison);

  if (hasRegressions && config.failOnRegression) {
    console.log(chalk.red.bold('\n❌ Performance regression detected!'));
    process.exit(1);
  } else if (hasRegressions) {
    console.log(chalk.yellow.bold('\n⚠️  Performance regression detected (non-failing)'));
    process.exit(0);
  } else {
    console.log(chalk.green.bold('\n✅ No performance regressions detected'));
    process.exit(0);
  }
}

/**
 * Load JSON file
 */
function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(chalk.red(`Error loading ${filePath}:`), error.message);
    return null;
  }
}

/**
 * Save baseline
 */
function saveBaseline(results) {
  try {
    const baselineDir = path.dirname(config.baselineFile);
    if (!fs.existsSync(baselineDir)) {
      fs.mkdirSync(baselineDir, { recursive: true });
    }
    fs.writeFileSync(config.baselineFile, JSON.stringify(results, null, 2));
    console.log(chalk.green(`✅ Baseline saved to ${config.baselineFile}`));
  } catch (error) {
    console.error(chalk.red('Error saving baseline:'), error.message);
  }
}

/**
 * Compare metrics between baseline and current
 */
function compareMetrics(baseline, current) {
  const comparison = {
    timestamp: new Date().toISOString(),
    baseline: extractMetrics(baseline),
    current: extractMetrics(current),
    differences: {},
    regressions: [],
    improvements: [],
  };

  // Compare each metric
  const metricsToCompare = [
    { key: 'http_req_duration_avg', name: 'Average Latency', unit: 'ms' },
    { key: 'http_req_duration_p95', name: 'P95 Latency', unit: 'ms' },
    { key: 'http_req_duration_p99', name: 'P99 Latency', unit: 'ms' },
    { key: 'http_req_duration_max', name: 'Max Latency', unit: 'ms' },
    { key: 'http_req_failed_rate', name: 'Error Rate', unit: '%', inverted: true },
    { key: 'http_reqs_count', name: 'Total Requests', unit: '' },
    { key: 'http_reqs_rate', name: 'Request Rate', unit: '/s' },
  ];

  metricsToCompare.forEach(metric => {
    const baselineValue = comparison.baseline[metric.key];
    const currentValue = comparison.current[metric.key];

    if (baselineValue !== undefined && currentValue !== undefined) {
      const diff = currentValue - baselineValue;
      const diffPercent = (diff / baselineValue) * 100;

      comparison.differences[metric.key] = {
        name: metric.name,
        baseline: baselineValue,
        current: currentValue,
        difference: diff,
        differencePercent: diffPercent,
        unit: metric.unit,
        inverted: metric.inverted || false,
      };

      // Determine if regression or improvement
      const threshold = config.regressionThreshold;
      const isRegression = metric.inverted
        ? diffPercent > threshold  // For inverted metrics (like error rate), increase is bad
        : diffPercent > threshold; // For normal metrics, increase is bad

      const isImprovement = metric.inverted
        ? diffPercent < -threshold
        : diffPercent < -threshold;

      if (isRegression) {
        comparison.regressions.push({
          metric: metric.name,
          key: metric.key,
          ...comparison.differences[metric.key],
        });
      } else if (isImprovement) {
        comparison.improvements.push({
          metric: metric.name,
          key: metric.key,
          ...comparison.differences[metric.key],
        });
      }
    }
  });

  return comparison;
}

/**
 * Extract key metrics from test results
 */
function extractMetrics(results) {
  if (!results || !results.metrics) {
    return {};
  }

  const metrics = results.metrics;

  return {
    // Latency metrics
    http_req_duration_avg: metrics.http_req_duration?.values?.avg,
    http_req_duration_p95: metrics.http_req_duration?.values?.['p(95)'],
    http_req_duration_p99: metrics.http_req_duration?.values?.['p(99)'],
    http_req_duration_max: metrics.http_req_duration?.values?.max,
    http_req_duration_min: metrics.http_req_duration?.values?.min,

    // Request metrics
    http_reqs_count: metrics.http_reqs?.values?.count,
    http_reqs_rate: metrics.http_reqs?.values?.rate,

    // Error metrics
    http_req_failed_rate: metrics.http_req_failed?.values?.rate * 100, // Convert to percentage

    // Data transfer
    data_received: metrics.data_received?.values?.count,
    data_sent: metrics.data_sent?.values?.count,

    // Checks
    checks_pass_rate: metrics.checks?.values?.rate * 100,
  };
}

/**
 * Print comparison report to console
 */
function printConsoleReport(comparison) {
  // Summary table
  const summaryTable = new Table({
    head: [
      chalk.bold('Metric'),
      chalk.bold('Baseline'),
      chalk.bold('Current'),
      chalk.bold('Difference'),
      chalk.bold('Change %'),
      chalk.bold('Status'),
    ],
    colWidths: [25, 15, 15, 15, 12, 12],
  });

  Object.keys(comparison.differences).forEach(key => {
    const diff = comparison.differences[key];
    const change = diff.differencePercent;
    const threshold = config.regressionThreshold;

    let status, statusColor;
    if (Math.abs(change) < threshold) {
      status = '✓ OK';
      statusColor = 'green';
    } else if ((diff.inverted && change > threshold) || (!diff.inverted && change > threshold)) {
      status = '✗ WORSE';
      statusColor = 'red';
    } else {
      status = '↑ BETTER';
      statusColor = 'green';
    }

    const diffStr = change > 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
    const diffValue = diff.difference > 0
      ? `+${diff.difference.toFixed(2)}${diff.unit}`
      : `${diff.difference.toFixed(2)}${diff.unit}`;

    summaryTable.push([
      diff.name,
      `${diff.baseline.toFixed(2)}${diff.unit}`,
      `${diff.current.toFixed(2)}${diff.unit}`,
      diffValue,
      diffStr,
      chalk[statusColor](status),
    ]);
  });

  console.log(summaryTable.toString());
  console.log('');

  // Regressions
  if (comparison.regressions.length > 0) {
    console.log(chalk.red.bold('⚠️  Regressions Detected:'));
    comparison.regressions.forEach(reg => {
      console.log(chalk.red(`   • ${reg.metric}: ${reg.differencePercent.toFixed(2)}% worse`));
      console.log(chalk.gray(`     ${reg.baseline.toFixed(2)}${reg.unit} → ${reg.current.toFixed(2)}${reg.unit}`));
    });
    console.log('');
  }

  // Improvements
  if (comparison.improvements.length > 0) {
    console.log(chalk.green.bold('✨ Improvements:'));
    comparison.improvements.forEach(imp => {
      console.log(chalk.green(`   • ${imp.metric}: ${Math.abs(imp.differencePercent).toFixed(2)}% better`));
      console.log(chalk.gray(`     ${imp.baseline.toFixed(2)}${imp.unit} → ${imp.current.toFixed(2)}${imp.unit}`));
    });
    console.log('');
  }

  // Threshold info
  console.log(chalk.gray(`Regression Threshold: ${config.regressionThreshold}%`));
  console.log(chalk.gray(`Fail on Regression: ${config.failOnRegression}`));
}

/**
 * Save comparison report
 */
function saveComparisonReport(comparison) {
  try {
    const reportDir = path.dirname(config.outputReport);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    fs.writeFileSync(config.outputReport, JSON.stringify(comparison, null, 2));
    console.log(chalk.gray(`\n📄 Report saved: ${config.outputReport}`));
  } catch (error) {
    console.error(chalk.red('Error saving comparison report:'), error.message);
  }
}

/**
 * Check if there are any regressions
 */
function checkForRegressions(comparison) {
  return comparison.regressions.length > 0;
}

// Run comparison
if (require.main === module) {
  comparePerformance().catch(error => {
    console.error(chalk.red('Error running performance comparison:'), error);
    process.exit(1);
  });
}

module.exports = { comparePerformance, compareMetrics, extractMetrics };
