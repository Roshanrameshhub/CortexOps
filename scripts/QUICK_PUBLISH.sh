#!/bin/bash

# Quick NPM Publish Script (bypasses full install)
# Use this for faster publishing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

VERSION_TYPE=${1:-patch}

print_header "Quick NPM Publish - $VERSION_TYPE"

# Check if logged in to npm
if ! npm whoami &> /dev/null; then
    print_error "Not logged in to NPM. Please run: npm login"
    exit 1
fi

NPM_USER=$(npm whoami)
print_success "Logged in as: $NPM_USER"

# Copy LICENSE to each package
print_warning "Copying LICENSE to packages..."
cp LICENSE sdks/javascript/LICENSE 2>/dev/null || true
cp LICENSE services/model-marketplace/LICENSE 2>/dev/null || true
cp LICENSE services/tenant-management/LICENSE 2>/dev/null || true
cp LICENSE services/graphql-gateway/LICENSE 2>/dev/null || true

# Bump version
print_warning "Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE --workspaces --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
print_success "New version: $NEW_VERSION"

# Commit version bump
print_warning "Committing version bump..."
git add .
git commit -m "chore: bump version to $NEW_VERSION

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Create git tag
print_warning "Creating git tag v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push changes and tags
print_warning "Pushing to remote..."
git push origin main --tags

print_success ""
print_success "Version $NEW_VERSION has been tagged and pushed!"
print_success ""
print_success "Now run GitHub Actions to publish:"
print_success "https://github.com/roshanrameshhub/inferops/actions/workflows/npm-publish.yml"
print_success ""
print_success "Or publish manually by running:"
print_success "./scripts/publish-local.sh"
