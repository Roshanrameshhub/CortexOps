.PHONY: help install dev test coverage lint format clean run docker-build docker-run

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	pip install -r requirements.txt

dev: ## Install development dependencies
	pip install -r requirements.txt
	pip install black pylint mypy pytest-watch

test: ## Run tests
	pytest

coverage: ## Run tests with coverage report
	pytest --cov=. --cov-report=html --cov-report=term-missing

test-watch: ## Run tests in watch mode
	pytest-watch

lint: ## Run linters
	pylint *.py services/ integrations/
	mypy .

format: ## Format code with black
	black .

format-check: ## Check code formatting
	black --check .

clean: ## Clean up generated files
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete
	find . -type f -name '*.pyo' -delete
	find . -type d -name '*.egg-info' -exec rm -rf {} +
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -rf dist
	rm -rf build

run: ## Run the service
	uvicorn main:app --host 0.0.0.0 --port 3004 --reload

run-prod: ## Run the service in production mode
	uvicorn main:app --host 0.0.0.0 --port 3004 --workers 4

docker-build: ## Build Docker image
	docker build -t llm-marketplace/admin-service:latest .

docker-run: ## Run Docker container
	docker run -p 3004:3004 --env-file .env llm-marketplace/admin-service:latest

init-db: ## Initialize database
	python -c "from database import init_db; init_db()"

db-migrate: ## Run database migrations (placeholder)
	@echo "Database migrations not yet implemented"

check: lint format-check test ## Run all checks (lint, format, test)

ci: install check coverage ## Run CI pipeline

.DEFAULT_GOAL := help
