#!/usr/bin/env node
/**
 * Deprecation Agent CLI
 *
 * CLI interface for deprecation operations.
 *
 * Commands:
 * - deprecate: Mark an asset as deprecated
 * - retire: Mark an asset as retired
 * - inspect: Get deprecation status of an asset
 * - impact: Assess consumer impact of deprecating an asset
 * - list-deprecated: List deprecated assets
 */

import { Command } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import {
  DeprecationAgentInput,
  DeprecationReason,
  DeprecatableAssetType,
  DEPRECATION_AGENT_METADATA
} from '@llm-marketplace/agentics-contracts';
import { createDeprecationAgent } from '../core';
import { createRuVectorClient } from '../clients';

const program = new Command();

program
  .name('deprecation-agent')
  .description('LLM Marketplace Deprecation Agent CLI')
  .version(DEPRECATION_AGENT_METADATA.agentVersion);

/**
 * deprecate command
 */
program
  .command('deprecate')
  .description('Mark an asset as deprecated')
  .requiredOption('-a, --asset-id <id>', 'Asset UUID')
  .requiredOption('-t, --asset-type <type>', 'Asset type (service|agent|template|workflow|bundle|plugin)')
  .requiredOption('-r, --reason <reason>', 'Deprecation reason')
  .requiredOption('-d, --description <text>', 'Detailed reason description')
  .option('-v, --version <version>', 'Current asset version', '1.0.0')
  .option('-s, --sunset-date <date>', 'Sunset date (ISO 8601)')
  .option('-i, --immediate', 'Apply immediately (no sunset period)', false)
  .option('-f, --force', 'Force deprecation even with active consumers', false)
  .option('--no-notify', 'Disable consumer notifications')
  .option('--replacement <id>', 'Suggested replacement asset ID')
  .option('--migration-guide <url>', 'Migration guide URL')
  .option('--dry-run', 'Dry run (no changes)', false)
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      const input: DeprecationAgentInput = {
        assetId: options.assetId,
        assetType: options.assetType as DeprecatableAssetType,
        currentVersion: options.version,
        targetState: 'deprecated',
        reason: options.reason as DeprecationReason,
        reasonDescription: options.description,
        requesterId: process.env.USER_ID || uuidv4(),
        sunsetDate: options.sunsetDate,
        immediateEffect: options.immediate,
        forceDeprecation: options.force,
        notificationConfig: {
          enabled: options.notify !== false,
          urgency: 'standard',
          reminderDays: [30, 14, 7, 1]
        },
        migrationGuidance: options.replacement || options.migrationGuide ? {
          replacementAssetId: options.replacement,
          migrationGuideUrl: options.migrationGuide
        } : undefined,
        correlationId: uuidv4()
      };

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ dryRun: true, input }, null, 2));
        } else {
          console.log('DRY RUN - No changes will be made');
          console.log('Input:', JSON.stringify(input, null, 2));
        }
        return;
      }

      const agent = createDeprecationAgent();
      const result = await agent.execute(input);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result.output);
      }

      process.exit(result.output.success ? 0 : 1);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * retire command
 */
program
  .command('retire')
  .description('Mark an asset as retired (removes from marketplace)')
  .requiredOption('-a, --asset-id <id>', 'Asset UUID')
  .requiredOption('-t, --asset-type <type>', 'Asset type')
  .requiredOption('-r, --reason <reason>', 'Retirement reason')
  .requiredOption('-d, --description <text>', 'Detailed reason description')
  .option('-v, --version <version>', 'Current asset version', '1.0.0')
  .option('-f, --force', 'Force retirement even with active consumers', false)
  .option('--dry-run', 'Dry run (no changes)', false)
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      const input: DeprecationAgentInput = {
        assetId: options.assetId,
        assetType: options.assetType as DeprecatableAssetType,
        currentVersion: options.version,
        targetState: 'retired',
        reason: options.reason as DeprecationReason,
        reasonDescription: options.description,
        requesterId: process.env.USER_ID || uuidv4(),
        immediateEffect: true,
        forceDeprecation: options.force,
        correlationId: uuidv4()
      };

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ dryRun: true, input }, null, 2));
        } else {
          console.log('DRY RUN - No changes will be made');
          console.log('Input:', JSON.stringify(input, null, 2));
        }
        return;
      }

      const agent = createDeprecationAgent();
      const result = await agent.execute(input);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result.output);
      }

      process.exit(result.output.success ? 0 : 1);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * inspect command
 */
program
  .command('inspect')
  .description('Get deprecation status of an asset')
  .requiredOption('-a, --asset-id <id>', 'Asset UUID')
  .option('-t, --asset-type <type>', 'Asset type (for validation)')
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      const client = createRuVectorClient();
      const history = await client.getLifecycleHistory(options.assetId);

      if (options.json) {
        console.log(JSON.stringify({ assetId: options.assetId, history }, null, 2));
      } else {
        console.log(`\nLifecycle History for ${options.assetId}:`);
        console.log('='.repeat(50));

        if (history.length === 0) {
          console.log('No lifecycle transitions found');
        } else {
          history.forEach((transition, index) => {
            console.log(`\n[${index + 1}] ${transition.fromState} -> ${transition.toState}`);
            console.log(`    Timestamp: ${transition.transitionedAt}`);
            console.log(`    Initiated by: ${transition.initiatedBy}`);
            console.log(`    Reason: ${transition.reason}`);
          });
        }
      }

      process.exit(0);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * impact command
 */
program
  .command('impact')
  .description('Assess consumer impact of deprecating an asset')
  .requiredOption('-a, --asset-id <id>', 'Asset UUID')
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      const client = createRuVectorClient();
      const impact = await client.getConsumerImpact(options.assetId);

      if (options.json) {
        console.log(JSON.stringify({ assetId: options.assetId, impact }, null, 2));
      } else {
        console.log(`\nConsumer Impact Assessment for ${options.assetId}:`);
        console.log('='.repeat(50));
        console.log(`Active Consumers: ${impact.activeConsumerCount}`);
        console.log(`Critical Consumers: ${impact.criticalConsumerCount}`);
        console.log(`Avg Daily Requests: ${impact.averageDailyRequests}`);
        console.log(`Impact Score: ${(impact.impactScore * 100).toFixed(1)}%`);

        if (impact.topConsumers.length > 0) {
          console.log('\nTop Consumers:');
          impact.topConsumers.forEach((id, i) => {
            console.log(`  ${i + 1}. ${id}`);
          });
        }
      }

      process.exit(0);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * list-deprecated command
 */
program
  .command('list-deprecated')
  .description('List deprecated assets')
  .option('-t, --asset-type <type>', 'Filter by asset type')
  .option('-l, --limit <number>', 'Maximum results', '20')
  .option('-o, --offset <number>', 'Result offset', '0')
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      // This would query ruvector-service for deprecated assets
      // For now, output a placeholder
      const result = {
        total: 0,
        offset: parseInt(options.offset),
        limit: parseInt(options.limit),
        assets: []
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\nDeprecated Assets:');
        console.log('='.repeat(50));
        console.log(`Total: ${result.total}`);

        if (result.assets.length === 0) {
          console.log('No deprecated assets found');
        }
      }

      process.exit(0);
    } catch (error) {
      handleError(error, options.json);
    }
  });

/**
 * Print result in human-readable format
 */
function printResult(output: any): void {
  console.log('\n' + '='.repeat(50));
  console.log(`Status: ${output.success ? '✓ SUCCESS' : '✗ FAILED'}`);
  console.log(`Code: ${output.statusCode}`);
  console.log(`Message: ${output.message}`);
  console.log('='.repeat(50));

  if (output.newState) {
    console.log(`\nNew State: ${output.newState}`);
  }

  if (output.effectiveSunsetDate) {
    console.log(`Sunset Date: ${output.effectiveSunsetDate}`);
  }

  if (output.transition) {
    console.log('\nTransition:');
    console.log(`  From: ${output.transition.fromState}`);
    console.log(`  To: ${output.transition.toState}`);
    console.log(`  At: ${output.transition.transitionedAt}`);
  }

  if (output.consumerImpact) {
    console.log('\nConsumer Impact:');
    console.log(`  Active Consumers: ${output.consumerImpact.activeConsumerCount}`);
    console.log(`  Impact Score: ${(output.consumerImpact.impactScore * 100).toFixed(1)}%`);
  }

  if (output.notifications) {
    console.log('\nNotifications:');
    console.log(`  Queued: ${output.notifications.totalQueued}`);
    console.log(`  Immediate: ${output.notifications.immediateSent}`);
    console.log(`  Scheduled: ${output.notifications.scheduled}`);
  }

  if (output.policyViolations?.length > 0) {
    console.log('\nPolicy Violations:');
    output.policyViolations.forEach((v: any, i: number) => {
      console.log(`  ${i + 1}. [${v.severity}] ${v.message}`);
      if (v.remediation) {
        console.log(`     Remediation: ${v.remediation}`);
      }
    });
  }

  if (output.warnings?.length > 0) {
    console.log('\nWarnings:');
    output.warnings.forEach((w: string) => {
      console.log(`  ⚠ ${w}`);
    });
  }

  if (output.auditRef) {
    console.log(`\nAudit Reference: ${output.auditRef}`);
  }

  if (output.processingDurationMs) {
    console.log(`\nProcessing Time: ${output.processingDurationMs}ms`);
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
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }
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
