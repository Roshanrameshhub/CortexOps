# On-Call Quick Reference Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-19

---

## 🚨 You Got Paged - What Now?

### First 60 Seconds

1. **Acknowledge Alert** (PagerDuty app or SMS reply)
2. **Check Alert Details**:
   - Service affected
   - Alert severity
   - Metric that triggered
3. **Join War Room** if exists, or create one
4. **Open Grafana** dashboards

**Don't Panic** - You have runbooks and support.

---

## Quick Commands

### Check Service Health

```bash
# All services status
kubectl get pods -n llm-marketplace

# Specific service
kubectl get pods -n llm-marketplace -l app=publishing-service

# Recent events
kubectl get events -n llm-marketplace --sort-by='.lastTimestamp' | tail -20
```

### Check Logs

```bash
# Service logs
kubectl logs -n llm-marketplace -l app=publishing-service --tail=100 -f

# Previous crashed pod
kubectl logs -n llm-marketplace <pod-name> --previous

# All services, last hour
kubectl logs -n llm-marketplace --since=1h | grep -i error
```

### Check Metrics

```bash
# Resource usage
kubectl top nodes
kubectl top pods -n llm-marketplace --sort-by=memory
```

**Grafana Dashboards**:
- Service Health Overview: http://grafana/d/service-health
- Database Performance: http://grafana/d/postgres
- Error Rates: http://grafana/d/errors

---

## Common Alerts & Quick Fixes

### ServiceDown

**Cause**: Service pods are crashing or not ready

**Quick Check**:
```bash
kubectl get pods -n llm-marketplace -l app=<service>
kubectl describe pod <pod-name> -n llm-marketplace
kubectl logs -n llm-marketplace <pod-name> --previous
```

**Common Fixes**:
- Database connection issue → Check DB health
- OOM killed → Increase memory limit
- Recent deployment → Rollback

**Runbook**: [RB-001](../incidents/RB-001-SERVICE-DOWN.md)

---

### HighErrorRate

**Cause**: Service returning errors (5xx)

**Quick Check**:
```bash
# Check error rate
# Grafana: Error Rate dashboard

# Sample errors from logs
kubectl logs -n llm-marketplace -l app=<service> --tail=500 | grep -i "error\|exception"
```

**Common Fixes**:
- Database slow → Scale database
- Dependency down → Check dependencies
- Bad deployment → Rollback

**Runbook**: [RB-002](../incidents/RB-002-SERVICE-DEGRADED.md)

---

### HighAPILatency

**Cause**: Requests taking too long

**Quick Check**:
```bash
# Test actual latency
time curl http://<service>.llm-marketplace.svc.cluster.local:PORT/health

# Check database
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -c \
  "SELECT pid, now() - query_start as duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 5;"
```

**Common Fixes**:
- Slow queries → Optimize or add index
- High traffic → Scale up
- Resource constraints → Increase limits

**Runbook**: [RB-003](../incidents/RB-003-HIGH-LATENCY.md)

---

### DatabaseConnectionFailure

**Cause**: Can't connect to database

**Quick Check**:
```bash
kubectl get pods -n llm-marketplace -l app=postgres
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -c "SELECT 1;"
```

**Quick Fix**:
```bash
# Check connection count
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
SELECT count(*) FROM pg_stat_activity;
SELECT max_connections FROM pg_settings WHERE name = 'max_connections';
EOF

# Kill idle connections if maxed out
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '10 minutes';"
```

**Runbook**: [RB-005](../incidents/RB-005-DATABASE-CONNECTION.md)

---

## Incident Response Workflow

```
Alert Triggered
    ↓
Acknowledge (PagerDuty)
    ↓
Assess Severity (P0/P1/P2/P3)
    ↓
[If P0/P1] Declare Incident
    ↓
Create War Room (#incident-YYYY-MM-DD-NNN)
    ↓
Investigate (use runbooks)
    ↓
Identify Root Cause
    ↓
Implement Fix
    ↓
Verify Resolution
    ↓
Monitor Stability (30-60 min)
    ↓
Close Incident
    ↓
Schedule PIR (Post-Incident Review)
```

---

## Severity Guidelines

### P0 - Critical (Page Everyone)
- Complete service outage
- All users unable to access
- Data breach/security incident
- **Response**: < 5 minutes
- **Updates**: Every 15 minutes
- **Escalate**: VP Engineering immediately

### P1 - High (Page On-Call + Manager)
- Major degradation (>20% error rate)
- Critical feature down
- Significant user impact
- **Response**: < 15 minutes
- **Updates**: Every 30 minutes
- **Escalate**: After 2 hours if unresolved

### P2 - Medium (Page On-Call)
- Minor degradation (<20% errors)
- Non-critical feature impacted
- Workaround available
- **Response**: < 1 hour
- **Updates**: Every 2 hours
- **Escalate**: After 12 hours if unresolved

### P3 - Low (Ticket, No Page)
- Minimal impact
- Internal tools affected
- No user facing impact
- **Response**: < 4 hours
- **Updates**: Daily
- **Escalate**: Not required

---

## Emergency Contacts

```
TIER 1: On-Call
Primary: You!
Backup: #on-call channel

TIER 2: Service Owners
Publishing: john.doe@company.com | +1-555-0101
Discovery: jane.smith@company.com | +1-555-0102
Consumption: bob.jones@company.com | +1-555-0103
Admin: alice.wang@company.com | +1-555-0104
Infrastructure: charlie.brown@company.com | +1-555-0105

TIER 3: Leadership
Engineering Manager: manager@company.com | +1-555-0201
Database Lead: dba@company.com | +1-555-0202
Security Lead: security@company.com | +1-555-0203

TIER 4: Executives (P0 only)
VP Engineering: vp.eng@company.com | +1-555-0301
CTO: cto@company.com | +1-555-0302
```

---

## Useful Links

**Monitoring**:
- Grafana: http://grafana.llm-marketplace.internal:3000
- Prometheus: http://prometheus.llm-marketplace.internal:9090
- Kibana: http://kibana.llm-marketplace.internal:5601
- Jaeger: http://jaeger.llm-marketplace.internal:16686

**Incident Management**:
- PagerDuty: https://llm-marketplace.pagerduty.com
- Status Page: https://status.llm-marketplace.com
- Runbooks: https://docs.llm-marketplace.com/runbooks
- Slack: #incidents, #on-call

**Documentation**:
- Architecture: https://docs.llm-marketplace.com/architecture
- API Docs: https://api-docs.llm-marketplace.com
- Deployment: https://docs.llm-marketplace.com/deployment

---

## Rollback Commands

### Service Rollback

```bash
# Check deployment history
kubectl rollout history deployment/<service> -n llm-marketplace

# Rollback to previous version
kubectl rollout undo deployment/<service> -n llm-marketplace

# Rollback to specific revision
kubectl rollout undo deployment/<service> -n llm-marketplace --to-revision=5

# Verify rollback
kubectl rollout status deployment/<service> -n llm-marketplace
```

### Database Rollback

```bash
# List migrations
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace -c \
  "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 10;"

# Rollback migration (use migration tool)
kubectl exec -it <service-pod> -n llm-marketplace -- npm run migrate:rollback
```

---

## Communication Templates

### Incident Declaration

```
🚨 P[0/1/2] INCIDENT - [TITLE]

Service: [Service Name]
Impact: [Brief description]
Affected: [% of users]
Status: Investigating
IC: @[your-name]
War Room: #incident-$(date +%Y-%m-%d)-NNN

Next update: [15/30/120] minutes
```

### Status Update

```
📊 UPDATE - Incident #YYYY-MM-DD-NNN

Status: [Investigating/Identified/Monitoring/Resolved]
Summary: [What's happening]
Actions: [What we're doing]

Next update: [time]
```

### Resolution

```
✅ RESOLVED - Incident #YYYY-MM-DD-NNN

Duration: [X hours]
Root Cause: [Brief explanation]
Fix: [What was done]

PIR scheduled: [date/time]
```

---

## When to Escalate

**Escalate Immediately If**:
- P0 incident (automatic)
- You're unsure how to proceed
- Need access/permissions you don't have
- Issue involves multiple services
- Security incident suspected
- Data loss possible

**How to Escalate**:
1. Post in #on-call: "@on-call-lead need help with <incident>"
2. Page appropriate SME via PagerDuty
3. Call engineering manager (P0/P1)

**Don't Wait** - Better to escalate early than struggle alone.

---

## Before Your Shift

**Setup Checklist**:
- [ ] PagerDuty app installed and tested
- [ ] Phone notifications enabled
- [ ] Laptop charged, nearby
- [ ] VPN configured
- [ ] kubectl configured and tested
- [ ] Grafana/monitoring access verified
- [ ] Slack notifications enabled
- [ ] Emergency contacts saved
- [ ] Read recent incidents (#incidents channel)
- [ ] Review runbooks (at least RB-001, RB-002, RB-003)

---

## After Incident Resolution

**Checklist**:
- [ ] Incident marked resolved in PagerDuty
- [ ] Status page updated
- [ ] War room channel archived with summary
- [ ] PIR scheduled (within 24h for P0, 3 days for P1)
- [ ] Action items created and assigned
- [ ] Handoff notes if shift ending

---

## Pro Tips

1. **Check Recent Changes First**: 80% of incidents relate to recent deployments or config changes
2. **Use Runbooks**: They're tested procedures, follow them
3. **Communicate Often**: Over-communicate during incidents
4. **Ask for Help Early**: Don't struggle alone, escalate
5. **Document Everything**: Scribe role is crucial for PIR
6. **Health Checks Lie**: Always verify actual functionality
7. **Logs Tell Stories**: Read them chronologically
8. **Metrics Don't Lie**: Trust data over assumptions
9. **Rollback First, Debug Later**: For P0, restore service then investigate
10. **You're Not Alone**: Team supports you, use #on-call

---

## Stress Management

**During High-Stress Incidents**:
- Take deep breaths
- Read through runbook calmly
- Ask for help - IC can bring in SMEs
- Focus on one step at a time
- You have support - use it

**After Difficult Incidents**:
- Debrief with team
- Take a break
- Learn from PIR (not blame)
- Update runbooks
- Talk to manager if needed

---

## On-Call Rotation

**Current Schedule**: https://llm-marketplace.pagerduty.com/schedules

**Shift Handoff**:
1. Review any ongoing incidents
2. Check recent alerts (last 24h)
3. Note any scheduled maintenance
4. Share context in #on-call channel

**Shift Handoff Template**:
```
🔄 On-Call Handoff

From: @previous-person
To: @next-person
Time: [timestamp]

Active Incidents: [None / List]
Watch Items: [Things to monitor]
Scheduled Maintenance: [Any planned work]
Recent Changes: [Deployments, config changes]

Notes: [Any additional context]
```

---

**Remember**: Every incident is a learning opportunity. Stay calm, follow procedures, and ask for help when needed. You've got this! 💪

---

**Document Version**: 1.0.0
**Last Updated**: 2024-11-19
**Owner**: DevOps Team
