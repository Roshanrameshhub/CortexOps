# Multi-stage build for Consumption Service (Rust)

# Stage 1: Build
FROM rust:1.75-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache musl-dev openssl-dev

# Copy manifest files
COPY Cargo.toml Cargo.lock ./

# Create dummy src to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies (cached layer)
RUN cargo build --release

# Remove dummy files
RUN rm -rf src

# Copy actual source code
COPY src ./src

# Build for release
RUN cargo build --release

# Stage 2: Production
FROM alpine:3.19

# Install runtime dependencies
RUN apk --no-cache add ca-certificates libgcc

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/consumption /app/consumption

# Create non-root user
RUN addgroup -g 1001 -S consumption && \
    adduser -S consumption -u 1001 -G consumption

# Change ownership
RUN chown -R consumption:consumption /app

# Switch to non-root user
USER consumption

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

# Start application
CMD ["/app/consumption"]
