# Chaos Engineering Runbook
# Operational playbook for executing and managing chaos experiments

## Table of Contents
1. [Pre-Chaos Checklist](#pre-chaos-checklist)
2. [Chaos Scenarios](#chaos-scenarios)
3. [Incident Response](#incident-response)
4. [Post-Chaos Analysis](#post-chaos-analysis)
5. [Rollback Procedures](#rollback-procedures)

---

## Pre-Chaos Checklist

### Prerequisites
Before running any chaos experiment, verify:

- [ ] **Environment Validation**
  - [ ] Running in correct environment (dev/staging/prod)
  - [ ] All services are healthy (green health checks)
  - [ ] No ongoing incidents or maintenance windows
  - [ ] Monitoring and alerting systems operational

- [ ] **Team Notification**
  - [ ] On-call engineers notified
  - [ ] Chaos window communicated to stakeholders
  - [ ] Incident response team on standby

- [ ] **Baseline Metrics**
  - [ ] Current error rate < 0.1%
  - [ ] P95 latency < 500ms
  - [ ] All pods running and ready
  - [ ] Database replication lag < 1s

- [ ] **Safety Mechanisms**
  - [ ] Blast radius configured (max 30% for prod)
  - [ ] Auto-abort conditions set
  - [ ] Rollback plan documented
  - [ ] Emergency contacts available

### Baseline Metrics Collection
```bash
# Collect baseline metrics before chaos
kubectl exec -n monitoring prometheus-0 -- \
  promtool query instant \
  http://localhost:9090 \
  'rate(http_requests_total[5m])'

# Export to baseline file
./scripts/export-baseline-metrics.sh > /tmp/chaos-baseline-$(date +%Y%m%d-%H%M%S).json
```

---

## Chaos Scenarios

### Scenario 1: Network Latency Injection

**Objective**: Validate system behavior under degraded network conditions

**Expected Impact**:
- Increased request latency
- Potential timeout errors
- Circuit breaker activation

**Success Criteria**:
- Error rate remains < 1%
- P95 latency < 5s
- No cascading failures
- Automatic recovery within 2 minutes after chaos ends

**Execution**:
```bash
# 1. Apply network latency chaos
kubectl apply -f experiments/network/network-latency.yaml

# 2. Monitor SLOs
watch -n 5 'curl -s http://prometheus:9090/api/v1/query?query=chaos:slo:error_rate:1m'

# 3. Wait for experiment duration (5 minutes)
sleep 300

# 4. Verify automatic cleanup
kubectl get networkchaos -n chaos-testing

# 5. Validate recovery
./scripts/validate-slo.sh --post-chaos
```

**Rollback**:
```bash
kubectl delete networkchaos graphql-network-latency -n chaos-testing
```

---

### Scenario 2: Pod Failure (Random Pod Kill)

**Objective**: Test service resilience to pod failures and verify auto-healing

**Expected Impact**:
- Temporary service unavailability for killed pods
- Kubernetes automatic pod recreation
- Load balancer removes unhealthy pods

**Success Criteria**:
- Pods automatically recreated within 30s
- No user-facing errors (load balancer handles failover)
- StatefulSet maintains quorum
- Zero data loss

**Execution**:
```bash
# 1. Verify current pod count
kubectl get pods -n llm-marketplace -l tier=backend

# 2. Apply pod chaos
kubectl apply -f experiments/pods/pod-chaos.yaml

# 3. Monitor pod recreation
kubectl get events -n llm-marketplace --watch

# 4. Verify service availability
while true; do
  curl -s http://graphql-gateway:4000/health || echo "FAILED"
  sleep 1
done

# 5. Wait for chaos completion
sleep 60

# 6. Validate all pods running
kubectl wait --for=condition=Ready pods -n llm-marketplace -l tier=backend --timeout=120s
```

**Rollback**:
```bash
kubectl delete podchaos random-pod-kill -n chaos-testing
```

---

### Scenario 3: Database Connection Pool Exhaustion

**Objective**: Validate graceful degradation when database connections are exhausted

**Expected Impact**:
- Connection pool saturation
- Request queuing
- Potential timeouts

**Success Criteria**:
- Application implements connection retry
- Circuit breaker prevents cascade
- Graceful error messages to users
- Auto-recovery when connections released

**Execution**:
```bash
# 1. Monitor current connections
kubectl exec -n llm-marketplace postgres-0 -- \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# 2. Run connection exhaustion chaos
kubectl apply -f application/database-chaos.yaml

# 3. Monitor application behavior
kubectl logs -n llm-marketplace -l app=graphql-gateway --tail=100 -f | grep -i "connection"

# 4. Watch Prometheus metrics
# Open Grafana dashboard: Chaos Engineering -> Database Connection Pool

# 5. Wait for chaos completion (2 minutes)
sleep 120

# 6. Verify connection pool recovered
kubectl exec -n llm-marketplace postgres-0 -- \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE state='active';"
```

**Rollback**:
```bash
kubectl delete job db-connection-exhaustion-chaos -n chaos-testing
# Kill hanging connections if needed
kubectl exec -n llm-marketplace postgres-0 -- \
  psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='chaos';"
```

---

### Scenario 4: Cache Failure (Redis Failover)

**Objective**: Test application behavior when cache is unavailable

**Expected Impact**:
- Cache misses increase to 100%
- Database query load increases
- Response latency increases

**Success Criteria**:
- Application falls back to database
- No 5xx errors
- Redis Sentinel promotes new master within 30s
- Cache rebuilds automatically

**Execution**:
```bash
# 1. Check Redis master
kubectl exec -n llm-marketplace redis-sentinel-0 -- \
  redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster

# 2. Monitor cache hit rate
watch -n 2 'kubectl exec -n llm-marketplace redis-master-0 -- redis-cli INFO stats | grep keyspace'

# 3. Trigger Redis failover
kubectl apply -f application/cache-chaos.yaml

# 4. Watch Sentinel logs
kubectl logs -n llm-marketplace -l app=redis-sentinel -f

# 5. Verify new master elected
sleep 30
kubectl exec -n llm-marketplace redis-sentinel-0 -- \
  redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster

# 6. Test cache operations
kubectl exec -n llm-marketplace redis-master-0 -- redis-cli SET test-key test-value
kubectl exec -n llm-marketplace redis-master-0 -- redis-cli GET test-key
```

**Rollback**:
```bash
kubectl delete job cache-failover-chaos -n chaos-testing
# Manually promote specific replica if needed
kubectl exec -n llm-marketplace redis-replica-0 -- redis-cli REPLICAOF NO ONE
```

---

### Scenario 5: Resource Exhaustion (CPU/Memory Stress)

**Objective**: Validate system behavior under resource constraints

**Expected Impact**:
- Increased CPU/memory usage
- Pod throttling
- Potential OOMKill events
- HPA scaling triggers

**Success Criteria**:
- Horizontal Pod Autoscaler scales up
- Kubernetes resource limits prevent system-wide impact
- No pod evictions
- Load distributed to new pods

**Execution**:
```bash
# 1. Check current resource usage
kubectl top nodes
kubectl top pods -n llm-marketplace

# 2. Verify HPA configuration
kubectl get hpa -n llm-marketplace

# 3. Apply stress chaos
kubectl apply -f experiments/stress/stress-chaos.yaml

# 4. Monitor HPA scaling
watch -n 5 'kubectl get hpa -n llm-marketplace'

# 5. Watch for new pods
kubectl get events -n llm-marketplace --watch | grep -E 'Scaled|Created'

# 6. Wait for chaos completion (5 minutes)
sleep 300

# 7. Verify scale-down
sleep 120
kubectl get hpa -n llm-marketplace
```

**Rollback**:
```bash
kubectl delete stresschaos cpu-stress memory-stress -n chaos-testing
# Manually scale if HPA doesn't scale down
kubectl scale deployment graphql-gateway -n llm-marketplace --replicas=3
```

---

### Scenario 6: Complete Region Failure (Disaster Recovery)

**Objective**: Validate disaster recovery procedures and RTO/RPO

**Expected Impact**:
- Complete zone/region unavailability
- Multi-AZ failover
- Potential data loss (within RPO)

**Success Criteria**:
- Failover to backup region within RTO (15 minutes)
- Data loss < RPO (5 minutes)
- All critical services operational in backup region
- Database replicated and consistent

**Execution**:
```bash
# WARNING: Only run in pre-production environment!

# 1. Create backup snapshot
./scripts/backup-all-services.sh

# 2. Execute disaster recovery workflow
kubectl apply -f litmus/workflows/disaster-recovery-workflow.yaml

# 3. Monitor workflow progress
argo watch -n chaos-testing disaster-recovery-workflow

# 4. Validate services in backup region
kubectl config use-context backup-region
kubectl get pods -n llm-marketplace

# 5. Run smoke tests
./scripts/smoke-tests.sh --environment=backup-region

# 6. Measure RTO
# Record time from failure injection to full recovery
```

**Rollback**:
```bash
# Switch back to primary region
kubectl config use-context primary-region

# Verify data consistency
./scripts/verify-data-consistency.sh

# Restore from backup if needed
./scripts/restore-from-backup.sh --snapshot=<latest>
```

---

## Incident Response

### During Chaos Experiments

#### Critical Alert Triggered
1. **Immediately assess severity**:
   ```bash
   # Check active alerts
   kubectl exec -n monitoring prometheus-0 -- \
     promtool query instant http://localhost:9090 'ALERTS{severity="critical"}'
   ```

2. **Determine if related to chaos**:
   - Check if chaos experiment is active
   - Correlate alert timing with chaos start time
   - Review Grafana chaos dashboard

3. **Decision tree**:
   - **If expected behavior**: Document and continue monitoring
   - **If unexpected but within safety bounds**: Continue with increased monitoring
   - **If safety bounds exceeded**: Execute emergency abort

#### Emergency Abort Procedure
```bash
#!/bin/bash
# emergency-abort.sh

echo "EMERGENCY CHAOS ABORT INITIATED"

# 1. Delete all active chaos experiments
kubectl delete chaosengine --all -n chaos-testing
kubectl delete podchaos --all -n chaos-testing
kubectl delete networkchaos --all -n chaos-testing
kubectl delete stresschaos --all -n chaos-testing
kubectl delete iochaos --all -n chaos-testing

# 2. Stop Argo workflows
argo terminate -n chaos-testing --all

# 3. Verify cleanup
kubectl get chaosengine,podchaos,networkchaos,stresschaos,iochaos -n chaos-testing

# 4. Wait for system stabilization
sleep 60

# 5. Validate SLOs
./scripts/validate-slo.sh --emergency

echo "CHAOS ABORT COMPLETED"
```

#### Escalation Path
1. **Level 1 (0-5 min)**: Chaos engineer monitors and documents
2. **Level 2 (5-10 min)**: Engage on-call SRE
3. **Level 3 (10-15 min)**: Engage engineering lead + incident commander
4. **Level 4 (15+ min)**: Full incident response, abort chaos, war room

---

## Post-Chaos Analysis

### Immediate Post-Chaos (T+5 minutes)
```bash
# 1. Collect final metrics
./scripts/export-final-metrics.sh > /tmp/chaos-final-$(date +%Y%m%d-%H%M%S).json

# 2. Verify all systems recovered
./scripts/validate-slo.sh --post-chaos

# 3. Check for lingering issues
kubectl get events -n llm-marketplace --sort-by='.lastTimestamp' | head -50

# 4. Export chaos results
kubectl get chaosresult -n chaos-testing -o json > /tmp/chaos-results.json
```

### Analysis Report Template
```markdown
# Chaos Experiment Report

## Experiment Details
- **Date/Time**: [ISO timestamp]
- **Scenario**: [Name]
- **Duration**: [X minutes]
- **Blast Radius**: [X% of pods]
- **Environment**: [dev/staging/prod]

## Hypothesis
[What we expected to happen]

## Observations
### System Behavior
- Error rate: [baseline] → [peak] → [recovered]
- Latency P95: [baseline] → [peak] → [recovered]
- Pod restarts: [count]
- Recovery time: [X seconds]

### Failures Detected
1. [Description]
2. [Description]

### Successes
1. [What worked well]
2. [Resilience mechanisms that activated correctly]

## Improvement Actions
| Priority | Action Item | Owner | Due Date |
|----------|-------------|-------|----------|
| P0 | [Critical fix] | @engineer | [date] |
| P1 | [Important improvement] | @engineer | [date] |
| P2 | [Nice to have] | @engineer | [date] |

## Metrics
- **RTO (Recovery Time Objective)**: [X minutes] (Target: Y minutes)
- **RPO (Recovery Point Objective)**: [X minutes] (Target: Y minutes)
- **MTTR (Mean Time To Recovery)**: [X minutes]
- **Blast Radius Actual**: [X% pods affected]

## Conclusion
[Summary of learnings and next steps]
```

---

## Rollback Procedures

### General Rollback Steps
```bash
#!/bin/bash
# rollback-all-chaos.sh

# 1. List all active chaos resources
kubectl get chaosengine,podchaos,networkchaos,stresschaos,iochaos -n chaos-testing

# 2. Delete by category
kubectl delete chaosengine --all -n chaos-testing
kubectl delete podchaos --all -n chaos-testing
kubectl delete networkchaos --all -n chaos-testing
kubectl delete stresschaos --all -n chaos-testing
kubectl delete iochaos --all -n chaos-testing

# 3. Terminate workflows
argo terminate -n chaos-testing --all

# 4. Wait for cleanup
echo "Waiting for cleanup..."
sleep 30

# 5. Verify no chaos resources remain
REMAINING=$(kubectl get chaosengine,podchaos,networkchaos,stresschaos,iochaos -n chaos-testing --no-headers 2>/dev/null | wc -l)

if [ "$REMAINING" -eq 0 ]; then
  echo "✓ All chaos resources cleaned up"
else
  echo "✗ Warning: $REMAINING chaos resources still exist"
  kubectl get chaosengine,podchaos,networkchaos,stresschaos,iochaos -n chaos-testing
fi
```

### Service-Specific Recovery

#### GraphQL Gateway Recovery
```bash
# Restart all pods
kubectl rollout restart deployment/graphql-gateway -n llm-marketplace

# Wait for rollout
kubectl rollout status deployment/graphql-gateway -n llm-marketplace

# Verify health
curl http://graphql-gateway:4000/health
```

#### Database Recovery
```bash
# Check replication status
kubectl exec -n llm-marketplace postgres-0 -- \
  psql -U postgres -c "SELECT * FROM pg_stat_replication;"

# If replication broken, rebuild replica
kubectl delete pod postgres-1 -n llm-marketplace

# Verify recovery
kubectl wait --for=condition=Ready pod/postgres-1 -n llm-marketplace --timeout=300s
```

#### Cache Recovery
```bash
# Flush cache (if corrupted)
kubectl exec -n llm-marketplace redis-master-0 -- redis-cli FLUSHALL

# Rebuild cache from database
curl -X POST http://graphql-gateway:4000/admin/cache/rebuild

# Verify cache warming
kubectl exec -n llm-marketplace redis-master-0 -- redis-cli DBSIZE
```

---

## Operational Commands Reference

### Quick Status Checks
```bash
# Overall system health
kubectl get pods -n llm-marketplace | grep -v Running

# Active chaos experiments
kubectl get chaosengine,podchaos,networkchaos,stresschaos -n chaos-testing

# Current error rate
curl -s "http://prometheus:9090/api/v1/query?query=chaos:slo:error_rate:1m" | jq .

# P95 latency
curl -s "http://prometheus:9090/api/v1/query?query=chaos:slo:latency:p95:1m" | jq .
```

### Chaos Control
```bash
# Pause chaos engine
kubectl patch chaosengine <name> -n chaos-testing --type=merge -p '{"spec":{"engineState":"stop"}}'

# Resume chaos engine
kubectl patch chaosengine <name> -n chaos-testing --type=merge -p '{"spec":{"engineState":"active"}}'

# View chaos logs
kubectl logs -n chaos-testing -l app=chaos-controller -f
```

---

## Safety Guidelines

### Production Chaos Rules
1. **Always** run during low-traffic windows (2-6 AM)
2. **Never** exceed 30% blast radius in production
3. **Always** have rollback plan documented
4. **Never** run chaos during incidents or maintenance
5. **Always** notify stakeholders 24h in advance
6. **Never** run multiple experiments simultaneously in prod
7. **Always** validate baseline SLOs before starting
8. **Never** disable monitoring or alerting during chaos

### Emergency Contacts
- **On-Call SRE**: [PagerDuty escalation policy]
- **Engineering Lead**: [Contact info]
- **Incident Commander**: [Contact info]
- **War Room**: [Slack channel / Zoom link]

---

**Document Version**: 1.0
**Last Updated**: 2024-01-19
**Owner**: Platform Engineering Team
