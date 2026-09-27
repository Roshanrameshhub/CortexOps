# Disaster Recovery Training Guide

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2024-11-19
**Owner:** SRE Team

---

## Table of Contents

1. [Overview](#overview)
2. [Learning Objectives](#learning-objectives)
3. [Module 1: DR Fundamentals](#module-1-dr-fundamentals)
4. [Module 2: Backup and Recovery](#module-2-backup-and-recovery)
5. [Module 3: Failover Procedures](#module-3-failover-procedures)
6. [Module 4: Testing and Validation](#module-4-testing-and-validation)
7. [Module 5: Incident Response](#module-5-incident-response)
8. [Hands-On Exercises](#hands-on-exercises)
9. [Knowledge Checks](#knowledge-checks)
10. [Certification](#certification)

---

## Overview

### Purpose

This training guide prepares SRE team members to execute disaster recovery procedures for the LLM-Marketplace platform. By completing this training, you will be able to respond effectively to disaster scenarios and maintain our DR systems.

### Training Duration

- **Self-Paced Study:** 4-6 hours
- **Hands-On Labs:** 2-3 hours
- **Total Time:** 6-9 hours

### Prerequisites

- Familiarity with AWS services (RDS, S3, EKS)
- Basic Kubernetes knowledge
- Command line proficiency
- Understanding of the LLM-Marketplace architecture

---

## Learning Objectives

By the end of this training, you will be able to:

✅ Explain the DR strategy and recovery objectives (RTO/RPO)
✅ Execute backup verification procedures
✅ Perform database failover (Multi-AZ and cross-region)
✅ Deploy applications to DR environment
✅ Execute full platform failover
✅ Validate recovery procedures
✅ Respond to DR-related incidents
✅ Conduct DR tests independently

---

## Module 1: DR Fundamentals

### 1.1 What is Disaster Recovery?

**Definition:**
Disaster Recovery (DR) is the process and set of procedures to recover IT systems after a catastrophic event.

**Key Concepts:**

```
┌─────────────────────────────────────────────────────────────┐
│ DR Key Concepts                                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ RTO (Recovery Time Objective):                              │
│   Maximum acceptable time to restore service                │
│   Our target: < 4 hours for full platform                   │
│                                                               │
│ RPO (Recovery Point Objective):                             │
│   Maximum acceptable data loss (measured in time)            │
│   Our target: < 15 minutes                                  │
│                                                               │
│ Backup:                                                      │
│   Copy of data stored separately from production            │
│   Multiple types: Full, incremental, snapshot               │
│                                                               │
│ Replication:                                                 │
│   Continuous copying of data to secondary location           │
│   Reduces RPO significantly                                  │
│                                                               │
│ Failover:                                                    │
│   Process of switching to DR environment                     │
│   Can be automatic or manual                                 │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Why DR Matters

**Business Impact:**

| Scenario | Without DR | With DR (Our System) |
|----------|-----------|----------------------|
| Database failure | 8-24 hours downtime | < 15 minutes (automatic) |
| Region outage | Days of downtime | < 4 hours |
| Data corruption | Data loss | < 15 minutes of data |
| Cost of outage | $100K-500K/hour | Minimal |

**Real-World Example:**

```
Timeline of AWS us-east-1 Outage (Hypothetical):

Hour 0:
  - us-east-1 region experiences widespread outage
  - All services in primary region down
  - Customer traffic fails

Hour 0-1 (Without DR):
  - Scrambling to understand issue
  - No clear recovery plan
  - Customers leaving platform
  - Revenue loss: $500K

Hour 0-1 (With DR):
  - Incident detected automatically
  - Incident Commander assigned
  - DR procedures initiated
  - Failover to us-west-2 underway

Hour 4:
  - Full platform restored in DR region
  - All services operational
  - Customer impact minimized
  - Revenue loss: <$50K
```

### 1.3 Our DR Architecture

**Multi-Region Setup:**

```
Primary Region (us-east-1)           DR Region (us-west-2)
┌─────────────────────────┐         ┌─────────────────────────┐
│                          │         │                          │
│  EKS Cluster (Active)    │         │  EKS Cluster (Standby)   │
│  ├─ Publishing Service   │         │  ├─ (Pre-deployed)       │
│  ├─ Discovery Service    │         │  └─ (Scaled to 0)        │
│  ├─ Consumption Service  │         │                          │
│  └─ Admin Service        │         │                          │
│                          │         │                          │
│  RDS PostgreSQL          │────────>│  RDS Read Replica        │
│  (Primary, Multi-AZ)     │ Async   │  (Standby)              │
│                          │ Repl.   │                          │
│  Elasticsearch           │         │  Elasticsearch           │
│  (Primary cluster)       │ Snapshots│ (Standby cluster)       │
│                          │ to S3   │                          │
│  ElastiCache Redis       │         │  ElastiCache Redis       │
│  (Primary cluster)       │         │  (Standby cluster)       │
│                          │         │                          │
└─────────────────────────┘         └─────────────────────────┘
           │                                   │
           └───────────  Route53 DNS  ─────────┘
                    (Weighted routing)
```

### 1.4 Component RTO/RPO Targets

| Component | RTO | RPO | Failover Type |
|-----------|-----|-----|---------------|
| PostgreSQL (Multi-AZ) | 2 min | 0 | Automatic |
| PostgreSQL (Cross-Region) | 15 min | 5 min | Manual |
| Elasticsearch | 30 min | 1 hour | Manual |
| Redis/ElastiCache | 10 min | 15 min | Manual |
| Publishing Service | 5 min | 0 | Manual |
| Discovery Service | 5 min | 1 hour | Manual |
| Consumption Service | 5 min | 5 min | Manual |
| **Full Platform** | **4 hours** | **15 min** | **Manual** |

---

## Module 2: Backup and Recovery

### 2.1 Backup Strategy

**Three-Layer Backup Approach:**

**Layer 1: RDS Automated Backups**
- Frequency: Daily (automated by AWS)
- Retention: 35 days
- Scope: Full database
- RPO: ~24 hours
- Storage: AWS managed

**Layer 2: Manual Logical Backups**
- Frequency: Daily via `backup-database.sh`
- Retention: 90 days
- Scope: Full database (pg_dump)
- RPO: ~24 hours
- Storage: S3 with encryption

**Layer 3: WAL Archiving**
- Frequency: Continuous
- Retention: 7 days
- Scope: Transaction logs
- RPO: ~5 minutes
- Storage: S3

### 2.2 Backup Verification

**Hands-On: Verify Current Backups**

```bash
# Step 1: Run backup verification script
/docs/disaster-recovery/scripts/verify-backups.sh

# Expected output:
# ========================================
# Backup Verification Summary
# ========================================
# Total Components:  3
# Passed:            3
# Warnings:          0
# Failed:            0

# Step 2: View detailed report
cat /tmp/backup-verification-report-*.json | jq .

# Step 3: Check PostgreSQL backup age
aws s3 ls s3://llm-marketplace-backups-primary/database/postgres/ --recursive | \
    grep postgres-backup | \
    sort | \
    tail -1

# Step 4: Check Elasticsearch snapshot
curl -sf http://elasticsearch:9200/_snapshot/s3_backup/_all | \
    jq '.snapshots | sort_by(.start_time_in_millis) | last'
```

**What to Look For:**

- ✅ Latest backup < 25 hours old
- ✅ Backup size > 1MB (not corrupted)
- ✅ No failed validations
- ✅ S3 bucket accessible

### 2.3 Restore Procedures

**Database Restore Process:**

```bash
# Restore from latest S3 backup
/docs/disaster-recovery/scripts/restore-database.sh \
    --backup-s3 s3://llm-marketplace-backups-primary/database/postgres/postgres-backup-YYYYMMDD-HHMMSS.dump \
    --target-db llm_marketplace_restored

# Restore from local file
/docs/disaster-recovery/scripts/restore-database.sh \
    --backup-file /backups/postgres-backup-20241119.dump \
    --target-db llm_marketplace_restored

# Validate backup without restoring
/docs/disaster-recovery/scripts/restore-database.sh \
    --backup-file /backups/postgres-backup-20241119.dump \
    --validate-only
```

---

## Module 3: Failover Procedures

### 3.1 Database Multi-AZ Failover

**Scenario:** Primary database AZ fails

**Automatic Failover Process:**

```
Step 1: RDS detects AZ failure (30-60 seconds)
   ↓
Step 2: RDS automatically promotes standby in different AZ (60 seconds)
   ↓
Step 3: DNS endpoint updated to new primary (30 seconds)
   ↓
Step 4: Applications automatically reconnect (5-10 seconds)
   ↓
Total RTO: ~2 minutes
```

**Human Actions Required:**

1. **Monitor** (don't interfere - it's automatic!)
2. **Verify** application health after failover
3. **Document** incident details
4. **Update** status page

**Hands-On: Execute Multi-AZ Failover Test**

```bash
# Step 1: Check current AZ
aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --query 'DBInstances[0].AvailabilityZone' \
    --output text

# Step 2: Record baseline metrics
kubectl logs -n llm-marketplace -l app=publishing-service --tail=20

# Step 3: Force failover
START_TIME=$(date +%s)

aws rds reboot-db-instance \
    --db-instance-identifier llm-marketplace-db \
    --force-failover

# Step 4: Monitor failover
watch -n 5 'aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --query "DBInstances[0].{Status:DBInstanceStatus,AZ:AvailabilityZone}"'

# Step 5: Calculate RTO
END_TIME=$(date +%s)
RTO=$((END_TIME - START_TIME))
echo "RTO: ${RTO} seconds (target: 120 seconds)"

# Step 6: Verify new AZ
aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --query 'DBInstances[0].AvailabilityZone' \
    --output text

# Step 7: Verify application health
for svc in publishing discovery consumption admin; do
    kubectl exec -n llm-marketplace \
        $(kubectl get pod -n llm-marketplace -l app=${svc}-service -o jsonpath='{.items[0].metadata.name}') \
        -- wget -q -O- http://localhost:3001/health
done
```

### 3.2 Cross-Region Failover

**Scenario:** Entire us-east-1 region is unavailable

**Manual Failover Process:**

```
Phase 1: Database Failover (10-15 minutes)
   - Verify primary region unavailable
   - Promote read replica in us-west-2
   - Update DNS records
   ↓
Phase 2: Elasticsearch Failover (15-20 minutes)
   - Restore latest snapshot to DR cluster
   - Update DNS records
   ↓
Phase 3: Application Deployment (45-60 minutes)
   - Switch kubectl context to DR cluster
   - Deploy all microservices
   - Scale up deployments
   ↓
Phase 4: Load Balancer Failover (10-15 minutes)
   - Update Route53 to point to DR LB
   - Wait for DNS propagation
   ↓
Phase 5: Validation (30-45 minutes)
   - Test all critical workflows
   - Verify monitoring and alerting
   - Update status page
   ↓
Total RTO: 2-4 hours
```

**Detailed Procedure:** See [FAILOVER_PROCEDURES.md](../procedures/FAILOVER_PROCEDURES.md#cr-f-001-full-platform-cross-region-failover)

### 3.3 Decision Matrix

**When to Initiate Failover:**

| Scenario | Automatic | Manual | Approval Needed |
|----------|-----------|---------|-----------------|
| Single pod crash | ✅ | ❌ | ❌ |
| Database Multi-AZ failure | ✅ | ❌ | ❌ |
| Single service down | ❌ | ✅ | Incident Commander |
| Multiple services down | ❌ | ✅ | VP Engineering |
| Entire region down | ❌ | ✅ | CTO |

**Decision Tree:**

```
Is the issue in primary region?
├─ No → Don't failover, investigate
└─ Yes → Is it affecting customers?
    ├─ No → Monitor, don't failover
    └─ Yes → Has it lasted > 15 minutes?
        ├─ No → Monitor, standby for failover
        └─ Yes → Is AWS confirming region issue?
            ├─ No → Continue investigation
            └─ Yes → INITIATE FAILOVER
                └─ Get VP Eng or CTO approval
```

---

## Module 4: Testing and Validation

### 4.1 Monthly Component Tests

**What Gets Tested:**

- Week 1: Database failover
- Week 2: Application failover
- Week 3: Backup/restore
- Week 4: Infrastructure health

**Test Execution:**

```bash
# Run specific test
/docs/disaster-recovery/tests/run-dr-tests.sh --test-type database

# Run all tests
/docs/disaster-recovery/tests/run-dr-tests.sh --test-type all

# Dry run (no actual failover)
/docs/disaster-recovery/tests/run-dr-tests.sh --test-type database --dry-run

# View results
cat /var/log/dr-tests/dr-test-*.json | jq .summary
```

### 4.2 RTO/RPO Measurement

**How We Measure RTO:**

```bash
# Start timer
START_TIME=$(date +%s)

# ... perform failover ...

# End timer
END_TIME=$(date +%s)
RTO=$((END_TIME - START_TIME))

# Record result
echo "RTO: ${RTO}s (Target: XXXs)" >> /var/log/dr-tests/rto-measurements.log
```

**How We Measure RPO:**

```bash
# Insert test record with timestamp BEFORE disaster
psql -c "INSERT INTO dr_test (timestamp, data) VALUES (NOW(), 'pre-disaster');"

# ... disaster occurs ...
# ... perform recovery ...

# Check if test record exists AFTER recovery
psql -c "SELECT COUNT(*) FROM dr_test WHERE data='pre-disaster';"

# If count=1: RPO=0 (no data loss)
# If count=0: Calculate RPO from last successful transaction
```

### 4.3 Post-Test Procedures

**After Every DR Test:**

1. **Document Results** (15 minutes)
   - Fill out test report template
   - Record RTO/RPO measurements
   - Note any issues

2. **Update Dashboards** (5 minutes)
   - Metrics automatically published to CloudWatch
   - Review in Grafana

3. **Team Debrief** (30 minutes)
   - What went well?
   - What could be improved?
   - Any runbook updates needed?

4. **Action Items** (ongoing)
   - Create Jira tickets for issues
   - Assign owners and due dates
   - Track to completion

---

## Module 5: Incident Response

### 5.1 Incident Roles

**Incident Commander:**
- Declares incident severity
- Makes final decisions
- Coordinates team
- Communicates to stakeholders

**Technical Lead:**
- Executes failover procedures
- Directs technical team
- Provides status updates

**Communications Lead:**
- Updates status page
- Notifies customers
- Manages internal comms

**Scribe:**
- Documents all actions
- Records timestamps
- Captures decisions

### 5.2 Communication During Incidents

**Status Page Updates:**

```
Investigating (0-15 min):
"We are investigating reports of service degradation in our primary region."

Identified (15-30 min):
"We have identified a region-wide issue and are initiating disaster recovery procedures."

Monitoring (30 min - 4 hours):
"Services are being restored in our backup region. Current progress: 60% complete."

Resolved (post-recovery):
"All services have been restored. We are monitoring closely for stability."

Postmortem (within 48 hours):
"A detailed incident report is available at [link]."
```

**Internal Communication:**

- **Slack #incident-response:** Real-time coordination
- **Zoom War Room:** Voice/video coordination
- **Email:** Stakeholder updates (hourly)
- **PagerDuty:** Escalations

---

## Hands-On Exercises

### Exercise 1: Backup Verification (15 minutes)

**Objective:** Verify all backups are current and valid

```bash
# 1. Run backup verification
/docs/disaster-recovery/scripts/verify-backups.sh

# 2. Check for any failures
# Expected: All PASS

# 3. If any failures, investigate
cat /var/log/postgres-backup.log | grep ERROR

# 4. Manually verify S3 backups
aws s3 ls s3://llm-marketplace-backups-primary/ --recursive | tail -10
```

**Success Criteria:**
- ✅ All backup verifications pass
- ✅ Latest backup < 24 hours old
- ✅ No errors in logs

---

### Exercise 2: Database Multi-AZ Failover (30 minutes)

**Objective:** Execute and validate database failover

See [Module 3.1](#31-database-multi-az-failover) for detailed steps.

**Success Criteria:**
- ✅ Failover completes in < 120 seconds
- ✅ No data loss (RPO = 0)
- ✅ All applications reconnect automatically
- ✅ No customer-facing errors

---

### Exercise 3: Application Failover to DR (45 minutes)

**Objective:** Deploy applications to DR cluster

```bash
# 1. Switch to DR cluster
kubectl config use-context dr-cluster

# 2. Verify cluster health
kubectl get nodes
kubectl get namespaces

# 3. Deploy applications
kubectl apply -f k8s/base/ -n llm-marketplace
kubectl apply -f k8s/overlays/dr/ -n llm-marketplace

# 4. Scale up
kubectl scale deployment --all --replicas=3 -n llm-marketplace

# 5. Wait for ready
kubectl wait --for=condition=available \
    --timeout=300s \
    deployment --all \
    -n llm-marketplace

# 6. Verify health
for svc in publishing discovery consumption admin; do
    kubectl exec -n llm-marketplace \
        $(kubectl get pod -n llm-marketplace -l app=${svc}-service -o jsonpath='{.items[0].metadata.name}') \
        -- wget -q -O- http://localhost:3001/health
done
```

**Success Criteria:**
- ✅ All deployments ready within 5 minutes
- ✅ Health checks passing
- ✅ No errors in pod logs

---

## Knowledge Checks

### Quiz 1: DR Fundamentals

1. **What is RTO?**
   - A) Recovery Time Objective - Maximum acceptable time to restore service
   - B) Recovery Total Optimization
   - C) Regional Time Offset
   - D) Redundancy Testing Operation

   <details>
   <summary>Answer</summary>
   A) Recovery Time Objective - Maximum acceptable time to restore service
   </details>

2. **What is our platform's RTO target?**
   - A) 1 hour
   - B) 2 hours
   - C) 4 hours
   - D) 8 hours

   <details>
   <summary>Answer</summary>
   C) 4 hours
   </details>

3. **What is RPO?**
   - A) Recovery Point Objective - Maximum acceptable data loss
   - B) Regional Protection Optimization
   - C) Redundant Processing Order
   - D) Rapid Processing Objective

   <details>
   <summary>Answer</summary>
   A) Recovery Point Objective - Maximum acceptable data loss
   </details>

4. **How often should we run DR tests?**
   - A) Annually
   - B) Semi-annually
   - C) Quarterly
   - D) Monthly

   <details>
   <summary>Answer</summary>
   D) Monthly (component tests), Quarterly (integration tests), Semi-annually (full tests)
   </details>

5. **What is the DR region for LLM-Marketplace?**
   - A) us-east-2
   - B) us-west-1
   - C) us-west-2
   - D) eu-west-1

   <details>
   <summary>Answer</summary>
   C) us-west-2
   </details>

### Quiz 2: Failover Procedures

6. **Database Multi-AZ failover is:**
   - A) Manual
   - B) Automatic
   - C) Semi-automatic
   - D) Not supported

   <details>
   <summary>Answer</summary>
   B) Automatic
   </details>

7. **Who must approve cross-region failover?**
   - A) On-call engineer
   - B) Incident Commander
   - C) VP Engineering or CTO
   - D) Any SRE

   <details>
   <summary>Answer</summary>
   C) VP Engineering or CTO
   </details>

8. **What is the expected RTO for database Multi-AZ failover?**
   - A) 30 seconds
   - B) 2 minutes
   - C) 15 minutes
   - D) 1 hour

   <details>
   <summary>Answer</summary>
   B) 2 minutes
   </details>

9. **During cross-region failover, what is the first phase?**
   - A) Application deployment
   - B) DNS failover
   - C) Database failover
   - D) Load balancer update

   <details>
   <summary>Answer</summary>
   C) Database failover
   </details>

10. **How long is acceptable for the full platform failover?**
    - A) 1 hour
    - B) 2 hours
    - C) 4 hours
    - D) 8 hours

    <details>
    <summary>Answer</summary>
    C) 4 hours (RTO target)
    </details>

---

## Certification

### Requirements

To be certified in DR procedures, you must:

1. ✅ Complete all training modules
2. ✅ Pass knowledge check (8/10 correct)
3. ✅ Complete all hands-on exercises
4. ✅ Participate in at least one DR test
5. ✅ Shadow incident commander in a drill

### Certification Levels

**Level 1: DR Responder** (All SREs)
- Can execute basic procedures
- Can verify backups
- Can perform component failovers
- Requires: Modules 1-3 + Exercises 1-2

**Level 2: DR Specialist** (Senior SREs)
- Can execute full platform failover
- Can lead component tests
- Can update DR documentation
- Requires: All modules + All exercises

**Level 3: Incident Commander** (Staff+ SREs)
- Can lead full DR drills
- Can make critical decisions
- Can update DR strategy
- Requires: Level 2 + Lead 2 DR tests

---

## Next Steps

After completing this training:

1. **Schedule Hands-On Session** with senior SRE
2. **Join Monthly DR Test** as observer
3. **Review Recent Incidents** in Confluence
4. **Update Your Oncall Runbook** with DR procedures
5. **Complete Certification** within 30 days

---

## Additional Resources

- [DISASTER_RECOVERY_PLAN.md](../DISASTER_RECOVERY_PLAN.md)
- [FAILOVER_PROCEDURES.md](../procedures/FAILOVER_PROCEDURES.md)
- [RTO_RPO_VALIDATION.md](../procedures/RTO_RPO_VALIDATION.md)
- [DR_TESTING_SCHEDULE.md](../tests/DR_TESTING_SCHEDULE.md)

---

**Document Owner:** SRE Team
**Last Updated:** 2024-11-19
**Next Review:** 2025-01-19
**Status:** ✅ Active
