.PHONY: help install dev build start test lint clean docker-build docker-run docker-stop

# Variables
PROJECT_NAME = graphql-gateway
DOCKER_IMAGE = llm-marketplace/$(PROJECT_NAME)
DOCKER_TAG = latest
PORT = 4000

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm ci

dev: ## Start development server with hot reload
	npm run dev

build: ## Build TypeScript to JavaScript
	npm run build

start: ## Start production server
	npm start

test: ## Run tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage
	npm run test:coverage

lint: ## Run ESLint
	npm run lint

lint-fix: ## Run ESLint with auto-fix
	npm run lint:fix

typecheck: ## Run TypeScript type checking
	npm run typecheck

clean: ## Remove build artifacts and dependencies
	rm -rf dist/
	rm -rf node_modules/
	rm -rf coverage/
	rm -rf .cache/

format: ## Format code with Prettier
	npx prettier --write 'src/**/*.ts'

docker-build: ## Build Docker image
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

docker-run: ## Run Docker container
	docker run --rm \
		-p $(PORT):4000 \
		-e REDIS_URL=redis://host.docker.internal:6379 \
		-e JWT_SECRET=dev-secret \
		--name $(PROJECT_NAME) \
		$(DOCKER_IMAGE):$(DOCKER_TAG)

docker-stop: ## Stop Docker container
	docker stop $(PROJECT_NAME)

docker-compose-up: ## Start services with Docker Compose
	docker-compose up -d

docker-compose-down: ## Stop services with Docker Compose
	docker-compose down

docker-compose-logs: ## View Docker Compose logs
	docker-compose logs -f

redis-start: ## Start Redis in Docker
	docker run -d --name redis -p 6379:6379 redis:7-alpine

redis-stop: ## Stop Redis container
	docker stop redis && docker rm redis

schema-dump: ## Dump GraphQL schema
	npm run generate-schema

all: clean install build test ## Clean, install, build, and test

.DEFAULT_GOAL := help
