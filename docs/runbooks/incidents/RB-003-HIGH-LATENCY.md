# RB-003: High API Latency

**Runbook ID**: RB-003
**Severity**: P1-P2 (High to Medium)
**Service**: All Microservices
**Last Updated**: 2025-11-19
**Owner**: Performance Team

---

## Incident Description

API response times are significantly higher than baseline, causing slow user experience. P95 latency > 2 seconds or P99 latency > 5 seconds for sustained period (>10 minutes).

---

## Symptoms

### User-Visible Impact
- Slow page loads
- "Loading..." spinners for extended time
- Operations taking 5-10x longer than normal
- Timeouts in mobile apps
- User complaints about sluggishness

### Technical Indicators
- **Prometheus Alerts**:
  - `HighAPILatency` - P95 latency > 2s for 10 minutes
  - `VeryHighAPILatency` - P99 latency > 5s for 5 minutes
  - `SlowDatabaseQueries` - Query latency > 1s

- **Metrics**:
  - P50 latency: > 500ms (baseline: 50-100ms)
  - P95 latency: > 2s (baseline: 200-500ms)
  - P99 latency: > 5s (baseline: 500ms-1s)
  - Request duration increasing trend
  - No significant error rate increase

- **Logs**:
  - "Slow query" warnings
  - "Request timeout" messages
  - "Connection pool wait" warnings
  - External API timeout logs

---

## Impact Assessment

### Severity Determination

**P1 (High)** if:
- P95 latency > 5s
- Affecting > 50% of requests
- User escalations
- Revenue impact > $1K/hour

**P2 (Medium)** if:
- P95 latency 2-5s
- Affecting 20-50% of requests
- Minor user impact
- Revenue impact < $1K/hour

### Business Impact
- **Search Latency**: Users wait longer for results, may abandon
- **Publishing Latency**: Service submission delayed
- **API Consumption**: Partner integrations timing out
- **Admin Operations**: Dashboard slow, operational impact

---

## Immediate Response (First 10 Minutes)

### Step 1: Confirm Latency Issue

```bash
# Check Grafana dashboards
# - API Latency Overview
# - Service Response Times
# - Database Query Performance

# Query current P95/P99 latency
curl -s "http://prometheus.llm-marketplace.svc.cluster.local:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))" | jq

curl -s "http://prometheus.llm-marketplace.svc.cluster.local:9090/api/v1/query?query=histogram_quantile(0.99,rate(http_request_duration_seconds_bucket[5m]))" | jq

# Expected: Values > 2s for P95, > 5s for P99

# Test actual latency
time curl http://discovery-service.llm-marketplace.svc.cluster.local:3002/api/v1/search?q=test
```

---

### Step 2: Declare Incident (if P1)

```bash
🟡 P1 INCIDENT - HIGH API LATENCY

Service: Discovery Service
Metric: P95 latency = 6.2s (threshold: 2s)
Impact: All users experiencing slow search
Duration: 15 minutes
War Room: #incident-$(date +%Y-%m-%d)-003
IC: @oncall
```

---

### Step 3: Quick Checks

**Recent Changes** (last 4 hours):
```bash
# Check deployments
kubectl rollout history deployment -n llm-marketplace | head -20

# Check configuration changes
kubectl get events -n llm-marketplace --sort-by='.lastTimestamp' | grep -i config | tail -10
```

**Traffic Patterns**:
```bash
# Check request rate
# Grafana: Request Rate dashboard
# Look for unusual spikes

# Check for retry storms
kubectl logs -n llm-marketplace -l app=discovery-service --tail=1000 | \
  grep -c "retry"
```

---

## Investigation Phase (10-30 Minutes)

### Step 4: Identify Latency Source

**Use Distributed Tracing** (Jaeger):
```bash
# Access Jaeger UI: http://jaeger.llm-marketplace.internal:16686

# Find slowest traces (last hour)
# Look for:
# 1. Which service span is slowest?
# 2. Database queries taking longest?
# 3. External API calls timing out?
# 4. Service-to-service hops adding up?
```

**Latency Breakdown**:
- **Total Request**: 6.2s
  - Service logic: 0.1s
  - Database query: 5.8s ← **BOTTLENECK**
  - External calls: 0.2s
  - Network: 0.1s

---

### Step 5: Check Database Performance

```bash
# Connect to database
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace

# Check current query performance
SELECT pid, now() - query_start as duration, state, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC
LIMIT 10;

# Check for blocking queries
SELECT blocked_locks.pid AS blocked_pid,
       blocking_locks.pid AS blocking_pid,
       blocked_activity.query AS blocked_query,
       blocking_activity.query AS blocking_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

# Check table bloat
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

# Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public';
```

**Database Issues to Look For**:
- Long-running queries (> 5s)
- Lock contention
- Missing indexes (seq scans on large tables)
- Table bloat
- Low cache hit ratio

---

### Step 6: Check Resource Utilization

```bash
# CPU usage
kubectl top nodes
kubectl top pods -n llm-marketplace --sort-by=cpu

# Memory usage
kubectl top pods -n llm-marketplace --sort-by=memory

# Check for CPU throttling
kubectl describe pod -n llm-marketplace -l app=discovery-service | \
  grep -A 5 "cpu"

# Disk I/O (if accessible)
kubectl exec -it postgres-0 -n llm-marketplace -- iostat -x 1 5
```

**Resource Thresholds**:
- **CPU > 80%**: Likely throttling, causing slowness
- **Memory > 85%**: Potential swapping
- **Disk I/O wait > 50%**: Storage bottleneck
- **Network saturation**: Check pod network stats

---

### Step 7: Check External Dependencies

```bash
# Elasticsearch performance
curl "http://elasticsearch.llm-marketplace.svc.cluster.local:9200/_cluster/health?pretty"
curl "http://elasticsearch.llm-marketplace.svc.cluster.local:9200/_nodes/stats?pretty" | jq '.nodes[].jvm.mem.heap_used_percent'

# Redis latency
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli --latency-history

# Policy Engine
time grpcurl -plaintext policy-engine.llm-marketplace.svc.cluster.local:50051 \
  policyengine.PolicyEngineService/HealthCheck

# External APIs
for api in api1.example.com api2.example.com; do
  echo "Testing $api..."
  time curl -f https://$api/health
done
```

---

### Step 8: Analyze Traffic Patterns

```bash
# Check request distribution
kubectl logs -n llm-marketplace -l app=discovery-service --tail=10000 | \
  awk '{print $7}' | sort | uniq -c | sort -rn | head -20

# Look for:
# - Specific endpoint getting hammered
# - Unusual query parameters
# - Bot/scraper traffic
# - Retry storms

# Check for abusive users/IPs
kubectl logs -n llm-marketplace -l app=discovery-service --tail=10000 | \
  awk '{print $1}' | sort | uniq -c | sort -rn | head -20
```

---

## Resolution Actions

### Solution 1: Scale Up Service

**When to Use**: High CPU/memory, normal query performance

```bash
# Scale up deployment
kubectl scale deployment discovery-service -n llm-marketplace --replicas=15

# Verify scaling
kubectl get pods -n llm-marketplace -l app=discovery-service -w

# Monitor latency improvement
# Check Grafana: API Latency dashboard
```

**Expected Time**: 2-3 minutes
**Expected Impact**: Latency should decrease proportionally to scaling

---

### Solution 2: Database Query Optimization

**When to Use**: Slow database queries identified

```bash
# Identify slow query from pg_stat_activity
# Let's say it's a search query without index

# Add missing index (example)
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
-- Create index on frequently searched column
CREATE INDEX CONCURRENTLY idx_services_name_trgm ON services USING gin(name gin_trgm_ops);

-- Analyze table
ANALYZE services;
EOF

# Monitor query performance
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%services%'
ORDER BY mean_exec_time DESC
LIMIT 5;
EOF
```

**Expected Time**: 5-15 minutes (CONCURRENTLY means no table lock)
**Expected Impact**: Query time 10-100x faster

---

### Solution 3: Clear/Warm Cache

**When to Use**: Cache miss rate high, cold cache

```bash
# Check Redis cache hit rate
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli INFO stats | grep keyspace

# If cache is empty, warm it up
kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=discovery-service -o jsonpath='{.items[0].metadata.name}') -n llm-marketplace -- \
  curl -X POST http://localhost:3002/admin/cache/warm

# Or restart cache with persistence
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli BGSAVE

# Check cache size
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli DBSIZE
```

**Expected Time**: 5-10 minutes (warming depends on data size)
**Expected Impact**: Subsequent requests faster due to cache hits

---

### Solution 4: Connection Pool Tuning

**When to Use**: "Connection pool exhausted" in logs

```bash
# Check current pool configuration
kubectl get configmap discovery-config -n llm-marketplace -o yaml | grep -i pool

# Increase connection pool size
kubectl patch configmap discovery-config -n llm-marketplace -p \
  '{"data":{"DB_POOL_SIZE":"50","DB_POOL_MAX":"100"}}'

# Restart service to apply
kubectl rollout restart deployment/discovery-service -n llm-marketplace

# Monitor connection usage
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
EOF
```

**Expected Time**: 3-5 minutes
**Expected Impact**: Fewer "waiting for connection" delays

---

### Solution 5: Rate Limiting

**When to Use**: Traffic spike, abusive user pattern

```bash
# Identify top requesters
kubectl logs -n llm-marketplace -l app=discovery-service --tail=10000 | \
  awk '{print $1}' | sort | uniq -c | sort -rn | head -10

# Apply stricter rate limits
kubectl patch configmap rate-limit-config -n llm-marketplace -p \
  '{"data":{"RATE_LIMIT_PER_MINUTE":"100","RATE_LIMIT_PER_IP":"50"}}'

# Or block specific IPs temporarily
kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=nginx-ingress -o jsonpath='{.items[0].metadata.name}') -- \
  nginx -s reload

# Restart services
kubectl rollout restart deployment/discovery-service -n llm-marketplace
```

**Expected Time**: 2-3 minutes
**Expected Impact**: Legitimate traffic gets more resources

---

### Solution 6: Database Vacuum

**When to Use**: Table bloat, poor query planning

```bash
# Check last vacuum time
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
SELECT schemaname, tablename, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY last_autovacuum DESC NULLS LAST;
EOF

# Manual vacuum (if needed)
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
VACUUM ANALYZE services;
VACUUM ANALYZE service_versions;
EOF

# Or full vacuum (more aggressive, locks table briefly)
# Only during low traffic!
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
VACUUM FULL ANALYZE services;
EOF
```

**Expected Time**: 10-30 minutes (depending on table size)
**Expected Impact**: Better query plans, less disk I/O

---

### Solution 7: Elasticsearch Optimization

**When to Use**: Search queries slow, ES showing high latency

```bash
# Check ES cluster health
curl "http://elasticsearch.llm-marketplace.svc.cluster.local:9200/_cluster/health?pretty"

# Check slow queries
curl "http://elasticsearch.llm-marketplace.svc.cluster.local:9200/_nodes/stats?pretty" | \
  jq '.nodes[].indices.search.query_time_in_millis'

# Clear fielddata cache if memory pressure
curl -XPOST "http://elasticsearch.llm-marketplace.svc.cluster.local:9200/_cache/clear?fielddata=true"

# Force merge indices (during low traffic)
curl -XPOST "http://elasticsearch.llm-marketplace.svc.cluster.local:9200/services/_forcemerge?max_num_segments=1"

# Increase refresh interval temporarily
curl -XPUT "http://elasticsearch.llm-marketplace.svc.cluster.local:9200/services/_settings" -H 'Content-Type: application/json' -d'
{
  "index": {
    "refresh_interval": "30s"
  }
}'
```

**Expected Time**: 5-20 minutes
**Expected Impact**: Search latency decreases

---

## Verification

### Step 9: Confirm Latency Improvement

```bash
# Check current latency metrics
# Grafana: API Latency dashboard

# Test actual endpoint
time curl "http://discovery-service.llm-marketplace.svc.cluster.local:3002/api/v1/search?q=test"

# Expected: < 500ms

# Check P95/P99 improving
curl -s "http://prometheus.llm-marketplace.svc.cluster.local:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))" | jq

# Verify all services healthy
kubectl get pods -n llm-marketplace
```

**Success Criteria**:
- P50 latency < 200ms
- P95 latency < 500ms
- P99 latency < 2s
- Latency trend decreasing

---

### Step 10: Monitor Stability (1 hour)

```bash
# Watch latency trends
# Grafana: API Latency (1 hour window)

# Monitor for regression
kubectl get events -n llm-marketplace -w

# Check resource usage stable
kubectl top pods -n llm-marketplace

# Verify database query times
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 5;
EOF
```

---

## Communication

### Initial Notification
```
🟡 P1 INCIDENT - HIGH API LATENCY

Search functionality is experiencing high latency.
Users may experience slow response times.

Metric: P95 latency = 6.2s (normal: <500ms)
Impact: All search queries affected
Status: Investigating
IC: @oncall
War Room: #incident-2024-11-19-003

Next update in 30 minutes.
```

### Resolution Notification
```
✅ RESOLVED - HIGH API LATENCY

API latency has returned to normal levels.

Root Cause: Missing database index on frequently queried column
Resolution: Added index, optimized query plan
Duration: 45 minutes
Impact: Users experienced slow search (6s vs normal 0.5s)

Latency now: P95=350ms, P99=800ms (within normal range)
```

---

## Prevention

### Immediate Actions
1. Add missing database indexes
2. Set up alerts for slow queries (>1s)
3. Implement query result caching
4. Add latency budgets per endpoint

### Long-Term Actions
1. **Performance Testing**
   - Regular load tests
   - Query performance regression tests
   - Database query plan analysis

2. **Monitoring Enhancements**
   - Per-endpoint latency tracking
   - Database query performance dashboard
   - Automatic slow query detection

3. **Architecture Improvements**
   - Read replicas for heavy queries
   - Query result caching layer
   - Database connection pooling optimization
   - Async processing for non-critical paths

---

## Related Runbooks

- [RB-002: Service Degraded](RB-002-SERVICE-DEGRADED.md)
- [RB-006: Database Slow Queries](RB-006-DATABASE-SLOW-QUERIES.md)
- [RB-011: Elasticsearch Performance](RB-011-ELASTICSEARCH-PERFORMANCE.md)

---

**Document Version**: 1.0.0
**Last Tested**: 2024-11-19
**Next Review**: 2024-12-19
