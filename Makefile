.PHONY: help install-deps clean build test lint format docker-up docker-down verify-env

# Default target
help:
	@echo "InferOps - Available Commands:"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install-deps        Install all dependencies (Node.js, Go, Rust, Python)"
	@echo "  make verify-env          Verify development environment is ready"
	@echo ""
	@echo "Development:"
	@echo "  make dev                 Start all services in development mode"
	@echo "  make dev-publishing      Start publishing service only"
	@echo "  make dev-discovery       Start discovery service only"
	@echo "  make dev-consumption     Start consumption service only"
	@echo "  make dev-admin           Start admin service only"
	@echo ""
	@echo "Build:"
	@echo "  make build               Build all services"
	@echo "  make build-publishing    Build publishing service"
	@echo "  make build-discovery     Build discovery service"
	@echo "  make build-consumption   Build consumption service"
	@echo "  make build-admin         Build admin service"
	@echo ""
	@echo "Testing:"
	@echo "  make test                Run all tests"
	@echo "  make test-unit           Run unit tests only"
	@echo "  make test-integration    Run integration tests"
	@echo "  make test-e2e            Run end-to-end tests"
	@echo "  make test-performance    Run performance tests"
	@echo "  make coverage            Generate test coverage report"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint                Lint all code"
	@echo "  make lint-fix            Lint and auto-fix issues"
	@echo "  make format              Format all code"
	@echo "  make format-check        Check code formatting"
	@echo "  make typecheck           Run TypeScript type checking"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up           Start all infrastructure services"
	@echo "  make docker-down         Stop all infrastructure services"
	@echo "  make docker-build        Build all Docker images"
	@echo "  make docker-logs         View Docker logs"
	@echo "  make docker-clean        Clean Docker volumes and images"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate          Run database migrations"
	@echo "  make db-migrate-down     Rollback last migration"
	@echo "  make db-seed             Seed database with test data"
	@echo "  make db-reset            Reset database (drop, create, migrate, seed)"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean               Clean build artifacts"
	@echo "  make clean-all           Clean everything (artifacts, deps, docker)"
	@echo ""

# Installation & Setup
install-deps:
	@echo "Installing Node.js dependencies..."
	npm install
	@echo "Installing Go dependencies for Discovery service..."
	cd services/discovery && go mod download
	@echo "Installing Rust dependencies for Consumption service..."
	cd services/consumption && cargo fetch
	@echo "Installing Python dependencies for Admin service..."
	cd services/admin && pip install -r requirements.txt
	@echo "All dependencies installed successfully!"

verify-env:
	@echo "Verifying development environment..."
	@command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is not installed"; exit 1; }
	@command -v go >/dev/null 2>&1 || { echo "ERROR: Go is not installed"; exit 1; }
	@command -v cargo >/dev/null 2>&1 || { echo "ERROR: Rust is not installed"; exit 1; }
	@command -v python3 >/dev/null 2>&1 || { echo "ERROR: Python 3 is not installed"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed"; exit 1; }
	@echo "Node.js version: $$(node --version)"
	@echo "Go version: $$(go version)"
	@echo "Rust version: $$(cargo --version)"
	@echo "Python version: $$(python3 --version)"
	@echo "Docker version: $$(docker --version)"
	@echo "Environment verification complete!"

# Development
dev:
	docker-compose up -d postgres redis elasticsearch kafka jaeger
	npm run dev

dev-publishing:
	npm run dev:publishing

dev-admin:
	npm run dev:admin

dev-discovery:
	cd services/discovery && go run main.go

dev-consumption:
	cd services/consumption && cargo run

# Build
build:
	npm run build
	$(MAKE) build-discovery
	$(MAKE) build-consumption

build-publishing:
	npm run build:publishing

build-admin:
	npm run build:admin

build-discovery:
	cd services/discovery && go build -o bin/discovery cmd/main.go

build-consumption:
	cd services/consumption && cargo build --release

# Testing
test:
	npm run test
	$(MAKE) test-discovery
	$(MAKE) test-consumption

test-unit:
	npm run test:unit
	cd services/discovery && go test ./... -v
	cd services/consumption && cargo test

test-integration:
	npm run test:integration

test-e2e:
	npm run test:e2e

test-performance:
	cd tests/performance && k6 run load-test.js

coverage:
	npm run test -- --coverage
	cd services/discovery && go test ./... -coverprofile=coverage.out
	cd services/consumption && cargo tarpaulin --out Html

# Code Quality
lint:
	npm run lint
	cd services/discovery && golangci-lint run
	cd services/consumption && cargo clippy
	cd services/admin && pylint **/*.py

lint-fix:
	npm run lint:fix
	cd services/discovery && golangci-lint run --fix
	cd services/consumption && cargo clippy --fix
	cd services/admin && autopep8 --in-place --recursive .

format:
	npm run format
	cd services/discovery && gofmt -w .
	cd services/consumption && cargo fmt
	cd services/admin && black .

format-check:
	npm run format:check
	cd services/discovery && gofmt -l .
	cd services/consumption && cargo fmt -- --check
	cd services/admin && black --check .

typecheck:
	npm run typecheck

# Docker
docker-up:
	docker-compose up -d
	@echo "Waiting for services to be healthy..."
	@sleep 10
	docker-compose ps

docker-down:
	docker-compose down

docker-build:
	docker-compose build

docker-logs:
	docker-compose logs -f

docker-clean:
	docker-compose down -v
	docker system prune -f

# Database
db-migrate:
	npm run migrate:up

db-migrate-down:
	npm run migrate:down

db-seed:
	npm run seed

db-reset:
	docker-compose down -v postgres
	docker-compose up -d postgres
	@sleep 5
	$(MAKE) db-migrate
	$(MAKE) db-seed

# Clean
clean:
	npm run clean
	rm -rf dist coverage .cache
	cd services/discovery && rm -rf bin
	cd services/consumption && cargo clean
	find . -type d -name "__pycache__" -exec rm -rf {} +

clean-all: clean docker-clean
	rm -rf node_modules
	cd services/discovery && rm -rf vendor
	cd services/consumption && rm -rf target
	cd services/admin && rm -rf venv .venv

# CI/CD
ci-test:
	$(MAKE) verify-env
	$(MAKE) install-deps
	$(MAKE) lint
	$(MAKE) typecheck
	$(MAKE) test-unit

ci-build:
	$(MAKE) build
	$(MAKE) docker-build

ci-deploy-staging:
	kubectl config use-context staging
	kubectl apply -k infrastructure/kubernetes/overlays/staging

ci-deploy-production:
	kubectl config use-context production
	kubectl apply -k infrastructure/kubernetes/overlays/production

# Infrastructure
infra-plan:
	cd infrastructure/terraform && terraform plan

infra-apply:
	cd infrastructure/terraform && terraform apply

infra-destroy:
	cd infrastructure/terraform && terraform destroy

# Security
security-scan:
	npm audit
	cd services/discovery && go list -json -m all | docker run --rm -i sonatypecommunity/nancy:latest sleuth
	cd services/consumption && cargo audit
	cd services/admin && safety check

# Performance Benchmarks
benchmark:
	cd services/discovery && go test -bench=. -benchmem
	cd services/consumption && cargo bench
