# Multi-stage build for Discovery Service (Go)

# Stage 1: Build
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -installsuffix cgo -ldflags="-w -s" -o /bin/discovery ./cmd/main.go

# Stage 2: Production
FROM alpine:3.19

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /bin/discovery /app/discovery

# Create non-root user
RUN addgroup -g 1001 -S discovery && \
    adduser -S discovery -u 1001 -G discovery

# Change ownership
RUN chown -R discovery:discovery /app

# Switch to non-root user
USER discovery

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Start application
CMD ["/app/discovery"]
