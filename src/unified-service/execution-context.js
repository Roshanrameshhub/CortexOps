/**
 * Execution Context Module
 *
 * Runtime implementation for the Foundational Execution Unit span lifecycle.
 * Provides functions to extract execution context, create/close spans,
 * attach artifacts, and build the structured execution result.
 *
 * This module enforces the invariants required by the Agentics execution system:
 *   - parent_span_id must be present (reject otherwise)
 *   - Every agent execution produces a span
 *   - No successful result without at least one agent span
 *   - Artifacts attach to agent spans only
 *   - Causal ordering via parent_span_id chain: Core -> Repo -> Agent
 */

const crypto = require('crypto');

const REPO_NAME = 'llm-marketplace';

/**
 * Generate a UUID v4.
 * @returns {string}
 */
function generateSpanId() {
  return crypto.randomUUID();
}

/**
 * Extract and validate execution context from the request.
 * Checks body fields first (primary), then headers (fallback).
 *
 * @param {import('http').IncomingMessage} req
 * @param {object} body - parsed request body
 * @returns {{ valid: true, context: { execution_id: string, parent_span_id: string } } | { valid: false, error: string }}
 */
function extractExecutionContext(req, body) {
  const parent_span_id = body?.parent_span_id
    || req.headers['x-parent-span-id']
    || null;

  if (!parent_span_id) {
    return {
      valid: false,
      error: 'MISSING_PARENT_SPAN_ID: parent_span_id is required. '
           + 'Provide in request body or X-Parent-Span-Id header.',
    };
  }

  const execution_id = body?.execution_id
    || req.headers['x-execution-id']
    || generateSpanId();

  return {
    valid: true,
    context: { execution_id, parent_span_id },
  };
}

/**
 * Create an open repo-level span linked to the Core's parent span.
 *
 * @param {{ execution_id: string, parent_span_id: string }} executionContext
 * @returns {object} repo span (end_time is null until closed)
 */
function createRepoSpan(executionContext) {
  return {
    span_id: generateSpanId(),
    parent_span_id: executionContext.parent_span_id,
    type: 'repo',
    repo_name: REPO_NAME,
    execution_id: executionContext.execution_id,
    start_time: new Date().toISOString(),
    end_time: null,
    status: 'ok',
    agent_count: 0,
    metadata: {},
  };
}

/**
 * Create an open agent-level span linked to the repo span.
 *
 * @param {string} agentName - registered agent name
 * @param {string} repoSpanId - the repo span's span_id
 * @returns {object} agent span (end_time is null until closed)
 */
function createAgentSpan(agentName, repoSpanId) {
  return {
    span_id: generateSpanId(),
    parent_span_id: repoSpanId,
    type: 'agent',
    agent_name: agentName,
    repo_name: REPO_NAME,
    start_time: new Date().toISOString(),
    end_time: null,
    status: 'ok',
    artifacts: [],
    evidence: [],
    metadata: {},
  };
}

/**
 * Close a span by setting its end_time and final status.
 *
 * @param {object} span
 * @param {string} [status='ok'] - 'ok', 'error', or 'invalid'
 * @returns {object} the closed span
 */
function closeSpan(span, status) {
  span.end_time = new Date().toISOString();
  span.status = status || 'ok';
  return span;
}

/**
 * Create an artifact envelope.
 *
 * @param {string} artifactType - e.g. 'DecisionEvent', 'AgentOutput'
 * @param {object} data - artifact payload
 * @returns {object}
 */
function createArtifact(artifactType, data) {
  return {
    artifact_id: generateSpanId(),
    artifact_type: artifactType,
    produced_at: new Date().toISOString(),
    data,
  };
}

/**
 * Attach an artifact to an agent span.
 *
 * @param {object} agentSpan
 * @param {object} artifact
 * @returns {object} the agent span
 */
function attachArtifact(agentSpan, artifact) {
  agentSpan.artifacts.push(artifact);
  return agentSpan;
}

/**
 * Wrap an agent handler invocation with full span lifecycle.
 *
 * Creates an agent span, invokes the handler, attaches any DecisionEvent
 * and AgentOutput artifacts, and closes the span.
 *
 * @param {string} agentName - registered agent name
 * @param {object} repoSpan - the repo-level span
 * @param {Function} handlerFn - async (req, body) => { status, body }
 * @param {import('http').IncomingMessage} req
 * @param {object} body - parsed request body
 * @returns {Promise<{ agentSpan: object, handlerResult: object }>}
 */
async function executeAgentWithSpan(agentName, repoSpan, handlerFn, req, body) {
  const agentSpan = createAgentSpan(agentName, repoSpan.span_id);

  try {
    const handlerResult = await handlerFn(req, body);

    // Attach DecisionEvent if present in the response
    const decisionEvent = handlerResult?.body?.data?.decisionEvent;
    if (decisionEvent) {
      attachArtifact(agentSpan, createArtifact('DecisionEvent', decisionEvent));
    }

    // Attach a summary of the agent output as evidence
    attachArtifact(agentSpan, createArtifact('AgentOutput', {
      status: handlerResult.status,
      result_code: handlerResult.body?.result_code,
      success: handlerResult.body?.success,
    }));

    closeSpan(agentSpan, handlerResult.status >= 400 ? 'error' : 'ok');

    return { agentSpan, handlerResult };
  } catch (error) {
    attachArtifact(agentSpan, createArtifact('Error', {
      message: error.message,
      stack: error.stack,
    }));
    closeSpan(agentSpan, 'error');

    return {
      agentSpan,
      handlerResult: {
        status: 500,
        body: {
          success: false,
          error: { code: 'AGENT_EXECUTION_ERROR', message: error.message },
        },
      },
    };
  }
}

/**
 * Assemble the final RepoExecutionResult.
 *
 * Enforces the invariant that at least one agent span must exist.
 * If no agent spans were produced, returns valid: false and marks the
 * repo span as 'invalid'.
 *
 * @param {object} repoSpan
 * @param {object[]} agentSpans
 * @param {{ execution_id: string, parent_span_id: string }} executionContext
 * @returns {{ valid: boolean, result: object, error?: string }}
 */
function buildExecutionResult(repoSpan, agentSpans, executionContext) {
  if (!agentSpans || agentSpans.length === 0) {
    closeSpan(repoSpan, 'invalid');
    return {
      valid: false,
      error: 'NO_AGENT_SPANS: Execution produced no agent spans. '
           + 'At least one agent must execute.',
      result: {
        repo_span: repoSpan,
        agent_spans: [],
        artifacts: [],
        execution_context: executionContext,
      },
    };
  }

  // Check for any failed agent spans
  const hasFailedAgent = agentSpans.some(s => s.status === 'error');

  repoSpan.agent_count = agentSpans.length;
  closeSpan(repoSpan, hasFailedAgent ? 'error' : 'ok');

  // Flatten all artifacts from agent spans
  const allArtifacts = agentSpans.flatMap(s => s.artifacts || []);

  return {
    valid: true,
    result: {
      repo_span: repoSpan,
      agent_spans: agentSpans,
      artifacts: allArtifacts,
      execution_context: executionContext,
    },
  };
}

module.exports = {
  extractExecutionContext,
  createRepoSpan,
  createAgentSpan,
  closeSpan,
  createArtifact,
  attachArtifact,
  executeAgentWithSpan,
  buildExecutionResult,
  generateSpanId,
  REPO_NAME,
};
