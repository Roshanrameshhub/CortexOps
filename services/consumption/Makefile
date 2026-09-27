.PHONY: help build run test bench clean docker-build docker-run migrate fmt lint

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the project
	cargo build --release

run: ## Run the service
	cargo run

test: ## Run tests
	cargo test

bench: ## Run benchmarks
	cargo bench

clean: ## Clean build artifacts
	cargo clean

docker-build: ## Build Docker image
	docker build -t llm-marketplace/consumption:latest .

docker-run: ## Run Docker container
	docker-compose up -d

docker-stop: ## Stop Docker containers
	docker-compose down

migrate: ## Run database migrations
	@echo "Running migrations..."
	psql $(DATABASE_URL) -f migrations/001_init.sql

fmt: ## Format code
	cargo fmt

lint: ## Run clippy linter
	cargo clippy -- -D warnings

check: ## Run all checks (fmt, lint, test)
	cargo fmt -- --check
	cargo clippy -- -D warnings
	cargo test

dev: ## Start development environment
	docker-compose up -d postgres redis jaeger
	@echo "Waiting for services to start..."
	@sleep 5
	make migrate
	cargo run

watch: ## Watch and rebuild on changes
	cargo watch -x run

logs: ## View Docker logs
	docker-compose logs -f consumption

metrics: ## Open Prometheus metrics
	@echo "Opening http://localhost:9090"
	@open http://localhost:9090 || xdg-open http://localhost:9090

traces: ## Open Jaeger UI
	@echo "Opening http://localhost:16686"
	@open http://localhost:16686 || xdg-open http://localhost:16686

grafana: ## Open Grafana
	@echo "Opening http://localhost:3001"
	@open http://localhost:3001 || xdg-open http://localhost:3001

load-test: ## Run load test
	@echo "Running load test..."
	wrk -t12 -c100 -d30s http://localhost:3000/health

benchmark-results: ## Open benchmark results in browser
	@echo "Opening benchmark results..."
	@open target/criterion/report/index.html || xdg-open target/criterion/report/index.html
