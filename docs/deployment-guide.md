# Deployment Guide

This guide covers deploying LLM-Marketplace in various environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Compose Deployment](#docker-compose-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Cloud Deployments](#cloud-deployments)
6. [Self-Hosted Registry](#self-hosted-registry)
7. [Configuration](#configuration)
8. [Monitoring](#monitoring)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

**Minimum (Development):**
- CPU: 2 cores
- RAM: 4 GB
- Storage: 20 GB
- OS: Linux, macOS, Windows (WSL2)

**Recommended (Production):**
- CPU: 8+ cores
- RAM: 16+ GB
- Storage: 100+ GB SSD
- OS: Linux (Ubuntu 22.04 LTS or similar)

### Software Requirements

- Docker 24.0+
- Docker Compose 2.20+
- Kubernetes 1.28+ (for K8s deployment)
- Helm 3.12+ (for K8s deployment)
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)

---

## Local Development

### Quick Start

```bash
# Clone repository
git clone https://github.com/roshanrameshhub/CortexOps.git
cd CortexOps

# Copy environment template
cp .env.example .env

# Edit configuration
vim .env

# Start services
docker-compose -f docker-compose.dev.yml up -d

# Run migrations
docker-compose exec api llm-marketplace migrate

# Create admin user
docker-compose exec api llm-marketplace admin create \
  --username admin \
  --email admin@localhost \
  --password changeme

# Access at http://localhost:3000
```

### Development Environment Configuration

**.env.example:**

```bash
# Application
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:8080

# Database
DATABASE_URL=postgres://postgres:password@db:5432/marketplace
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL=redis://redis:6379
REDIS_CACHE_TTL=3600

# Object Storage (MinIO in dev)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=llm-marketplace
S3_REGION=us-east-1

# Search
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_MASTER_KEY=masterKey123

# Message Queue
NATS_URL=nats://nats:4222

# Authentication
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=604800

# Security
ALLOWED_ORIGINS=http://localhost:3000
BCRYPT_ROUNDS=10

# Email (optional in dev)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_FROM=noreply@localhost

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json
```

### Running Tests

```bash
# Backend tests
cd backend
cargo test

# Frontend tests
cd frontend
npm test

# Integration tests
./scripts/integration-test.sh

# E2E tests
cd e2e
npm run test:e2e
```

---

## Docker Compose Deployment

### Production Configuration

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  # API Server
  api:
    image: llm-marketplace/api:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      MEILISEARCH_URL: http://meilisearch:7700
      NATS_URL: nats://nats:4222
      JWT_SECRET: ${JWT_SECRET}
      RUST_LOG: info
    depends_on:
      - db
      - redis
      - meilisearch
      - nats
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G

  # Web Frontend
  web:
    image: llm-marketplace/web:latest
    restart: unless-stopped
    ports:
      - "3000:80"
    environment:
      API_URL: http://api:8080
    depends_on:
      - api

  # PostgreSQL Database
  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: marketplace
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Meilisearch
  meilisearch:
    image: getmeili/meilisearch:v1.5
    restart: unless-stopped
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      MEILI_ENV: production
      MEILI_NO_ANALYTICS: true
    volumes:
      - meili_data:/meili_data
    ports:
      - "7700:7700"

  # MinIO Object Storage
  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

  # NATS Message Queue
  nats:
    image: nats:latest
    restart: unless-stopped
    command: -js -m 8222
    ports:
      - "4222:4222"
      - "8222:8222"
    volumes:
      - nats_data:/data

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - web

volumes:
  postgres_data:
  redis_data:
  meili_data:
  minio_data:
  nats_data:
```

### Nginx Configuration

**nginx.conf:**

```nginx
events {
    worker_connections 1024;
}

http {
    upstream api {
        least_conn;
        server api:8080 max_fails=3 fail_timeout=30s;
    }

    upstream web {
        server web:80;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

    server {
        listen 80;
        server_name llm-marketplace.dev;

        # Redirect to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name llm-marketplace.dev;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # API routes
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Auth routes (stricter rate limit)
        location /api/auth/ {
            limit_req zone=auth_limit burst=5 nodelay;

            proxy_pass http://api/auth/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Frontend
        location / {
            proxy_pass http://web/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

### Deployment Steps

```bash
# 1. Set up environment
cp .env.production .env
vim .env  # Configure production values

# 2. Generate SSL certificates
./scripts/generate-ssl.sh

# 3. Pull images
docker-compose pull

# 4. Start services
docker-compose up -d

# 5. Run migrations
docker-compose exec api llm-marketplace migrate

# 6. Create admin user
docker-compose exec api llm-marketplace admin create

# 7. Verify deployment
curl https://your-domain.com/api/health

# 8. Monitor logs
docker-compose logs -f
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.28+)
- kubectl configured
- Helm 3.12+
- Persistent Volume provisioner
- Load Balancer (MetalLB, cloud provider, etc.)

### Using Helm Chart

```bash
# Add Helm repository
helm repo add llm-marketplace https://charts.llm-marketplace.dev
helm repo update

# Create namespace
kubectl create namespace marketplace

# Create secrets
kubectl create secret generic marketplace-secrets \
  --from-literal=database-password=your-password \
  --from-literal=jwt-secret=your-jwt-secret \
  --from-literal=s3-access-key=your-access-key \
  --from-literal=s3-secret-key=your-secret-key \
  -n marketplace

# Install chart
helm install marketplace llm-marketplace/marketplace \
  --namespace marketplace \
  --values values.yaml
```

**values.yaml:**

```yaml
# Global settings
global:
  domain: marketplace.example.com
  environment: production

# API service
api:
  replicaCount: 3
  image:
    repository: llm-marketplace/api
    tag: "1.0.0"
    pullPolicy: IfNotPresent

  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "500m"

  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80

  env:
    LOG_LEVEL: info
    RUST_LOG: info

# Web frontend
web:
  replicaCount: 2
  image:
    repository: llm-marketplace/web
    tag: "1.0.0"

  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "200m"

# PostgreSQL
postgresql:
  enabled: true
  auth:
    database: marketplace
    existingSecret: marketplace-secrets
    secretKeys:
      adminPasswordKey: database-password

  primary:
    persistence:
      enabled: true
      size: 100Gi
      storageClass: "fast-ssd"

    resources:
      requests:
        memory: "2Gi"
        cpu: "1000m"
      limits:
        memory: "4Gi"
        cpu: "2000m"

  readReplicas:
    replicaCount: 2
    persistence:
      enabled: true
      size: 100Gi

# Redis
redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false

  master:
    persistence:
      enabled: true
      size: 10Gi

    resources:
      requests:
        memory: "1Gi"
        cpu: "500m"

# Meilisearch
meilisearch:
  enabled: true
  replicaCount: 3

  persistence:
    enabled: true
    size: 50Gi

  resources:
    requests:
      memory: "1Gi"
      cpu: "500m"

# Object Storage (MinIO or external S3)
minio:
  enabled: true
  mode: distributed
  replicas: 4

  persistence:
    enabled: true
    size: 500Gi

  resources:
    requests:
      memory: "2Gi"
      cpu: "1000m"

# Ingress
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"

  hosts:
    - host: marketplace.example.com
      paths:
        - path: /
          pathType: Prefix

  tls:
    - secretName: marketplace-tls
      hosts:
        - marketplace.example.com

# Monitoring
monitoring:
  enabled: true

  prometheus:
    enabled: true

  grafana:
    enabled: true
    adminPassword: changeme
```

### Manual Kubernetes Deployment

**namespace.yaml:**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: marketplace
```

**api-deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marketplace-api
  namespace: marketplace
spec:
  replicas: 3
  selector:
    matchLabels:
      app: marketplace-api
  template:
    metadata:
      labels:
        app: marketplace-api
    spec:
      containers:
      - name: api
        image: llm-marketplace/api:1.0.0
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: marketplace-secrets
              key: database-url
        - name: REDIS_URL
          value: redis://redis:6379
        - name: S3_ENDPOINT
          value: http://minio:9000
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: marketplace-api
  namespace: marketplace
spec:
  selector:
    app: marketplace-api
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: marketplace-api-hpa
  namespace: marketplace
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: marketplace-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**ingress.yaml:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: marketplace-ingress
  namespace: marketplace
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - marketplace.example.com
    secretName: marketplace-tls
  rules:
  - host: marketplace.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: marketplace-api
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: marketplace-web
            port:
              number: 80
```

### Apply Manifests

```bash
kubectl apply -f namespace.yaml
kubectl apply -f secrets.yaml
kubectl apply -f postgres.yaml
kubectl apply -f redis.yaml
kubectl apply -f meilisearch.yaml
kubectl apply -f minio.yaml
kubectl apply -f api-deployment.yaml
kubectl apply -f web-deployment.yaml
kubectl apply -f ingress.yaml

# Verify deployment
kubectl get pods -n marketplace
kubectl get services -n marketplace
kubectl get ingress -n marketplace
```

---

## Cloud Deployments

### AWS EKS

```bash
# Create EKS cluster
eksctl create cluster \
  --name llm-marketplace \
  --version 1.28 \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type t3.large \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed

# Install AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=llm-marketplace

# Deploy application
helm install marketplace llm-marketplace/marketplace \
  --namespace marketplace \
  --set postgresql.enabled=false \
  --set postgresql.external.host=marketplace-db.abc123.us-east-1.rds.amazonaws.com \
  --set minio.enabled=false \
  --set s3.bucket=llm-marketplace-assets \
  --set s3.region=us-east-1
```

### Google GKE

```bash
# Create GKE cluster
gcloud container clusters create llm-marketplace \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type n1-standard-4 \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 10

# Get credentials
gcloud container clusters get-credentials llm-marketplace

# Deploy
helm install marketplace llm-marketplace/marketplace \
  --namespace marketplace \
  --set ingress.className=gce
```

### Azure AKS

```bash
# Create AKS cluster
az aks create \
  --resource-group llm-marketplace-rg \
  --name llm-marketplace \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group llm-marketplace-rg --name llm-marketplace

# Deploy
helm install marketplace llm-marketplace/marketplace --namespace marketplace
```

---

## Self-Hosted Registry

For running a private, self-contained registry:

### Single-Binary Deployment

```bash
# Download binary
curl -L https://github.com/llm-marketplace/marketplace/releases/download/v1.0.0/llm-marketplace-linux-x64 -o llm-marketplace
chmod +x llm-marketplace

# Initialize
./llm-marketplace init \
  --data-dir /var/lib/marketplace \
  --admin-email admin@example.com

# Run
./llm-marketplace serve \
  --port 8080 \
  --tls-cert cert.pem \
  --tls-key key.pem
```

### Configuration File

**config.toml:**

```toml
[server]
host = "0.0.0.0"
port = 8080
tls_cert = "/etc/marketplace/cert.pem"
tls_key = "/etc/marketplace/key.pem"

[database]
url = "postgres://user:pass@localhost/marketplace"
pool_size = 20

[storage]
type = "local"  # or "s3"
path = "/var/lib/marketplace/assets"

[search]
type = "embedded"  # Uses Tantivy

[auth]
jwt_secret = "your-secret-key"
session_duration = 3600

[features]
registration_enabled = true
public_assets = true
private_registry = false
```

---

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

### Secrets Management

**Using Kubernetes Secrets:**

```bash
kubectl create secret generic marketplace-secrets \
  --from-file=database-url=./secrets/db-url.txt \
  --from-file=jwt-secret=./secrets/jwt-secret.txt \
  -n marketplace
```

**Using HashiCorp Vault:**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: marketplace
  namespace: marketplace
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: vault-agent-config
data:
  vault-agent-config.hcl: |
    vault {
      address = "https://vault.example.com"
    }
    auto_auth {
      method "kubernetes" {
        config = {
          role = "marketplace"
        }
      }
    }
```

---

## Monitoring

### Prometheus Metrics

The API exposes metrics at `/metrics`:

```
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/assets",status="200"} 15420

# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 8542
```

### Grafana Dashboards

Import pre-built dashboards:

- **Application Overview**: ID 12345
- **Database Performance**: ID 12346
- **API Latency**: ID 12347

### Alerting Rules

**prometheus-alerts.yaml:**

```yaml
groups:
  - name: marketplace
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High API error rate"

      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        annotations:
          summary: "PostgreSQL is down"
```

---

## Backup & Recovery

### Database Backups

```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump -h localhost -U marketplace marketplace | gzip > "$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

# Upload to S3
aws s3 cp "$BACKUP_DIR/backup_$TIMESTAMP.sql.gz" s3://backups/postgres/

# Cleanup old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
```

### Restore from Backup

```bash
# Download backup
aws s3 cp s3://backups/postgres/backup_20251118_120000.sql.gz .

# Restore
gunzip -c backup_20251118_120000.sql.gz | psql -h localhost -U marketplace marketplace
```

---

## Troubleshooting

### Common Issues

**1. Database Connection Errors:**

```bash
# Check connection
psql -h localhost -U marketplace -d marketplace

# Verify credentials
kubectl get secret marketplace-secrets -o yaml
```

**2. Pod CrashLoopBackOff:**

```bash
# Check logs
kubectl logs -n marketplace deployment/marketplace-api

# Describe pod
kubectl describe pod -n marketplace <pod-name>
```

**3. Slow Search Performance:**

```bash
# Check Meilisearch status
curl http://meilisearch:7700/health

# Rebuild index
./scripts/reindex-search.sh
```

### Debug Mode

Enable debug logging:

```bash
# Docker Compose
docker-compose -f docker-compose.yml -f docker-compose.debug.yml up

# Kubernetes
kubectl set env deployment/marketplace-api LOG_LEVEL=debug -n marketplace
```

---

**Version:** 1.0
**Last Updated:** 2025-11-18
