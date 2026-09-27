# NPM Publishing Quick Start Guide

## 🚀 Quick Setup (One-Time)

### 1. Add NPM Token to GitHub Secrets

1. **Get your NPM automation token**:
   ```bash
   # Login to npm (if not already)
   npm login

   # Or create a token at: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   # Choose "Automation" token type
   ```

2. **Add to GitHub Secrets**:
   - Go to: https://github.com/roshanrameshhub/inferops/settings/secrets/actions
   - Click **"New repository secret"**
   - Name: `NPM_TOKEN`
   - Value: Your NPM automation token (starts with `npm_...`)
   - Click **"Add secret"**

### 2. Join NPM Organization

Make sure you're a member of the `@llm-dev-ops` organization on NPM:
- Contact the org owner to add you
- Or create the org at: https://www.npmjs.com/org/create

---

## 📦 Packages to be Published

| Package Name | Description |
|--------------|-------------|
| `@llm-dev-ops/llm-marketplace-sdk` | Official JavaScript/TypeScript SDK |
| `@llm-dev-ops/llm-marketplace-model-marketplace` | Fine-tuned model marketplace service |
| `@llm-dev-ops/llm-marketplace-tenant-management` | Multi-tenancy management service |
| `@llm-dev-ops/llm-marketplace-graphql-gateway` | Unified GraphQL API gateway |

---

## 🎯 Publishing Methods

### Method 1: GitHub Actions (Recommended) ✅

**Trigger automated publishing via GitHub UI:**

1. Go to: https://github.com/roshanrameshhub/inferops/actions/workflows/npm-publish.yml

2. Click **"Run workflow"** button

3. Select:
   - Branch: `main`
   - Version type: `patch` / `minor` / `major`

4. Click **"Run workflow"**

5. Monitor progress in Actions tab

**What happens automatically:**
- ✓ Runs all tests
- ✓ Builds all packages
- ✓ Bumps version numbers
- ✓ Creates git tag
- ✓ Publishes to NPM
- ✓ Creates release notes

---

### Method 2: Release Script (Local)

**For local releases with full control:**

```bash
# Patch release (1.1.0 → 1.1.1)
./scripts/release.sh patch

# Minor release (1.1.0 → 1.2.0)
./scripts/release.sh minor

# Major release (1.1.0 → 2.0.0)
./scripts/release.sh major
```

**What the script does:**
1. Pulls latest from main
2. Runs tests and linters
3. Builds all packages
4. Bumps version numbers
5. Creates commit and git tag
6. Pushes to GitHub
7. Triggers GitHub Actions to publish

---

### Method 3: Manual Publishing (Advanced)

**Only if automated methods don't work:**

```bash
# 1. Login to NPM
npm login

# 2. Verify packages
./scripts/check-packages.sh

# 3. Build everything
npm run build

# 4. Publish all packages
./scripts/publish-local.sh
```

---

## 🔍 Verification Commands

### Before Publishing

```bash
# Check package configuration
./scripts/check-packages.sh

# Dry run (see what would be published)
npm run publish:dry-run

# Build all packages
npm run build

# Run tests
npm test

# Type checking
npm run typecheck
```

### After Publishing

```bash
# Check if package is live on NPM
npm view @llm-dev-ops/llm-marketplace-sdk
npm view @llm-dev-ops/llm-marketplace-model-marketplace
npm view @llm-dev-ops/llm-marketplace-tenant-management
npm view @llm-dev-ops/llm-marketplace-graphql-gateway

# Install to test
npm install @llm-dev-ops/llm-marketplace-sdk
```

---

## 📋 Pre-Publishing Checklist

Before publishing, ensure:

- [ ] **NPM_TOKEN** secret is added to GitHub
- [ ] You're a member of **@llm-dev-ops** NPM organization
- [ ] On **main** branch: `git checkout main`
- [ ] Latest code pulled: `git pull origin main`
- [ ] No uncommitted changes: `git status`
- [ ] All tests pass: `npm test`
- [ ] Builds successfully: `npm run build`
- [ ] Package validation passes: `./scripts/check-packages.sh`

---

## 🛠️ Useful Commands

### Version Management

```bash
# Bump patch version (1.1.0 → 1.1.1)
npm run version:patch

# Bump minor version (1.1.0 → 1.2.0)
npm run version:minor

# Bump major version (1.1.0 → 2.0.0)
npm run version:major
```

### Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build:sdk
npm run build:model-marketplace
npm run build:tenant-management
npm run build:graphql-gateway
```

### Testing

```bash
# Run all tests
npm test

# Run linters
npm run lint

# Type checking
npm run typecheck
```

---

## 🎬 Complete Publishing Workflow

### Using GitHub Actions (Easiest):

```
1. Make sure NPM_TOKEN is in GitHub Secrets ✓
2. Go to Actions → Publish to NPM workflow
3. Click "Run workflow"
4. Select version type (patch/minor/major)
5. Click "Run workflow" button
6. Wait for workflow to complete (~5 min)
7. Verify packages on NPM ✓
```

### Using Release Script:

```bash
# 1. Ensure you're ready
git checkout main
git pull origin main
./scripts/check-packages.sh

# 2. Run release script
./scripts/release.sh patch  # or minor/major

# 3. Wait for GitHub Actions to publish automatically

# 4. Verify
npm view @llm-dev-ops/llm-marketplace-sdk
```

---

## 🔗 Important Links

- **NPM Organization**: https://www.npmjs.com/org/llm-dev-ops
- **GitHub Repository**: https://github.com/roshanrameshhub/inferops
- **GitHub Actions**: https://github.com/roshanrameshhub/inferops/actions
- **GitHub Secrets**: https://github.com/roshanrameshhub/inferops/settings/secrets/actions

### Published Packages

- https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-sdk
- https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-model-marketplace
- https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-tenant-management
- https://www.npmjs.com/package/@llm-dev-ops/llm-marketplace-graphql-gateway

---

## ⚠️ Troubleshooting

### "You do not have permission to publish"

**Solution**: Make sure you're a member of the `@llm-dev-ops` NPM organization.

```bash
# Check your NPM username
npm whoami

# Contact org owner to add you to @llm-dev-ops
```

### "Version already exists"

**Solution**: Bump the version before publishing.

```bash
# Increment version
npm run version:patch

# Then publish again
```

### GitHub Actions failing

**Check**:
1. NPM_TOKEN secret is set correctly
2. Token has "Automation" permissions
3. Token hasn't expired

**Re-add token**:
- Go to: https://github.com/roshanrameshhub/inferops/settings/secrets/actions
- Update NPM_TOKEN with new value

### Build errors

```bash
# Clean everything
npm run clean
rm -rf node_modules package-lock.json
rm -rf */node_modules */package-lock.json

# Fresh install
npm install

# Rebuild
npm run build
```

---

## 📞 Support

For issues or questions:
- GitHub Issues: https://github.com/roshanrameshhub/inferops/issues
- Check full guide: [docs/NPM_PUBLISHING_GUIDE.md](docs/NPM_PUBLISHING_GUIDE.md)

---

## ✅ Next Steps After This Setup

1. **Add NPM_TOKEN to GitHub Secrets** (see step 1 above)
2. **Run the workflow**: Go to Actions → Publish to NPM → Run workflow
3. **Verify packages are published**: Check NPM links above

That's it! 🎉
