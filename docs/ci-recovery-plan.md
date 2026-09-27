# CortexOps — CI/CD Recovery Plan

> Generated: 2026-09-27
> Based on: Testing Infrastructure Audit (read-only phase)
> Node on runner: 20.x (as declared in all workflows)
> Local Node: v22.13.1 / npm 10.9.2

---

## P0 — Blocking: Fix Before All Else

---

### Finding 1 — Root package-lock.json has missing version fields (semver crash)

**Evidence:**
- `package-lock.json` exists at repo root (1 MB, lockfileVersion: 3) but contains 8 entries with `{"optional": true}` and NO `version` field:
  - `node_modules/@ruvector/gnn/node_modules/@ruvector/gnn-darwin-arm64`
  - `node_modules/@ruvector/gnn/node_modules/@ruvector/gnn-darwin-x64`
  - `node_modules/@ruvector/gnn/node_modules/@ruvector/gnn-linux-arm64-gnu`
  - `node_modules/@ruvector/gnn/node_modules/@ruvector/gnn-linux-arm64-musl`
  - `node_modules/@ruvector/gnn/node_modules/@ruvector/gnn-linux-x64-musl`
  - `node_modules/@ruvector/gnn/node_modules/@ruvector/gnn-win32-x64-msvc`
  - `node_modules/@claude-flow/plugin-gastown-bridge/node_modules/ruvector-gnn-wasm`
  - `node_modules/@claude-flow/plugin-gastown-bridge/node_modules/gastown-formula-wasm`
- `npm ci --dry-run` crashes: `TypeError: Invalid Version:` at `semver/classes/semver.js:38`
- The parent `@ruvector/gnn@0.1.22` declares all 6 platform variants at version `0.1.22`
- `ruvector-gnn-wasm` latest on npm registry: `2.1.0`
- `gastown-formula-wasm` is NOT on the public npm registry (404)

**Affected jobs:** ALL — every workflow that runs `npm ci`

**Severity:** CRITICAL

**Proposed change:** Patch the 8 broken lockfile entries to add the correct `version` field:
- `@ruvector/gnn-*` nested packages -> `"version": "0.1.22"`
- `ruvector-gnn-wasm` -> `"version": "2.1.0"`
- `gastown-formula-wasm` -> `"version": "0.1.0"` (range `^0.1.0`, package is private/not on public registry)

**Verification:** `npm ci --dry-run`

**Auto-applicable:** YES

---

### Finding 2 — `ci-cd-pipeline.yaml` integration-tests uses wrong compose path

**Evidence:**
- Line 236: `docker-compose -f docker-compose.test.yml up --abort-on-container-exit`
- Actual file: `tests/e2e/docker-compose.test.yml` (verified present)
- No `docker-compose.test.yml` at repo root (verified absent)

**Affected job:** `ci-cd-pipeline.yaml` -> `integration-tests`

**Severity:** HIGH

**Proposed change:**
```
Before: docker-compose -f docker-compose.test.yml
After:  docker-compose -f tests/e2e/docker-compose.test.yml
```

**Verification:** `docker-compose -f tests/e2e/docker-compose.test.yml config --quiet`

**Auto-applicable:** YES

---

### Finding 3 — E2E workflow triple-starts infrastructure (port conflicts)

**Evidence in `e2e-tests.yml`:**
- Layer 1 (lines 28-52): GHA `services:` starts postgres:5432, redis:6379
- Layer 2 (lines 69-92): `docker run` starts elasticsearch:9200, kafka:9092, zookeeper:2181
- Layer 3 (line 111): `docker-compose up` starts ALL of the above again

Port 5432, 6379, 9200, 9092 each bound twice -> second container fails to start -> healthchecks timeout.

**Authoritative source:** `tests/e2e/docker-compose.test.yml` - contains all 7 services (postgres, redis, elasticsearch, kafka, zookeeper, + application containers) with proper healthchecks and dependency ordering.

**Proposed change:**
- REMOVE the GHA `services:` block (postgres + redis)
- REMOVE the `Start Elasticsearch` step
- REMOVE the `Start Kafka` step
- REMOVE the `Wait for services to be ready` step
- KEEP: `Build service Docker images`, `docker-compose up`, health verifications

**Verification:** `docker-compose -f tests/e2e/docker-compose.test.yml config --quiet`

**Auto-applicable:** YES

---

### Finding 4 — Performance workflow has the same triple-startup problem

**Evidence in `performance-tests.yml`:**
- Layer 1 (lines 41-64): GHA services postgres:5432, redis:6379
- Layer 2 (lines 91-123): `docker run` elasticsearch, kafka, zookeeper
- Layer 3 (line 134): `docker-compose up`

**Proposed change:** Same as Finding 3 - remove redundant Layers 1 and 2.

**Auto-applicable:** YES

---

### Finding 5 — Stale `inferops` Docker image tags across 3 workflow files

**Evidence:**
- `ci-cd-pipeline.yaml` line 21: `IMAGE_PREFIX: .../inferops`
- `ci-cd.yml` lines 257-291: `DOCKER_USERNAME/inferops-publishing`, `inferops-discovery`, etc.
- `e2e-tests.yml` lines 104-107: `docker build -t inferops/publishing:test`
- `performance-tests.yml` lines 127-130: same pattern

**Classification:**
- `IMAGE_PREFIX: .../inferops` -> PRODUCT BRANDING -> change to `cortexops`
- `DOCKER_USERNAME/inferops-*` -> PRODUCT BRANDING -> change to `cortexops-*`
- `docker build -t inferops/*:test` -> LOCAL CI TAGS -> change to `cortexops/*`

**Auto-applicable:** YES — these are CI-only tags, no runtime systems depend on these exact names

---

### Finding 6 — Wrong k6 performance test path in `ci-cd-pipeline.yaml`

**Evidence:**
- Line 469: `filename: tests/performance/load-test.js`
- `tests/performance/load-test.js` -> does NOT exist (False)
- `tests/performance/scenarios/load-test.js` -> EXISTS (True)

**Proposed change:** `filename: tests/performance/scenarios/load-test.js`

**Auto-applicable:** YES

---

## P1 — Required: Infrastructure Gaps

---

### Finding 7 — Five deployment shell scripts missing

**Evidence:** `Test-Path` -> `False` for all:
- `scripts/smoke-tests.sh`
- `scripts/blue-green-deploy.sh`
- `scripts/rollback.sh`
- `scripts/canary-deploy.sh`
- `scripts/create-snapshot.sh`

**Proposed change:** Create functional stub scripts (log invocation, accept args, exit 0).

**Auto-applicable:** YES (stubs)

---

### Finding 8 — `services/consumption/Cargo.lock` excluded by .gitignore

**Evidence:**
- `.gitignore` line 50: `services/consumption/Cargo.lock`
- File does not exist on disk
- Rust binary crates should commit Cargo.lock; only library crates should omit it

**Proposed change:**
1. Remove `services/consumption/Cargo.lock` from `.gitignore`
2. Generate: `cd services/consumption && cargo generate-lockfile`

**Auto-applicable:** YES for gitignore fix; Cargo.lock generation requires Rust toolchain

---

### Finding 9 — Missing performance test scenarios and support scripts

**Missing files (all return False from Test-Path):**
- `tests/performance/scenarios/workflow-performance.js`
- `tests/performance/scenarios/spike-test.js`
- `tests/performance/scenarios/soak-test.js`
- `tests/performance/scenarios/stress-test.js`
- `tests/performance/scripts/generate-report.js`
- `tests/performance/scripts/setup-test-data.js`
- `tests/performance/scripts/cleanup-test-data.js`

**Proposed change:** Create stub k6 scenarios and Node.js helpers.

**Auto-applicable:** YES (stubs with correct exports)

---

## P2 — Coverage and Test Completeness

---

### Finding 10 — No tests in `model-marketplace` or `tenant-management`

**Evidence:** Zero test files found by glob in either service directory.

**Proposed change:** Add minimal unit tests testing real service behavior.

**Auto-applicable:** PARTIAL — requires code review first

---

### Finding 11 — `tests/cloud-function.test.js` invisible to Jest

**Evidence:**
- File exists (10 KB .js file)
- Root Jest testMatch: `**/?(*.)+(spec|test).ts` — matches .ts only
- `.js` file never runs

**Proposed change:** Convert to `.test.ts` or add `.js` to testMatch pattern.

**Auto-applicable:** PARTIAL — requires file inspection first

---

### Finding 12 — `npm-publish.yml` broken PR dry-run artifact dependency

**Evidence:**
- `publish-dry-run` job triggered on `pull_request`, needs `build` artifact
- `build` job correctly uploads artifact, but `publish-dry-run` job uses
  `download-artifact` which can race with the upload or fail on PR forks

**Proposed change:** Add `continue-on-error: false` guard and ensure artifact retention.

**Auto-applicable:** YES

---

### Finding 13 — Kubernetes overlay directories missing

**Evidence:**
- `infrastructure/kubernetes/base/` exists with manifests and `kustomization.yaml`
- `infrastructure/kubernetes/overlays/` does NOT exist
- Workflows reference: `overlays/development`, `overlays/staging`, `overlays/production`

**Proposed change:** Create kustomize overlay directories for development, staging, production.

**Auto-applicable:** YES (skeleton overlays)

---

## Summary

| # | Finding | Phase | Severity | Auto |
|---|---|---|---|---|
| 1 | Broken package-lock.json version fields | P0 | CRITICAL | YES |
| 2 | Wrong compose path in integration-tests | P0 | HIGH | YES |
| 3 | E2E triple-startup port conflicts | P0 | HIGH | YES |
| 4 | Performance triple-startup port conflicts | P0 | HIGH | YES |
| 5 | Stale inferops Docker image tags | P0 | MEDIUM | YES |
| 6 | Wrong performance test path | P0 | MEDIUM | YES |
| 7 | Five missing deployment scripts | P1 | HIGH | YES (stubs) |
| 8 | Cargo.lock gitignored for binary service | P1 | MEDIUM | YES |
| 9 | Missing perf scenario/support files | P1 | MEDIUM | YES (stubs) |
| 10 | No tests in model-marketplace/tenant-mgmt | P2 | MEDIUM | PARTIAL |
| 11 | cloud-function.test.js not in Jest scope | P2 | LOW | PARTIAL |
| 12 | npm-publish PR artifact dependency | P2 | LOW | YES |
| 13 | Kubernetes overlays missing | P2 | LOW | YES (skeletons) |
