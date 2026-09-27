# RB-010: Memory Leak / OOM Kills

**Runbook ID**: RB-010
**Severity**: P1-P2 (High to Medium)
**Component**: All Services
**Last Updated**: 2025-11-19
**Owner**: Platform Team

---

## Incident Description

Service memory usage continuously increasing over time, leading to Out of Memory (OOM) kills and pod restarts. Pod memory usage exceeds limits causing Kubernetes to terminate containers.

---

## Symptoms

### User-Visible Impact
- Intermittent service unavailability
- Slow performance before OOM kill
- Request failures during pod restart
- Degraded user experience

### Technical Indicators
- **Alerts**: `PodMemoryHigh`, `OOMKilled`, `PodRestartingFrequently`
- **Pod Status**: `OOMKilled` in previous termination reason
- **Metrics**: Memory usage trending upward, restart count increasing
- **Logs**: "out of memory", "memory allocation failed"

---

## Immediate Response

### Step 1: Confirm Memory Issue

```bash
# Check current memory usage
kubectl top pods -n llm-marketplace --sort-by=memory

# Check for OOMKilled events
kubectl get events -n llm-marketplace --field-selector reason=OOMKilled --sort-by='.lastTimestamp'

# View pod termination reason
kubectl describe pod -n llm-marketplace -l app=discovery-service | grep -A 10 "Last State"

# Check restart count
kubectl get pods -n llm-marketplace -o wide
```

**OOMKilled Indicators**:
- Exit Code: 137
- Reason: OOMKilled
- Increasing restart count
- Memory usage approaching limit before restart

---

### Step 2: Emergency Mitigation

**Option A: Increase Memory Limit (Quick Fix)**
```bash
# Patch deployment with higher memory limit
kubectl patch deployment discovery-service -n llm-marketplace -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"discovery-service","resources":{"limits":{"memory":"4Gi"}}}]}}}}'

# Monitor restart
kubectl rollout status deployment/discovery-service -n llm-marketplace
```

**Option B: Add More Replicas**
```bash
# Distribute load across more pods
kubectl scale deployment discovery-service -n llm-marketplace --replicas=10

# Each pod handles less traffic, slower memory growth
```

**Expected Time**: 2-3 minutes
**Expected Impact**: Temporary relief, buys time for investigation

---

## Investigation Phase

### Step 3: Analyze Memory Usage Pattern

```bash
# Get historical memory usage from Prometheus
# Grafana: Pod Memory Usage (24h view)

# Check for:
# - Steady increase (memory leak)
# - Spikes after specific operations
# - Correlation with traffic patterns
# - Time between restarts decreasing
```

**Memory Leak Patterns**:
- **Linear growth**: Classic memory leak
- **Sawtooth pattern**: Periodic memory leak, GC helps but not enough
- **Sudden spike**: Specific operation causing issue
- **Gradual acceleration**: Leak rate increasing

---

### Step 4: Heap Dump Analysis (Node.js)

```bash
# Enable heap dump for Node.js services
kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=discovery-service -o jsonpath='{.items[0].metadata.name}') -n llm-marketplace -- \
  kill -USR2 $(pgrep node)

# Heap dump written to container filesystem
# Copy to local machine
kubectl cp llm-marketplace/<pod-name>:/app/heapdump-*.heapsnapshot ./heapdump.heapsnapshot

# Analyze with Chrome DevTools
# Load in Memory profiler, look for:
# - Large retained objects
# - Growing arrays/maps
# - Event listeners not removed
# - Circular references
```

---

### Step 5: Check for Common Memory Leaks

**Node.js Common Issues**:
```bash
# Check logs for clues
kubectl logs -n llm-marketplace -l app=discovery-service --tail=5000 | grep -i "memory\|heap\|leak"

# Common causes:
# - Event listeners not removed
# - Timers/intervals not cleared
# - Large cache without eviction
# - Closure scope retention
# - Database connection not released
```

**Database Connection Leaks**:
```bash
# Check connection pool usage
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
SELECT count(*), state, application_name
FROM pg_stat_activity
WHERE application_name LIKE 'discovery%'
GROUP BY state, application_name;
EOF

# Growing connection count per app = leak
```

**Cache Memory**:
```bash
# Check Redis memory usage
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli INFO memory

# Check for keys without TTL
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli --scan --pattern '*' | \
  while read key; do
    kubectl exec -it redis-0 -n llm-marketplace -- redis-cli TTL "$key"
  done | grep -c "^-1$"

# -1 means no expiration = potential leak
```

---

## Resolution Actions

### Solution 1: Fix Code Memory Leak

**After identifying leak in code**:

```javascript
// Example fix: Remove event listeners
// BEFORE (leaking):
router.post('/endpoint', (req, res) => {
  const listener = () => { /* ... */ };
  emitter.on('event', listener);  // Never removed!
  res.send(result);
});

// AFTER (fixed):
router.post('/endpoint', (req, res) => {
  const listener = () => {
    emitter.removeListener('event', listener);  // Clean up
    /* ... */
  };
  emitter.once('event', listener);  // Auto-removes
  res.send(result);
});
```

Deploy fix:
```bash
# Build and deploy fixed version
docker build -t discovery-service:v1.2.3-memleak-fix .
docker push discovery-service:v1.2.3-memleak-fix

kubectl set image deployment/discovery-service \
  discovery-service=discovery-service:v1.2.3-memleak-fix \
  -n llm-marketplace

kubectl rollout status deployment/discovery-service -n llm-marketplace
```

---

### Solution 2: Implement Cache Eviction

**Add LRU cache with size limit**:

```javascript
// Before: Unbounded cache
const cache = new Map();
app.get('/api/data', (req, res) => {
  const key = req.params.id;
  if (!cache.has(key)) {
    cache.set(key, fetchData(key));  // Grows forever!
  }
  res.json(cache.get(key));
});

// After: LRU cache with eviction
const LRU = require('lru-cache');
const cache = new LRU({
  max: 10000,              // Max items
  maxSize: 100 * 1024 * 1024,  // 100MB
  sizeCalculation: (value) => JSON.stringify(value).length,
  ttl: 1000 * 60 * 60,     // 1 hour TTL
});
```

---

### Solution 3: Database Connection Pool Fix

```yaml
# config/database.yaml
database:
  pool:
    min: 5
    max: 20
    acquireTimeoutMillis: 30000
    idleTimeoutMillis: 300000  # 5 minutes
    connectionTimeoutMillis: 2000
    # IMPORTANT: Release connections!

# Code fix:
# BEFORE:
const client = await pool.connect();
const result = await client.query('SELECT ...');
return result.rows;  // Connection not released!

# AFTER:
const client = await pool.connect();
try {
  const result = await client.query('SELECT ...');
  return result.rows;
} finally {
  client.release();  // Always release
}
```

---

### Solution 4: Periodic Pod Restarts (Temporary)

**While investigating permanent fix**:

```yaml
# Add liveness probe with memory threshold
apiVersion: apps/v1
kind: Deployment
metadata:
  name: discovery-service
spec:
  template:
    spec:
      containers:
      - name: discovery-service
        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - |
              MEMORY_USAGE=$(cat /sys/fs/cgroup/memory/memory.usage_in_bytes)
              MEMORY_LIMIT=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
              USAGE_PERCENT=$((MEMORY_USAGE * 100 / MEMORY_LIMIT))
              if [ $USAGE_PERCENT -gt 90 ]; then exit 1; fi
          periodSeconds: 60
```

**Or use CronJob to restart periodically**:
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: restart-discovery-service
spec:
  schedule: "0 */6 * * *"  # Every 6 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: kubectl
            image: bitnami/kubectl
            command:
            - kubectl
            - rollout
            - restart
            - deployment/discovery-service
            - -n
            - llm-marketplace
```

---

## Verification

### Step 6: Monitor Memory Stability

```bash
# Watch memory usage over time
# Grafana: Pod Memory Usage (24h view)

# Should see:
# - Flat or slightly increasing (GC working)
# - Sawtooth pattern (GC cycles)
# - No continuous increase
# - No OOMKills

# Check restart count
kubectl get pods -n llm-marketplace -l app=discovery-service -w

# Should remain stable (no restarts)
```

**Success Criteria**:
- No OOMKills for 48 hours
- Memory usage stable under load
- Restart count not increasing
- Memory usage < 80% of limit

---

## Prevention

### Immediate Actions
1. **Add Monitoring**
   - Alert on memory > 80%
   - Alert on increasing memory trend
   - Alert on restart rate > 1/hour

2. **Resource Limits**
   - Set appropriate memory limits
   - Set memory requests = limits (guaranteed QoS)
   - Configure OOMScoreAdj

3. **Testing**
   - Load test with memory profiling
   - Soak test (24h+ runtime)
   - Check memory after X requests

### Long-Term Actions
1. **Code Reviews**
   - Memory leak checklist
   - Automated memory profiling in CI
   - Regular heap dump analysis

2. **Architecture**
   - Implement request-scoped context
   - Use streaming for large data
   - Proper connection pool management
   - Cache with eviction policies

3. **Monitoring**
   - Memory usage per endpoint
   - Memory allocation rate
   - GC pause time tracking
   - Memory profiling in production

---

## Related Runbooks
- [RB-001: Service Down](RB-001-SERVICE-DOWN.md)
- [RB-008: Pod Crash Loop](RB-008-POD-CRASH-LOOP.md)

---

**Document Version**: 1.0.0
**Last Tested**: 2024-11-19
**Next Review**: 2024-12-19
