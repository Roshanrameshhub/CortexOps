# Failover Procedures

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2024-11-19
**Owner:** DevOps & SRE Team

---

## Table of Contents

1. [Overview](#overview)
2. [Failover Scenarios](#failover-scenarios)
3. [Prerequisites](#prerequisites)
4. [Database Failover](#database-failover)
5. [Cross-Region Failover](#cross-region-failover)
6. [Application Failover](#application-failover)
7. [Rollback Procedures](#rollback-procedures)
8. [Post-Failover Validation](#post-failover-validation)
9. [Automation Scripts](#automation-scripts)

---

## Overview

### Purpose

This document provides step-by-step procedures for failing over the LLM-Marketplace platform in various disaster scenarios. These procedures are designed to minimize downtime and data loss while ensuring system integrity.

### Failover Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Primary Region (us-east-1)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ EKS Cluster  │  │ RDS Primary  │  │ ElastiCache  │     │
│  │  (Active)    │  │   (Active)   │  │   (Active)   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            │                                │
│                    Cross-Region Replication                 │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────┐
│                            │                                │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐     │
│  │ EKS Cluster  │  │ RDS Standby  │  │ ElastiCache  │     │
│  │  (Standby)   │  │  (Standby)   │  │  (Standby)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                   DR Region (us-west-2)                     │
└─────────────────────────────────────────────────────────────┘
```

### Failover Types

| Type | Trigger | RTO Target | RPO Target | Auto/Manual |
|------|---------|------------|------------|-------------|
| Database Multi-AZ | AZ failure | < 2 min | 0 | Automatic |
| Database Cross-Region | Region failure | < 15 min | < 5 min | Manual |
| Application Pod | Pod crash | < 30 sec | 0 | Automatic |
| EKS Cluster | Cluster failure | < 30 min | 0 | Manual |
| Full Region | Region disaster | < 4 hours | < 15 min | Manual |

---

## Failover Scenarios

### Scenario 1: Database Multi-AZ Failover (Automatic)

**Trigger Conditions:**
- Primary AZ network failure
- Primary database instance failure
- Planned maintenance

**Automatic Actions:**
- RDS automatically promotes standby replica
- DNS endpoint updated automatically
- Applications reconnect automatically

**Human Actions Required:**
1. Monitor failover progress in RDS console
2. Verify application health post-failover
3. Create incident report
4. Update status page

**Expected Duration:** 1-2 minutes

---

### Scenario 2: Database Cross-Region Failover (Manual)

**Trigger Conditions:**
- Complete us-east-1 region failure
- Multi-hour us-east-1 degradation
- Compliance requirement for region migration

**Manual Actions:** See [Database Cross-Region Failover](#database-cross-region-failover)

**Expected Duration:** 10-15 minutes

---

### Scenario 3: Full Platform Cross-Region Failover (Manual)

**Trigger Conditions:**
- Complete us-east-1 region failure
- All services down in primary region
- Extended us-east-1 outage (> 2 hours)

**Manual Actions:** See [Cross-Region Failover](#cross-region-failover)

**Expected Duration:** 2-4 hours

---

## Prerequisites

### Before Initiating Failover

**Verify the Following:**

1. **Incident Confirmation**
   - [ ] Verified primary region is truly unavailable (not transient issue)
   - [ ] Checked AWS Service Health Dashboard
   - [ ] Confirmed issue persists > 15 minutes
   - [ ] Decision maker approval obtained (VP Engineering or CTO)

2. **DR Environment Readiness**
   - [ ] DR region infrastructure is healthy
   - [ ] Latest backup/replication verified (< 1 hour old)
   - [ ] DR cluster has sufficient capacity
   - [ ] All required secrets/configs present in DR region

3. **Team Readiness**
   - [ ] Incident Commander assigned
   - [ ] On-call engineers notified and available
   - [ ] Communication channels established (#incident-response)
   - [ ] Customer support team notified

4. **Communication**
   - [ ] Status page updated (Investigating)
   - [ ] Internal stakeholders notified
   - [ ] Customer-facing teams briefed

### Required Access

- AWS Console access to both regions
- IAM permissions for RDS, EKS, Route53, S3
- kubectl access to both EKS clusters
- PagerDuty access for incident management
- Status page admin access

### Required Tools

```bash
# Verify tool installation
aws --version        # AWS CLI v2
kubectl version      # Kubernetes CLI
jq --version        # JSON processor
```

---

## Database Failover

### DB-F-001: RDS Multi-AZ Automatic Failover

**This failover is automatic - Monitor only**

#### Monitoring Steps

```bash
# 1. Watch failover event in CloudWatch
aws rds describe-events \
    --source-identifier llm-marketplace-db \
    --duration 60 \
    --region us-east-1

# 2. Check current primary AZ
aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --region us-east-1 \
    --query 'DBInstances[0].AvailabilityZone'

# 3. Monitor application connection errors
kubectl logs -n llm-marketplace -l app=publishing-service --tail=100 | grep -i "connection"
```

#### Post-Failover Validation

```bash
# 1. Verify database is available
aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --region us-east-1 \
    --query 'DBInstances[0].DBInstanceStatus'
# Expected: "available"

# 2. Test database connectivity
PGPASSWORD=$DB_PASSWORD psql \
    -h llm-marketplace-db.cluster-xyz.us-east-1.rds.amazonaws.com \
    -U postgres \
    -d llm_marketplace \
    -c "SELECT 1;"

# 3. Verify application health
for svc in publishing discovery consumption admin; do
    kubectl exec -n llm-marketplace \
        $(kubectl get pod -n llm-marketplace -l app=${svc}-service -o jsonpath='{.items[0].metadata.name}') \
        -- wget -q -O- http://localhost:3001/health
done
```

**Expected RTO:** < 2 minutes
**Expected RPO:** 0 (synchronous replication)

---

### DB-F-002: RDS Cross-Region Manual Failover

**Use this procedure for regional database failover**

#### Step 1: Verify Primary Region Unavailable

```bash
# Check primary database status
aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --region us-east-1 \
    --query 'DBInstances[0].DBInstanceStatus' || echo "PRIMARY UNAVAILABLE"
```

#### Step 2: Check Read Replica Status in DR Region

```bash
# Verify DR replica is healthy
aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db-replica \
    --region us-west-2 \
    --query 'DBInstances[0].{Status:DBInstanceStatus, ReplicationLag:StatusInfos}'
```

**Decision Point:** If replication lag > 5 minutes, consult with data team before proceeding.

#### Step 3: Promote Read Replica to Primary

```bash
# Promote read replica (THIS ACTION IS IRREVERSIBLE)
aws rds promote-read-replica \
    --db-instance-identifier llm-marketplace-db-replica \
    --region us-west-2

# Monitor promotion progress
watch -n 10 'aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db-replica \
    --region us-west-2 \
    --query "DBInstances[0].DBInstanceStatus"'
# Wait for status: "available" (typically 3-5 minutes)
```

#### Step 4: Update DNS Records

```bash
# Get new database endpoint
NEW_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db-replica \
    --region us-west-2 \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

echo "New database endpoint: $NEW_ENDPOINT"

# Update Route53 DNS record
aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch "{
        \"Changes\": [{
            \"Action\": \"UPSERT\",
            \"ResourceRecordSet\": {
                \"Name\": \"db.llm-marketplace.com\",
                \"Type\": \"CNAME\",
                \"TTL\": 60,
                \"ResourceRecords\": [{\"Value\": \"$NEW_ENDPOINT\"}]
            }
        }]
    }"

# Wait for DNS propagation (60 seconds based on TTL)
sleep 60
```

#### Step 5: Update Application Configuration

```bash
# Update database connection string in Kubernetes secrets
kubectl create secret generic db-credentials \
    --from-literal=host=$NEW_ENDPOINT \
    --from-literal=port=5432 \
    --from-literal=database=llm_marketplace \
    --from-literal=username=postgres \
    --from-literal=password=$DB_PASSWORD \
    --namespace llm-marketplace \
    --dry-run=client -o yaml | kubectl apply -f -

# Rolling restart all services to pick up new connection
for svc in publishing-service discovery-service consumption-service admin-service; do
    kubectl rollout restart deployment/$svc -n llm-marketplace
    kubectl rollout status deployment/$svc -n llm-marketplace --timeout=5m
done
```

#### Step 6: Verify Database Failover

```bash
# 1. Test database connectivity from local machine
PGPASSWORD=$DB_PASSWORD psql -h $NEW_ENDPOINT -U postgres -d llm_marketplace -c "
    SELECT
        current_database(),
        pg_is_in_recovery(),
        version();
"
# Expected: pg_is_in_recovery = false (now primary)

# 2. Verify data integrity - check record counts
PGPASSWORD=$DB_PASSWORD psql -h $NEW_ENDPOINT -U postgres -d llm_marketplace -c "
    SELECT
        'services' as table_name, COUNT(*) as count FROM services
    UNION ALL
    SELECT 'users', COUNT(*) FROM users
    UNION ALL
    SELECT 'api_keys', COUNT(*) FROM api_keys;
"

# 3. Verify applications can read/write
kubectl exec -n llm-marketplace \
    $(kubectl get pod -n llm-marketplace -l app=publishing-service -o jsonpath='{.items[0].metadata.name}') \
    -- wget -q -O- http://localhost:3001/health
```

**Expected RTO:** 10-15 minutes
**Expected RPO:** < 5 minutes (replication lag)

---

## Cross-Region Failover

### CR-F-001: Full Platform Cross-Region Failover

**This is the complete disaster recovery procedure**

#### Pre-Failover Checklist

- [ ] Executive approval obtained
- [ ] Primary region confirmed unavailable > 1 hour
- [ ] Incident commander assigned
- [ ] All stakeholders notified
- [ ] Status page updated to "Major Outage"
- [ ] War room established

#### Phase 1: Database Failover (15 minutes)

Follow [DB-F-002: RDS Cross-Region Manual Failover](#db-f-002-rds-cross-region-manual-failover)

```bash
# Quick database failover script
export DR_REGION="us-west-2"
export DB_INSTANCE="llm-marketplace-db-replica"

# 1. Promote replica
aws rds promote-read-replica \
    --db-instance-identifier $DB_INSTANCE \
    --region $DR_REGION

# 2. Wait for promotion
aws rds wait db-instance-available \
    --db-instance-identifier $DB_INSTANCE \
    --region $DR_REGION

# 3. Get endpoint
export NEW_DB_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier $DB_INSTANCE \
    --region $DR_REGION \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

echo "✅ Database failover complete: $NEW_DB_ENDPOINT"
```

#### Phase 2: Elasticsearch Failover (20 minutes)

```bash
# 1. Verify DR Elasticsearch cluster is healthy
curl -sf "http://es-dr.llm-marketplace.com:9200/_cluster/health" | jq .

# 2. Restore latest snapshot to DR cluster
export LATEST_SNAPSHOT=$(curl -sf "http://es-dr.llm-marketplace.com:9200/_snapshot/s3_backup/_all" | \
    jq -r '.snapshots | sort_by(.start_time_in_millis) | last | .snapshot')

curl -X POST "http://es-dr.llm-marketplace.com:9200/_snapshot/s3_backup/$LATEST_SNAPSHOT/_restore" \
    -H 'Content-Type: application/json' \
    -d '{
        "indices": "*",
        "ignore_unavailable": true,
        "include_global_state": false
    }'

# 3. Monitor restore progress
watch -n 10 'curl -sf "http://es-dr.llm-marketplace.com:9200/_recovery" | \
    jq "[.[] | select(.type == \"SNAPSHOT\")] | length"'

# 4. Update DNS for Elasticsearch
aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch "{
        \"Changes\": [{
            \"Action\": \"UPSERT\",
            \"ResourceRecordSet\": {
                \"Name\": \"elasticsearch.llm-marketplace.com\",
                \"Type\": \"CNAME\",
                \"TTL\": 60,
                \"ResourceRecords\": [{\"Value\": \"es-dr.llm-marketplace.com\"}]
            }
        }]
    }"

echo "✅ Elasticsearch failover complete"
```

#### Phase 3: Redis/ElastiCache Failover (10 minutes)

```bash
# 1. Verify DR Redis cluster
redis-cli -h redis-dr.llm-marketplace.com -p 6379 ping
# Expected: PONG

# 2. Update DNS for Redis
aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch "{
        \"Changes\": [{
            \"Action\": \"UPSERT\",
            \"ResourceRecordSet\": {
                \"Name\": \"redis.llm-marketplace.com\",
                \"Type\": \"CNAME\",
                \"TTL\": 60,
                \"ResourceRecords\": [{\"Value\": \"redis-dr.llm-marketplace.com\"}]
            }
        }]
    }"

echo "✅ Redis failover complete"
```

#### Phase 4: Application Deployment to DR EKS (60 minutes)

```bash
# 1. Switch kubectl context to DR cluster
export DR_REGION="us-west-2"
aws eks update-kubeconfig \
    --region $DR_REGION \
    --name llm-marketplace-dr \
    --alias dr-cluster

kubectl config use-context dr-cluster

# 2. Verify DR cluster is healthy
kubectl get nodes
kubectl get namespaces

# 3. Update application configurations with DR endpoints
kubectl create configmap app-config \
    --from-literal=DB_HOST=$NEW_DB_ENDPOINT \
    --from-literal=ES_HOST=elasticsearch.llm-marketplace.com \
    --from-literal=REDIS_HOST=redis.llm-marketplace.com \
    --from-literal=REGION=$DR_REGION \
    --namespace llm-marketplace \
    --dry-run=client -o yaml | kubectl apply -f -

# 4. Deploy all microservices
kubectl apply -f k8s/base/ -n llm-marketplace
kubectl apply -f k8s/overlays/dr/ -n llm-marketplace

# 5. Scale up deployments
for svc in publishing-service discovery-service consumption-service admin-service; do
    kubectl scale deployment/$svc --replicas=3 -n llm-marketplace
done

# 6. Wait for all deployments to be ready
kubectl wait --for=condition=available \
    --timeout=300s \
    deployment --all \
    -n llm-marketplace

echo "✅ Application deployment complete"
```

#### Phase 5: Load Balancer and DNS Failover (15 minutes)

```bash
# 1. Get DR load balancer endpoint
export DR_LB=$(kubectl get svc -n llm-marketplace gateway \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "DR Load Balancer: $DR_LB"

# 2. Update primary DNS to point to DR load balancer
aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch "{
        \"Changes\": [{
            \"Action\": \"UPSERT\",
            \"ResourceRecordSet\": {
                \"Name\": \"api.llm-marketplace.com\",
                \"Type\": \"CNAME\",
                \"TTL\": 60,
                \"ResourceRecords\": [{\"Value\": \"$DR_LB\"}]
            }
        }]
    }"

# 3. Wait for DNS propagation
sleep 60

# 4. Verify DNS resolution
dig api.llm-marketplace.com +short
# Should return DR load balancer IP

echo "✅ DNS failover complete"
```

#### Phase 6: Validation and Monitoring (30 minutes)

See [Post-Failover Validation](#post-failover-validation) section below.

**Total Expected RTO:** 2-4 hours
**Total Expected RPO:** < 15 minutes

---

## Application Failover

### APP-F-001: Kubernetes Pod Automatic Restart

**This is automatic via Kubernetes liveness/readiness probes**

#### Monitor Pod Restarts

```bash
# Check pod restart counts
kubectl get pods -n llm-marketplace \
    -o custom-columns=NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount

# Check recent pod events
kubectl get events -n llm-marketplace \
    --sort-by='.lastTimestamp' \
    --field-selector involvedObject.kind=Pod
```

#### Investigate Frequent Restarts

```bash
# If pod is restarting > 5 times/hour, investigate

# 1. Check pod logs
kubectl logs -n llm-marketplace <pod-name> --previous

# 2. Describe pod for events
kubectl describe pod -n llm-marketplace <pod-name>

# 3. Check resource usage
kubectl top pod -n llm-marketplace <pod-name>
```

---

### APP-F-002: Manual Service Failover

**Use when a specific service needs immediate replacement**

```bash
# 1. Identify problematic service
export SERVICE_NAME="discovery-service"

# 2. Scale down problematic deployment
kubectl scale deployment/$SERVICE_NAME --replicas=0 -n llm-marketplace

# 3. Wait 30 seconds for connections to drain
sleep 30

# 4. Scale up with fresh pods
kubectl scale deployment/$SERVICE_NAME --replicas=3 -n llm-marketplace

# 5. Verify new pods are healthy
kubectl get pods -n llm-marketplace -l app=$SERVICE_NAME
kubectl logs -n llm-marketplace -l app=$SERVICE_NAME --tail=50
```

---

## Rollback Procedures

### Rollback Decision Criteria

**Rollback if:**
- Failover completed but services unstable
- Data integrity issues discovered
- Business decides to wait for primary region recovery
- RPO/RTO targets cannot be met in DR region

### RB-001: Rollback from DR to Primary Region

**Only use this when primary region is recovered**

#### Prerequisites

- [ ] Primary region fully recovered and healthy
- [ ] Primary database available and data synchronized
- [ ] Executive approval for rollback

#### Rollback Steps

```bash
# 1. Stop writes in DR region (enable read-only mode)
kubectl set env deployment/publishing-service READ_ONLY=true -n llm-marketplace
kubectl set env deployment/discovery-service READ_ONLY=true -n llm-marketplace
kubectl set env deployment/consumption-service READ_ONLY=true -n llm-marketplace

# 2. Create final backup in DR region
/docs/disaster-recovery/scripts/backup-database.sh

# 3. Sync DR data to primary (if needed)
# Use AWS DMS or custom replication scripts

# 4. Update DNS back to primary region
aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch "{
        \"Changes\": [{
            \"Action\": \"UPSERT\",
            \"ResourceRecordSet\": {
                \"Name\": \"api.llm-marketplace.com\",
                \"Type\": \"CNAME\",
                \"TTL\": 60,
                \"ResourceRecords\": [{\"Value\": \"$PRIMARY_LB\"}]
            }
        }]
    }"

# 5. Wait for DNS propagation
sleep 120

# 6. Scale down DR deployments
kubectl scale deployment --all --replicas=0 -n llm-marketplace

# 7. Verify primary region is serving traffic
curl -sf https://api.llm-marketplace.com/health | jq .
```

**Expected Duration:** 1-2 hours

---

## Post-Failover Validation

### Validation Checklist

#### Immediate Validation (First 30 minutes)

```bash
# 1. Verify all services are running
kubectl get pods -n llm-marketplace
# All pods should be Running with 0 restarts

# 2. Check service health endpoints
for svc in publishing discovery consumption admin; do
    echo "Checking ${svc}..."
    curl -sf https://api.llm-marketplace.com/${svc}/health | jq .
done

# 3. Verify database connectivity and replication status
PGPASSWORD=$DB_PASSWORD psql -h $NEW_DB_ENDPOINT -U postgres -d llm_marketplace -c "
    SELECT
        current_database(),
        pg_is_in_recovery(),
        pg_database_size(current_database()) as size_bytes,
        (SELECT count(*) FROM pg_stat_replication) as replica_count;
"

# 4. Verify Elasticsearch health
curl -sf http://elasticsearch.llm-marketplace.com:9200/_cluster/health | jq '{
    status,
    number_of_nodes,
    active_primary_shards,
    active_shards,
    unassigned_shards
}'

# 5. Test critical user workflows
# Publishing workflow
curl -X POST https://api.llm-marketplace.com/publishing/v1/services \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -d '{
        "name": "dr-test-service",
        "description": "DR validation test"
    }'

# Discovery workflow
curl https://api.llm-marketplace.com/discovery/v1/services/search?q=test

# Consumption workflow
curl https://api.llm-marketplace.com/consumption/v1/usage
```

#### Extended Validation (First 4 hours)

```bash
# 1. Monitor error rates
kubectl logs -n llm-marketplace -l app=publishing-service --tail=1000 | grep -i error | wc -l
# Should be < 10

# 2. Monitor response times
# Check CloudWatch metrics or Prometheus
# P95 latency should be < 800ms

# 3. Verify data replication is working
# If primary region recovered, verify DR replication re-established

# 4. Monitor resource usage
kubectl top nodes
kubectl top pods -n llm-marketplace

# 5. Check for any warnings or alerts
# Review PagerDuty, CloudWatch Alarms, Grafana dashboards
```

#### 24-Hour Validation

- [ ] Zero critical incidents in DR region
- [ ] All automated backups running successfully
- [ ] Performance metrics within SLA targets
- [ ] No data integrity issues reported
- [ ] Customer complaints < baseline
- [ ] All monitoring and alerting working correctly

---

## Automation Scripts

### Automated Failover Script

Create `/docs/disaster-recovery/scripts/failover-to-dr.sh`:

```bash
#!/bin/bash

##############################################################################
# Automated Cross-Region Failover Script
#
# WARNING: This script performs a complete regional failover
# Only run with explicit approval from incident commander
##############################################################################

set -euo pipefail

# Configuration
DR_REGION="us-west-2"
PRIMARY_REGION="us-east-1"

# Function to wait for user confirmation
confirm() {
    read -p "$1 (type 'yes' to continue): " response
    if [[ "$response" != "yes" ]]; then
        echo "Failover aborted"
        exit 1
    fi
}

# Phase 1: Database
echo "========================================="
echo "Phase 1: Database Failover"
echo "========================================="
confirm "Promote DR database to primary?"

aws rds promote-read-replica \
    --db-instance-identifier llm-marketplace-db-replica \
    --region $DR_REGION

aws rds wait db-instance-available \
    --db-instance-identifier llm-marketplace-db-replica \
    --region $DR_REGION

echo "✅ Database failover complete"

# Phase 2: Applications
echo "========================================="
echo "Phase 2: Application Deployment"
echo "========================================="

# Switch to DR cluster
aws eks update-kubeconfig --region $DR_REGION --name llm-marketplace-dr

# Deploy applications
kubectl apply -f k8s/base/ -n llm-marketplace
kubectl apply -f k8s/overlays/dr/ -n llm-marketplace

# Scale up
kubectl scale deployment --all --replicas=3 -n llm-marketplace

# Wait for ready
kubectl wait --for=condition=available --timeout=300s deployment --all -n llm-marketplace

echo "✅ Application deployment complete"

# Phase 3: DNS
echo "========================================="
echo "Phase 3: DNS Failover"
echo "========================================="
confirm "Update DNS to point to DR region?"

# Update DNS (simplified - use actual hosted zone ID)
# aws route53 change-resource-record-sets ...

echo "✅ Failover complete!"
echo "Please run post-failover validation checks"
```

---

## Emergency Contacts

### Escalation Path

1. **On-Call Engineer** → Initial responder
2. **Incident Commander** → Coordinates failover
3. **VP Engineering** → Approval for cross-region failover
4. **CTO** → Approval for major decisions

### Contact Information

| Role | Primary | Backup | Phone | Slack |
|------|---------|--------|-------|-------|
| On-Call SRE | Auto-paged | Auto-paged | PagerDuty | #incident-response |
| Incident Commander | John Doe | Jane Smith | xxx-xxx-xxxx | @incident-cmd |
| VP Engineering | Alice Johnson | Bob Wilson | xxx-xxx-xxxx | @vp-eng |
| CTO | Charlie Brown | | xxx-xxx-xxxx | @cto |

---

## Related Documentation

- [DISASTER_RECOVERY_PLAN.md](../DISASTER_RECOVERY_PLAN.md) - Overall DR strategy
- [RTO_RPO_VALIDATION.md](./RTO_RPO_VALIDATION.md) - Testing procedures
- [RUNBOOK_TEMPLATE.md](../../runbooks/templates/RUNBOOK_TEMPLATE.md) - Runbook format
- [Incident Response Framework](../../runbooks/INCIDENT_RESPONSE_FRAMEWORK.md)

---

**Document Owner:** SRE Team
**Last Updated:** 2024-11-19
**Next Review:** 2024-12-19
**Status:** ✅ Active
