# LLM Marketplace - Infrastructure Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Deployment Guide](#deployment-guide)
6. [Monitoring & Observability](#monitoring--observability)
7. [Disaster Recovery](#disaster-recovery)
8. [Troubleshooting](#troubleshooting)
9. [Cost Optimization](#cost-optimization)

## Overview

The LLM Marketplace infrastructure is a production-grade, cloud-native platform built on:
- **Container Orchestration**: Kubernetes 1.28+
- **Service Mesh**: Istio for mTLS and traffic management
- **Infrastructure as Code**: Terraform for multi-cloud deployment
- **CI/CD**: GitHub Actions with automated security scanning
- **Monitoring**: Prometheus, Grafana, Jaeger, Loki
- **Databases**: PostgreSQL, Redis, Elasticsearch, Kafka

### Key Features

- **High Availability**: Multi-AZ deployment with automated failover
- **Auto-scaling**: HPA for services, cluster autoscaler for nodes
- **Security**: mTLS, encryption at rest/transit, automated scanning
- **Observability**: Distributed tracing, metrics, logging
- **Disaster Recovery**: Automated backups, cross-region replication
- **Blue-Green Deployments**: Zero-downtime deployments
- **Multi-cloud**: Support for AWS, GCP, Azure

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Load Balancer (AWS ALB)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Istio Ingress Gateway                       │
│                  (TLS 1.3 Termination)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Service Mesh (Istio)                      │
│              mTLS, Circuit Breaking, Retries                 │
└─────┬───────────┬────────────┬────────────┬─────────────────┘
      │           │            │            │
  ┌───▼──┐   ┌───▼──┐    ┌───▼──┐    ┌───▼──┐
  │Publish│   │Disco-│    │Consum│    │Admin │
  │  ing  │   │ very │    │ ption│    │      │
  └───┬───┘   └───┬──┘    └───┬──┘    └───┬──┘
      │           │            │            │
      └───────────┴────────────┴────────────┘
                      │
      ┌───────────────┼────────────────┐
      │               │                │
  ┌───▼───┐     ┌────▼────┐     ┌────▼────┐
  │PostGre│     │  Redis  │     │  Kafka  │
  │  SQL  │     │         │     │         │
  └───────┘     └─────────┘     └─────────┘
```

### Infrastructure Components

#### Compute Layer
- **EKS Cluster**: 3 node groups (general, compute, memory)
- **Auto-scaling**: 3-200 pods per service based on CPU/memory/RPS
- **Instance Types**:
  - General: t3.xlarge (4 vCPU, 16GB RAM)
  - Compute: c5.2xlarge (8 vCPU, 16GB RAM)
  - Memory: r5.xlarge (4 vCPU, 32GB RAM)

#### Data Layer
- **PostgreSQL**: RDS r6g.xlarge, Multi-AZ, 100GB-1TB storage
- **Redis**: ElastiCache r6g.xlarge, 3-node cluster
- **Elasticsearch**: 3-node cluster, 200GB SSD per node
- **Kafka**: MSK m5.xlarge, 3 brokers, 1TB EBS per broker

#### Networking
- **VPC**: /16 CIDR with 3 AZs
- **Subnets**: Public, private, database subnets
- **NAT Gateway**: High availability mode
- **Service Mesh**: Istio with mTLS enforcement

#### Security
- **Encryption**: KMS encryption for all data at rest
- **Secrets**: AWS Secrets Manager + Kubernetes Secrets
- **Network Policies**: Istio authorization policies
- **TLS**: TLS 1.3 for all external traffic, mTLS for internal

## Prerequisites

### Required Tools
```bash
# Install required CLI tools
brew install kubectl terraform aws-cli helm istioctl
```

### Tool Versions
- Docker: 24.0+
- Kubernetes: 1.28+
- Terraform: 1.6+
- Helm: 3.0+
- AWS CLI: 2.0+

### AWS Credentials
```bash
aws configure
# Enter your AWS access key, secret key, and region
```

### Required Permissions
- EKS full access
- RDS full access
- ElastiCache full access
- MSK full access
- VPC full access
- S3 full access
- KMS full access

## Quick Start

### Local Development

1. **Start infrastructure**:
```bash
docker-compose up -d
```

2. **Verify services**:
```bash
docker-compose ps
```

3. **Access services**:
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- Elasticsearch: localhost:9200
- Kafka: localhost:9092
- Prometheus: localhost:9090
- Grafana: localhost:3000
- Jaeger: localhost:16686

### Deploy to AWS

1. **Initialize Terraform**:
```bash
cd infrastructure/terraform
terraform init
```

2. **Create environment variables**:
```bash
cp environments/production/terraform.tfvars.example environments/production/terraform.tfvars
# Edit terraform.tfvars with your values
```

3. **Plan deployment**:
```bash
terraform plan -var-file=environments/production/terraform.tfvars
```

4. **Apply infrastructure**:
```bash
terraform apply -var-file=environments/production/terraform.tfvars
```

5. **Configure kubectl**:
```bash
aws eks update-kubeconfig --name llm-marketplace-production-eks --region us-east-1
```

6. **Deploy applications**:
```bash
kubectl apply -k infrastructure/kubernetes/overlays/production
```

## Deployment Guide

### Environment Setup

#### Development
- Single NAT gateway
- Smaller instance types
- No cross-region replication
- 7-day backup retention

```bash
terraform apply -var-file=environments/dev/terraform.tfvars
```

#### Staging
- Multi-AZ NAT gateways
- Production-like instance types
- 14-day backup retention
- Blue-green deployments

```bash
terraform apply -var-file=environments/staging/terraform.tfvars
```

#### Production
- Multi-AZ everything
- Production instance types
- Cross-region replication
- 30-day backup retention
- Canary deployments

```bash
terraform apply -var-file=environments/production/terraform.tfvars
```

### Deployment Strategies

#### Blue-Green Deployment
```bash
./scripts/deployment/blue-green-deploy.sh production
```

Features:
- Zero-downtime deployments
- Instant rollback capability
- Full traffic cutover
- Automated health checks

#### Canary Deployment
```bash
./scripts/deployment/canary-deploy.sh production 10  # 10% traffic
./scripts/deployment/canary-deploy.sh production 50  # 50% traffic
./scripts/deployment/canary-deploy.sh production 100 # 100% traffic
```

Features:
- Gradual traffic shifting
- Continuous monitoring
- Automatic rollback on errors
- Metrics-based validation

### CI/CD Pipeline

The GitHub Actions pipeline automatically:
1. Runs security scans (Trivy, Snyk, OWASP)
2. Executes code quality checks (SonarQube)
3. Runs unit and integration tests
4. Builds and pushes Docker images
5. Deploys to development on `develop` branch
6. Deploys to staging on `main` branch
7. Deploys to production on manual approval

#### Triggering Deployments

**Development**:
```bash
git push origin develop
```

**Staging**:
```bash
git push origin main
```

**Production**:
1. Go to GitHub Actions
2. Select "CI/CD Pipeline"
3. Click "Run workflow"
4. Select environment: "production"
5. Approve deployment

## Monitoring & Observability

### Prometheus Metrics

Access Prometheus: `kubectl port-forward -n llm-marketplace svc/prometheus 9090:9090`

**Key Metrics**:
- `marketplace_requests_total` - Total requests
- `marketplace_request_duration_seconds` - Request latency
- `marketplace_errors_total` - Error count
- `marketplace_active_connections` - Active connections

### Grafana Dashboards

Access Grafana: `kubectl port-forward -n llm-marketplace svc/grafana 3000:3000`

**Pre-configured Dashboards**:
1. **Service Overview**: Request rate, latency, error rate
2. **Infrastructure**: CPU, memory, disk, network
3. **Database**: PostgreSQL performance metrics
4. **Cache**: Redis hit/miss rates
5. **Message Queue**: Kafka lag, throughput
6. **Business**: Service consumption, API usage

### Jaeger Tracing

Access Jaeger: `kubectl port-forward -n llm-marketplace svc/jaeger-query 16686:16686`

Features:
- End-to-end request tracing
- Service dependency graph
- Performance bottleneck identification
- Error tracking

### Loki Logging

Logs are centralized in Loki and queryable via Grafana.

**Query Examples**:
```logql
# All errors
{namespace="llm-marketplace"} |= "error"

# Slow requests
{namespace="llm-marketplace"} | json | duration > 1s

# Specific service
{namespace="llm-marketplace",app="publishing"}
```

### Alerts

**Critical Alerts** (PagerDuty):
- Service down (2+ minutes)
- Error rate > 1%
- Latency p95 > 1s
- Database connection pool exhausted

**Warning Alerts** (Slack):
- Error rate > 0.5%
- Latency p95 > 500ms
- Disk usage > 80%
- Memory usage > 85%

## Disaster Recovery

### Backup Strategy

**Automated Backups**:
- PostgreSQL: Hourly (AWS RDS automated)
- Redis: Daily snapshots
- Kafka: Topic configuration and messages
- Application config: S3

**Retention**:
- Development: 7 days
- Staging: 14 days
- Production: 30 days

### Backup Execution

**Manual Backup**:
```bash
./scripts/backup/postgres-backup.sh production
```

**Automated Backup** (CronJob):
```yaml
# Already configured in Kubernetes
# Runs daily at 3 AM UTC
```

### Restore Procedures

**Full System Restore**:
```bash
./scripts/backup/disaster-recovery.sh production latest
```

**Point-in-Time Restore**:
```bash
./scripts/backup/disaster-recovery.sh production 20241118_030000
```

### RTO & RPO

- **RTO** (Recovery Time Objective): < 1 hour
- **RPO** (Recovery Point Objective): < 15 minutes

### Multi-Region Failover

**Primary Region**: us-east-1
**DR Region**: us-west-2

**Failover Process**:
1. Promote DR database to primary
2. Update Route53 DNS
3. Scale up DR Kubernetes cluster
4. Verify health checks
5. Monitor metrics

## Troubleshooting

### Common Issues

#### Service Not Starting

```bash
# Check pod status
kubectl get pods -n llm-marketplace

# View logs
kubectl logs -n llm-marketplace <pod-name> --tail=100

# Describe pod
kubectl describe pod -n llm-marketplace <pod-name>
```

#### High Memory Usage

```bash
# Check resource usage
kubectl top pods -n llm-marketplace

# Scale down if needed
kubectl scale deployment/<service> -n llm-marketplace --replicas=3
```

#### Database Connection Issues

```bash
# Check database pod
kubectl get pods -n llm-marketplace -l app=postgres

# Test connection
kubectl exec -it -n llm-marketplace postgres-0 -- psql -U marketplace_user -d llm_marketplace

# Check secrets
kubectl get secret marketplace-secrets -n llm-marketplace -o yaml
```

#### Slow Performance

1. Check Grafana dashboards
2. Review Jaeger traces
3. Analyze slow query logs
4. Check resource utilization
5. Review auto-scaling metrics

### Debug Commands

```bash
# Get all resources
kubectl get all -n llm-marketplace

# Check events
kubectl get events -n llm-marketplace --sort-by='.lastTimestamp'

# Shell into pod
kubectl exec -it -n llm-marketplace <pod-name> -- /bin/sh

# Port forward for local access
kubectl port-forward -n llm-marketplace svc/<service> 8080:3001

# View configmaps
kubectl get configmap -n llm-marketplace marketplace-config -o yaml
```

## Cost Optimization

### Current Monthly Costs (Production)

| Component | Cost | Optimization |
|-----------|------|--------------|
| EKS Cluster | $73 | Fixed |
| EC2 Nodes | $1,200 | Use Spot instances (60% savings) |
| RDS PostgreSQL | $450 | Use Reserved Instances (40% savings) |
| ElastiCache Redis | $300 | Right-size nodes |
| MSK Kafka | $720 | Use Graviton instances |
| Load Balancer | $25 | Fixed |
| NAT Gateway | $90 | Consolidate to single gateway in dev |
| Data Transfer | $100 | Use VPC endpoints |
| **Total** | **~$2,958/month** | **Optimized: ~$1,800/month** |

### Optimization Strategies

1. **Use Spot Instances** for non-critical workloads (60% cost reduction)
2. **Reserved Instances** for databases (40% cost reduction)
3. **Auto-scaling** to scale down during off-hours
4. **S3 Lifecycle Policies** for backups (90% cost reduction for archives)
5. **Graviton Instances** for Kafka (20% cost reduction)
6. **Single NAT Gateway** in development (50% NAT cost reduction)

### Enable Cost-Saving Features

```bash
# Enable spot instances
terraform apply -var enable_spot_instances=true

# Use single NAT gateway (dev only)
terraform apply -var single_nat_gateway=true

# Enable cluster autoscaler
terraform apply -var enable_cluster_autoscaler=true
```

## Support & Contact

- **Documentation**: https://docs.marketplace.example.com
- **Runbooks**: `/docs/runbooks/`
- **Slack**: #llm-marketplace-ops
- **Email**: platform-team@example.com
- **On-call**: PagerDuty rotation

## License

Copyright © 2024 LLM Marketplace. All rights reserved.
