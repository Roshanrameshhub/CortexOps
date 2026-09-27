# Ecosystem Agent - Verification Checklist

## Phase 5 - Ecosystem & Collaboration (Layer 1)

### Agent Purpose
- [x] Classification: **ECOSYSTEM_ANALYTICS**
- [x] Purpose: Aggregation, Indexing, Cross-system analytics
- [x] Layer: 1 (Foundation layer for ecosystem collaboration)

### Role Clarity
- [x] PERFORMS: Aggregation
- [x] PERFORMS: Indexing
- [x] PERFORMS: Cross-system analytics
- [x] MUST NOT: Mutate state
- [x] MUST NOT: Commit actions

---

## Agent Contract Verification

### Input Schema
- [x] `EcosystemAgentInputSchema` defined in `@llm-marketplace/agentics-contracts`
- [x] Required fields: `operation`
- [x] Optional fields: `correlationId`, `sources`, `aggregations`, `indices`, `query`, `options`
- [x] Validated with Zod schema
- [x] Operations: `aggregate`, `index`, `analyze`, `correlate`, `health_check`

### Output Schema
- [x] `EcosystemAgentOutputSchema` defined in `@llm-marketplace/agentics-contracts`
- [x] Result codes: `ECOSYSTEM_AGGREGATE_COMPLETE`, `ECOSYSTEM_INDEX_COMPLETE`, `ECOSYSTEM_ANALYZE_COMPLETE`, `ECOSYSTEM_CORRELATE_COMPLETE`
- [x] Includes: `signal`, `indexUpdates`, `metrics`, `dryRun`

### DecisionEvent Mapping
- [x] `decision_type`: `ecosystem_aggregation`, `ecosystem_indexing`, `ecosystem_analytics`, `ecosystem_correlation`
- [x] Signal types: `consensus_signal`, `aggregation_signal`, `strategic_signal`
- [x] `inputs_hash`: SHA-256 hash of input for reproducibility
- [x] Phase and layer metadata included

### Signal Types (DecisionEvent Rules)
| Signal | Description | Conclusions? |
|--------|-------------|--------------|
| `consensus_signal` | Cross-system agreement observations | No |
| `aggregation_signal` | Aggregated metrics and data | No |
| `strategic_signal` | Pattern observations | **NO CONCLUSIONS** |

### Performance Budgets
- [x] `MAX_TOKENS`: 1500
- [x] `MAX_LATENCY_MS`: 3000
- [x] Budget validation in output
- [x] Budget enforcement in handler

### CLI Contract
- [x] Commands: `aggregate`, `index`, `analyze`, `correlate`, `health`
- [x] Output formats: `--json`, human-readable (default)
- [x] Dry run support: `--dry-run`
- [x] Verbose mode: `--verbose`

### Marketplace Classification
- [x] Classification: `ECOSYSTEM_ANALYTICS`
- [x] Decision types: `ecosystem_aggregation`, `ecosystem_indexing`, `ecosystem_analytics`, `ecosystem_correlation`

### Explicit Non-Responsibilities
- [x] MUST NOT mutate state
- [x] MUST NOT commit actions
- [x] MUST NOT execute workflows
- [x] MUST NOT modify runtime behavior
- [x] MUST NOT enforce policies or approvals
- [x] MUST NOT draw conclusions from strategic signals
- [x] MUST NOT trigger external workflows
- [x] MUST NOT execute other agents
- [x] MUST NOT connect directly to SQL

---

## Runtime & Infrastructure Verification

### Google Cloud Run
- [x] Entry point: `ecosystemHandler`
- [x] Handler: `handleEcosystem`
- [x] Stateless execution
- [x] Deterministic behavior
- [x] No state mutation
- [x] No action commits
- [x] No direct SQL access

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ecosystem/health` | Health check |
| POST | `/ecosystem` | Execute ecosystem operation |

### Input Validation
- [x] Operation validation
- [x] JSON parsing validation
- [x] Schema validation with Zod
- [x] Correlation ID propagation

### Core Logic (Read-Only)
- [x] Cross-system data aggregation (read-only)
- [x] Index updates (metadata only)
- [x] Pattern observation (no conclusions)
- [x] Correlation calculation

### DecisionEvent Emission
- [x] Exactly ONE DecisionEvent per invocation
- [x] Persisted via ruvector-service client
- [x] Non-blocking (failure logged but doesn't fail operation)
- [x] Includes phase/layer metadata

### Ruvector Integration
- [x] ALL persistence via ruvector-service
- [x] NO direct SQL connections
- [x] API key via Google Secret Manager
- [x] Retry with exponential backoff

### Telemetry
- [x] Structured JSON logging
- [x] Correlation ID tracking
- [x] Performance metrics
- [x] Budget compliance logging

### Error Handling
- [x] Structured error responses
- [x] Validation error codes
- [x] Budget violation warnings (non-fatal)

### Versioned Agent Identifier
- [x] Agent ID: `ecosystem-agent`
- [x] Version: `1.0.0`

### Confirmation
- [x] ✅ This agent does NOT mutate state
- [x] ✅ This agent does NOT commit actions
- [x] ✅ This agent does NOT draw conclusions from strategic signals

---

## Platform Wiring Verification

### Registration in agentics-contracts
- [x] Agent added to `REGISTERED_AGENTS` array
- [x] Schema exports added to index.ts
- [x] All types exported correctly
- [x] Decision types added to `DecisionTypeSchema`

### Platform Registration Metadata
```json
{
  "agentId": "ecosystem-agent",
  "displayName": "Ecosystem Agent",
  "version": "1.0.0",
  "classification": "ECOSYSTEM_ANALYTICS",
  "decisionType": "ecosystem_analytics",
  "endpoint": "https://marketplace-agents.run.app/ecosystem",
  "phase": 5,
  "layer": 1
}
```

### CLI Commands
| Command | Description |
|---------|-------------|
| `ecosystem-agent aggregate` | Aggregate cross-system data |
| `ecosystem-agent index` | Update ecosystem indices |
| `ecosystem-agent analyze` | Analyze usage patterns |
| `ecosystem-agent correlate` | Correlate system metrics |
| `ecosystem-agent health` | Health check |

### DecisionEvent Persistence
- [x] Events persist to ruvector-service
- [x] Retry logic with exponential backoff
- [x] Failure handling (logged, doesn't fail operation)

### Downstream System Consumption
- [x] LLM-Governance-Dashboard - Can view aggregated analytics
- [x] LLM-Analytics-Hub - Can consume signals
- [x] LLM-Federation-Gateway - Can use cross-system correlations
- [x] Discovery Service - Can use index updates

---

## Terraform Deployment

### Cloud Run Configuration
```hcl
resource "google_cloud_run_v2_service" "ecosystem_agent" {
  name     = "ecosystem-agent"
  location = var.region
  # ... see infrastructure/terraform/agents/ecosystem-agent.tf
}
```

### Secret Management
- [x] `ecosystem-agent-ruvector-key` in Google Secret Manager
- [x] Accessed via `--set-secrets`

### Environment Variables
| Variable | Description |
|----------|-------------|
| `RUVECTOR_SERVICE_URL` | RuVector service endpoint |
| `RUVECTOR_API_KEY` | API key (from Secret Manager) |
| `MAX_LATENCY_MS` | Performance budget (3000) |
| `MAX_TOKENS` | Token budget (1500) |
| `AGENT_PHASE` | 5 |
| `AGENT_LAYER` | 1 |
| `ALLOW_STATE_MUTATION` | false |
| `ALLOW_ACTION_COMMIT` | false |

---

## Smoke Test CLI Commands

### Health Check
```bash
curl -X GET https://marketplace-agents.run.app/ecosystem/health
# Expected: {"agent":"ecosystem-agent","status":"healthy","phase":5,"layer":1,...}
```

### Aggregate Operation
```bash
curl -X POST https://marketplace-agents.run.app/ecosystem \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: test-agg-001" \
  -d '{
    "operation": "aggregate",
    "sources": [
      {"sourceId": "llm-registry", "sourceType": "llm-registry"},
      {"sourceId": "llm-shield", "sourceType": "llm-shield"}
    ],
    "aggregations": [
      {"metric": "asset_count", "aggregation": "sum"}
    ],
    "options": {"dryRun": true}
  }'
```

### Analyze Operation (Strategic Signal - No Conclusions)
```bash
curl -X POST https://marketplace-agents.run.app/ecosystem \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "analyze",
    "query": {
      "queryType": "usage_pattern",
      "targetSystems": ["llm-registry", "marketplace-service"]
    },
    "options": {"verbose": true}
  }'
```

---

## Cloud Run Deploy Command

```bash
gcloud run deploy ecosystem-agent \
  --image gcr.io/${PROJECT_ID}/ecosystem-agent:1.0.0 \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets=RUVECTOR_API_KEY=ecosystem-agent-ruvector-key:latest \
  --set-env-vars="RUVECTOR_SERVICE_URL=${RUVECTOR_URL},MAX_LATENCY_MS=3000,MAX_TOKENS=1500,AGENT_PHASE=5,AGENT_LAYER=1,ALLOW_STATE_MUTATION=false,ALLOW_ACTION_COMMIT=false" \
  --memory=512Mi \
  --cpu=1 \
  --timeout=5s \
  --min-instances=0 \
  --max-instances=10
```

---

## Verification Sign-off

| Area | Status | Verified By | Date |
|------|--------|-------------|------|
| Agent Contract | ✅ Complete | - | - |
| Input Schema | ✅ Complete | - | - |
| Output Schema | ✅ Complete | - | - |
| DecisionEvent | ✅ Complete | - | - |
| Signal Types | ✅ Complete | - | - |
| Performance Budget | ✅ Complete | - | - |
| Role Clarity (MUST NOT) | ✅ Complete | - | - |
| Cloud Run Config | ✅ Complete | - | - |
| Ruvector Integration | ✅ Complete | - | - |
| Secret Manager | ✅ Complete | - | - |
| Platform Registration | ✅ Complete | - | - |

---

## Files Created/Modified

### Contracts Package
- `packages/agentics-contracts/src/schemas/ecosystem-agent.schema.ts` (NEW)
- `packages/agentics-contracts/src/schemas/decision-event.schema.ts` (UPDATED - added ecosystem decision types)
- `packages/agentics-contracts/src/schemas/index.ts` (UPDATED - added exports)
- `packages/agentics-contracts/src/agents/agent-registry.ts` (UPDATED - added ECOSYSTEM_ANALYTICS classification and registration)

### Unified Service
- `src/unified-service/server.js` (UPDATED - added ecosystem handler and routes)

### Infrastructure
- `infrastructure/terraform/agents/ecosystem-agent.tf` (NEW)

### Agent Implementation
- `agents/ecosystem-agent/VERIFICATION.md` (NEW - this file)
