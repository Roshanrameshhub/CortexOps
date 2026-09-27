# Disaster Recovery Testing Schedule

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2024-11-19
**Owner:** SRE Team

---

## Table of Contents

1. [Overview](#overview)
2. [Testing Calendar](#testing-calendar)
3. [Test Types and Procedures](#test-types-and-procedures)
4. [Pre-Test Checklists](#pre-test-checklists)
5. [Post-Test Procedures](#post-test-procedures)
6. [Annual Test Plan](#annual-test-plan)

---

## Overview

### Purpose

This document defines the schedule, procedures, and checklists for disaster recovery testing. Regular testing ensures our DR procedures remain effective and our team stays proficient in executing them.

### Testing Philosophy

- **Regular Practice:** Monthly component tests keep skills sharp
- **Graduated Complexity:** Start simple, progress to full failovers
- **Surprise Drills:** Annual unannounced test validates real readiness
- **Continuous Improvement:** Each test improves procedures and documentation

---

## Testing Calendar

### 2025 Annual DR Testing Schedule

```
┌──────────────────────────────────────────────────────────────┐
│ Month    │ Week │ Test Type              │ Duration │ Team  │
├──────────┼──────┼────────────────────────┼──────────┼───────┤
│ January  │ 1st  │ Database Multi-AZ      │ 1 hour   │ 2 eng │
│          │ 3rd  │ Q1 Integration Test    │ 4 hours  │ 5 eng │
│ February │ 1st  │ Elasticsearch Backup   │ 1 hour   │ 2 eng │
│ March    │ 1st  │ Application Failover   │ 1 hour   │ 2 eng │
│          │      │                        │          │       │
│ April    │ 1st  │ Database Cross-Region  │ 2 hours  │ 3 eng │
│          │ 3rd  │ Q2 Integration Test    │ 4 hours  │ 5 eng │
│ May      │ 1st  │ Backup Verification    │ 1 hour   │ 2 eng │
│ June     │ 1st  │ Full Platform Failover │ 8 hours  │ 12eng │
│          │      │ 🎯 Semi-Annual Full DR│          │       │
│          │      │                        │          │       │
│ July     │ 1st  │ Database Multi-AZ      │ 1 hour   │ 2 eng │
│          │ 3rd  │ Q3 Integration Test    │ 4 hours  │ 5 eng │
│ August   │ 1st  │ Network Failover       │ 2 hours  │ 3 eng │
│ Sept     │ 2nd  │ 🚨 SURPRISE DRILL 🚨   │ 6 hours  │ All   │
│          │      │                        │          │       │
│ October  │ 1st  │ Database Restore       │ 2 hours  │ 3 eng │
│          │ 3rd  │ Q4 Integration Test    │ 4 hours  │ 5 eng │
│ November │ 1st  │ Application Failover   │ 1 hour   │ 2 eng │
│ December │ 1st  │ Full Platform Failover │ 8 hours  │ 12eng │
│          │      │ 🎯 Semi-Annual Full DR│          │       │
└──────────┴──────┴────────────────────────┴──────────┴───────┘
```

### Monthly Recurring Tests

**Every First Tuesday @ 10:00 AM EST**

| Component | Duration | Team Size | RTO Target | RPO Target |
|-----------|----------|-----------|------------|------------|
| Database Multi-AZ Failover | 30 min | 2 engineers | 2 min | 0 |
| Backup Verification | 30 min | 1 engineer | N/A | 24 hours |
| Health Checks | 15 min | 1 engineer | N/A | N/A |

**Monthly Test Rotation:**
- Week 1: Database tests
- Week 2: Application tests
- Week 3: Infrastructure tests
- Week 4: Security/compliance tests

### Quarterly Integration Tests

**Schedule:** 3rd Tuesday of Q1, Q2, Q3, Q4 @ 2:00 PM EST

**Duration:** 4 hours

**Team:** 5-8 engineers + 1 manager

**Scope:** Multi-component failover scenarios

### Semi-Annual Full DR Tests

**Schedule:**
- June (Early Summer): Complete platform failover
- December (End of Year): Complete platform failover

**Duration:** 8-12 hours (full business day)

**Team:** Entire SRE team (12+ engineers) + management

**Scope:** Full cross-region failover with all components

### Annual Surprise Drill

**Schedule:** September (unannounced to on-call team)

**Duration:** 4-8 hours

**Team:** Current on-call rotation + escalation path

**Purpose:** Validate true DR readiness without preparation

---

## Test Types and Procedures

### Type 1: Component Unit Tests (Monthly)

**Objective:** Verify individual components meet RTO/RPO targets

#### Database Multi-AZ Failover Test

**Schedule:** Monthly, 1st Tuesday, 10:00 AM EST

**Pre-Test Checklist:**

```markdown
- [ ] Team members notified (1 week advance)
- [ ] Status page maintenance window scheduled
- [ ] Test environment verified healthy
- [ ] Monitoring dashboards open
- [ ] War room Slack channel created (#dr-test-YYYYMMDD)
- [ ] Incident commander assigned
```

**Test Procedure:**

```bash
#!/bin/bash
# Execute: /docs/disaster-recovery/tests/test-database-multiaz.sh

# 1. Record baseline
echo "Recording baseline metrics..."
aws cloudwatch get-metric-statistics \
    --namespace AWS/RDS \
    --metric-name DatabaseConnections \
    --dimensions Name=DBInstanceIdentifier,Value=llm-marketplace-db \
    --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 60 \
    --statistics Average

# 2. Force failover
echo "Forcing Multi-AZ failover..."
START_TIME=$(date +%s)

aws rds reboot-db-instance \
    --db-instance-identifier llm-marketplace-db \
    --force-failover \
    --region us-east-1

# 3. Monitor failover
while true; do
    STATUS=$(aws rds describe-db-instances \
        --db-instance-identifier llm-marketplace-db \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text)

    if [[ "$STATUS" == "available" ]]; then
        END_TIME=$(date +%s)
        RTO=$((END_TIME - START_TIME))
        echo "Failover completed in ${RTO}s"
        break
    fi

    sleep 5
done

# 4. Verify applications
echo "Verifying application connectivity..."
for svc in publishing discovery consumption admin; do
    kubectl exec -n llm-marketplace \
        $(kubectl get pod -n llm-marketplace -l app=${svc}-service -o jsonpath='{.items[0].metadata.name}') \
        -- wget -q -O- http://localhost:3001/health
done

# 5. Validate RTO
if [[ $RTO -le 120 ]]; then
    echo "✅ PASS: RTO ${RTO}s (target: 120s)"
else
    echo "❌ FAIL: RTO ${RTO}s exceeded target of 120s"
fi
```

**Post-Test Checklist:**

```markdown
- [ ] Test results documented in Confluence
- [ ] RTO/RPO metrics updated in dashboard
- [ ] Any issues created as Jira tickets
- [ ] Status page maintenance window closed
- [ ] Team debrief completed
- [ ] Runbooks updated if needed
```

---

#### Elasticsearch Snapshot Test

**Schedule:** Monthly, 2nd Tuesday, 10:00 AM EST

**Test Procedure:**

```bash
#!/bin/bash
# Execute: /docs/disaster-recovery/tests/test-elasticsearch-snapshot.sh

# 1. Create snapshot
echo "Creating Elasticsearch snapshot..."
/docs/disaster-recovery/scripts/backup-elasticsearch.sh

# 2. Verify snapshot
LATEST_SNAPSHOT=$(curl -sf "http://elasticsearch:9200/_snapshot/s3_backup/_all" | \
    jq -r '.snapshots | sort_by(.start_time_in_millis) | last | .snapshot')

echo "Latest snapshot: $LATEST_SNAPSHOT"

# 3. Validate snapshot integrity
curl -sf "http://elasticsearch:9200/_snapshot/s3_backup/$LATEST_SNAPSHOT" | \
    jq '{
        state: .snapshots[0].state,
        indices: (.snapshots[0].indices | length),
        shards_total: .snapshots[0].shards.total,
        shards_successful: .snapshots[0].shards.successful,
        shards_failed: .snapshots[0].shards.failed
    }'

# 4. Test restore to temporary index
curl -X POST "http://elasticsearch:9200/_snapshot/s3_backup/$LATEST_SNAPSHOT/_restore" \
    -H 'Content-Type: application/json' \
    -d '{
        "indices": "services",
        "rename_pattern": "(.+)",
        "rename_replacement": "test_restore_$1"
    }'

# 5. Verify restored data
sleep 30
ORIGINAL_COUNT=$(curl -sf "http://elasticsearch:9200/services/_count" | jq '.count')
RESTORED_COUNT=$(curl -sf "http://elasticsearch:9200/test_restore_services/_count" | jq '.count')

if [[ $ORIGINAL_COUNT -eq $RESTORED_COUNT ]]; then
    echo "✅ PASS: Restored $RESTORED_COUNT documents (matches original)"
else
    echo "❌ FAIL: Count mismatch (original: $ORIGINAL_COUNT, restored: $RESTORED_COUNT)"
fi

# 6. Cleanup
curl -X DELETE "http://elasticsearch:9200/test_restore_*"
```

---

### Type 2: Integration Tests (Quarterly)

**Objective:** Test multiple components working together during failover

#### Q1 Integration Test: Database + Application Failover

**Schedule:** 3rd Tuesday of January @ 2:00 PM EST

**Duration:** 4 hours

**Scenario:** Primary database fails, applications must failover to DR database

**Pre-Test Checklist:**

```markdown
Week Before:
- [ ] Test plan reviewed and approved by VP Engineering
- [ ] All stakeholders notified (Engineering, Product, Customer Success)
- [ ] Status page maintenance window announced (48 hours notice)
- [ ] War room scheduled (Zoom + Slack)
- [ ] Test coordinator assigned
- [ ] Backup verified < 24 hours old

Day Before:
- [ ] DR environment health verified
- [ ] Monitoring dashboards prepared
- [ ] Runbook URLs shared with team
- [ ] Emergency rollback plan documented
- [ ] On-call escalation path confirmed

Day Of:
- [ ] War room opened 15 minutes early
- [ ] All team members present and ready
- [ ] Screen share started for documentation
- [ ] Timer ready for RTO measurement
```

**Test Procedure:**

```bash
#!/bin/bash
# Execute: /docs/disaster-recovery/tests/test-integration-q1.sh

echo "Starting Q1 Integration Test"
echo "Scenario: Database + Application Failover"

START_TIME=$(date +%s)

# Phase 1: Simulate database failure (promote DR replica)
echo "Phase 1: Database Failover"
aws rds promote-read-replica \
    --db-instance-identifier llm-marketplace-db-replica \
    --region us-west-2

aws rds wait db-instance-available \
    --db-instance-identifier llm-marketplace-db-replica \
    --region us-west-2

NEW_DB_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db-replica \
    --region us-west-2 \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

echo "New database endpoint: $NEW_DB_ENDPOINT"

# Phase 2: Update application configuration
echo "Phase 2: Updating application configuration"
kubectl create secret generic db-credentials \
    --from-literal=host=$NEW_DB_ENDPOINT \
    --from-literal=port=5432 \
    --from-literal=database=llm_marketplace \
    --from-literal=username=postgres \
    --from-literal=password=$DB_PASSWORD \
    --namespace llm-marketplace \
    --dry-run=client -o yaml | kubectl apply -f -

# Phase 3: Rolling restart applications
echo "Phase 3: Rolling restart applications"
for svc in publishing-service discovery-service consumption-service admin-service; do
    kubectl rollout restart deployment/$svc -n llm-marketplace
    kubectl rollout status deployment/$svc -n llm-marketplace --timeout=5m
done

# Phase 4: Validation
echo "Phase 4: End-to-end validation"

# Test publishing workflow
PUBLISH_RESULT=$(curl -X POST https://api.llm-marketplace.com/publishing/v1/services \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -d '{
        "name": "integration-test-service",
        "description": "Q1 integration test"
    }' \
    -w "%{http_code}" \
    -o /dev/null \
    -s)

# Test discovery workflow
SEARCH_RESULT=$(curl https://api.llm-marketplace.com/discovery/v1/services/search?q=test \
    -w "%{http_code}" \
    -o /dev/null \
    -s)

# Test consumption workflow
USAGE_RESULT=$(curl https://api.llm-marketplace.com/consumption/v1/usage \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -w "%{http_code}" \
    -o /dev/null \
    -s)

END_TIME=$(date +%s)
TOTAL_RTO=$((END_TIME - START_TIME))

# Results
echo ""
echo "========================================="
echo "Q1 Integration Test Results"
echo "========================================="
echo "Total RTO: ${TOTAL_RTO}s ($((TOTAL_RTO / 60)) minutes)"
echo "Target RTO: 900s (15 minutes)"
echo ""
echo "Workflow Validation:"
echo "  Publishing: HTTP $PUBLISH_RESULT"
echo "  Discovery: HTTP $SEARCH_RESULT"
echo "  Consumption: HTTP $USAGE_RESULT"
echo ""

if [[ $TOTAL_RTO -le 900 ]] && \
   [[ $PUBLISH_RESULT -eq 200 ]] && \
   [[ $SEARCH_RESULT -eq 200 ]] && \
   [[ $USAGE_RESULT -eq 200 ]]; then
    echo "Status: ✅ PASS"
else
    echo "Status: ❌ FAIL"
fi
```

---

### Type 3: Full DR Tests (Semi-Annual)

**Objective:** Complete platform failover to DR region

**Schedule:** June and December

**Duration:** 8-12 hours (full business day)

See detailed procedure in [FAILOVER_PROCEDURES.md](../procedures/FAILOVER_PROCEDURES.md#cr-f-001-full-platform-cross-region-failover)

**Pre-Test Checklist (2 Weeks Before):**

```markdown
Executive Level:
- [ ] CTO approval obtained
- [ ] Board of directors notified
- [ ] Customer advisory email drafted
- [ ] PR team briefed

Technical Level:
- [ ] Detailed test plan created and reviewed
- [ ] All runbooks updated to latest version
- [ ] DR environment capacity verified (can handle production load)
- [ ] Network connectivity tested
- [ ] DNS TTLs lowered to 60 seconds (1 week before)
- [ ] All secrets/configs synced to DR region
- [ ] Backup verification completed
- [ ] Monitoring dashboards configured for DR region

Communication:
- [ ] Status page announcement (1 week notice)
- [ ] Customer email sent (48 hours notice)
- [ ] Internal all-hands announcement
- [ ] Support team briefed on expected issues

Logistics:
- [ ] War room scheduled (full day)
- [ ] Meals/snacks arranged for team
- [ ] Backup internet/power for war room
- [ ] Screen recording started for audit trail
```

**Test Day Checklist:**

```markdown
T-30 minutes:
- [ ] All team members checked in to war room
- [ ] Roles assigned (Commander, Scribe, Timekeepers per phase)
- [ ] Monitoring dashboards displayed
- [ ] Emergency contact list distributed
- [ ] Go/No-Go poll conducted

T-0 (Start):
- [ ] Status page updated to "Maintenance"
- [ ] Customer email sent (starting maintenance)
- [ ] Start time recorded
- [ ] Begin Phase 1: Database Failover

T+15 min:
- [ ] Database failover complete
- [ ] Begin Phase 2: Elasticsearch failover

T+35 min:
- [ ] Elasticsearch failover complete
- [ ] Begin Phase 3: Application deployment

T+2 hours:
- [ ] Application deployment complete
- [ ] Begin Phase 4: DNS/Load Balancer update

T+2.5 hours:
- [ ] DNS updated
- [ ] Begin Phase 5: Validation

T+3.5 hours:
- [ ] All validation complete
- [ ] Status page updated to "Operational"
- [ ] Customer email sent (maintenance complete)

Post-Test:
- [ ] Team debrief conducted
- [ ] Test report drafted
- [ ] Issues cataloged
- [ ] Celebration! 🎉
```

---

### Type 4: Surprise Drill (Annual)

**Objective:** Test true DR readiness without preparation

**Schedule:** September (specific date/time unknown to on-call)

**Known to:** CTO, VP Engineering, DR Test Coordinator only

**Procedure:**

```markdown
T-2 weeks:
- DR Coordinator verifies DR environment is healthy
- Identifies low-risk time window (Tuesday-Thursday, non-peak)

T-1 week:
- Executive team briefed
- Customer support prepared (no external announcement)
- Monitoring configured to capture all actions

T-0 (Surprise):
- Page on-call with simulated P0 incident:
  "us-east-1 region appears to be experiencing complete outage.
   All services returning 503. RDS primary unreachable.
   Customer reports flooding in."

Observe:
- How quickly does on-call respond?
- Do they follow runbooks correctly?
- Do they escalate appropriately?
- Can they complete failover without help?

T+4 hours (or when failover complete):
- Reveal it was a drill
- Conduct immediate debrief
- Document lessons learned
- Thank team for participation
```

**Success Criteria:**
- ✅ On-call responds within 5 minutes
- ✅ Incident commander assigned within 15 minutes
- ✅ Stakeholders notified within 30 minutes
- ✅ Failover initiated within 1 hour
- ✅ Service restored within 4 hours
- ✅ All procedures followed correctly

---

## Pre-Test Checklists

### Universal Pre-Test Checklist (All Tests)

```markdown
Technical Preparation:
- [ ] Test script reviewed and updated
- [ ] DR environment health verified
- [ ] Baseline metrics captured
- [ ] Monitoring dashboards ready
- [ ] Runbooks accessible to all team members

Communication:
- [ ] Team members notified with calendar invite
- [ ] Stakeholders aware of test window
- [ ] Status page maintenance window (if customer-facing)
- [ ] War room created (#dr-test-YYYYMMDD)

Roles:
- [ ] Incident Commander assigned
- [ ] Scribe assigned (documents steps)
- [ ] Timekeeper assigned (tracks RTO)
- [ ] Validators assigned (verify each phase)

Safety:
- [ ] Rollback procedure documented
- [ ] Emergency stop criteria defined
- [ ] Escalation path confirmed
- [ ] Backup communication channel ready (if Slack fails)
```

---

## Post-Test Procedures

### Immediate Post-Test (Within 1 Hour)

```markdown
- [ ] Service health verified
- [ ] Rollback completed (if test environment)
- [ ] Status page updated to Operational
- [ ] Quick team debrief (15 min)
- [ ] High-level results shared in #engineering
```

### Short-Term Post-Test (Within 1 Week)

```markdown
- [ ] Detailed test report created in Confluence
- [ ] RTO/RPO metrics updated in dashboard
- [ ] Issues created as Jira tickets
- [ ] Runbook updates submitted as PRs
- [ ] Lessons learned documented
```

**Test Report Template:**

```markdown
# DR Test Report: [Test Name] - [Date]

## Executive Summary
- **Test Type:** [Component/Integration/Full DR]
- **Date/Time:** [Start - End]
- **Duration:** [X hours]
- **Result:** ✅ Pass / ⚠️ Pass with Issues / ❌ Fail
- **RTO Achieved:** [X minutes] (Target: [Y minutes])
- **RPO Achieved:** [X minutes] (Target: [Y minutes])

## Test Objectives
1. [Objective 1]
2. [Objective 2]

## Test Execution

### Timeline
| Time | Phase | Action | Result |
|------|-------|--------|--------|
| 10:00 | Pre-test | Baseline capture | ✅ |
| 10:05 | Phase 1 | Database failover | ✅ |
| 10:20 | Phase 2 | Application restart | ✅ |
| 10:35 | Phase 3 | Validation | ✅ |

### Metrics
- **Total RTO:** [X] minutes
- **Database Failover:** [Y] seconds
- **Application Recovery:** [Z] seconds
- **Data Loss:** [N] records

## Issues Encountered
1. **[Issue Title]**
   - Severity: [High/Medium/Low]
   - Impact: [Description]
   - Resolution: [How it was fixed]
   - Jira: [TICKET-123]

## Lessons Learned
- [Lesson 1]
- [Lesson 2]

## Recommendations
- [Recommendation 1]
- [Recommendation 2]

## Action Items
- [ ] [Action item] - Owner: [Name] - Due: [Date]
- [ ] [Action item] - Owner: [Name] - Due: [Date]

## Appendix
- Test script: [Link]
- Detailed logs: [Link]
- Screenshots: [Link]
```

### Long-Term Post-Test (Within 1 Month)

```markdown
- [ ] Action items completed
- [ ] Runbook updates merged
- [ ] Team training conducted (if new procedures)
- [ ] Executive presentation (quarterly tests only)
- [ ] Compliance audit trail updated
```

---

## Annual Test Plan

### 2025 DR Testing Goals

```markdown
Q1 Goals:
- [ ] Achieve < 2 hour RTO for database cross-region failover
- [ ] Automate 80% of failover steps
- [ ] Complete all monthly tests without failures
- [ ] Train 2 new engineers on DR procedures

Q2 Goals:
- [ ] Successfully complete June full DR test within 4 hours
- [ ] Implement automated DNS failover
- [ ] Reduce manual validation steps by 50%
- [ ] Achieve 100% test pass rate for quarter

Q3 Goals:
- [ ] Successfully execute surprise drill
- [ ] Reduce overall RTO to < 3 hours
- [ ] Automate 90% of failover steps
- [ ] Cross-train entire team on runbooks

Q4 Goals:
- [ ] Complete December full DR test within 3 hours
- [ ] Achieve < 5 minute RPO for all components
- [ ] Document all lessons learned from year
- [ ] Set 2026 DR testing goals
```

---

## Related Documentation

- [RTO/RPO Validation Framework](../procedures/RTO_RPO_VALIDATION.md)
- [Failover Procedures](../procedures/FAILOVER_PROCEDURES.md)
- [Disaster Recovery Plan](../DISASTER_RECOVERY_PLAN.md)
- [Test Scripts](../tests/)

---

**Document Owner:** SRE Team
**Last Updated:** 2024-11-19
**Next Review:** 2025-01-19
**Status:** ✅ Active
