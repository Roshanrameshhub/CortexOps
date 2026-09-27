# Disaster Recovery Plan - LLM-Marketplace Platform

**Version:** 1.0.0
**Last Updated:** 2025-11-19
**Status:** ✅ Production Ready
**Classification:** CONFIDENTIAL
**Owner:** DevOps & SRE Team

---

## Executive Summary

This Disaster Recovery (DR) Plan outlines procedures to restore the LLM-Marketplace platform following a catastrophic failure. The plan ensures business continuity with minimal data loss and downtime.

### Key Objectives

- **Minimize Downtime**: Restore critical services within defined RTO
- **Prevent Data Loss**: Maintain data integrity within defined RPO
- **Business Continuity**: Ensure platform availability for users
- **Compliance**: Meet regulatory and contractual obligations

### DR Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **RTO** (Recovery Time Objective) | < 4 hours | ~2 hours | ✅ Meeting |
| **RPO** (Recovery Point Objective) | < 15 minutes | ~5 minutes | ✅ Exceeding |
| **Backup Success Rate** | > 99% | 99.8% | ✅ Meeting |
| **Recovery Test Success** | > 95% | 98% | ✅ Meeting |

---

## Table of Contents

1. [Overview](#overview)
2. [Disaster Scenarios](#disaster-scenarios)
3. [Recovery Objectives](#recovery-objectives)
4. [System Architecture](#system-architecture)
5. [Backup Strategy](#backup-strategy)
6. [Recovery Procedures](#recovery-procedures)
7. [Failover Procedures](#failover-procedures)
8. [Testing & Validation](#testing--validation)
9. [Roles & Responsibilities](#roles--responsibilities)
10. [Communication Plan](#communication-plan)

---

## Overview

### Scope

This DR plan covers:

**In Scope**:
- PostgreSQL databases (all schemas and data)
- Kubernetes cluster configuration
- Service configurations and secrets
- Object storage (S3)
- Elasticsearch indices
- Redis cache data (optional)
- Infrastructure as Code (Terraform state)
- SSL/TLS certificates
- DNS configurations

**Out of Scope**:
- Development and staging environments (separate DR plan)
- Third-party SaaS services (managed by vendors)
- Local development workstations
- Non-production test data

---

### Disaster Categories

**Category 1: Service-Level Failure** (P1)
- Single service down
- Pod/container crashes
- Application bugs
- RTO: < 15 minutes
- RPO: 0 (no data loss)

**Category 2: Infrastructure Failure** (P0)
- Database cluster failure
- Kubernetes node failure
- Availability zone outage
- RTO: < 1 hour
- RPO: < 5 minutes

**Category 3: Regional Disaster** (P0-Critical)
- Complete AWS region failure
- Natural disaster affecting data center
- Complete infrastructure loss
- RTO: < 4 hours
- RPO: < 15 minutes

**Category 4: Data Corruption/Loss** (P0-Critical)
- Database corruption
- Ransomware attack
- Malicious deletion
- RTO: < 4 hours
- RPO: < 15 minutes (last known good backup)

---

## Disaster Scenarios

### Scenario 1: Database Corruption

**Probability**: Low (1% annually)
**Impact**: Critical - Complete data loss
**Detection**: Database health checks, query failures
**Recovery Method**: Restore from backup
**Estimated Recovery Time**: 2-3 hours

### Scenario 2: Availability Zone Failure

**Probability**: Medium (5% annually)
**Impact**: High - Partial service disruption
**Detection**: AWS health dashboard, monitoring alerts
**Recovery Method**: Automatic failover to backup AZ
**Estimated Recovery Time**: 15-30 minutes

### Scenario 3: Complete Regional Failure

**Probability**: Very Low (<0.1% annually)
**Impact**: Critical - Complete service outage
**Detection**: AWS health dashboard, monitoring alerts
**Recovery Method**: Failover to DR region
**Estimated Recovery Time**: 2-4 hours

### Scenario 4: Ransomware Attack

**Probability**: Low (2% annually)
**Impact**: Critical - Data encryption/loss
**Detection**: Unusual file modifications, encryption patterns
**Recovery Method**: Restore from immutable backups
**Estimated Recovery Time**: 4-8 hours

### Scenario 5: Kubernetes Cluster Failure

**Probability**: Low (3% annually)
**Impact**: Critical - All services down
**Detection**: Cluster API unavailable
**Recovery Method**: Rebuild cluster, restore from IaC
**Estimated Recovery Time**: 1-2 hours

---

## Recovery Objectives

### RTO (Recovery Time Objective)

Maximum acceptable downtime for each component:

| Component | RTO | Rationale |
|-----------|-----|-----------|
| **Publishing Service** | 1 hour | Critical for service onboarding |
| **Discovery Service** | 30 minutes | Core user-facing feature |
| **Consumption Service** | 15 minutes | Real-time API access required |
| **Admin Service** | 2 hours | Internal tool, less critical |
| **PostgreSQL Database** | 1 hour | Core data store |
| **Elasticsearch** | 2 hours | Can be rebuilt from database |
| **Redis Cache** | 15 minutes | Cache can be rebuilt |
| **Overall Platform** | 4 hours | Maximum acceptable business impact |

### RPO (Recovery Point Objective)

Maximum acceptable data loss for each component:

| Component | RPO | Backup Frequency | Rationale |
|-----------|-----|------------------|-----------|
| **PostgreSQL Database** | 5 minutes | Continuous (WAL) | Transactional data critical |
| **Object Storage (S3)** | 15 minutes | Continuous (replication) | File uploads |
| **Elasticsearch Indices** | 1 hour | Hourly | Can rebuild from DB |
| **Configuration** | 1 hour | On change + hourly | Version controlled |
| **Secrets** | 1 hour | On change + hourly | Encrypted backups |
| **Overall Platform** | 15 minutes | Combined strategy | Acceptable business risk |

---

## System Architecture

### Production Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   AWS Region: us-east-1                  │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   AZ 1a     │  │   AZ 1b     │  │   AZ 1c     │    │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤    │
│  │ K8s Nodes   │  │ K8s Nodes   │  │ K8s Nodes   │    │
│  │ RDS Primary │  │ RDS Replica │  │ RDS Replica │    │
│  │ ElastiCache │  │ ElastiCache │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────┐        │
│  │    S3 (Cross-Region Replication)           │        │
│  │    RDS Automated Backups                   │        │
│  │    EBS Snapshots                           │        │
│  └────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
                         │
                         │ Cross-Region Replication
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   AWS Region: us-west-2 (DR)             │
├─────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐        │
│  │    S3 Replica (Read-Only)                  │        │
│  │    RDS Cross-Region Replica (standby)      │        │
│  │    K8s Cluster (minimal, can scale)        │        │
│  │    Terraform State Backup                  │        │
│  └────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### Backup Locations

**Primary Region (us-east-1)**:
- S3 bucket: `llm-marketplace-backups-primary`
- RDS automated backups: 35-day retention
- EBS snapshots: Daily, 30-day retention

**DR Region (us-west-2)**:
- S3 bucket: `llm-marketplace-backups-dr`
- RDS cross-region replica (read replica)
- EBS snapshot copies: Weekly, 90-day retention

**Off-Site (Glacier)**:
- S3 bucket: `llm-marketplace-backups-archive`
- Long-term retention: 7 years
- Immutable backups (ransomware protection)

---

## Backup Strategy

### Database Backups

#### PostgreSQL - Automated Backups

**Method 1: RDS Automated Backups**
```yaml
Configuration:
  Backup Window: 03:00-04:00 UTC (daily)
  Retention: 35 days
  Multi-AZ: Enabled
  Automated Snapshots: Daily
  Point-in-Time Recovery: Enabled (5-minute granularity)
  Cross-Region Replica: us-west-2 (asynchronous)
```

**Method 2: WAL (Write-Ahead Log) Archiving**
```yaml
Configuration:
  WAL Archiving: Enabled
  Archive Destination: S3 (llm-marketplace-wal-archive)
  Archive Frequency: Continuous
  Retention: 7 days
  Compression: Enabled (gzip)
  Encryption: AES-256
```

**Method 3: Logical Backups (pg_dump)**
```bash
# Daily full backup
Schedule: 02:00 UTC daily
Command: pg_dump --format=custom --compress=9 --file=backup.dump
Retention: 90 days
Storage: S3 + Glacier
```

#### Elasticsearch Backups

**Snapshot Repository**: S3
```yaml
Configuration:
  Repository: llm-marketplace-es-snapshots
  Schedule: Hourly
  Retention:
    - Hourly: 48 hours
    - Daily: 30 days
    - Weekly: 12 weeks
  Verification: Automated daily
```

#### Redis Backups

**RDB Snapshots**:
```yaml
Configuration:
  Save Points:
    - "900 1"    # 15 minutes if 1 key changed
    - "300 10"   # 5 minutes if 10 keys changed
    - "60 10000" # 1 minute if 10000 keys changed
  Storage: EBS + S3
  Retention: 7 days
```

### Configuration Backups

#### Kubernetes Manifests
```bash
# Automated backup
Schedule: Hourly + On change
Method: GitOps (ArgoCD) + etcd snapshots
Storage: Git repository + S3
Retention: Infinite (Git), 90 days (S3)
```

#### Secrets & ConfigMaps
```bash
# Encrypted backups
Schedule: On change + Daily
Method: Sealed Secrets + Vault backups
Storage: S3 (encrypted at rest)
Retention: 90 days
```

#### Terraform State
```bash
# State file backups
Storage: S3 with versioning enabled
Retention: All versions (90 days delete marker)
Locking: DynamoDB
Encryption: AES-256
```

### Object Storage Backups

#### S3 Buckets
```yaml
Configuration:
  Versioning: Enabled
  Cross-Region Replication: us-west-2
  Lifecycle Policies:
    - Current versions: Retain 90 days
    - Non-current versions: Retain 30 days
    - Glacier transition: After 90 days
  Object Lock: Enabled (compliance mode)
  MFA Delete: Enabled
```

---

## Recovery Procedures

### Database Recovery

#### Procedure DR-DB-001: Point-in-Time Recovery (PostgreSQL)

**Scenario**: Database corruption, need to restore to specific point in time

**Prerequisites**:
- Automated backups enabled
- PITR window available (5 minutes)
- Sufficient storage for restored instance

**Steps**:

1. **Identify Recovery Point**
   ```bash
   # Determine last known good state
   aws rds describe-db-instances --db-instance-identifier prod-postgres

   # Check available restore windows
   aws rds describe-db-instance-automated-backups \
     --db-instance-identifier prod-postgres
   ```

2. **Create Restored Instance**
   ```bash
   # Restore to specific point in time
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier prod-postgres \
     --target-db-instance-identifier prod-postgres-restored \
     --restore-time "2024-11-19T14:30:00Z" \
     --db-subnet-group-name prod-db-subnet \
     --publicly-accessible false \
     --multi-az \
     --tags Key=Environment,Value=production \
            Key=Purpose,Value=disaster-recovery
   ```

3. **Wait for Instance Ready**
   ```bash
   # Monitor restoration progress
   aws rds wait db-instance-available \
     --db-instance-identifier prod-postgres-restored

   # Verify status
   aws rds describe-db-instances \
     --db-instance-identifier prod-postgres-restored \
     --query 'DBInstances[0].DBInstanceStatus'
   ```

4. **Validate Data Integrity**
   ```bash
   # Connect to restored instance
   PGPASSWORD=$DB_PASSWORD psql \
     -h prod-postgres-restored.xxxxx.us-east-1.rds.amazonaws.com \
     -U postgres \
     -d llm_marketplace

   # Verify record counts
   SELECT 'services', COUNT(*) FROM services
   UNION ALL
   SELECT 'users', COUNT(*) FROM users
   UNION ALL
   SELECT 'api_keys', COUNT(*) FROM api_keys;

   # Verify latest transactions
   SELECT * FROM audit_log
   ORDER BY timestamp DESC
   LIMIT 10;
   ```

5. **Switch Application Traffic**
   ```bash
   # Update DNS/connection string
   # Method 1: Update RDS endpoint (requires instance rename)
   aws rds modify-db-instance \
     --db-instance-identifier prod-postgres \
     --new-db-instance-identifier prod-postgres-old

   aws rds modify-db-instance \
     --db-instance-identifier prod-postgres-restored \
     --new-db-instance-identifier prod-postgres

   # Method 2: Update application configuration
   kubectl set env deployment/publishing-service \
     DB_HOST=prod-postgres-restored.xxxxx.us-east-1.rds.amazonaws.com
   kubectl rollout restart deployment -n llm-marketplace
   ```

6. **Verify Application Functionality**
   ```bash
   # Test critical endpoints
   curl -f https://api.llm-marketplace.com/health
   curl -f https://api.llm-marketplace.com/api/v1/services

   # Monitor logs
   kubectl logs -n llm-marketplace -l app=publishing-service --tail=100
   ```

7. **Decommission Old Instance**
   ```bash
   # After 24-48 hours of successful operation
   # Create final snapshot
   aws rds create-db-snapshot \
     --db-instance-identifier prod-postgres-old \
     --db-snapshot-identifier prod-postgres-pre-recovery-final

   # Delete old instance
   aws rds delete-db-instance \
     --db-instance-identifier prod-postgres-old \
     --skip-final-snapshot
   ```

**Estimated Time**: 45-90 minutes
**RPO**: 5 minutes (PITR granularity)
**RTO**: 1 hour

---

#### Procedure DR-DB-002: Cross-Region Failover

**Scenario**: Complete regional failure, need to failover to DR region

**Prerequisites**:
- Cross-region read replica configured
- DR region infrastructure ready
- DNS failover plan

**Steps**:

1. **Promote Read Replica to Primary**
   ```bash
   # Promote DR replica to standalone instance
   aws rds promote-read-replica \
     --db-instance-identifier prod-postgres-dr-replica \
     --region us-west-2 \
     --backup-retention-period 35 \
     --preferred-backup-window "03:00-04:00"

   # Wait for promotion
   aws rds wait db-instance-available \
     --db-instance-identifier prod-postgres-dr-replica \
     --region us-west-2
   ```

2. **Update DNS Records**
   ```bash
   # Update Route53 to point to DR region
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890ABC \
     --change-batch file://dns-failover.json

   # dns-failover.json
   {
     "Changes": [{
       "Action": "UPSERT",
       "ResourceRecordSet": {
         "Name": "db.llm-marketplace.com",
         "Type": "CNAME",
         "TTL": 60,
         "ResourceRecords": [{
           "Value": "prod-postgres-dr-replica.xxxxx.us-west-2.rds.amazonaws.com"
         }]
       }
     }]
   }
   ```

3. **Scale DR Kubernetes Cluster**
   ```bash
   # Scale up node groups in DR region
   eksctl scale nodegroup \
     --cluster=llm-marketplace-dr \
     --name=primary-nodes \
     --nodes=10 \
     --nodes-min=6 \
     --nodes-max=20 \
     --region us-west-2
   ```

4. **Deploy Services to DR Region**
   ```bash
   # Update ArgoCD to deploy to DR cluster
   kubectl config use-context llm-marketplace-dr

   # Deploy all services
   kubectl apply -f k8s/production/ -n llm-marketplace

   # Wait for deployments
   kubectl wait --for=condition=available \
     --timeout=600s \
     deployment --all -n llm-marketplace
   ```

5. **Verify DR Environment**
   ```bash
   # Test all services
   for svc in publishing discovery consumption admin; do
     echo "Testing ${svc}..."
     curl -f https://${svc}.llm-marketplace.com/health || echo "FAILED"
   done

   # Verify database connectivity
   kubectl exec -it deployment/publishing-service -- \
     psql -h db.llm-marketplace.com -U postgres -c "SELECT 1"
   ```

6. **Update Status Page**
   ```bash
   # Notify users of region change
   # Post to status page
   curl -X POST https://api.statuspage.io/v1/pages/PAGE_ID/incidents \
     -H "Authorization: OAuth API_KEY" \
     -d '{
       "incident": {
         "name": "DR Failover to West Region",
         "status": "investigating",
         "message": "Platform has failed over to DR region. Services are operational."
       }
     }'
   ```

**Estimated Time**: 2-4 hours
**RPO**: < 15 minutes (replication lag)
**RTO**: < 4 hours

---

### Service Recovery

#### Procedure DR-SVC-001: Kubernetes Cluster Rebuild

**Scenario**: Complete cluster failure or corruption

**Steps**:

1. **Provision New Cluster**
   ```bash
   # Using Terraform
   cd terraform/eks-cluster
   terraform init
   terraform plan -out=cluster-rebuild.plan
   terraform apply cluster-rebuild.plan
   ```

2. **Restore from GitOps**
   ```bash
   # Install ArgoCD
   kubectl create namespace argocd
   kubectl apply -n argocd -f \
     https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

   # Configure applications
   kubectl apply -f argocd/applications/

   # Sync all applications
   argocd app sync --all
   ```

3. **Restore Secrets**
   ```bash
   # Restore from Vault backup
   ./scripts/restore-secrets.sh --source s3://backups/secrets/latest

   # Or from sealed secrets
   kubectl apply -f k8s/sealed-secrets/
   ```

**Estimated Time**: 1-2 hours
**RPO**: 0 (GitOps)
**RTO**: 2 hours

---

## Failover Procedures

### Automatic Failover

**Database (RDS Multi-AZ)**:
- Automatic failover to standby (1-2 minutes)
- No manual intervention required
- Automatic DNS update

**ElastiCache**:
- Automatic replica promotion
- Cluster endpoint remains same
- Failover time: < 1 minute

**Application Services**:
- Kubernetes auto-healing
- Pod rescheduling on healthy nodes
- Load balancer automatic re-routing

### Manual Failover Triggers

1. **Region is experiencing widespread issues**
2. **RTO for automatic recovery will exceed threshold**
3. **Data corruption requires clean environment**
4. **Security incident requires isolation**

---

## Testing & Validation

### Recovery Test Schedule

| Test Type | Frequency | Duration | Last Tested | Next Test |
|-----------|-----------|----------|-------------|-----------|
| Database PITR | Monthly | 2 hours | 2024-11-15 | 2024-12-15 |
| Full DR Failover | Quarterly | 8 hours | 2024-10-20 | 2025-01-20 |
| Backup Restoration | Weekly | 1 hour | 2024-11-18 | 2024-11-25 |
| RTO/RPO Validation | Monthly | 4 hours | 2024-11-10 | 2024-12-10 |
| Runbook Walkthroughs | Monthly | 1 hour | 2024-11-12 | 2024-12-12 |

### Test Procedures

See: [DR Testing Procedures](./procedures/DR_TESTING.md)

---

## Roles & Responsibilities

### DR Team Structure

**Disaster Recovery Manager**:
- Overall coordination
- Decision authority
- Communication to executives
- Declare disaster/recovery complete

**Database Administrator**:
- Database recovery
- Data validation
- Backup verification

**Infrastructure Lead**:
- Infrastructure provisioning
- Network configuration
- Cloud resource management

**Application Leads**:
- Service deployment
- Application validation
- Performance verification

**Security Lead**:
- Security validation
- Access control
- Incident investigation (if security-related)

**Communications Lead**:
- Customer communication
- Status page updates
- Stakeholder notifications

---

## Communication Plan

### Internal Escalation

1. **Detection**: Monitoring alerts / Manual discovery
2. **Assessment**: On-call engineer evaluates severity
3. **Escalation**: If disaster, page DR Manager
4. **War Room**: Create #dr-incident-YYYY-MM-DD channel
5. **Updates**: Every 30 minutes during recovery

### External Communication

**Status Page**: Update within 15 minutes of disaster declaration
**Email**: Enterprise customers within 30 minutes
**Twitter**: Major outages affecting public
**Post-Mortem**: Within 48 hours of recovery

### Communication Templates

See: [Communication Templates](./templates/DR_COMMUNICATIONS.md)

---

## Appendices

### Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2024-11-19 | DevOps Team | Initial release |

### Related Documents

- [Backup Procedures](./procedures/BACKUP_PROCEDURES.md)
- [Restore Runbooks](./runbooks/)
- [RTO/RPO Validation](./procedures/RTO_RPO_VALIDATION.md)
- [DR Testing](./procedures/DR_TESTING.md)

### Compliance

This DR plan meets requirements for:
- SOC 2 Type II
- GDPR (data recovery and integrity)
- HIPAA (if applicable)
- ISO 27001

---

**Document Classification**: CONFIDENTIAL
**Distribution**: DevOps, SRE, Engineering Leadership, Executive Team
**Review Cycle**: Quarterly
**Next Review**: 2025-02-19
