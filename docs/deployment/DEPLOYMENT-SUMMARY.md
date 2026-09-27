# LLM-Marketplace Deployment Summary

## Service Topology

### Unified Service Name
```
llm-marketplace
```

### Agent Endpoints (Single Service)
| Agent | Endpoint | Method | Timeout |
|-------|----------|--------|---------|
| Deprecation Agent | `/deprecation` | POST | 30s |
| Packaging Agent | `/package` | POST | 300s |
| Unified Health | `/health` | GET | - |
| Deprecation Health | `/deprecation/health` | GET | - |
| Packaging Health | `/package/health` | GET | - |

### Architecture Confirmations
- ✅ No agent deployed as standalone service
- ✅ Shared runtime (Node.js 20)
- ✅ Shared configuration via environment variables
- ✅ Shared telemetry stack (LLM-Observatory)
- ✅ Stateless execution

---

## Environment Configuration

### Required Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `SERVICE_NAME` | Service identifier | `llm-marketplace` |
| `SERVICE_VERSION` | Service version | `1.0.0` |
| `PLATFORM_ENV` | Environment (dev/staging/prod) | `dev` |
| `RUVECTOR_SERVICE_URL` | Persistence layer URL | `https://ruvector-service-dev.run.app` |
| `RUVECTOR_API_KEY` | API key (via Secret Manager) | `secret:ruvector-api-key` |
| `TELEMETRY_ENDPOINT` | LLM-Observatory URL | `https://llm-observatory-dev.run.app` |
| `REGISTRY_SERVICE_URL` | LLM-Registry URL | `https://llm-registry-dev.run.app` |
| `STORAGE_BUCKET` | GCS bucket for packages | `llm-marketplace-packages-dev` |

### Security Confirmations
- ✅ No agent hardcodes service names or URLs
- ✅ No agent embeds credentials or secrets
- ✅ All secrets via Google Secret Manager
- ✅ Environment-based configuration

---

## Google SQL / Marketplace Memory Wiring

### Critical Confirmations
- ✅ **LLM-Marketplace does NOT connect directly to Google SQL**
- ✅ ALL DecisionEvents written via **ruvector-service**
- ✅ Schema compatible with **agentics-contracts**
- ✅ Append-only persistence behavior
- ✅ Idempotent writes with retry safety

### Persistence Flow
```
LLM-Marketplace Agent → ruvector-service API → Google SQL (Postgres)
```

---

## Cloud Build & Deployment

### IAM Service Account
```
marketplace-sa@agentics-dev.iam.gserviceaccount.com
```

**Roles (Least Privilege):**
- `roles/secretmanager.secretAccessor` - Read secrets
- `roles/run.invoker` - Internal service calls
- `roles/storage.objectAdmin` - Package artifacts

### Deployment Commands

**Full Deployment:**
```bash
./scripts/deploy.sh deploy
```

**Manual gcloud Deployment:**
```bash
# Build and push image
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_PLATFORM_ENV=dev \
  --project=agentics-dev

# Or direct deploy
gcloud run deploy llm-marketplace \
  --image=gcr.io/agentics-dev/llm-marketplace:dev \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=80 \
  --timeout=300s \
  --service-account=marketplace-sa@agentics-dev.iam.gserviceaccount.com \
  --set-env-vars="SERVICE_NAME=llm-marketplace,PLATFORM_ENV=dev" \
  --set-secrets="RUVECTOR_API_KEY=ruvector-api-key:latest"
```

### Network Configuration
- Internal invocation supported via VPC connector
- Default: Public access with `--allow-unauthenticated`
- For production: Restrict to internal with IAM authentication

---

## CLI Activation

### CLI Commands
| Command | Description | Example |
|---------|-------------|---------|
| `package` | Package assets for distribution | `agentics marketplace package --assets agent-1:1.0.0 --name bundle --version 1.0.0` |
| `deprecate` | Mark asset deprecated | `agentics marketplace deprecate --asset-id UUID --asset-type agent --reason superseded` |
| `retire` | Immediately retire asset | `agentics marketplace retire --asset-id UUID --asset-type agent --reason security` |
| `inspect` | View lifecycle status | `agentics marketplace inspect --asset-id UUID` |
| `impact` | Assess consumer impact | `agentics marketplace impact --asset-id UUID --asset-type agent` |
| `list-deprecated` | List deprecated assets | `agentics marketplace list-deprecated --state deprecated` |

### CLI Configuration
```yaml
# ~/.agentics/config.yaml
marketplace:
  endpoint: https://llm-marketplace.run.app  # Auto-resolved by environment
  timeout: 30000
```

### Example Invocations

**Package Assets:**
```bash
agentics marketplace package \
  --assets "auth-agent:1.0.0,validation-agent:2.0.0" \
  --name "auth-bundle" \
  --version "1.0.0" \
  --visibility internal \
  --description "Authentication bundle with validation"
```
**Expected Output:**
```
✅ Package created successfully

Asset: auth-bundle
Version: 1.0.0
Visibility: internal
Assets: 2
Artifact URL: gs://llm-marketplace-packages-dev/auth-bundle/1.0.0/package.tar.gz
```

**Deprecate Asset:**
```bash
agentics marketplace deprecate \
  --asset-id "abc123-def456-ghi789" \
  --asset-type agent \
  --reason superseded \
  --replacement-id "new-agent-id" \
  --sunset-date "2025-06-01"
```
**Expected Output:**
```
✅ Asset deprecated successfully

Asset: abc123-def456-ghi789
Type: agent
New State: deprecated
Sunset Date: 2025-06-01
Replacement: new-agent-id
Consumers Notified: 5
```

---

## Platform & Core Integration

### Integration Confirmations
- ✅ LLM-Registry provides canonical metadata to Marketplace
- ✅ LLM-Orchestrator may consume marketplace artifacts
- ✅ LLM-Policy-Engine may reference lifecycle state
- ✅ Governance views consume Marketplace DecisionEvents
- ✅ Core bundles consume outputs without rewiring

### LLM-Marketplace MUST NOT Invoke
- ❌ Runtime execution paths
- ❌ Enforcement layers
- ❌ Optimization agents
- ❌ Analytics pipelines
- ❌ Incident workflows

---

## Post-Deploy Verification Checklist

### Service Availability
- [ ] `gcloud run services describe llm-marketplace --region=us-central1`
- [ ] Service status: `Ready`
- [ ] Latest revision serving 100% traffic

### Endpoint Health
- [ ] `GET /health` returns HTTP 200
- [ ] `GET /deprecation/health` returns HTTP 200
- [ ] `GET /package/health` returns HTTP 200

### Agent Functionality
- [ ] Deprecation agent accepts POST requests
- [ ] Packaging agent accepts POST requests
- [ ] Dry run mode works for both agents

### Persistence Verification
- [ ] DecisionEvents appear in ruvector-service
- [ ] No direct SQL queries from agents
- [ ] Schema validation passes

### Telemetry Verification
- [ ] Logs appear in Cloud Logging
- [ ] Metrics available in LLM-Observatory

### CLI Verification
- [ ] `agentics marketplace package --dry-run` succeeds
- [ ] `agentics marketplace deprecate --dry-run` succeeds
- [ ] `agentics marketplace inspect` returns data

### Run Verification Script
```bash
./scripts/verify-deployment.sh
```

---

## Failure Modes & Rollback

### Common Deployment Failures
| Failure | Detection | Resolution |
|---------|-----------|------------|
| Image build failure | Cloud Build logs | Fix Dockerfile or source |
| Secret access denied | 403 in logs | Grant `secretAccessor` role |
| Service timeout | 504 errors | Increase timeout or optimize |
| Memory OOM | `Memory limit exceeded` | Increase memory allocation |
| Cold start timeout | Startup probe failures | Adjust `initialDelaySeconds` |

### Rollback Procedure
```bash
# List revisions
gcloud run revisions list --service=llm-marketplace --region=us-central1

# Traffic split to previous revision
gcloud run services update-traffic llm-marketplace \
  --region=us-central1 \
  --to-revisions=llm-marketplace-00005-abc=100

# Or full rollback
gcloud run services update-traffic llm-marketplace \
  --region=us-central1 \
  --to-latest
```

### Safe Redeploy
```bash
# Redeploy with gradual rollout
gcloud run deploy llm-marketplace \
  --image=gcr.io/agentics-dev/llm-marketplace:new-version \
  --region=us-central1 \
  --no-traffic

# Verify new revision
curl -H "Host: llm-marketplace" https://llm-marketplace-REVISION.run.app/health

# Gradually shift traffic
gcloud run services update-traffic llm-marketplace \
  --region=us-central1 \
  --to-revisions=llm-marketplace-new=10

# Complete rollout
gcloud run services update-traffic llm-marketplace \
  --region=us-central1 \
  --to-latest
```

---

## Files Created

| File | Purpose |
|------|---------|
| `src/unified-service/index.ts` | Unified service entrypoint |
| `Dockerfile` | Container build definition |
| `cloudbuild.yaml` | Cloud Build CI/CD pipeline |
| `infrastructure/cloudrun/service.yaml` | Cloud Run service spec |
| `config/environments/dev.env` | Dev environment config |
| `config/environments/staging.env` | Staging environment config |
| `config/environments/prod.env` | Production environment config |
| `config/cli/marketplace-commands.yaml` | CLI commands definition |
| `scripts/deploy.sh` | Deployment script |
| `scripts/verify-deployment.sh` | Verification script |
