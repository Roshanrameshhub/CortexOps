# RB-001: Service Completely Down

**Runbook ID**: RB-001
**Severity**: P0 (Critical)
**Service**: All Microservices
**Last Updated**: 2025-11-19
**Owner**: DevOps Team

---

## Incident Description

One or more core services (Publishing, Discovery, Consumption, Admin, Policy Engine) is completely unavailable, returning 0% successful responses. All health check endpoints return failures or timeouts.

---

## Symptoms

### User-Visible Impact
- Users unable to access affected functionality
- "Service Unavailable" or 503/504 errors
- Complete feature outage
- Mobile app failures

### Technical Indicators
- **Prometheus Alerts**:
  - `ServiceDown` - Target down for > 1 minute
  - `HighErrorRate` - Error rate > 95%
  - `HealthCheckFailing` - Health endpoint returns non-200

- **Metrics**:
  - Request success rate: 0%
  - Health check: Failing
  - Pod status: CrashLoopBackOff, Error, or Pending
  - Kubernetes deployment: Not ready

- **Logs**:
  - Connection refused errors
  - Panic/crash stack traces
  - OOMKilled messages
  - Startup failures

---

## Impact Assessment

### P0 Severity Criteria Met If:
- **Availability**: 0% of users can access the service
- **Duration**: Outage > 5 minutes
- **Revenue Impact**: > $1,000/minute
- **SLA Impact**: Violates 99.9% uptime commitment

### Affected Components
- **Publishing Service Down**: No new service publishing
- **Discovery Service Down**: No service search/discovery
- **Consumption Service Down**: No API calls possible
- **Admin Service Down**: No admin operations
- **Policy Engine Down**: No policy validation (publishes blocked)

---

## Immediate Response (First 5 Minutes)

### Step 1: Confirm Outage
```bash
# Check service health
curl -f http://publishing-service.llm-marketplace.svc.cluster.local:3001/health
curl -f http://discovery-service.llm-marketplace.svc.cluster.local:3002/health
curl -f http://consumption-service.llm-marketplace.svc.cluster.local:3003/health
curl -f http://admin-service.llm-marketplace.svc.cluster.local:3004/health

# Check Kubernetes pod status
kubectl get pods -n llm-marketplace
```

**Expected**: Health checks fail or timeout, pods in error state

---

### Step 2: Declare Incident
```bash
# Create incident in PagerDuty
# Post to #incidents Slack channel

# Template:
🚨 P0 INCIDENT - SERVICE DOWN
Service: [service-name]
Status: All pods down / No healthy instances
Impact: 100% of users unable to access [functionality]
War Room: #incident-$(date +%Y-%m-%d)-001
IC: @oncall
```

---

### Step 3: Create War Room
- Create Slack channel: `#incident-YYYY-MM-DD-NNN`
- Invite: IC, SME, Engineering Manager, VP Eng (for P0)
- Pin important information
- Start incident timeline document

---

## Investigation Phase (5-30 Minutes)

### Step 4: Check Recent Changes

**Deployments**:
```bash
# Check recent deployments
kubectl rollout history deployment/publishing-service -n llm-marketplace
kubectl rollout history deployment/discovery-service -n llm-marketplace

# Check deployment status
kubectl rollout status deployment/publishing-service -n llm-marketplace

# View recent events
kubectl get events -n llm-marketplace --sort-by='.lastTimestamp' | tail -50
```

**Configuration Changes**:
```bash
# Check ConfigMap changes
kubectl get configmaps -n llm-marketplace -o yaml | grep -A 5 "resourceVersion"

# Check Secret changes
kubectl get secrets -n llm-marketplace -o yaml | grep -A 5 "resourceVersion"
```

**Infrastructure Changes**:
- Check AWS CloudTrail for recent changes
- Review Terraform state changes
- Check Kubernetes cluster events

---

### Step 5: Examine Pod State

```bash
# Get detailed pod information
kubectl describe pod -n llm-marketplace -l app=publishing-service

# Common failure modes to check:
```

**Pod States and Meanings**:
- `CrashLoopBackOff`: Application crashing on startup
- `ImagePullBackOff`: Cannot pull container image
- `Pending`: Cannot schedule (resource constraints)
- `OOMKilled`: Out of memory
- `Error`: Startup command failed

---

### Step 6: Analyze Logs

```bash
# Get recent logs from crashed pods
kubectl logs -n llm-marketplace -l app=publishing-service --tail=200 --previous

# Check for common errors:
# - Panic messages
# - Database connection failures
# - Missing environment variables
# - Port binding errors
# - Certificate errors
# - Dependency connection failures
```

**Log Analysis Checklist**:
- [ ] Application startup sequence
- [ ] Database connectivity
- [ ] External service dependencies
- [ ] Configuration loading
- [ ] Certificate/TLS errors
- [ ] Resource exhaustion
- [ ] Crash stack traces

---

### Step 7: Check Dependencies

**Database**:
```bash
# Check PostgreSQL
kubectl get pods -n llm-marketplace -l app=postgres
kubectl logs -n llm-marketplace -l app=postgres --tail=50

# Test database connection
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -c "SELECT 1;"

# Check connections
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

**Redis**:
```bash
# Check Redis
kubectl get pods -n llm-marketplace -l app=redis
kubectl exec -it redis-0 -n llm-marketplace -- redis-cli PING
```

**Elasticsearch**:
```bash
# Check Elasticsearch
kubectl get pods -n llm-marketplace -l app=elasticsearch
curl http://elasticsearch.llm-marketplace.svc.cluster.local:9200/_cluster/health
```

**External Dependencies**:
- Check DNS resolution
- Check external API availability
- Verify network policies
- Check firewall rules

---

## Resolution Actions

### Solution 1: Rollback Recent Deployment

**When to Use**: Recent deployment correlates with outage

```bash
# Rollback to previous version
kubectl rollout undo deployment/publishing-service -n llm-marketplace

# Verify rollback
kubectl rollout status deployment/publishing-service -n llm-marketplace

# Check pods are healthy
kubectl get pods -n llm-marketplace -l app=publishing-service

# Test service
curl http://publishing-service.llm-marketplace.svc.cluster.local:3001/health
```

**Expected Time**: 2-5 minutes

---

### Solution 2: Fix Configuration Error

**When to Use**: Configuration change caused the issue

```bash
# Edit ConfigMap
kubectl edit configmap publishing-config -n llm-marketplace

# Or restore from backup
kubectl apply -f backup/publishing-config-YYYY-MM-DD.yaml

# Restart pods to pick up changes
kubectl rollout restart deployment/publishing-service -n llm-marketplace

# Wait for rollout
kubectl rollout status deployment/publishing-service -n llm-marketplace
```

**Expected Time**: 3-5 minutes

---

### Solution 3: Scale Up Resources

**When to Use**: Resource constraints (pending pods, resource quotas)

```bash
# Check resource quotas
kubectl describe resourcequota -n llm-marketplace

# Check node capacity
kubectl describe nodes | grep -A 5 "Allocated resources"

# Scale down non-critical services temporarily
kubectl scale deployment/non-critical-service -n llm-marketplace --replicas=0

# Or add node capacity
eksctl scale nodegroup --cluster=llm-marketplace --name=primary --nodes=10

# Verify pods scheduled
kubectl get pods -n llm-marketplace -w
```

**Expected Time**: 5-15 minutes (cluster autoscaling may take longer)

---

### Solution 4: Fix Database Connection

**When to Use**: Database connection errors in logs

```bash
# Check database password secret
kubectl get secret postgres-credentials -n llm-marketplace -o jsonpath='{.data.password}' | base64 -d

# Restart database if needed
kubectl rollout restart statefulset/postgres -n llm-marketplace

# Wait for database ready
kubectl wait --for=condition=ready pod -l app=postgres -n llm-marketplace --timeout=300s

# Test connection from service
kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=publishing-service -o jsonpath='{.items[0].metadata.name}') -n llm-marketplace -- \
  nc -zv postgres.llm-marketplace.svc.cluster.local 5432
```

**Expected Time**: 5-10 minutes

---

### Solution 5: Fix Image Pull Errors

**When to Use**: ImagePullBackOff or authentication errors

```bash
# Check image name in deployment
kubectl get deployment publishing-service -n llm-marketplace -o jsonpath='{.spec.template.spec.containers[0].image}'

# Verify image exists in registry
docker pull <image:tag>

# Update image pull secrets if needed
kubectl create secret docker-registry regcred \
  --docker-server=<registry> \
  --docker-username=<username> \
  --docker-password=<password> \
  -n llm-marketplace

# Update deployment to use secret
kubectl patch deployment publishing-service -n llm-marketplace -p \
  '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"regcred"}]}}}}'
```

**Expected Time**: 5-10 minutes

---

### Solution 6: Emergency Restart

**When to Use**: Unknown cause, need to restore service quickly

```bash
# Delete all pods (StatefulSet/Deployment will recreate)
kubectl delete pods -n llm-marketplace -l app=publishing-service

# Force restart deployment
kubectl rollout restart deployment/publishing-service -n llm-marketplace

# Watch pod startup
kubectl get pods -n llm-marketplace -l app=publishing-service -w

# Monitor logs during startup
kubectl logs -n llm-marketplace -l app=publishing-service -f
```

**Expected Time**: 2-5 minutes

**⚠️ Warning**: Only use as last resort for P0. Does not fix root cause.

---

## Verification

### Step 8: Confirm Service Recovery

```bash
# Check pod status
kubectl get pods -n llm-marketplace -l app=publishing-service

# Expected: All pods Running, READY 1/1

# Test health endpoint
curl http://publishing-service.llm-marketplace.svc.cluster.local:3001/health

# Expected: 200 OK with healthy status

# Check metrics
# - Request success rate > 99%
# - Latency back to normal
# - Error rate < 1%

# Test actual functionality
curl -X POST http://publishing-service.llm-marketplace.svc.cluster.local:3001/api/v1/services \
  -H "Content-Type: application/json" \
  -d '{"name":"test","version":"1.0.0"}'
```

---

### Step 9: Monitor Stability

**Watch for 30 minutes**:
```bash
# Monitor pod restarts
kubectl get pods -n llm-marketplace -l app=publishing-service -w

# Watch error rate
# Check Grafana dashboard: Service Health Overview

# Monitor logs for errors
kubectl logs -n llm-marketplace -l app=publishing-service -f | grep -i error
```

**Stability Criteria**:
- No pod restarts for 30 minutes
- Error rate < 0.1%
- Latency within normal range
- No new alerts triggered

---

## Communication

### Initial Notification (T+5min)
```
🚨 P0 INCIDENT - PUBLISHING SERVICE DOWN

We are investigating a complete outage of the Publishing Service.
All users are unable to publish new services.

Status: Investigating
Impact: 100% of publishing functionality unavailable
IC: @oncall
War Room: #incident-2024-11-19-001

Next update in 15 minutes.
```

### Progress Update (Every 15min)
```
📊 UPDATE - PUBLISHING SERVICE DOWN

Status: Root cause identified - database connection failure
Action: Restarting database pod and verifying connections
Progress: Database restarted, services reconnecting
ETA: 5 minutes

Next update in 15 minutes.
```

### Resolution Notification
```
✅ RESOLVED - PUBLISHING SERVICE DOWN

The Publishing Service has been fully restored.

Root Cause: Database connection pool exhaustion
Resolution: Restarted database pod and increased connection limits
Duration: 23 minutes
Impact: 100% of users unable to publish during outage

Post-incident review scheduled for tomorrow 2pm.
```

---

## Prevention

### Immediate Actions (Within 24 hours)
1. **Add Monitoring**
   - Alert on database connection pool usage > 80%
   - Alert on pod pending state > 2 minutes
   - Enhanced health check (test database connectivity)

2. **Update Runbook**
   - Document specific failure mode encountered
   - Add root cause to common issues section

3. **Create Incident Report**
   - Complete post-incident review template
   - Share learnings with team

### Long-Term Actions
1. **Improve Resilience**
   - Implement connection pool monitoring
   - Add circuit breakers for database calls
   - Implement graceful degradation
   - Add retry logic with exponential backoff

2. **Better Detection**
   - Synthetic monitoring (active health checks)
   - Enhanced observability (detailed traces)
   - Anomaly detection on key metrics

3. **Faster Recovery**
   - Automated rollback on health check failures
   - Canary deployments (staged rollout)
   - Database connection pre-warming

---

## Rollback Procedure

If resolution attempts fail:

```bash
# Complete rollback to last known good state
kubectl rollout undo deployment/publishing-service -n llm-marketplace

# Restore configuration
kubectl apply -f backup/last-known-good/

# Restart all services
for svc in publishing discovery consumption admin; do
  kubectl rollout restart deployment/${svc}-service -n llm-marketplace
done

# Verify all services healthy
kubectl get pods -n llm-marketplace
```

---

## Escalation

### Automatic Escalation Points
- **T+0**: Page on-call engineer
- **T+0**: Notify Incident Commander
- **T+0**: Page VP Engineering (P0)
- **T+30min**: If not resolved, bring in database SME
- **T+1hour**: If not resolved, escalate to CTO

### Manual Escalation Triggers
- Root cause unclear after 15 minutes
- Need infrastructure changes (AWS, K8s cluster)
- Multiple services affected
- Data loss suspected
- External vendor involvement needed

---

## Related Runbooks

- [RB-002: Service Degraded / High Error Rate](RB-002-SERVICE-DEGRADED.md)
- [RB-003: High API Latency](RB-003-HIGH-LATENCY.md)
- [RB-005: Database Connection Failures](RB-005-DATABASE-CONNECTION.md)
- [RB-008: Pod Crash Loop](RB-008-POD-CRASH-LOOP.md)

---

## Appendix

### Common Root Causes (Historical)

1. **Database Connection Exhaustion** (40% of incidents)
   - Cause: Connection pool too small
   - Fix: Increase pool size, add monitoring

2. **Configuration Error** (25% of incidents)
   - Cause: Invalid environment variable
   - Fix: Validate config before deploy

3. **Resource Exhaustion** (15% of incidents)
   - Cause: Memory limit too low
   - Fix: Increase limits, add HPA

4. **Dependency Failure** (10% of incidents)
   - Cause: External service down
   - Fix: Circuit breaker, fallback

5. **Bad Deployment** (10% of incidents)
   - Cause: Code bug introduced
   - Fix: Rollback, better testing

### Useful Grafana Dashboards
- **Service Health Overview**: http://grafana/d/service-health
- **Kubernetes Pod Status**: http://grafana/d/k8s-pods
- **Database Connections**: http://grafana/d/postgres

### Useful Commands Reference
```bash
# Quick health check all services
for svc in publishing discovery consumption admin; do
  echo "Checking ${svc}..."
  kubectl exec -it $(kubectl get pod -n llm-marketplace -l app=${svc}-service -o jsonpath='{.items[0].metadata.name}') -n llm-marketplace -- wget -q -O- http://localhost:300X/health
done

# Get all pod events
kubectl get events -n llm-marketplace --field-selector involvedObject.kind=Pod --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n llm-marketplace --sort-by=memory
```

---

**Document Version**: 1.0.0
**Last Tested**: 2024-11-19
**Next Review**: 2024-12-19
