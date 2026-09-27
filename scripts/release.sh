#!/bin/bash

# LLM Marketplace Release Script
# This script automates the release process for all npm packages

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

# Check if we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_error "Must be on main branch to release. Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_error "You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Get version type
VERSION_TYPE=${1:-patch}
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Invalid version type. Must be: patch, minor, or major"
    exit 1
fi

print_header "LLM Marketplace Release - $VERSION_TYPE"

# Pull latest changes
print_warning "Pulling latest changes from origin/main..."
git pull origin main

# Install dependencies
print_warning "Installing dependencies..."
npm ci

# Run tests
print_warning "Running tests..."
npm test

# Run linting
print_warning "Running linters..."
npm run lint

# Run type checking
print_warning "Running type checking..."
npm run typecheck

# Build all packages
print_warning "Building all packages..."
npm run build

# Copy LICENSE to each package
print_warning "Copying LICENSE to packages..."
cp LICENSE sdks/javascript/LICENSE
cp LICENSE services/model-marketplace/LICENSE
cp LICENSE services/tenant-management/LICENSE
cp LICENSE services/graphql-gateway/LICENSE

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

print_success "Release complete!"
print_success "Version $NEW_VERSION has been released and tagged."
print_success ""
print_success "GitHub Actions will automatically publish packages to NPM."
print_success "Monitor the workflow at: https://github.com/roshanrameshhub/inferops/actions"
