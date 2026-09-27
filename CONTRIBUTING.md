# Contributing to InferOps

Thank you for your interest in contributing to **InferOps**! We welcome contributions, bug fixes, enhancements, and documentation improvements.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for all contributors. Please be respectful and constructive in all communications and reviews.

---

## Getting Started

1. **Fork the Repository**
   Create a fork of the repository on GitHub under your account.

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/roshanrameshhub/inferops.git
   cd inferops
   ```

3. **Set Up Development Environment**
   - Ensure you have **Node.js >= 20.0.0**, **npm >= 10.0.0**, and **Docker** installed.
   - For specific microservices, **Python >= 3.9**, **Go >= 1.21**, or **Rust >= 1.70** may be required.
   - Copy the environment configuration:
     ```bash
     cp .env.example .env
     ```
   - Start local dependencies via Docker Compose:
     ```bash
     docker compose up -d postgres redis elasticsearch kafka jaeger
     ```

4. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## Development & Code Quality Guidelines

Before submitting your changes, ensure your code complies with our standards:

### Monorepo & Workspaces
InferOps uses npm workspaces across multiple packages and services:
- `services/publishing` (TypeScript)
- `services/admin` (Python/FastAPI)
- `services/consumption` (Rust/Axum)
- `services/discovery` (Go/Gin)
- `services/graphql-gateway` (TypeScript/Apollo)
- `services/model-marketplace` (TypeScript/TypeORM)
- `services/tenant-management` (TypeScript/Express)
- `services/ml-recommendations` (Python/TensorFlow)
- `sdks/javascript` (TypeScript SDK)

### Testing & Validation
- Run test suites for any modified components:
  ```bash
  npm test
  ```
- Check linting and formatting:
  ```bash
  npm run lint
  npm run format:check
  ```
- Typecheck TypeScript services:
  ```bash
  npm run typecheck
  ```

---

## Submitting Changes

1. **Commit Guidelines**:
   - Write clear, concise commit messages in conventional commit format:
     - `feat: add model evaluation benchmark`
     - `fix: resolve token bucket rate limiting edge case`
     - `docs: update deployment instructions`
2. **Push to Your Fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
3. **Open a Pull Request**:
   - Target the `main` branch.
   - Provide a clear description of the problem solved and the implementation details.
   - Reference any related issues (e.g., `Fixes #12`).

---

## Security

Please do **NOT** report security vulnerabilities via public GitHub issues. Follow the instructions in our [Security Policy](SECURITY.md).
