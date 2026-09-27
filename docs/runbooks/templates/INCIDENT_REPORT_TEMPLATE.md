# Incident Report: [INCIDENT TITLE]

**Incident ID**: #YYYY-MM-DD-NNN
**Date**: YYYY-MM-DD
**Severity**: [P0 / P1 / P2 / P3]
**Duration**: [X hours Y minutes]
**Status**: [Resolved / In Progress / Monitoring]

---

## Executive Summary

[2-3 sentence summary suitable for leadership. Focus on business impact and resolution.]

Example:
> On November 19, 2024, the Discovery Service experienced a complete outage lasting 45 minutes affecting 100% of search functionality. The root cause was a database index corruption following a failed migration. Service was restored by rolling back the migration and rebuilding the index. No data loss occurred.

---

## Incident Timeline

| Time (UTC) | Event | Actor |
|------------|-------|-------|
| 14:00:00 | Initial alert triggered: DiscoveryServiceDown | Prometheus |
| 14:02:30 | Incident declared P0 | @oncall-engineer |
| 14:05:00 | War room created: #incident-2024-11-19-001 | @incident-commander |
| 14:08:00 | Root cause identified: database index corruption | @database-sme |
| 14:12:00 | Rollback initiated | @database-sme |
| 14:25:00 | Index rebuild started | @database-sme |
| 14:42:00 | Service health checks passing | System |
| 14:45:00 | Incident resolved, monitoring phase | @incident-commander |
| 15:15:00 | Incident fully closed | @incident-commander |

---

## Impact Assessment

### User Impact
- **Affected Users**: 12,500 users (100% of active users during outage window)
- **Affected Functionality**: Complete search outage, service discovery unavailable
- **User Experience**: All search queries returned 503 errors
- **Support Tickets**: 47 tickets filed during outage

### Business Impact
- **Revenue Impact**: ~$2,100 (estimated lost transactions)
- **SLA Impact**: 45 minutes against monthly error budget (99.9% = 43.8 min/month)
- **Partner Impact**: 3 enterprise customers reported issues
- **Reputation Impact**: 12 social media mentions, 2 requiring response

### Technical Impact
- **Services Affected**: Discovery Service (primary), Publishing Service (secondary - no search validation)
- **Data Impact**: No data loss or corruption
- **Failed Requests**: ~8,500 search requests
- **Performance Impact**: Latency spike to 100% timeouts

---

## Root Cause Analysis

### What Happened

[Detailed technical description of the incident]

On November 19, 2024 at 14:00 UTC, a database migration was deployed to add a new GIN index on the `services.search_vector` column to improve search performance. The migration script contained a bug that corrupted the existing trigram index on `services.name`.

The corruption caused PostgreSQL to reject all queries using that index with error: `index "idx_services_name_trgm" is not valid`. Since the Discovery Service's primary search query relied on this index, all search requests failed.

### Why It Happened

**Immediate Cause**: Database index corruption during migration

**Root Causes**:
1. **Insufficient Testing**: Migration was not tested on production-like dataset (tested with 1K rows, prod has 2.5M rows)
2. **Concurrent Operations**: Migration ran concurrently with active queries causing lock contention
3. **Missing Validation**: No post-migration index validation step
4. **Rollback Gap**: No automated rollback on migration failure

### Why We Didn't Catch It Sooner

1. **Monitoring Gap**: No alerting on database index health
2. **Deployment Process**: Migration auto-applied in prod without canary or gradual rollout
3. **Health Check Limitation**: Health endpoint didn't verify database query functionality, only connection
4. **Synthetic Monitoring**: No active search query validation running continuously

---

## Detection and Response

### What Went Well ✅

1. **Fast Detection**: Alert triggered within 30 seconds of first failure
2. **Clear Ownership**: On-call engineer acknowledged immediately
3. **Effective Communication**: War room created quickly, stakeholders notified
4. **Good Documentation**: Database runbook provided clear investigation steps
5. **SME Availability**: Database expert was available and joined within 5 minutes
6. **Decisive Action**: Decision to rollback made quickly once cause identified

### What Went Wrong ❌

1. **Slow Root Cause**: Took 8 minutes to identify database index issue
2. **Manual Process**: Rollback was manual, should be automated
3. **Incomplete Testing**: Migration not properly tested
4. **Monitoring Gaps**: No database index health monitoring
5. **Health Check**: Didn't catch database query failures
6. **Customer Communication**: Status page update delayed by 10 minutes

---

## Resolution Steps Taken

1. **Immediate**: Stopped ongoing migration (14:12 UTC)
2. **Rollback**: Reverted migration script (14:12-14:15 UTC)
3. **Index Rebuild**: Dropped corrupted index and recreated using CONCURRENTLY (14:25-14:42 UTC)
4. **Verification**: Confirmed all search queries working (14:42-14:45 UTC)
5. **Monitoring**: Watched for 30 minutes to ensure stability (14:45-15:15 UTC)

```sql
-- Resolution commands executed
-- 1. Kill ongoing migration
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE query LIKE '%CREATE INDEX%';

-- 2. Drop corrupted index
DROP INDEX idx_services_name_trgm;

-- 3. Recreate index properly
CREATE INDEX CONCURRENTLY idx_services_name_trgm
ON services USING gin(name gin_trgm_ops);

-- 4. Verify index health
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE indexname = 'idx_services_name_trgm';
```

---

## Action Items

| # | Action | Owner | Due Date | Priority | Status |
|---|--------|-------|----------|----------|--------|
| 1 | Add database index health monitoring | @devops | 2024-11-22 | P0 | In Progress |
| 2 | Implement automated migration rollback | @database-team | 2024-11-26 | P0 | Not Started |
| 3 | Enhance health check to verify queries | @platform-team | 2024-11-25 | P0 | Not Started |
| 4 | Add synthetic search monitoring | @sre-team | 2024-11-29 | P1 | Not Started |
| 5 | Create migration testing checklist | @database-team | 2024-11-23 | P1 | Not Started |
| 6 | Implement migration canary process | @devops | 2024-12-03 | P1 | Not Started |
| 7 | Update database migration runbook | @database-team | 2024-11-21 | P2 | Not Started |
| 8 | Production dataset for staging env | @devops | 2024-12-10 | P2 | Not Started |

---

## Lessons Learned

### Technical Lessons

1. **Test with Production Data Volume**: Small datasets don't reveal issues that appear at scale
2. **Index Operations Need Care**: CONCURRENT index creation is critical for production
3. **Validate After Migrations**: Always verify operation success before considering complete
4. **Automated Rollback**: Database migrations need automatic rollback on failure

### Process Lessons

1. **Canary Migrations**: Database changes should follow same gradual rollout as code
2. **Health Checks Matter**: Need functional checks, not just connectivity checks
3. **Synthetic Monitoring**: Active validation catches issues before users do
4. **Migration Review**: Database changes need same rigor as code review

### Communication Lessons

1. **Faster Status Updates**: Status page should update within 2 minutes
2. **Proactive Notification**: Enterprise customers should be notified immediately for P0
3. **Timeline Documentation**: Scribe role critical for accurate incident reports

---

## Follow-Up Actions

### Immediate (Next 7 Days)

**Monitoring Improvements**:
```yaml
# Add Prometheus alert for index health
- alert: DatabaseIndexInvalid
  expr: pg_index_invalid_count > 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Invalid database index detected"
```

**Process Changes**:
- All migrations require staging test with production data volume
- Migrations cannot auto-apply, must have manual approval gate
- Database migrations added to change advisory board

### Medium Term (Next 30 Days)

**Automation**:
- Implement automated migration rollback on health check failure
- Create migration smoke test suite
- Build migration canary deployment process

**Monitoring**:
- Deploy synthetic monitoring for all critical queries
- Enhanced health checks (functional, not just connectivity)
- Database index validation in CI/CD pipeline

### Long Term (Next 90 Days)

**Architecture**:
- Evaluate online schema change tools (gh-ost, pt-online-schema-change)
- Implement blue-green database migration strategy
- Create database DR/failover testing procedure

**Training**:
- Database migration training for all engineers
- Incident response drill including database scenarios
- Knowledge sharing session on this incident

---

## External Communication

### Internal (Engineering Team)

**Slack Announcement**:
```
🔴 Post-Incident Review: Discovery Service Outage (Nov 19)

We had a 45-minute outage of search functionality due to a database
index corruption during migration. All services are now stable.

Key Learnings:
• Always test migrations with production data volumes
• Need automated rollback for failed migrations
• Health checks should verify functionality, not just connectivity

Full PIR: https://docs.company.com/incidents/2024-11-19-001
Action Items: 8 items tracked in Jira

Questions? Ask in #incidents
```

### External (Customers)

**Status Page Post-Mortem**:
```
Subject: Incident Report - Search Functionality Outage (Nov 19, 2024)

Summary:
On November 19, 2024, between 14:00-14:45 UTC (45 minutes), the search
functionality was completely unavailable. Users attempting to search for
services received errors.

Impact:
• All search queries failed during this time
• Service publishing was unaffected
• API consumption was unaffected
• No data was lost

Root Cause:
A database maintenance operation corrupted an index used for search
queries. The issue was resolved by rebuilding the index.

Resolution:
• Rolled back the maintenance operation
• Rebuilt the database index correctly
• Verified all search functionality working
• Monitoring service stability

Prevention:
We are implementing additional safeguards:
• Enhanced pre-deployment testing
• Automated rollback for failed operations
• Improved health monitoring
• Active search validation

We apologize for the disruption and have taken steps to prevent
recurrence.

For questions: support@llm-marketplace.com
```

---

## Appendix

### Metrics and Graphs

[Attach screenshots from monitoring]
- Request success rate (drop to 0%)
- Error rate (spike to 100%)
- Latency (all requests timeout)
- Database connections (showing spike)

### Related Incidents

- 2024-10-15: Similar index issue on staging (severity: P3)
- 2024-08-22: Migration failure with rollback (severity: P2)

### References

- Migration script: `migrations/20241119_add_search_vector_index.sql`
- Runbook used: RB-006 (Database Slow Queries)
- Slack thread: #incident-2024-11-19-001
- Jira epic: ENG-1234

---

**Report Prepared By**: @incident-commander
**Reviewed By**: @engineering-manager, @vp-engineering
**Date Finalized**: 2024-11-20
**Distribution**: Engineering team, Customer success, Executive team

---

## Sign-Off

| Role | Name | Sign-Off | Date |
|------|------|----------|------|
| Incident Commander | John Doe | ✅ Approved | 2024-11-20 |
| Engineering Manager | Jane Smith | ✅ Approved | 2024-11-20 |
| VP Engineering | Bob Johnson | ✅ Approved | 2024-11-20 |
| CTO | Alice Wang | ✅ Approved | 2024-11-20 |

---

**Document Status**: FINAL
**Next Review**: 2024-12-19 (30 days)
