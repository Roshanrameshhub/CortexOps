# Multi-stage build for Policy Engine

# Stage 1: Build proto files
FROM golang:1.21-alpine AS proto-builder

RUN apk add --no-cache protobuf-dev

WORKDIR /workspace

# Install protoc plugins
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Copy proto files
COPY api/proto/ /workspace/api/proto/

# Generate Go code from proto files
RUN mkdir -p api/proto/v1 && \
    protoc --go_out=api/proto/v1 --go_opt=paths=source_relative \
           --go-grpc_out=api/proto/v1 --go-grpc_opt=paths=source_relative \
           api/proto/policy_engine.proto

# Stage 2: Build application
FROM golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git make

WORKDIR /workspace

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy generated proto files
COPY --from=proto-builder /workspace/api/proto/v1/ ./api/proto/v1/

# Copy source code
COPY cmd/ ./cmd/
COPY internal/ ./internal/

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo \
    -ldflags="-w -s" \
    -o /policy-engine \
    ./cmd/server/main.go

# Stage 3: Final runtime image
FROM alpine:3.19

# Install runtime dependencies
RUN apk --no-cache add ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 policyengine && \
    adduser -D -u 1000 -G policyengine policyengine

WORKDIR /app

# Copy binary from builder
COPY --from=builder --chown=policyengine:policyengine /policy-engine /app/policy-engine

# Switch to non-root user
USER policyengine

# Expose ports
EXPOSE 50051 9090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD /app/policy-engine --health-check || exit 1

# Run the binary
ENTRYPOINT ["/app/policy-engine"]
