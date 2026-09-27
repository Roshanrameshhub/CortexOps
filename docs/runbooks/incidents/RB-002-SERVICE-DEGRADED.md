# RB-002: Service Degraded / High Error Rate

**Runbook ID**: RB-002
**Severity**: P1 (High)
**Service**: All Microservices
**Last Updated**: 2025-11-19
**Owner**: DevOps Team

---

## Incident Description

Service is partially functional but experiencing elevated error rates (>5%) or degraded performance affecting a significant portion of users. Service is not completely down but quality is severely impacted.

---

## Symptoms

### User-Visible Impact
- Intermittent errors ("Something went wrong")
- Slow response times
- Timeouts on certain operations
- Some features working, others failing
- Partial data loading

### Technical Indicators
- **Prometheus Alerts**:
  - `HighErrorRate` - Error rate > 5% for 5 minutes
  - `HighRequestLatency` - P95 latency > 2s
  - `HTTPStatusCodeRateHigh` - 5xx errors > 5%

- **Metrics**:
  - Request success rate: 50-95%
  - Error rate: 5-50%
  - Latency: Increased but not timeout
  - Some pods healthy, others failing

- **Logs**:
  - Frequent error messages
  - Timeout errors
  - Database query failures
  - External API errors
  - Circuit breaker open

---

## Impact Assessment

### P1 Severity Criteria Met If:
- **Error Rate**: 5-50% of requests failing
- **User Impact**: 20-80% of users affected
- **Duration**: > 15 minutes
- **Revenue Impact**: $500-$5,000/minute
- **SLA Impact**: Approaching monthly error budget

### Affected Scenarios
- **Search Degraded**: Users can search but results incomplete
- **Publishing Slow**: Services publish but take 10x longer
- **API Errors**: Consumption requests fail intermittently
- **Admin Lag**: Admin operations timing out

---

## Immediate Response (First 15 Minutes)

### Step 1: Confirm Degradation

```bash
# Check current error rate
kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=prometheus -o jsonpath='{.items[0].metadata.name}') -n llm-marketplace -- \
  promtool query instant http://localhost:9090 \
  'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])'

# Check service health endpoints
for svc in publishing discovery consumption admin; do
  echo "=== ${svc} health ==="
  curl -s http://${svc}-service.llm-marketplace.svc.cluster.local:300X/health | jq
done

# Check pod status
kubectl get pods -n llm-marketplace -o wide
```

**Thresholds**:
- Error rate > 5%: P1 incident
- Error rate > 20%: Consider P0 escalation
- Error rate > 50%: Escalate to P0

---

### Step 2: Declare Incident

```bash
# Post to #incidents Slack channel

🔴 P1 INCIDENT - SERVICE DEGRADED
Service: Discovery Service
Metric: 15% error rate (threshold: 5%)
Impact: ~20% of search queries failing
Duration: 12 minutes
War Room: #incident-$(date +%Y-%m-%d)-002
IC: @oncall
```

---

### Step 3: Quick Triage

**Check Recent Changes** (last 2 hours):
```bash
# Deployments
kubectl rollout history deployment -n llm-marketplace

# ConfigMap changes
kubectl get events -n llm-marketplace --field-selector reason=ConfigMapUpdated

# Traffic patterns
# Check Grafana: Request rate, unusual spikes?
```

**Common Quick Wins**:
- Recent deployment → Rollback
- Traffic spike → Scale up
- Cache failure → Restart cache
- Database slow → Check slow queries

---

## Investigation Phase (15-60 Minutes)

### Step 4: Analyze Error Patterns

```bash
# Get error breakdown from logs
kubectl logs -n llm-marketplace -l app=discovery-service --tail=1000 | \
  grep -i "error" | \
  awk '{print $NF}' | \
  sort | uniq -c | sort -rn | head -20

# Check HTTP status code distribution
# Use Grafana: HTTP Status Codes dashboard
```

**Error Pattern Analysis**:
- **All 5xx errors**: Backend service issue
- **All 4xx errors**: Client/validation issue (usually not P1)
- **Mixed 5xx/4xx**: Complex issue, multiple causes
- **Specific endpoint**: Isolated feature problem
- **Time-based pattern**: Resource leak, memory buildup

---

### Step 5: Check Resource Utilization

```bash
# CPU and memory usage
kubectl top pods -n llm-marketplace --sort-by=cpu

# Check for resource throttling
kubectl describe pod -n llm-marketplace -l app=discovery-service | grep -A 10 "State:"

# Check for OOMKilled events
kubectl get events -n llm-marketplace --field-selector reason=OOMKilled

# Detailed resource metrics
kubectl describe node | grep -A 5 "Allocated resources"
```

**Resource Issues**:
- **CPU > 80%**: CPU throttling, slow response
- **Memory > 90%**: Risk of OOM kill
- **Disk > 90%**: Write failures
- **Network saturation**: Connection timeouts

---

### Step 6: Database Performance

```bash
# Check database load
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
-- Active queries
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

-- Long-running queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;

-- Lock contention
SELECT * FROM pg_locks WHERE NOT granted;

-- Cache hit ratio (should be > 90%)
SELECT
  sum(blks_hit) / sum(blks_hit + blks_read) as cache_hit_ratio
FROM pg_stat_database;
EOF

# Check connection pool
kubectl logs -n llm-marketplace -l app=discovery-service --tail=500 | \
  grep -i "connection pool"
```

**Database Red Flags**:
- Cache hit ratio < 90%
- Queries running > 30 seconds
- Lock contention
- Connection pool exhausted
- High replication lag

---

### Step 7: External Dependencies

```bash
# Check Policy Engine
curl -f http://policy-engine.llm-marketplace.svc.cluster.local:50051/health

# Check Elasticsearch
curl http://elasticsearch.llm-marketplace.svc.cluster.local:9200/_cluster/health

# Check Redis
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli INFO stats | grep -E "total_commands|keyspace"

# Check external APIs
kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=discovery-service -o jsonpath='{.items[0].metadata.name}') -n llm-marketplace -- \
  curl -m 5 -f https://external-api.example.com/health
```

**Dependency Health**:
- All dependencies responding?
- Response times normal?
- Any degraded services?
- Circuit breakers open?

---

### Step 8: Check Distributed Traces

```bash
# Access Jaeger UI
# http://jaeger.llm-marketplace.internal:16686

# Look for:
# - Slow database queries
# - External API timeouts
# - Service-to-service latency
# - Error patterns in trace spans
```

**Trace Analysis**:
- Find slowest traces in last hour
- Identify bottleneck service
- Check error traces vs successful
- Look for timeout patterns

---

## Resolution Actions

### Solution 1: Rollback Recent Deployment

**When to Use**: Error rate increased after recent deployment

```bash
# Check deployment history
kubectl rollout history deployment/discovery-service -n llm-marketplace

# View specific revision
kubectl rollout history deployment/discovery-service -n llm-marketplace --revision=5

# Rollback to previous version
kubectl rollout undo deployment/discovery-service -n llm-marketplace

# Monitor rollback progress
kubectl rollout status deployment/discovery-service -n llm-marketplace

# Verify error rate decreasing
# Check Grafana dashboard: Error Rate
```

**Expected Time**: 3-5 minutes
**Expected Impact**: Error rate drops to baseline within 2 minutes

---

### Solution 2: Scale Up Service

**When to Use**: High CPU/memory usage, increased traffic

```bash
# Current replica count
kubectl get deployment discovery-service -n llm-marketplace

# Scale up
kubectl scale deployment discovery-service -n llm-marketplace --replicas=10

# Verify scaling
kubectl get pods -n llm-marketplace -l app=discovery-service -w

# Check if HPA is fighting with manual scaling
kubectl get hpa -n llm-marketplace

# If needed, adjust HPA
kubectl patch hpa discovery-service-hpa -n llm-marketplace -p \
  '{"spec":{"minReplicas":10,"maxReplicas":50}}'
```

**Expected Time**: 2-3 minutes (pod startup)
**Expected Impact**: Error rate decreases as load distributes

---

### Solution 3: Restart Problematic Pods

**When to Use**: Specific pods showing errors, memory leaks

```bash
# Identify problematic pods
kubectl get pods -n llm-marketplace -l app=discovery-service -o wide

# Check pod metrics
kubectl top pods -n llm-marketplace -l app=discovery-service

# Delete high-memory or error-prone pods
kubectl delete pod <pod-name> -n llm-marketplace

# Or restart all pods gradually
kubectl rollout restart deployment/discovery-service -n llm-marketplace
```

**Expected Time**: 2-5 minutes per pod
**Expected Impact**: Fresh pods without memory leaks

---

### Solution 4: Clear/Restart Cache

**When to Use**: Cache corruption, stale data

```bash
# Check Redis health
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli INFO

# Clear specific cache keys
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli KEYS "*search*"
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli DEL cache:search:*

# Or flush all cache (careful!)
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli FLUSHDB

# Restart Redis if corrupted
kubectl rollout restart statefulset/redis -n llm-marketplace
```

**Expected Time**: 1-2 minutes
**Expected Impact**: Cache misses initially, then performance improves

---

### Solution 5: Database Query Optimization

**When to Use**: Slow database queries causing timeouts

```bash
# Kill long-running queries
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
-- Identify long queries
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '1 minute'
  AND query NOT LIKE '%pg_stat_activity%';
EOF

# Analyze slow queries
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
-- Enable logging of slow queries temporarily
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
EOF

# Check for missing indexes
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1;
EOF
```

**Expected Time**: 5-15 minutes (investigation + fix)
**Expected Impact**: Query latency improves

---

### Solution 6: Rate Limiting Adjustment

**When to Use**: Spike in traffic, DDoS suspected

```bash
# Check current rate limits
kubectl get configmap rate-limit-config -n llm-marketplace -o yaml

# Temporarily increase rate limits
kubectl patch configmap rate-limit-config -n llm-marketplace -p \
  '{"data":{"RATE_LIMIT_PER_MINUTE":"2000"}}'

# Or enable more aggressive rate limiting
kubectl patch configmap rate-limit-config -n llm-marketplace -p \
  '{"data":{"RATE_LIMIT_PER_MINUTE":"500","RATE_LIMIT_BURST":"100"}}'

# Restart services to pick up config
kubectl rollout restart deployment/discovery-service -n llm-marketplace
```

**Expected Time**: 3-5 minutes
**Expected Impact**: Legitimate traffic protected

---

### Solution 7: Circuit Breaker Reset

**When to Use**: Circuit breakers stuck open

```bash
# Check circuit breaker state
kubectl logs -n llm-marketplace -l app=discovery-service --tail=100 | grep -i "circuit"

# Access service and reset circuit breakers
kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=discovery-service -o jsonpath='{.items[0].metadata.name}') -n llm-marketplace -- \
  curl -X POST http://localhost:3002/admin/circuit-breaker/reset

# Or restart service to reset all breakers
kubectl rollout restart deployment/discovery-service -n llm-marketplace
```

**Expected Time**: 2-3 minutes
**Expected Impact**: Services retry failed dependencies

---

## Verification

### Step 9: Confirm Error Rate Decreasing

```bash
# Monitor error rate
# Grafana dashboard: Service Health Overview

# Check current error rate
curl -s "http://prometheus.llm-marketplace.svc.cluster.local:9090/api/v1/query?query=rate(http_requests_total{status=~\"5..\"}[5m])/rate(http_requests_total[5m])" | jq

# Expected: < 1% error rate

# Check pod health
kubectl get pods -n llm-marketplace -l app=discovery-service

# All pods should be Running and READY
```

**Success Criteria**:
- Error rate < 1%
- P95 latency < 500ms
- All pods healthy
- No alerts firing

---

### Step 10: Monitor Stability (30 minutes)

```bash
# Watch error rate trends
# Grafana: Error Rate (30min window)

# Monitor for new issues
kubectl get events -n llm-marketplace -w

# Check logs for errors
kubectl logs -n llm-marketplace -l app=discovery-service -f | grep -i "error\|warn"
```

**Monitoring Checklist**:
- [ ] Error rate stable < 1% for 30 minutes
- [ ] No pod restarts
- [ ] CPU/Memory usage normal
- [ ] Database query times normal
- [ ] No new alerts

---

## Communication

### Initial Notification (T+15min)
```
🔴 P1 INCIDENT - DISCOVERY SERVICE DEGRADED

We are experiencing elevated error rates on the Discovery Service.
Approximately 15% of search queries are failing.

Status: Investigating
Impact: 20% of users experiencing search failures
IC: @oncall
War Room: #incident-2024-11-19-002

Next update in 30 minutes.
```

### Progress Update (Every 30min)
```
📊 UPDATE - DISCOVERY SERVICE DEGRADED

Status: Root cause identified - database query timeout
Action: Optimizing slow queries and scaling up service
Progress: Error rate decreased from 15% to 8%
Current: 8% error rate, still elevated

Next update in 30 minutes.
```

### Resolution Notification
```
✅ RESOLVED - DISCOVERY SERVICE DEGRADED

Discovery Service error rates have returned to normal levels.

Root Cause: Unoptimized database query causing timeouts
Resolution: Added database index, scaled service to 10 replicas
Duration: 1 hour 15 minutes
Impact: 20% of users experienced intermittent search failures

The service is now stable. We will monitor for the next 24 hours.
Post-incident review scheduled for 2024-11-20 at 2pm.
```

---

## Prevention

### Immediate Actions (Within 24 hours)

1. **Enhanced Monitoring**
   ```bash
   # Add alert for error rate > 2% (earlier warning)
   # Add alert for database query time > 1s
   # Add alert for gradual error rate increase
   ```

2. **Performance Testing**
   - Identify query that caused issue
   - Add to performance test suite
   - Ensure proper indexing

3. **Runbook Update**
   - Document specific failure mode
   - Add to common issues list
   - Update resolution steps

### Long-Term Actions

1. **Database Optimization**
   - Regular query performance review
   - Automated slow query analysis
   - Index optimization recommendations
   - Connection pool tuning

2. **Service Resilience**
   - Implement graceful degradation
   - Better circuit breaker configuration
   - Retry logic with exponential backoff
   - Timeout tuning

3. **Observability**
   - Enhanced distributed tracing
   - Detailed error categorization
   - Anomaly detection on error rates
   - Automated root cause analysis

4. **Load Testing**
   - Regular load tests in staging
   - Chaos engineering tests
   - Database performance benchmarks
   - Failover testing

---

## Rollback Procedure

If resolution attempts fail or make things worse:

```bash
# Emergency rollback
kubectl rollout undo deployment/discovery-service -n llm-marketplace

# Restore previous configuration
kubectl apply -f backup/discovery-config-last-good.yaml

# Reset rate limits
kubectl apply -f config/rate-limits-default.yaml

# Restart dependent services
kubectl rollout restart deployment -n llm-marketplace

# Verify system state
kubectl get pods -n llm-marketplace
```

---

## Escalation

### Automatic Escalation Points
- **T+0**: Page on-call engineer
- **T+15min**: Notify Incident Commander
- **T+2hours**: If not resolved, escalate to Engineering Manager
- **T+4hours**: If not resolved, escalate to VP Engineering

### Manual Escalation Triggers
- Error rate increasing despite fixes
- Multiple services affected
- Database performance degrading
- User complaints escalating
- Revenue impact > $10K

### Escalation Contacts
- Database SME: dba@company.com
- Performance SME: perf@company.com
- Engineering Manager: manager@company.com

---

## Related Runbooks

- [RB-001: Service Completely Down](RB-001-SERVICE-DOWN.md)
- [RB-003: High API Latency](RB-003-HIGH-LATENCY.md)
- [RB-005: Database Connection Failures](RB-005-DATABASE-CONNECTION.md)
- [RB-006: Database Slow Queries](RB-006-DATABASE-SLOW-QUERIES.md)
- [RB-010: Memory Leak](RB-010-MEMORY-LEAK.md)

---

## Appendix

### Common Root Causes (Historical)

1. **Database Query Performance** (35%)
   - Missing indexes
   - Unoptimized queries
   - Lock contention

2. **Resource Exhaustion** (25%)
   - CPU throttling
   - Memory pressure
   - Connection pool exhaustion

3. **External Dependency Issues** (20%)
   - Elasticsearch degraded
   - Policy Engine timeout
   - External API slow

4. **Code Issues** (15%)
   - Memory leaks
   - Race conditions
   - Exception handling gaps

5. **Traffic Spikes** (5%)
   - Unexpected load
   - Retry storms
   - DDoS attempts

### Useful Queries

**Prometheus - Current Error Rate**:
```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**Prometheus - Error Rate by Endpoint**:
```promql
sum by (path) (rate(http_requests_total{status=~"5.."}[5m]))
```

**PostgreSQL - Slow Queries**:
```sql
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

**Document Version**: 1.0.0
**Last Tested**: 2024-11-19
**Next Review**: 2024-12-19
