# RB-005: Database Connection Failures

**Runbook ID**: RB-005
**Severity**: P0-P1 (Critical to High)
**Component**: PostgreSQL Database
**Last Updated**: 2025-11-19
**Owner**: Database Team

---

## Incident Description

Services unable to connect to PostgreSQL database, or connections are being refused/timing out. This typically manifests as "connection refused", "too many connections", or "connection timeout" errors.

---

## Symptoms

### User-Visible Impact
- Service errors (500 Internal Server Error)
- Unable to create/update/read data
- Complete service outage if all replicas affected

### Technical Indicators
- **Alerts**: `DatabaseConnectionFailure`, `PostgreSQLDown`
- **Logs**: "connection refused", "FATAL: remaining connection slots reserved"
- **Metrics**: Active connections = max_connections

---

## Immediate Response

### Step 1: Verify Database Status

```bash
# Check PostgreSQL pods
kubectl get pods -n llm-marketplace -l app=postgres

# Check if database is responding
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -c "SELECT 1;"

# Check connection count
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
SELECT count(*) FROM pg_stat_activity;
SELECT max_connections FROM pg_settings WHERE name = 'max_connections';
EOF
```

---

### Step 2: Quick Fix - Kill Idle Connections

```bash
# Identify idle connections
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
SELECT pid, usename, application_name, state, state_change
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < now() - interval '10 minutes';
EOF

# Kill long-idle connections
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < now() - interval '10 minutes'
  AND pid != pg_backend_pid();
EOF
```

**Expected Time**: 1-2 minutes
**Expected Impact**: Frees connection slots

---

### Step 3: Increase Max Connections (Temporary)

```bash
# Edit PostgreSQL config
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
ALTER SYSTEM SET max_connections = 500;
SELECT pg_reload_conf();
EOF

# Note: Full increase requires restart
# Quick reload only works within limits
```

---

## Long-Term Solutions

### Solution 1: Configure Connection Pooling

```yaml
# Update service configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: publishing-config
data:
  DB_POOL_SIZE: "20"        # Per instance
  DB_POOL_MAX: "40"
  DB_POOL_MIN: "5"
  DB_POOL_IDLE_TIMEOUT: "300s"
  DB_POOL_MAX_LIFETIME: "3600s"
```

### Solution 2: Implement PgBouncer

```bash
# Deploy PgBouncer as connection pooler
kubectl apply -f k8s/pgbouncer-deployment.yaml

# Update services to use PgBouncer
DB_HOST=pgbouncer.llm-marketplace.svc.cluster.local
DB_PORT=6432
```

---

## Related Runbooks
- [RB-001: Service Down](RB-001-SERVICE-DOWN.md)
- [RB-006: Database Slow Queries](RB-006-DATABASE-SLOW-QUERIES.md)

---

**Document Version**: 1.0.0
