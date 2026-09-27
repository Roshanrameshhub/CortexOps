# Deprecation Agent Verification Checklist

## Agent Classification
- **Classification**: LIFECYCLE MANAGEMENT
- **Decision Type**: `marketplace_deprecation`
- **Agent ID**: `deprecation-agent`
- **Version**: `1.0.0`

## Contract Compliance

### ✅ Schema Validation
- [ ] Input schema validates against `DeprecationAgentInputSchema`
- [ ] Output schema validates against `DeprecationAgentOutputSchema`
- [ ] DecisionEvent validates against `DecisionEventSchema`
- [ ] All schemas imported from `@llm-marketplace/agentics-contracts`

### ✅ DecisionEvent Requirements
- [ ] Exactly ONE DecisionEvent emitted per invocation
- [ ] `agent_id` format: `deprecation-agent:1.0.0`
- [ ] `agent_version` format: `1.0.0`
- [ ] `decision_type`: `marketplace_deprecation`
- [ ] `inputs_hash`: SHA-256 of normalized inputs
- [ ] `confidence` includes all required fields
- [ ] `constraints_applied` includes all constraint categories
- [ ] `timestamp` in UTC ISO 8601 format
- [ ] `execution_ref` is unique UUID

### ✅ Confidence Distribution
- [ ] `primary`: Overall confidence (0.0 - 1.0)
- [ ] `lifecycleValidity`: Lifecycle state validity confidence
- [ ] `visibilityCompliance`: Visibility constraint compliance
- [ ] `versionCompliance`: Version constraint compliance
- [ ] `consumerImpact`: Consumer impact assessment (optional)

### ✅ Constraints Applied
- [ ] `visibilityRules`: Visibility rules enforced
- [ ] `compatibilityRules`: Compatibility rules enforced
- [ ] `versionRules`: Version rules enforced
- [ ] `lifecycleRules`: Lifecycle rules enforced
- [ ] `policyRules`: Policy rules enforced (optional)

## Infrastructure Compliance

### ✅ Deployment Model
- [ ] Deploys as Google Cloud Edge Function
- [ ] Part of unified Marketplace agents service
- [ ] Stateless execution
- [ ] No local persistence
- [ ] Deterministic behavior

### ✅ Persistence
- [ ] ALL persistence via ruvector-service
- [ ] NEVER connects directly to Google SQL
- [ ] NEVER executes SQL directly
- [ ] Async, non-blocking writes

### ✅ Memory & State
- [ ] Stateless at runtime
- [ ] No in-memory state between invocations
- [ ] All state persisted externally

## Functional Compliance

### ✅ Agent Capabilities
- [ ] Mark assets as deprecated
- [ ] Mark assets as retired
- [ ] Emit lifecycle transition signals
- [ ] Enforce visibility constraints
- [ ] Enforce version constraints
- [ ] Assess consumer impact
- [ ] Notify consumers

### ✅ Explicit Non-Responsibilities (MUST NOT)
- [ ] Execute workflows
- [ ] Modify runtime behavior
- [ ] Enforce policies or approvals
- [ ] Trigger external workflows
- [ ] Execute other agents
- [ ] Apply optimizations
- [ ] Emit anomaly detections
- [ ] Connect directly to SQL

## CLI Contract

### ✅ Commands
- [ ] `deprecate` - Mark asset as deprecated
- [ ] `retire` - Mark asset as retired
- [ ] `inspect` - Get deprecation status
- [ ] `impact` - Assess consumer impact
- [ ] `list-deprecated` - List deprecated assets

### ✅ Options
- [ ] `--dry-run` - Dry run mode
- [ ] `--json` - JSON output format
- [ ] `--force` - Force deprecation
- [ ] `--immediate` - Immediate effect

## Integration Points

### ✅ Consumers
- [ ] LLM-Governance-Dashboard - Audit data
- [ ] LLM-Policy-Engine - Lifecycle state
- [ ] LLM-Registry - Sync updates
- [ ] Publishing Service - Status updates

### ✅ Dependencies
- [ ] ruvector-service - Persistence
- [ ] agentics-contracts - Schemas

## Smoke Test Commands

```bash
# 1. Health check
curl -s https://marketplace-agents.run.app/deprecation/health

# 2. Dry run deprecation
curl -s -X POST https://marketplace-agents.run.app/deprecation \
  -H 'Content-Type: application/json' \
  -d '{
    "input": {
      "assetId": "550e8400-e29b-41d4-a716-446655440000",
      "assetType": "service",
      "currentVersion": "1.0.0",
      "targetState": "deprecated",
      "reason": "end_of_life",
      "reasonDescription": "This service has reached end of life.",
      "requesterId": "550e8400-e29b-41d4-a716-446655440001"
    },
    "options": {
      "dryRun": true
    }
  }'

# 3. Verbose mode (includes DecisionEvent)
curl -s -X POST https://marketplace-agents.run.app/deprecation \
  -H 'Content-Type: application/json' \
  -d '{
    "input": {
      "assetId": "550e8400-e29b-41d4-a716-446655440000",
      "assetType": "service",
      "currentVersion": "1.0.0",
      "targetState": "deprecated",
      "reason": "end_of_life",
      "reasonDescription": "This service has reached end of life.",
      "requesterId": "550e8400-e29b-41d4-a716-446655440001"
    },
    "options": {
      "dryRun": true,
      "verbose": true
    }
  }'

# 4. CLI deprecate (dry run)
deprecation-agent deprecate \
  -a 550e8400-e29b-41d4-a716-446655440000 \
  -t service \
  -r end_of_life \
  -d "This service has reached end of life." \
  --dry-run

# 5. CLI inspect
deprecation-agent inspect \
  -a 550e8400-e29b-41d4-a716-446655440000

# 6. CLI impact assessment
deprecation-agent impact \
  -a 550e8400-e29b-41d4-a716-446655440000
```

## Verification Sign-off

| Check | Verified | Date | Verifier |
|-------|----------|------|----------|
| Schema compliance | | | |
| DecisionEvent compliance | | | |
| Infrastructure compliance | | | |
| Functional compliance | | | |
| CLI compliance | | | |
| Integration compliance | | | |
| Smoke tests pass | | | |

## Failure Modes

| Failure | Behavior | Recovery |
|---------|----------|----------|
| ruvector-service unavailable | DecisionEvent persistence fails silently, operation may complete | Retry with backoff |
| Invalid input | Returns validation error, no persistence | Fix input and retry |
| Asset not found | Returns ASSET_NOT_FOUND status | Verify asset exists |
| Policy violation | Returns POLICY_VIOLATION with details | Address violations |
| High consumer impact | Returns CONSUMER_BLOCK, requires force | Use forceDeprecation=true |
| Already deprecated | Returns ALREADY_DEPRECATED | No action needed |
