# NPM Publishing Guide for LLM Marketplace

Complete guide for publishing LLM Marketplace packages to NPM registry.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Package Structure](#package-structure)
- [Publishing Methods](#publishing-methods)
- [Step-by-Step Instructions](#step-by-step-instructions)
- [Automated Publishing with GitHub Actions](#automated-publishing-with-github-actions)
- [Manual Publishing](#manual-publishing)
- [Version Management](#version-management)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### 1. NPM Account Setup

1. **Create NPM account** (if you don't have one):
   ```bash
   # Visit https://www.npmjs.com/signup
   ```

2. **Enable 2FA (Two-Factor Authentication)**:
   - Go to https://www.npmjs.com/settings/~/profile
   - Enable 2FA for publishing

3. **Create NPM Access Token**:
   ```bash
   # Login to NPM
   npm login

   # Or create token via web interface:
   # https://www.npmjs.com/settings/~/tokens
   # Choose "Automation" token type
   ```

### 2. GitHub Secrets Configuration

Add the NPM token to GitHub repository secrets:

1. Go to: `https://github.com/roshanrameshhub/CortexOps/settings/secrets/actions`
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: Your NPM automation token
5. Click "Add secret"

## Package Structure

The monorepo contains these publishable packages:

| Package | NPM Name | Description |
|---------|----------|-------------|
| JavaScript SDK | `@llm-marketplace/sdk` | Official TypeScript/JavaScript SDK |
| Model Marketplace | `@llm-marketplace/model-marketplace` | Fine-tuned model marketplace service |
| Tenant Management | `@llm-marketplace/tenant-management` | Multi-tenancy management service |
| GraphQL Gateway | `@llm-marketplace/graphql-gateway` | Unified GraphQL API gateway |

## Publishing Methods

### Method 1: Automated via GitHub Actions (Recommended)

The repository includes automated publishing workflows that trigger on:
- Creating a new GitHub release
- Manual workflow dispatch

### Method 2: Manual Release Script

Use the provided release script for local releases:
```bash
./scripts/release.sh [patch|minor|major]
```

### Method 3: Manual NPM Commands

Direct NPM commands for manual control:
```bash
npm run publish:packages
```

## Step-by-Step Instructions

### Option A: Automated Publishing (Recommended)

#### Using GitHub Actions Workflow Dispatch:

1. **Go to GitHub Actions**:
   ```
   https://github.com/roshanrameshhub/CortexOps/actions
   ```

2. **Select "Publish to NPM" workflow**

3. **Click "Run workflow"**

4. **Choose version type**:
   - `patch` - Bug fixes (1.1.0 → 1.1.1)
   - `minor` - New features (1.1.0 → 1.2.0)
   - `major` - Breaking changes (1.1.0 → 2.0.0)

5. **Click "Run workflow"**

6. **Monitor the workflow**:
   - Tests will run automatically
   - Packages will be built
   - Version will be bumped
   - Packages will be published to NPM

#### Using GitHub Releases:

1. **Create a new release**:
   ```
   https://github.com/roshanrameshhub/CortexOps/releases/new
   ```

2. **Fill in release details**:
   - Tag version: `v1.1.0` (use semantic versioning)
   - Release title: `Release v1.1.0`
   - Description: Changelog and notable changes

3. **Click "Publish release"**

4. **GitHub Actions will automatically**:
   - Run tests
   - Build packages
   - Publish to NPM

### Option B: Using Release Script

1. **Ensure you're on main branch**:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Run the release script**:
   ```bash
   # For patch release (1.1.0 → 1.1.1)
   ./scripts/release.sh patch

   # For minor release (1.1.0 → 1.2.0)
   ./scripts/release.sh minor

   # For major release (1.1.0 → 2.0.0)
   ./scripts/release.sh major
   ```

3. **The script will**:
   - Pull latest changes
   - Install dependencies
   - Run tests and linting
   - Build all packages
   - Bump version in all packages
   - Create git commit and tag
   - Push to remote
   - Trigger GitHub Actions for NPM publishing

### Option C: Manual Publishing (Not Recommended)

Only use this if automated methods are not available.

1. **Login to NPM**:
   ```bash
   npm login
   ```

2. **Verify packages**:
   ```bash
   ./scripts/check-packages.sh
   ```

3. **Build all packages**:
   ```bash
   npm run build
   ```

4. **Publish using script**:
   ```bash
   ./scripts/publish-local.sh
   ```

   Or publish individually:
   ```bash
   # Publish SDK
   npm publish --workspace=sdks/javascript --access public

   # Publish Model Marketplace
   npm publish --workspace=services/model-marketplace --access public

   # Publish Tenant Management
   npm publish --workspace=services/tenant-management --access public

   # Publish GraphQL Gateway
   npm publish --workspace=services/graphql-gateway --access public
   ```

## Version Management

### Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features (backward compatible)
- **PATCH** (1.0.0 → 1.0.1): Bug fixes (backward compatible)

### Version Bumping Commands

```bash
# Bump patch version (all packages)
npm run version:patch

# Bump minor version (all packages)
npm run version:minor

# Bump major version (all packages)
npm run version:major
```

### Pre-release Versions

For beta/alpha releases:

```bash
# Create beta release
npm version prerelease --preid=beta --workspaces --no-git-tag-version

# Publish with beta tag
npm publish --workspace=sdks/javascript --tag beta --access public
```

## Dry Run Testing

Always test publishing before actual release:

```bash
# Test what would be published
npm run publish:dry-run

# Or manually
npm publish --workspaces --access public --dry-run
```

## Package Validation

Before publishing, validate all packages:

```bash
./scripts/check-packages.sh
```

This checks:
- ✓ package.json configuration
- ✓ Required fields (name, version, main, types)
- ✓ LICENSE file presence
- ✓ README.md presence
- ✓ .npmignore configuration
- ✓ Built dist/ directory
- ✓ publishConfig settings

## Troubleshooting

### Error: "You must be logged in to publish packages"

**Solution**:
```bash
npm login
# Enter your credentials
npm whoami  # Verify login
```

### Error: "You do not have permission to publish"

**Solution**:
1. Verify you're a collaborator on the NPM organization
2. Check NPM token has publish permissions
3. Ensure 2FA is configured correctly

### Error: "Version already published"

**Solution**:
```bash
# Bump version first
npm version patch --workspaces --no-git-tag-version
```

### Error: "Package name already exists"

**Solution**:
- Package names are scoped to `@llm-marketplace/`
- Ensure you have access to the NPM organization
- Contact organization admin for access

### Build Errors

**Solution**:
```bash
# Clean install
npm ci

# Clean build
npm run clean
npm run build

# Check TypeScript errors
npm run typecheck
```

### GitHub Actions Failing

**Check**:
1. NPM_TOKEN secret is set correctly
2. Tests are passing locally
3. No TypeScript errors
4. All dependencies are installed

**Debug**:
```bash
# Run same commands as CI locally
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Publishing Checklist

Before publishing, ensure:

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] All packages build successfully (`npm run build`)
- [ ] README files are up to date
- [ ] CHANGELOG is updated
- [ ] Version numbers are correct
- [ ] LICENSE files are present
- [ ] No sensitive data in packages
- [ ] .npmignore files are configured
- [ ] Git working directory is clean
- [ ] On main branch
- [ ] Latest changes pulled from remote

## Post-Publishing

After successful publishing:

1. **Verify on NPM**:
   - https://www.npmjs.com/package/@llm-marketplace/sdk
   - https://www.npmjs.com/package/@llm-marketplace/model-marketplace
   - https://www.npmjs.com/package/@llm-marketplace/tenant-management
   - https://www.npmjs.com/package/@llm-marketplace/graphql-gateway

2. **Test installation**:
   ```bash
   npm install @llm-marketplace/sdk
   ```

3. **Update documentation** with new version numbers

4. **Announce release** (if major/minor):
   - GitHub Discussions
   - Twitter/Social media
   - Documentation site

## NPM Commands Reference

```bash
# List all packages
npm list --workspaces --depth=0

# View package info
npm view @llm-marketplace/sdk

# Check outdated dependencies
npm outdated --workspaces

# Update dependencies
npm update --workspaces

# Audit for vulnerabilities
npm audit --workspaces

# Fix vulnerabilities
npm audit fix --workspaces
```

## CI/CD Workflow

The automated publishing workflow (`.github/workflows/npm-publish.yml`) includes:

1. **Test Job**: Runs on Node 18.x and 20.x
   - Checkout code
   - Install dependencies
   - Run linters
   - Run type checking
   - Run tests

2. **Build Job**: Builds all packages
   - Checkout code
   - Install dependencies
   - Build packages
   - Upload artifacts

3. **Publish Job**: Publishes to NPM
   - Download build artifacts
   - Bump version (if workflow_dispatch)
   - Publish each package
   - Create release summary

## Support

For issues or questions:
- GitHub Issues: https://github.com/roshanrameshhub/CortexOps/issues
- Email: support@llm-marketplace.com

## Resources

- [NPM Documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [npm workspaces](https://docs.npmjs.com/cli/v8/using-npm/workspaces)
