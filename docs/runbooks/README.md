# Operational Runbooks - LLM-Marketplace Platform

**Version:** 1.0.0
**Last Updated:** 2025-11-19
**Status:** ✅ Production Ready
**Owner:** DevOps & SRE Team

---

## 📋 Overview

This directory contains comprehensive operational runbooks for incident response and troubleshooting of the LLM-Marketplace platform. These runbooks provide step-by-step procedures for diagnosing and resolving common production incidents.

### Purpose

- **Rapid Incident Response**: Quick access to proven solutions
- **Consistent Procedures**: Standardized response across team
- **Knowledge Sharing**: Capture tribal knowledge
- **Training Resource**: Onboard new engineers
- **Continuous Improvement**: Living documents updated after each incident

### Scope

These runbooks cover:
- **Services**: Publishing, Discovery, Consumption, Admin, Policy Engine
- **Infrastructure**: Kubernetes, PostgreSQL, Redis, Elasticsearch, Kafka
- **Incident Types**: Availability, Performance, Security, Data Integrity
- **Severity Levels**: P0 (Critical) through P3 (Low)

---

## 🚀 Quick Start

### For On-Call Engineers

**Got Paged?** Start here: [On-Call Quick Reference Guide](./quick-reference/ON_CALL_GUIDE.md)

### Most Common Incidents

1. **Service Down**: [RB-001: Service Completely Down](./incidents/RB-001-SERVICE-DOWN.md)
2. **High Errors**: [RB-002: Service Degraded / High Error Rate](./incidents/RB-002-SERVICE-DEGRADED.md)
3. **Slow Performance**: [RB-003: High API Latency](./incidents/RB-003-HIGH-LATENCY.md)
4. **Database Issues**: [RB-005: Database Connection Failures](./incidents/RB-005-DATABASE-CONNECTION.md)
5. **Memory Problems**: [RB-010: Memory Leak / OOM Kills](./incidents/RB-010-MEMORY-LEAK.md)

### Incident Response Framework

**Start here** for incident response process: [Incident Response Framework](./INCIDENT_RESPONSE_FRAMEWORK.md)

---

## 📚 Runbook Directory

### Core Framework

| Document | Description | When to Use |
|----------|-------------|-------------|
| [Incident Response Framework](./INCIDENT_RESPONSE_FRAMEWORK.md) | Overall incident management process | Read first, reference during all incidents |

---

### Incident Runbooks

#### Service Availability (P0-P1)

| ID | Title | Severity | Description |
|----|-------|----------|-------------|
| [RB-001](./incidents/RB-001-SERVICE-DOWN.md) | Service Completely Down | P0 | Complete service outage, all pods failing |
| [RB-002](./incidents/RB-002-SERVICE-DEGRADED.md) | Service Degraded / High Error Rate | P1 | Elevated error rates (>5%), partial functionality |

#### Performance Issues (P1-P2)

| ID | Title | Severity | Description |
|----|-------|----------|-------------|
| [RB-003](./incidents/RB-003-HIGH-LATENCY.md) | High API Latency | P1-P2 | Slow response times, P95 > 2s |

#### Database Issues (P0-P2)

| ID | Title | Severity | Description |
|----|-------|----------|-------------|
| [RB-005](./incidents/RB-005-DATABASE-CONNECTION.md) | Database Connection Failures | P0-P1 | Cannot connect to database, connection pool exhausted |

#### Security Incidents (P0)

| ID | Title | Severity | Description |
|----|-------|----------|-------------|
| [RB-007](./incidents/RB-007-SECURITY-BREACH.md) | Security Breach / Unauthorized Access | P0 | Security incident, data breach, unauthorized access |

#### Infrastructure & Resource Issues (P1-P2)

| ID | Title | Severity | Description |
|----|-------|----------|-------------|
| [RB-010](./incidents/RB-010-MEMORY-LEAK.md) | Memory Leak / OOM Kills | P1-P2 | Memory usage increasing, OOMKilled pods |
| [RB-012](./incidents/RB-012-CERTIFICATE-EXPIRATION.md) | TLS Certificate Expiration | P0-P1 | SSL/TLS certificates expired or expiring soon |

---

### Templates

| Template | Purpose | When to Use |
|----------|---------|-------------|
| [Incident Report Template](./templates/INCIDENT_REPORT_TEMPLATE.md) | Post-incident review documentation | After every P0/P1 incident, recommended for P2 |
| [Communication Templates](./templates/COMMUNICATION_TEMPLATES.md) | Internal and external incident communications | During all incidents for consistent messaging |

---

### Quick Reference Guides

| Guide | Purpose | Audience |
|-------|---------|----------|
| [On-Call Guide](./quick-reference/ON_CALL_GUIDE.md) | Quick reference for on-call engineers | On-call engineers, new team members |

---

## 🎯 Using This Guide

### Finding the Right Runbook

#### By Symptom

**"Service is down / not responding"**
→ [RB-001: Service Down](./incidents/RB-001-SERVICE-DOWN.md)

**"Service is slow"**
→ [RB-003: High Latency](./incidents/RB-003-HIGH-LATENCY.md)

**"Getting lots of errors"**
→ [RB-002: Service Degraded](./incidents/RB-002-SERVICE-DEGRADED.md)

**"Database connection errors"**
→ [RB-005: Database Connection Failures](./incidents/RB-005-DATABASE-CONNECTION.md)

**"Pods keep restarting / OOMKilled"**
→ [RB-010: Memory Leak](./incidents/RB-010-MEMORY-LEAK.md)

**"Certificate errors / SSL errors"**
→ [RB-012: Certificate Expiration](./incidents/RB-012-CERTIFICATE-EXPIRATION.md)

**"Security alert / suspicious activity"**
→ [RB-007: Security Breach](./incidents/RB-007-SECURITY-BREACH.md)

#### By Alert Name

| Alert | Runbook |
|-------|---------|
| `ServiceDown` | [RB-001](./incidents/RB-001-SERVICE-DOWN.md) |
| `HighErrorRate` | [RB-002](./incidents/RB-002-SERVICE-DEGRADED.md) |
| `HighAPILatency` | [RB-003](./incidents/RB-003-HIGH-LATENCY.md) |
| `DatabaseConnectionFailure` | [RB-005](./incidents/RB-005-DATABASE-CONNECTION.md) |
| `PodMemoryHigh` / `OOMKilled` | [RB-010](./incidents/RB-010-MEMORY-LEAK.md) |
| `CertificateExpiringSoon` | [RB-012](./incidents/RB-012-CERTIFICATE-EXPIRATION.md) |

---

## 🔧 Tools and Access

### Required Access

All on-call engineers must have:

- **Kubernetes**: `kubectl` configured for production cluster
- **Databases**: Read access to PostgreSQL, ability to execute queries
- **Monitoring**: Access to Grafana, Prometheus, Kibana, Jaeger
- **Logging**: Elasticsearch/Kibana access
- **Incident Management**: PagerDuty admin access
- **Communication**: Slack access to #incidents, #on-call channels
- **Code Repository**: GitHub access to all repos
- **Cloud**: AWS console access (PowerUser or higher)

### Monitoring & Observability

**Metrics & Dashboards**:
- **Grafana**: http://grafana.llm-marketplace.internal:3000
- **Prometheus**: http://prometheus.llm-marketplace.internal:9090

**Logs**:
- **Kibana**: http://kibana.llm-marketplace.internal:5601
- **Elasticsearch**: http://elasticsearch.llm-marketplace.internal:9200

**Tracing**:
- **Jaeger**: http://jaeger.llm-marketplace.internal:16686

**Alerts**:
- **PagerDuty**: https://llm-marketplace.pagerduty.com

---

## 📞 Escalation & Contacts

### Escalation Ladder

**Tier 1**: On-Call Engineer (< 5 minutes)
**Tier 2**: Service SME / Team Lead (< 15 minutes for P0/P1)
**Tier 3**: Engineering Manager (< 30 minutes for P0)
**Tier 4**: VP Engineering / CTO (< 1 hour for P0)

### Contact List

```
TIER 1: On-Call
Primary: PagerDuty rotation
Backup: #on-call Slack channel

TIER 2: Service Owners
Publishing: john.doe@company.com | +1-555-0101
Discovery: jane.smith@company.com | +1-555-0102
Consumption: bob.jones@company.com | +1-555-0103
Admin: alice.wang@company.com | +1-555-0104

TIER 3: Leadership
Engineering Manager: manager@company.com | +1-555-0201
Database Lead: dba@company.com | +1-555-0202
Security Lead: security@company.com | +1-555-0203

TIER 4: Executives
VP Engineering: vp.eng@company.com | +1-555-0301
CTO: cto@company.com | +1-555-0302
```

---

## 📊 Response Time SLAs

| Severity | Detection | Acknowledgment | Updates | Resolution Target |
|----------|-----------|----------------|---------|-------------------|
| P0 | < 5 min | < 5 min | Every 15 min | < 1 hour |
| P1 | < 10 min | < 15 min | Every 30 min | < 4 hours |
| P2 | < 30 min | < 1 hour | Every 2 hours | < 24 hours |
| P3 | < 2 hours | < 4 hours | Daily | < 1 week |

---

## 🎓 Best Practices

### During Incidents

1. **Stay Calm**: Panic doesn't help, focus on process
2. **Follow Runbooks**: Don't improvise unless necessary
3. **Communicate Often**: Over-communication is better than silence
4. **Document Everything**: Timeline crucial for PIR
5. **Escalate Early**: Don't struggle alone
6. **Verify Fixes**: Always confirm resolution before closing
7. **Monitor Stability**: Watch for 30-60 minutes post-fix

### After Incidents

1. **Always Do PIR**: Every P0/P1, recommended for P2
2. **No Blame Culture**: Focus on system improvements
3. **Update Runbooks**: Fill gaps discovered during incident
4. **Share Learnings**: Present at team meetings
5. **Track Action Items**: Ensure improvements happen
6. **Thank Responders**: Acknowledge good incident response

---

## 🔄 Maintenance & Updates

All runbooks are version controlled in Git and updated:
- Within 48 hours of incident if runbook gaps found
- Quarterly review of all runbooks
- After significant system changes

**To Contribute**:
1. Create branch: `runbook/RB-XXX-update-description`
2. Make changes with updated date
3. Create PR with review from runbook owner
4. Update this index if adding new runbook

---

## 🆘 Help & Support

### Questions About Runbooks
- **Slack**: #devops-process
- **Email**: devops@company.com

### On-Call Support
- **During Incident**: #on-call channel
- **Escalation**: Use PagerDuty to page appropriate SME

---

**Document Owner**: DevOps Team (devops@company.com)
**Last Review**: 2024-11-19
**Next Review**: 2024-12-19 (monthly review)
**Status**: ✅ Active
