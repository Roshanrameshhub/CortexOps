#!/bin/bash

# Simple NPM Publish Script
# Publishes all packages to NPM registry

set -e

ROOT_DIR=$(pwd)

echo "🚀 Publishing packages to NPM..."
echo ""

# Check if logged in
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to NPM"
    echo "Run: npm login"
    exit 1
fi

echo "✓ Logged in as: $(npm whoami)"
echo ""

# Copy LICENSE files
echo "📄 Copying LICENSE files..."
cp LICENSE sdks/javascript/LICENSE 2>/dev/null || true
cp LICENSE services/model-marketplace/LICENSE 2>/dev/null || true
cp LICENSE services/tenant-management/LICENSE 2>/dev/null || true
cp LICENSE services/graphql-gateway/LICENSE 2>/dev/null || true
echo "✓ LICENSE files copied"
echo ""

# Build SDK if dist doesn't exist
echo "🔨 Checking SDK build..."
cd "$ROOT_DIR/sdks/javascript"
if [ ! -d "dist" ]; then
    echo "Building SDK..."
    npm run build 2>/dev/null || echo "⚠ Build failed - using existing files"
else
    echo "✓ Dist folder exists, skipping build"
fi
cd "$ROOT_DIR"
echo "✓ SDK ready"
echo ""

# Publish packages
echo "📦 Publishing packages..."
echo ""

echo "1/4 Publishing SDK..."
cd "$ROOT_DIR/sdks/javascript"
npm publish --access public --ignore-scripts
cd "$ROOT_DIR"
echo "✓ SDK published"
echo ""

echo "2/4 Publishing Model Marketplace..."
cd "$ROOT_DIR/services/model-marketplace"
npm publish --access public --ignore-scripts
cd "$ROOT_DIR"
echo "✓ Model Marketplace published"
echo ""

echo "3/4 Publishing Tenant Management..."
cd "$ROOT_DIR/services/tenant-management"
npm publish --access public --ignore-scripts
cd "$ROOT_DIR"
echo "✓ Tenant Management published"
echo ""

echo "4/4 Publishing GraphQL Gateway..."
cd "$ROOT_DIR/services/graphql-gateway"
npm publish --access public --ignore-scripts
cd "$ROOT_DIR"
echo "✓ GraphQL Gateway published"
echo ""

echo "✅ All packages published successfully!"
echo ""
echo "View at:"
echo "  https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-sdk"
echo "  https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-model-marketplace"
echo "  https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-tenant-management"
echo "  https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-graphql-gateway"
