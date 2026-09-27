# Deployment Guide - Consumption Service

## Overview

This guide covers deploying the LLM Marketplace Consumption Service to production environments.

## Prerequisites

- Kubernetes 1.28+
- Helm 3.0+
- Docker registry access
- PostgreSQL 15+ (managed or self-hosted)
- Redis 7+ (managed or self-hosted)
- Jaeger (optional, for tracing)
- Prometheus (optional, for metrics)

## Quick Start

### 1. Build Docker Image

```bash
# Build the image
docker build -t llm-marketplace/consumption:latest .

# Tag for registry
docker tag llm-marketplace/consumption:latest registry.example.com/llm-marketplace/consumption:v1.0.0

# Push to registry
docker push registry.example.com/llm-marketplace/consumption:v1.0.0
```

### 2. Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace llm-marketplace

# Create secrets
kubectl create secret generic consumption-secrets \
  --from-literal=database-url='postgres://user:pass@host:5432/db' \
  --from-literal=redis-url='redis://host:6379' \
  -n llm-marketplace

# Apply manifests
kubectl apply -f kubernetes/
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n llm-marketplace

# Check logs
kubectl logs -f deployment/consumption -n llm-marketplace

# Check service
kubectl get svc -n llm-marketplace
```

## Kubernetes Configuration

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: consumption
  namespace: llm-marketplace
spec:
  replicas: 3
  selector:
    matchLabels:
      app: consumption
  template:
    metadata:
      labels:
        app: consumption
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: consumption
        image: registry.example.com/llm-marketplace/consumption:v1.0.0
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: consumption-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: consumption-secrets
              key: redis-url
        - name: RUST_LOG
          value: "info,llm_marketplace_consumption=debug"
        - name: PORT
          value: "3000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Service Manifest

```yaml
apiVersion: v1
kind: Service
metadata:
  name: consumption
  namespace: llm-marketplace
spec:
  selector:
    app: consumption
  ports:
  - port: 80
    targetPort: 3000
    name: http
  type: ClusterIP
```

### HorizontalPodAutoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: consumption
  namespace: llm-marketplace
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: consumption
  minReplicas: 3
  maxReplicas: 10
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

## Environment Variables

### Required

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string

### Optional

- `PORT`: HTTP port (default: 3000)
- `RUST_LOG`: Log level (default: info)
- `OTEL_EXPORTER_JAEGER_AGENT_HOST`: Jaeger host
- `OTEL_EXPORTER_JAEGER_AGENT_PORT`: Jaeger port
- `DATABASE_MAX_CONNECTIONS`: Max DB connections (default: 100)
- `DATABASE_MIN_CONNECTIONS`: Min DB connections (default: 10)

## Database Migrations

### Initial Setup

```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Run migrations
\i migrations/001_init.sql
```

### Automated Migration

Add to deployment init container:

```yaml
initContainers:
- name: migrate
  image: postgres:15-alpine
  command: ['psql', '$(DATABASE_URL)', '-f', '/migrations/001_init.sql']
  env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: consumption-secrets
        key: database-url
  volumeMounts:
  - name: migrations
    mountPath: /migrations
volumes:
- name: migrations
  configMap:
    name: consumption-migrations
```

## Monitoring

### Prometheus ServiceMonitor

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: consumption
  namespace: llm-marketplace
spec:
  selector:
    matchLabels:
      app: consumption
  endpoints:
  - port: http
    path: /metrics
    interval: 15s
```

### Grafana Dashboard

Import dashboard from `grafana/consumption-dashboard.json`

## Scaling Recommendations

### Small Deployment (< 1K RPS)
- 2 pods
- 2 vCPU, 4GB RAM per pod
- 1 PostgreSQL instance
- 1 Redis instance

### Medium Deployment (1K - 10K RPS)
- 4-6 pods
- 4 vCPU, 8GB RAM per pod
- PostgreSQL with 1 read replica
- Redis Sentinel (3 nodes)

### Large Deployment (10K - 50K RPS)
- 10-15 pods
- 4 vCPU, 8GB RAM per pod
- PostgreSQL cluster with 2+ read replicas
- Redis Cluster (6+ nodes)

## High Availability

### Multi-Region Setup

1. Deploy to 3+ regions
2. Use global load balancer
3. Regional PostgreSQL with replication
4. Regional Redis clusters
5. Cross-region monitoring

### Disaster Recovery

- **RTO**: < 1 hour
- **RPO**: < 15 minutes

**Backup Strategy**:
- PostgreSQL: Continuous archiving with point-in-time recovery
- Redis: AOF persistence + periodic snapshots
- Configuration: Git-based IaC

## Security Checklist

- [ ] TLS 1.3 enabled on all endpoints
- [ ] Network policies configured
- [ ] Secrets stored in vault/secret manager
- [ ] Non-root container user
- [ ] Resource limits configured
- [ ] Security scanning in CI/CD
- [ ] API keys rotated regularly
- [ ] Database credentials encrypted
- [ ] Audit logging enabled

## Troubleshooting

### High Latency

```bash
# Check pod resources
kubectl top pods -n llm-marketplace

# Check database connections
kubectl exec -it deployment/consumption -n llm-marketplace -- \
  psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Check Redis latency
kubectl exec -it deployment/consumption -n llm-marketplace -- \
  redis-cli --latency -h redis
```

### OOM Errors

```bash
# Increase memory limits
kubectl set resources deployment/consumption \
  --limits=memory=1Gi \
  -n llm-marketplace

# Check for memory leaks
kubectl exec -it deployment/consumption -n llm-marketplace -- \
  cat /proc/meminfo
```

### Database Connection Pool Exhausted

```bash
# Increase max connections
kubectl set env deployment/consumption \
  DATABASE_MAX_CONNECTIONS=200 \
  -n llm-marketplace
```

## Rollback

```bash
# View deployment history
kubectl rollout history deployment/consumption -n llm-marketplace

# Rollback to previous version
kubectl rollout undo deployment/consumption -n llm-marketplace

# Rollback to specific revision
kubectl rollout undo deployment/consumption --to-revision=2 -n llm-marketplace
```

## Health Checks

### Liveness Probe
```bash
curl http://localhost:3000/health
```

### Readiness Probe
```bash
# Same as liveness for now
curl http://localhost:3000/health
```

### Metrics Endpoint
```bash
curl http://localhost:3000/metrics
```

## Support

For deployment issues:
- GitHub: https://github.com/org/llm-marketplace/issues
- Email: devops@llm-marketplace.example.com
- Slack: #llm-marketplace-ops
