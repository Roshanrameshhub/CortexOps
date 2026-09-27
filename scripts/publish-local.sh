#!/bin/bash

# Local NPM Publish Script
# This script publishes all packages to NPM registry
# Use this for manual publishing (not recommended - use GitHub Actions instead)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_header "LLM Marketplace NPM Publish"

# Check if logged in to npm
if ! npm whoami &> /dev/null; then
    print_error "Not logged in to NPM. Please run: npm login"
    exit 1
fi

NPM_USER=$(npm whoami)
print_success "Logged in as: $NPM_USER"

# Confirm publish
echo ""
print_warning "This will publish the following packages to NPM:"
echo "  - @llm-dev-ops/llm-marketplace-sdk"
echo "  - @llm-dev-ops/llm-marketplace-model-marketplace"
echo "  - @llm-dev-ops/llm-marketplace-tenant-management"
echo "  - @llm-dev-ops/llm-marketplace-graphql-gateway"
echo ""
read -p "Are you sure you want to publish? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    print_warning "Publish cancelled."
    exit 0
fi

# Build all packages
print_warning "Building all packages..."
npm run build

# Copy LICENSE to each package
print_warning "Copying LICENSE to packages..."
cp LICENSE sdks/javascript/LICENSE 2>/dev/null || true
cp LICENSE services/model-marketplace/LICENSE 2>/dev/null || true
cp LICENSE services/tenant-management/LICENSE 2>/dev/null || true
cp LICENSE services/graphql-gateway/LICENSE 2>/dev/null || true

# Publish packages
print_header "Publishing Packages"

# Publish SDK
print_warning "Publishing @llm-dev-ops/llm-marketplace-sdk..."
if npm publish --workspace=sdks/javascript --access public; then
    print_success "Published @llm-dev-ops/llm-marketplace-sdk"
else
    print_error "Failed to publish @llm-dev-ops/llm-marketplace-sdk"
fi

# Publish Model Marketplace
print_warning "Publishing @llm-dev-ops/llm-marketplace-model-marketplace..."
if npm publish --workspace=services/model-marketplace --access public; then
    print_success "Published @llm-dev-ops/llm-marketplace-model-marketplace"
else
    print_error "Failed to publish @llm-dev-ops/llm-marketplace-model-marketplace"
fi

# Publish Tenant Management
print_warning "Publishing @llm-dev-ops/llm-marketplace-tenant-management..."
if npm publish --workspace=services/tenant-management --access public; then
    print_success "Published @llm-dev-ops/llm-marketplace-tenant-management"
else
    print_error "Failed to publish @llm-dev-ops/llm-marketplace-tenant-management"
fi

# Publish GraphQL Gateway
print_warning "Publishing @llm-dev-ops/llm-marketplace-graphql-gateway..."
if npm publish --workspace=services/graphql-gateway --access public; then
    print_success "Published @llm-dev-ops/llm-marketplace-graphql-gateway"
else
    print_error "Failed to publish @llm-dev-ops/llm-marketplace-graphql-gateway"
fi

print_header "Publish Complete"
print_success "All packages have been published to NPM"
print_success ""
print_success "View packages at:"
echo "  - https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-sdk"
echo "  - https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-model-marketplace"
echo "  - https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-tenant-management"
echo "  - https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-graphql-gateway"
