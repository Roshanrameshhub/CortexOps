#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Assemble and deploy the marketplace-agents Cloud Function.
#
# This script copies only the files the Cloud Function needs into a clean
# functions/ directory with a minimal package.json (zero npm dependencies —
# the handler uses only Node.js built-ins).  This avoids pulling in the
# monorepo's full dependency tree during Cloud Build.
#
# Usage:
#   bash scripts/deploy-cloud-function.sh          # deploy
#   bash scripts/deploy-cloud-function.sh --dry-run # build bundle only
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/.deploy-bundle"

echo "==> Assembling deployment bundle in $BUNDLE_DIR"

rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/src/unified-service"

# Copy Cloud Function entry point
cp "$ROOT_DIR/index.js" "$BUNDLE_DIR/"

# Copy agent handlers and execution-context (no business-logic changes)
cp "$ROOT_DIR/src/unified-service/server.js" "$BUNDLE_DIR/src/unified-service/"
cp "$ROOT_DIR/src/unified-service/execution-context.js" "$BUNDLE_DIR/src/unified-service/"

# Minimal package.json — handler uses only Node.js built-ins
cat > "$BUNDLE_DIR/package.json" << 'PKGJSON'
{
  "name": "marketplace-agents",
  "version": "1.0.0",
  "description": "Marketplace Agents Cloud Function — Package + Deprecation",
  "main": "index.js",
  "engines": {
    "node": ">=20.0.0"
  }
}
PKGJSON

echo "==> Bundle contents:"
find "$BUNDLE_DIR" -type f | sort | sed "s|$BUNDLE_DIR/||"

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "==> Dry run — skipping deploy."
  exit 0
fi

echo "==> Deploying marketplace-agents Cloud Function…"
gcloud functions deploy marketplace-agents \
  --source "$BUNDLE_DIR" \
  --runtime nodejs20 \
  --trigger-http \
  --region us-central1 \
  --project agentics-dev \
  --entry-point handler \
  --memory 512MB \
  --timeout 60s \
  --no-allow-unauthenticated \
  --gen2

echo "==> Deploy complete."
echo "    URL: https://us-central1-agentics-dev.cloudfunctions.net/marketplace-agents"
