.PHONY: build test benchmark run docker-build docker-run clean

# Variables
SERVICE_NAME=discovery-service
DOCKER_IMAGE=llm-marketplace/$(SERVICE_NAME)
VERSION?=latest

# Build the service
build:
	@echo "Building $(SERVICE_NAME)..."
	go build -o bin/$(SERVICE_NAME) cmd/main.go

# Run tests
test:
	@echo "Running tests..."
	go test -v -race -coverprofile=coverage.out ./...

# Run benchmarks
benchmark:
	@echo "Running benchmarks..."
	go test -bench=. -benchmem -run=^$$ ./tests/

# Run load tests
load-test:
	@echo "Running load tests..."
	go test -v -timeout 30m ./tests/ -run TestLoadTest

# Run the service locally
run:
	@echo "Running $(SERVICE_NAME)..."
	go run cmd/main.go

# Build Docker image
docker-build:
	@echo "Building Docker image..."
	docker build -t $(DOCKER_IMAGE):$(VERSION) .

# Run Docker container
docker-run:
	@echo "Running Docker container..."
	docker run -p 8080:8080 -p 9090:9090 \
		--env-file .env \
		$(DOCKER_IMAGE):$(VERSION)

# Run with docker-compose
docker-compose-up:
	@echo "Starting services with docker-compose..."
	docker-compose up -d

# Stop docker-compose
docker-compose-down:
	@echo "Stopping services..."
	docker-compose down

# Run linter
lint:
	@echo "Running linter..."
	golangci-lint run

# Format code
fmt:
	@echo "Formatting code..."
	go fmt ./...
	goimports -w .

# Generate code coverage report
coverage:
	@echo "Generating coverage report..."
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf bin/
	rm -f coverage.out coverage.html

# Install dependencies
deps:
	@echo "Installing dependencies..."
	go mod download
	go mod tidy

# Performance test
perf-test:
	@echo "Running performance tests..."
	@echo "Starting load test with 100 concurrent users..."
	go test -v ./tests/ -run TestThroughput
	@echo "\nGenerating performance report..."
	go test -v ./tests/ -run GeneratePerformanceReport

# Help
help:
	@echo "Available targets:"
	@echo "  build           - Build the service"
	@echo "  test            - Run unit tests"
	@echo "  benchmark       - Run benchmarks"
	@echo "  load-test       - Run load tests"
	@echo "  run             - Run the service locally"
	@echo "  docker-build    - Build Docker image"
	@echo "  docker-run      - Run Docker container"
	@echo "  docker-compose-up   - Start with docker-compose"
	@echo "  docker-compose-down - Stop docker-compose services"
	@echo "  lint            - Run linter"
	@echo "  fmt             - Format code"
	@echo "  coverage        - Generate coverage report"
	@echo "  clean           - Clean build artifacts"
	@echo "  deps            - Install dependencies"
	@echo "  perf-test       - Run performance tests"
