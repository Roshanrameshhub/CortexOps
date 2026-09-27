# Chaos Engineering Test Suite
# Enterprise-grade resilience testing for LLM Marketplace platform

## Overview

This comprehensive chaos engineering test suite validates the resilience and fault tolerance of the LLM Marketplace platform under various failure conditions. It uses industry-standard tools (Chaos Mesh, Litmus) and follows best practices for safe, controlled chaos testing.

## Architecture

```
chaos-engineering/
├── experiments/          # Chaos Mesh experiment definitions
│   ├── network/         # Network chaos (latency, partition, bandwidth)
│   ├── pods/            # Pod chaos (kill, failure, container-kill)
│   ├── stress/          # Resource stress (CPU, memory, disk)
│   └── io/              # I/O chaos (delay, errno, corruption)
├── litmus/              # Litmus chaos workflows
│   ├── chaosengine/     # ChaosEngine definitions (DB, cache, app)
│   └── workflows/       # Argo workflow orchestration
├── application/         # Application-level chaos tests
│   ├── database-chaos.yaml
│   └── cache-chaos.yaml
├── monitoring/          # Prometheus/Grafana integration
│   ├── prometheus-chaos-rules.yaml
│   └── grafana-chaos-dashboard.json
├── playbooks/           # Operational runbooks
│   └── RUNBOOK.md
├── ci-cd/               # CI/CD integration
│   └── github-actions-chaos.yaml
├── scripts/             # Automation scripts
│   └── validate-slo.sh
└── DESIGN.md            # Comprehensive architecture documentation
```

## Quick Start

### Prerequisites

1. **Kubernetes Cluster** (v1.24+)
   ```bash
   kubectl version --short
   ```

2. **Chaos Mesh** (v2.6+)
   ```bash
   helm repo add chaos-mesh https://charts.chaos-mesh.org
   helm install chaos-mesh chaos-mesh/chaos-mesh \
     --namespace=chaos-testing \
     --create-namespace \
     --set chaosDaemon.runtime=containerd \
     --set chaosDaemon.socketPath=/run/containerd/containerd.sock
   ```

3. **Litmus** (v3.0+)
   ```bash
   kubectl apply -f https://litmuschaos.github.io/litmus/litmus-operator-v3.0.0.yaml
   kubectl apply -f https://hub.litmuschaos.io/api/chaos/master?file=charts/generic/experiments.yaml \
     -n chaos-testing
   ```

4. **Argo Workflows** (v3.5+)
   ```bash
   kubectl create namespace argo
   kubectl apply -n argo -f https://github.com/argoproj/argo-workflows/releases/download/v3.5.0/install.yaml
   ```

5. **Prometheus & Grafana** (for monitoring)
   ```bash
   # Apply Prometheus rules
   kubectl apply -f monitoring/prometheus-chaos-rules.yaml

   # Import Grafana dashboard
   # Upload monitoring/grafana-chaos-dashboard.json to Grafana
   ```

### Running Your First Chaos Test

#### 1. Validate Pre-Chaos SLOs
```bash
# Ensure system is healthy before starting chaos
./scripts/validate-slo.sh pre-chaos --export /tmp/baseline.json
```

#### 2. Run Network Latency Chaos
```bash
# Inject 500ms latency between GraphQL Gateway and PostgreSQL
kubectl apply -f experiments/network/network-latency.yaml

# Monitor in real-time
watch -n 2 'kubectl get networkchaos -n chaos-testing'

# View Grafana dashboard
open http://grafana.monitoring.svc.cluster.local/d/chaos-engineering
```

#### 3. Validate Post-Chaos Recovery
```bash
# Wait for chaos to complete
sleep 300

# Verify system recovered
./scripts/validate-slo.sh post-chaos --export /tmp/final.json
```

## Chaos Scenarios

### 1. Network Chaos

#### Network Latency
**Purpose**: Test system behavior under degraded network conditions

```bash
kubectl apply -f experiments/network/network-latency.yaml
```

**Expected Impact**:
- Increased request latency (500ms ± 100ms jitter)
- Circuit breaker activation
- Request timeouts

**Success Criteria**:
- Error rate < 1%
- P95 latency < 5s
- Automatic recovery within 2 minutes

#### Network Partition
**Purpose**: Test partition tolerance (CAP theorem)

```bash
kubectl apply -f experiments/network/network-partition.yaml
```

**Expected Impact**:
- Database isolation from backend services
- Connection failures
- Potential split-brain scenarios (if not properly configured)

**Success Criteria**:
- No data corruption
- Automatic reconnection after partition heals
- Consistent state maintained

### 2. Pod Chaos

#### Random Pod Kill
**Purpose**: Validate auto-healing and high availability

```bash
kubectl apply -f experiments/pods/pod-chaos.yaml
```

**Expected Impact**:
- Pod termination
- Kubernetes automatic pod recreation
- Temporary capacity reduction

**Success Criteria**:
- Pods recreated within 30s
- Zero user-facing errors (load balancer handles failover)
- No cascading failures

### 3. Resource Stress

#### CPU Stress
**Purpose**: Test behavior under CPU contention

```bash
kubectl apply -f experiments/stress/stress-chaos.yaml
```

**Expected Impact**:
- Increased CPU usage (80% load)
- Request queuing
- HPA scaling triggers

**Success Criteria**:
- Horizontal Pod Autoscaler scales up
- Latency increases but remains < 5s
- No pod evictions

### 4. Database Chaos

#### Connection Pool Exhaustion
**Purpose**: Validate graceful degradation when DB connections exhausted

```bash
kubectl apply -f application/database-chaos.yaml
```

**Expected Impact**:
- Connection pool saturation
- Connection timeouts
- Queue buildup

**Success Criteria**:
- Circuit breaker prevents cascade
- Graceful error messages
- Automatic recovery

### 5. Cache Chaos

#### Redis Failover
**Purpose**: Test cache layer resilience

```bash
kubectl apply -f application/cache-chaos.yaml
```

**Expected Impact**:
- Redis master failure
- Sentinel promotes new master
- Temporary cache unavailability

**Success Criteria**:
- Failover within 30s
- Application falls back to database
- Zero data loss

### 6. Comprehensive Workflow

#### Full System Chaos Test
**Purpose**: Orchestrated chaos testing across all components

```bash
argo submit litmus/workflows/comprehensive-chaos-workflow.yaml \
  -n chaos-testing \
  --parameter chaos-duration=300 \
  --parameter blast-radius=30 \
  --parameter environment=staging \
  --watch
```

**What It Does**:
1. Pre-chaos SLO validation
2. Network chaos (5 min)
3. Pod chaos (5 min)
4. Resource stress (5 min)
5. Application-level chaos (5 min)
6. Post-chaos validation
7. Report generation

## Safety Mechanisms

### Blast Radius Control
All experiments include percentage-based targeting to limit impact:

```yaml
spec:
  mode: fixed-percent
  value: "30"  # Only affect 30% of pods
```

### Abort Conditions
Automatic experiment termination if SLOs violated:

```yaml
# In Prometheus rules
- alert: ChaosErrorRateHigh
  expr: error_rate > 0.05  # Abort if error rate > 5%
  for: 2m
```

### Environment Isolation
Experiments are namespace-scoped with labels:

```yaml
spec:
  selector:
    namespaces:
      - llm-marketplace
    labelSelectors:
      chaos-ready: "true"  # Only target explicitly marked pods
```

## Monitoring & Observability

### Grafana Dashboards

Access the Chaos Engineering dashboard:
```
http://grafana.monitoring.svc.cluster.local/d/chaos-engineering
```

**Panels**:
- Active Chaos Experiments
- Blast Radius Gauge
- SLO Compliance (Error Rate, Latency)
- Pod Availability Timeline
- Database Connection Pool
- Cache Hit Rate
- Recovery Time Tracking

### Prometheus Alerts

Key alerts configured in `monitoring/prometheus-chaos-rules.yaml`:

- `ChaosExperimentActive`: Info alert when chaos is running
- `ChaosErrorRateHigh`: Critical if error rate > 5% during chaos
- `ChaosLatencyHigh`: Warning if P95 > 2s
- `ChaosRecoveryStalled`: Critical if system doesn't recover within 5 min

### Metrics Collection

**Pre-Chaos Baseline**:
```bash
./scripts/validate-slo.sh pre-chaos --export baseline.json
```

**During Chaos**:
```bash
# Watch error rate
watch -n 5 'curl -s http://prometheus:9090/api/v1/query?query=chaos:slo:error_rate:1m'

# Watch latency
watch -n 5 'curl -s http://prometheus:9090/api/v1/query?query=chaos:slo:latency:p95:1m'
```

**Post-Chaos Analysis**:
```bash
./scripts/validate-slo.sh post-chaos --export final.json

# Compare metrics
diff baseline.json final.json
```

## CI/CD Integration

### GitHub Actions Workflow

Automated chaos testing on every merge to staging:

```yaml
# .github/workflows/chaos.yaml
on:
  pull_request:
    branches: [staging]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
```

**Workflow Steps**:
1. Pre-chaos validation
2. Run chaos experiments
3. Monitor system during chaos
4. Post-chaos validation
5. Generate report
6. Notify team (Slack/email)

### Manual Trigger

Run chaos tests manually:
```bash
gh workflow run chaos.yaml \
  --field environment=staging \
  --field scenario=comprehensive \
  --field duration=300
```

## Operational Playbooks

See [`playbooks/RUNBOOK.md`](playbooks/RUNBOOK.md) for detailed operational procedures:

- **Pre-Chaos Checklist**: What to verify before running chaos
- **Chaos Scenarios**: Step-by-step execution guides
- **Incident Response**: What to do when things go wrong
- **Emergency Abort**: How to immediately stop all chaos
- **Post-Chaos Analysis**: Report template and analysis guide
- **Rollback Procedures**: Service-specific recovery steps

## Best Practices

### 1. Start Small
```bash
# Begin with low blast radius in dev
kubectl apply -f experiments/network/network-latency.yaml
# mode: one (single pod)
# blast-radius: 10%
```

### 2. Gradual Progression

**Graduation Path**:
1. **Dev**: Single pod, 5 min duration
2. **Staging**: 30% pods, 10 min duration, daily automated
3. **Pre-Prod**: 50% pods, 15 min duration, weekly
4. **Production**: 20% pods, 5 min duration, monthly during maintenance windows

### 3. Always Have Rollback Plan

Before any chaos test:
- [ ] Document current state
- [ ] Export baseline metrics
- [ ] Prepare emergency abort script
- [ ] Have on-call engineer available
- [ ] Test rollback procedure

### 4. Label Pods for Chaos
```yaml
# Explicitly mark pods as chaos-ready
metadata:
  labels:
    chaos-ready: "true"
```

### 5. Monitor Continuously
- Grafana dashboard open during chaos
- Prometheus alerts configured
- Slack notifications enabled
- On-call engineer monitoring

## Troubleshooting

### Chaos Experiment Stuck

**Symptoms**: Experiment doesn't complete after duration

**Solution**:
```bash
# Check experiment status
kubectl get podchaos,networkchaos,stresschaos -n chaos-testing

# Delete stuck experiment
kubectl delete podchaos <name> -n chaos-testing --force --grace-period=0

# Verify cleanup
kubectl get chaosengine -n chaos-testing
```

### System Not Recovering

**Symptoms**: Error rate remains high 5+ minutes after chaos ends

**Solution**:
```bash
# Execute emergency recovery
./playbooks/emergency-abort.sh

# Check pod status
kubectl get pods -n llm-marketplace | grep -v Running

# Restart unhealthy services
kubectl rollout restart deployment/graphql-gateway -n llm-marketplace

# Validate recovery
./scripts/validate-slo.sh emergency
```

### Metrics Not Available

**Symptoms**: Prometheus queries return no data

**Solution**:
```bash
# Verify Prometheus is running
kubectl get pods -n monitoring -l app=prometheus

# Check ServiceMonitor
kubectl get servicemonitor -n monitoring

# Verify metrics endpoint
kubectl port-forward -n monitoring prometheus-0 9090:9090
curl http://localhost:9090/api/v1/targets
```

## Configuration

### Customize Blast Radius
Edit experiment YAML:
```yaml
spec:
  mode: fixed-percent
  value: "20"  # Reduce to 20% for production
```

### Adjust Duration
```yaml
spec:
  duration: "180s"  # Reduce to 3 minutes
```

### Change Target Selector
```yaml
spec:
  selector:
    namespaces:
      - llm-marketplace
    labelSelectors:
      app: graphql-gateway
      tier: backend
      version: v2  # Only target specific version
```

## Compliance & Governance

### Audit Trail
All chaos experiments are logged:
```bash
# View chaos history
kubectl get chaosresult -n chaos-testing --sort-by=.metadata.creationTimestamp

# Export for compliance
kubectl get chaosresult -n chaos-testing -o json > chaos-audit-$(date +%Y%m%d).json
```

### Approval Workflow
Production chaos requires approval:
```yaml
# In GitHub Actions
environment:
  name: production-chaos
  approval_required: true
```

### Notification Requirements
```yaml
# Teams notified 24h before production chaos
notification:
  - engineering-team
  - sre-team
  - product-owner
  - compliance-team
```

## Performance Metrics

### RTO (Recovery Time Objective)
**Target**: System recovers within 5 minutes after chaos ends

**Measurement**:
```bash
# Recorded automatically in chaos:recovery:duration_seconds metric
curl -s "http://prometheus:9090/api/v1/query?query=chaos:recovery:duration_seconds"
```

### RPO (Recovery Point Objective)
**Target**: Zero data loss during chaos

**Validation**:
```bash
# Check database consistency
kubectl exec -n llm-marketplace postgres-0 -- \
  psql -U postgres -c "SELECT pg_stat_replication_lag();"
```

### MTTR (Mean Time To Recovery)
**Target**: < 2 minutes

**Measurement**: Tracked per experiment type in Grafana

## Resources

- **Documentation**: [DESIGN.md](DESIGN.md) - Comprehensive architecture
- **Runbooks**: [playbooks/RUNBOOK.md](playbooks/RUNBOOK.md) - Operational procedures
- **Chaos Mesh Docs**: https://chaos-mesh.org/docs/
- **Litmus Docs**: https://docs.litmuschaos.io/
- **Principles of Chaos**: https://principlesofchaos.org/

## Contributing

### Adding New Chaos Experiments

1. Create experiment YAML in appropriate category
2. Add success criteria to DESIGN.md
3. Update RUNBOOK.md with execution steps
4. Test in dev environment
5. Add to CI/CD workflow
6. Document in this README

### Reporting Issues

Open an issue with:
- Experiment name and configuration
- Environment (dev/staging/prod)
- Expected vs actual behavior
- Logs and metrics snapshots
- Grafana dashboard screenshots

## Support

- **On-Call SRE**: [PagerDuty escalation policy]
- **Slack Channel**: #chaos-engineering
- **Weekly Office Hours**: Thursdays 2-3 PM UTC
- **Documentation**: https://docs.llm-marketplace.io/chaos

---

## License

This chaos engineering suite is part of the LLM Marketplace platform.

**Version**: 1.0.0
**Last Updated**: 2024-01-19
**Maintained by**: Platform Engineering Team
