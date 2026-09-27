# CortexOps Unified Service
# Lightweight container for Cloud Run deployment

FROM node:20-alpine

WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S marketplace -u 1001 -G nodejs

# Copy unified service
COPY --chown=marketplace:nodejs src/unified-service/server.js ./server.js

# Environment configuration
ENV NODE_ENV=production
ENV PORT=8080
ENV SERVICE_NAME=cortexops
ENV SERVICE_VERSION=1.1.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Switch to non-root user
USER marketplace

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
