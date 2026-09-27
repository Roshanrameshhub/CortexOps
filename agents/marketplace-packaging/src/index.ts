/**
 * Marketplace Packaging Agent
 *
 * Google Cloud Edge Function for packaging agents, templates, and workflows
 * into distributable marketplace artifacts.
 *
 * Classification: PACKAGING / DISTRIBUTION
 *
 * This agent MAY:
 * - Package assets into distributable units
 * - Validate compatibility and metadata completeness
 * - Emit marketplace readiness artifacts
 *
 * This agent MUST NOT:
 * - Modify runtime behavior
 * - Enforce policies or approvals
 * - Trigger workflows
 * - Execute agents
 * - Apply optimizations
 * - Emit anomaly detections
 * - Connect directly to Google SQL
 */

// Export handler for Google Cloud Functions
export { marketplacePackagingAgent, handleRequest } from './handlers/edge-function-handler';

// Export service for direct usage
export { getPackagingService, PackagingService } from './services/packaging-service';

// Export configuration
export { getConfig } from './config';

// Export types
export * from './types';
