.PHONY: proto build test clean run docker-build

# Variables
PROTO_DIR := api/proto
PROTO_OUT := api/proto/v1
BINARY_NAME := policy-engine
DOCKER_IMAGE := llm-marketplace/policy-engine:latest

# Generate gRPC code from proto files
proto:
	@echo "Generating gRPC code from proto files..."
	mkdir -p $(PROTO_OUT)
	protoc --go_out=$(PROTO_OUT) --go_opt=paths=source_relative \
		--go-grpc_out=$(PROTO_OUT) --go-grpc_opt=paths=source_relative \
		$(PROTO_DIR)/policy_engine.proto
	@echo "Proto generation complete"

# Download dependencies
deps:
	@echo "Downloading dependencies..."
	go mod download
	go mod tidy
	@echo "Dependencies downloaded"

# Build the binary
build: proto
	@echo "Building $(BINARY_NAME)..."
	go build -o bin/$(BINARY_NAME) cmd/server/main.go
	@echo "Build complete: bin/$(BINARY_NAME)"

# Run tests
test:
	@echo "Running tests..."
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Tests complete"

# Run the server locally
run: build
	@echo "Starting Policy Engine server..."
	./bin/$(BINARY_NAME)

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/
	rm -rf $(PROTO_OUT)
	rm -f coverage.out coverage.html
	@echo "Clean complete"

# Build Docker image
docker-build:
	@echo "Building Docker image..."
	docker build -t $(DOCKER_IMAGE) .
	@echo "Docker image built: $(DOCKER_IMAGE)"

# Run in Docker
docker-run: docker-build
	@echo "Running in Docker..."
	docker run -p 50051:50051 --env-file .env $(DOCKER_IMAGE)

# Lint code
lint:
	@echo "Linting code..."
	go vet ./...
	@echo "Lint complete"

# Format code
fmt:
	@echo "Formatting code..."
	go fmt ./...
	@echo "Format complete"

# Run all checks
check: fmt lint test

# Install development tools
install-tools:
	@echo "Installing development tools..."
	go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
	@echo "Tools installed"
