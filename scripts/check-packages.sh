#!/bin/bash

# Package Check Script
# Validates that all packages are correctly configured for NPM publishing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

check_package() {
    local package_path=$1
    local package_name=$2

    echo ""
    print_header "Checking: $package_name"

    # Check if package.json exists
    if [ ! -f "$package_path/package.json" ]; then
        print_error "package.json not found"
        return 1
    fi
    print_success "package.json exists"

    # Check for required fields
    local has_name=$(node -p "require('$package_path/package.json').name || ''" 2>/dev/null)
    local has_version=$(node -p "require('$package_path/package.json').version || ''" 2>/dev/null)
    local has_main=$(node -p "require('$package_path/package.json').main || ''" 2>/dev/null)
    local has_types=$(node -p "require('$package_path/package.json').types || ''" 2>/dev/null)

    [ -n "$has_name" ] && print_success "Has name: $has_name" || print_error "Missing name field"
    [ -n "$has_version" ] && print_success "Has version: $has_version" || print_error "Missing version field"
    [ -n "$has_main" ] && print_success "Has main entry: $has_main" || print_error "Missing main field"
    [ -n "$has_types" ] && print_success "Has types: $has_types" || print_warning "Missing types field"

    # Check for LICENSE
    if [ -f "$package_path/LICENSE" ]; then
        print_success "LICENSE file exists"
    else
        print_warning "LICENSE file missing"
    fi

    # Check for README
    if [ -f "$package_path/README.md" ]; then
        print_success "README.md exists"
    else
        print_warning "README.md missing"
    fi

    # Check for .npmignore
    if [ -f "$package_path/.npmignore" ]; then
        print_success ".npmignore exists"
    else
        print_warning ".npmignore missing"
    fi

    # Check if dist directory would be included
    if [ -d "$package_path/dist" ]; then
        print_success "dist/ directory exists"
    else
        print_warning "dist/ directory not found (run build first)"
    fi

    # Check publishConfig
    local has_publish_config=$(node -p "require('$package_path/package.json').publishConfig?.access || ''" 2>/dev/null)
    if [ "$has_publish_config" = "public" ]; then
        print_success "publishConfig.access is set to public"
    else
        print_warning "publishConfig.access not set to public"
    fi
}

print_header "LLM Marketplace Package Validation"

# Check all packages
check_package "sdks/javascript" "@llm-dev-ops/llm-marketplace-sdk"
check_package "services/model-marketplace" "@llm-dev-ops/llm-marketplace-model-marketplace"
check_package "services/tenant-management" "@llm-dev-ops/llm-marketplace-tenant-management"
check_package "services/graphql-gateway" "@llm-dev-ops/llm-marketplace-graphql-gateway"

echo ""
print_header "Dry Run Test"
print_warning "Running npm publish --dry-run for all packages..."

if npm publish --workspaces --access public --dry-run 2>&1 | grep -q "npm notice"; then
    print_success "Dry run successful - packages are ready to publish"
else
    print_error "Dry run failed - check errors above"
    exit 1
fi

echo ""
print_success "All checks passed!"
