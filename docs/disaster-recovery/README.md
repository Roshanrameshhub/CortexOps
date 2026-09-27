# Disaster Recovery Documentation

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2024-11-19
**Owner:** SRE & DevOps Team

---

## 📋 Overview

This directory contains comprehensive disaster recovery (DR) documentation, procedures, scripts, and automation for the LLM-Marketplace platform. The DR system is designed to ensure business continuity with **RTO < 4 hours** and **RPO < 15 minutes**.

### Quick Links

- 🚨 **In an Emergency:** See [DISASTER_RECOVERY_PLAN.md](./DISASTER_RECOVERY_PLAN.md#emergency-procedures)
- 📖 **New to DR:** Start with [DR Training Materials](./training/DR_TRAINING.md)
- 🔄 **Execute Failover:** See [FAILOVER_PROCEDURES.md](./procedures/FAILOVER_PROCEDURES.md)
- ✅ **Run DR Tests:** See [DR_TESTING_SCHEDULE.md](./tests/DR_TESTING_SCHEDULE.md)
- 📊 **Monitor DR Health:** See [DR_MONITORING_ALERTING.md](./monitoring/DR_MONITORING_ALERTING.md)

---

## 📁 Directory Structure

```
docs/disaster-recovery/
├── DISASTER_RECOVERY_PLAN.md         # Master DR plan and strategy
├── README.md                          # This file
│
├── procedures/                        # DR procedures and runbooks
│   ├── FAILOVER_PROCEDURES.md        # Step-by-step failover procedures
│   └── RTO_RPO_VALIDATION.md         # RTO/RPO testing framework
│
├── scripts/                           # Automation scripts
│   ├── backup-database.sh            # PostgreSQL backup automation
│   ├── backup-elasticsearch.sh       # Elasticsearch snapshot automation
│   ├── restore-database.sh           # Database restore automation
│   ├── restore-elasticsearch.sh      # Elasticsearch restore automation
│   └── verify-backups.sh             # Backup verification script
│
├── tests/                             # DR testing framework
│   ├── DR_TESTING_SCHEDULE.md        # Test schedule and checklists
│   └── run-dr-tests.sh               # Automated test execution
│
├── monitoring/                        # Monitoring and alerting
│   ├── DR_MONITORING_ALERTING.md     # Monitoring strategy and alerts
│   ├── publish-backup-metrics.sh     # CloudWatch metrics publisher
│   └── check-dr-environment.sh       # DR health check script
│
└── training/                          # Training materials
    └── DR_TRAINING.md                # Comprehensive DR training guide
```

---

## 🎯 DR Objectives

### Recovery Targets

| Component | RTO | RPO | Current Status |
|-----------|-----|-----|----------------|
| PostgreSQL (Multi-AZ) | 2 min | 0 | ✅ Meeting target |
| PostgreSQL (Cross-Region) | 15 min | 5 min | ✅ Meeting target |
| Elasticsearch | 30 min | 1 hour | ✅ Meeting target |
| Application Services | 5 min | 0 | ✅ Meeting target |
| **Full Platform** | **4 hours** | **15 min** | **✅ Meeting target** |

### Business Impact

- **RTO < 4 hours:** Ensures minimal revenue loss and customer impact
- **RPO < 15 minutes:** Acceptable data loss for most workflows
- **Automated Backups:** Daily automated backups with 90-day retention
- **Multi-Region:** Active-passive setup with us-east-1 primary, us-west-2 DR

---

## 🚀 Quick Start Guide

### For New Team Members

1. **Read the DR Plan** (30 minutes)
   - [DISASTER_RECOVERY_PLAN.md](./DISASTER_RECOVERY_PLAN.md)
   - Understand disaster scenarios and recovery strategies

2. **Review Failover Procedures** (45 minutes)
   - [FAILOVER_PROCEDURES.md](./procedures/FAILOVER_PROCEDURES.md)
   - Familiarize with step-by-step procedures

3. **Complete DR Training** (2 hours)
   - [DR_TRAINING.md](./training/DR_TRAINING.md)
   - Hands-on exercises and knowledge checks

4. **Participate in Monthly Test** (1 hour)
   - Observe or assist in monthly component test
   - See [DR_TESTING_SCHEDULE.md](./tests/DR_TESTING_SCHEDULE.md)

### For On-Call Engineers

**Essential Reading:**

- ✅ [DISASTER_RECOVERY_PLAN.md](./DISASTER_RECOVERY_PLAN.md) - Overview
- ✅ [FAILOVER_PROCEDURES.md](./procedures/FAILOVER_PROCEDURES.md) - Procedures
- ✅ [Emergency Contacts](./DISASTER_RECOVERY_PLAN.md#emergency-contacts)

**Quick Reference:**

```bash
# Check DR environment health
/docs/disaster-recovery/monitoring/check-dr-environment.sh

# Verify backups are current
/docs/disaster-recovery/scripts/verify-backups.sh

# Run database failover test
/docs/disaster-recovery/tests/run-dr-tests.sh --test-type database

# Execute cross-region failover
/docs/disaster-recovery/procedures/FAILOVER_PROCEDURES.md#cr-f-001
```

---

## 📖 Key Documents

### 1. Master DR Plan

**[DISASTER_RECOVERY_PLAN.md](./DISASTER_RECOVERY_PLAN.md)**

The master disaster recovery plan covering:
- Executive summary and scope
- Disaster scenarios and probabilities
- Recovery objectives (RTO/RPO)
- System architecture and components
- Backup and recovery strategies
- Communication plans
- Emergency procedures

**When to Use:**
- Understanding overall DR strategy
- Executive briefings
- Compliance and audit

---

### 2. Failover Procedures

**[FAILOVER_PROCEDURES.md](./procedures/FAILOVER_PROCEDURES.md)**

Step-by-step procedures for all failover scenarios:
- Database Multi-AZ failover (automatic)
- Database cross-region failover (manual)
- Application failover to DR cluster
- Full platform cross-region failover
- Rollback procedures

**When to Use:**
- During actual disaster events
- DR testing and drills
- Runbook updates

---

### 3. RTO/RPO Validation

**[RTO_RPO_VALIDATION.md](./procedures/RTO_RPO_VALIDATION.md)**

Framework for validating recovery objectives:
- Test scenarios and procedures
- Measurement methodology
- Success criteria
- Compliance requirements

**When to Use:**
- Monthly/quarterly testing
- Compliance audits
- Performance tracking

---

### 4. Testing Schedule

**[DR_TESTING_SCHEDULE.md](./tests/DR_TESTING_SCHEDULE.md)**

Complete testing calendar and procedures:
- Monthly component tests
- Quarterly integration tests
- Semi-annual full DR tests
- Annual surprise drill
- Pre/post-test checklists

**When to Use:**
- Planning DR tests
- Executing scheduled tests
- Tracking test compliance

---

### 5. Monitoring & Alerting

**[DR_MONITORING_ALERTING.md](./monitoring/DR_MONITORING_ALERTING.md)**

DR monitoring strategy and alerts:
- CloudWatch alarms
- Custom metrics
- PagerDuty integration
- Slack notifications
- Dashboard configurations

**When to Use:**
- Setting up monitoring
- Responding to alerts
- Dashboard reviews

---

## 🛠️ Common Procedures

### Execute Database Failover

```bash
# 1. Check current database status
aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --query 'DBInstances[0].{Status:DBInstanceStatus,AZ:AvailabilityZone}'

# 2. Force Multi-AZ failover (automatic)
aws rds reboot-db-instance \
    --db-instance-identifier llm-marketplace-db \
    --force-failover

# 3. Monitor failover progress
watch -n 5 'aws rds describe-db-instances \
    --db-instance-identifier llm-marketplace-db \
    --query "DBInstances[0].DBInstanceStatus"'

# 4. Verify application connectivity
kubectl exec -n llm-marketplace \
    $(kubectl get pod -n llm-marketplace -l app=publishing-service -o jsonpath='{.items[0].metadata.name}') \
    -- wget -q -O- http://localhost:3001/health
```

**Detailed procedure:** [FAILOVER_PROCEDURES.md#db-f-001](./procedures/FAILOVER_PROCEDURES.md#db-f-001-rds-multi-az-automatic-failover)

---

### Run Backup Verification

```bash
# Verify all backups
/docs/disaster-recovery/scripts/verify-backups.sh

# Verify specific component
/docs/disaster-recovery/scripts/verify-backups.sh --component postgresql

# View verification report
cat /var/log/backup-verification.log
```

**Detailed procedure:** [Backup Scripts](./scripts/)

---

### Execute Monthly DR Test

```bash
# 1. Review test plan
cat /docs/disaster-recovery/tests/DR_TESTING_SCHEDULE.md

# 2. Run automated test suite
/docs/disaster-recovery/tests/run-dr-tests.sh --test-type database

# 3. Review test results
cat /var/log/dr-tests/dr-test-*.json | jq .

# 4. Update metrics dashboard
# (metrics automatically published to CloudWatch)
```

**Detailed procedure:** [DR_TESTING_SCHEDULE.md](./tests/DR_TESTING_SCHEDULE.md)

---

## 🔐 Access Requirements

### AWS Permissions

Required IAM permissions for DR operations:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds:DescribeDBInstances",
        "rds:RebootDBInstance",
        "rds:PromoteReadReplica",
        "rds:DescribeDBSnapshots",
        "rds:RestoreDBInstanceFromDBSnapshot"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::llm-marketplace-backups-*",
        "arn:aws:s3:::llm-marketplace-backups-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "route53:ChangeResourceRecordSets",
        "route53:GetHostedZone"
      ],
      "Resource": "*"
    }
  ]
}
```

### Kubernetes Access

```bash
# Configure access to primary cluster
aws eks update-kubeconfig \
    --region us-east-1 \
    --name llm-marketplace \
    --alias primary-cluster

# Configure access to DR cluster
aws eks update-kubeconfig \
    --region us-west-2 \
    --name llm-marketplace-dr \
    --alias dr-cluster
```

### Required Tools

```bash
# Install required CLI tools
brew install awscli kubectl jq

# Install PostgreSQL client
brew install postgresql

# Verify installations
aws --version       # AWS CLI v2.x
kubectl version     # v1.28+
jq --version        # jq-1.6+
psql --version      # PostgreSQL 14+
```

---

## 📊 Metrics and Reporting

### Key Metrics Tracked

- **Backup Success Rate:** % of successful backups
- **Replication Lag:** Current cross-region lag (seconds)
- **RTO Actual:** Actual recovery time in tests/incidents
- **RPO Actual:** Actual data loss in tests/incidents
- **DR Test Compliance:** % of tests executed on schedule
- **DR Environment Health:** % uptime of DR infrastructure

### Dashboards

**CloudWatch Dashboard:** `LLM-Marketplace-DR-Overview`

Access: [AWS Console → CloudWatch → Dashboards](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:)

**Grafana Dashboard:** `DR Metrics`

Access: https://grafana.llm-marketplace.com/d/dr-metrics

---

## 🎓 Training and Certification

### Required Training

All SRE team members must complete:

1. **DR Basics** (2 hours)
   - Overview of DR strategy
   - Key procedures
   - Tools and access

2. **Hands-On Failover** (4 hours)
   - Execute test failover
   - Validate procedures
   - Document findings

3. **Incident Commander** (8 hours)
   - Lead DR drills
   - Make critical decisions
   - Coordinate team

### Training Schedule

- **New Hire Onboarding:** Week 2-3
- **Annual Refresher:** January each year
- **Quarterly Drills:** Participate in at least 2/year

See [DR_TRAINING.md](./training/DR_TRAINING.md) for complete training materials.

---

## 📞 Emergency Contacts

### Escalation Path

1. **On-Call Engineer** → First responder (auto-paged)
2. **Incident Commander** → Coordinates response
3. **VP Engineering** → Approval for cross-region failover
4. **CTO** → Final decision authority

### Contact Methods

- **PagerDuty:** Primary alerting system
- **Slack:** #incident-response channel
- **Phone Tree:** Documented in [DISASTER_RECOVERY_PLAN.md](./DISASTER_RECOVERY_PLAN.md#emergency-contacts)

---

## 🔄 Maintenance and Updates

### Document Review Schedule

| Document | Review Frequency | Next Review | Owner |
|----------|------------------|-------------|-------|
| DISASTER_RECOVERY_PLAN.md | Quarterly | 2025-01-19 | SRE Lead |
| FAILOVER_PROCEDURES.md | After each test | 2024-12-19 | SRE Team |
| RTO_RPO_VALIDATION.md | Quarterly | 2025-01-19 | SRE Team |
| DR_TESTING_SCHEDULE.md | Monthly | 2024-12-19 | SRE Team |
| DR_MONITORING_ALERTING.md | Quarterly | 2025-01-19 | SRE Team |

### Update Process

1. **Propose Update:** Create PR with changes
2. **Team Review:** SRE team reviews and approves
3. **Test Changes:** Validate in DR test
4. **Merge and Deploy:** Update documentation
5. **Notify Team:** Announce in #sre channel

---

## 🆘 Getting Help

### Questions or Issues?

- **Slack:** #sre or #disaster-recovery
- **Email:** sre-team@company.com
- **Documentation Issues:** Create GitHub issue
- **Urgent (During Incident):** Page on-call via PagerDuty

### Contributing

We welcome contributions to improve DR documentation:

1. Fork repository
2. Create feature branch
3. Make improvements
4. Test procedures
5. Submit pull request
6. Address review feedback

---

## 📚 Additional Resources

### External Documentation

- [AWS RDS Disaster Recovery](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)
- [Kubernetes Disaster Recovery](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster)
- [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/current/backup.html)

### Internal Resources

- [Architecture Documentation](../architecture/README.md)
- [Runbooks](../runbooks/README.md)
- [Monitoring Guide](../monitoring/README.md)
- [Security Policies](../security/README.md)

---

## ✅ Compliance

### SOC 2 Type II Requirements

- ✅ DR plan documented and reviewed quarterly
- ✅ DR tests executed at least quarterly
- ✅ Test results documented and retained for 3 years
- ✅ Executive review of DR readiness semi-annually

### ISO 27001 Requirements

- ✅ Business impact analysis completed
- ✅ RTO/RPO targets defined and approved
- ✅ DR procedures tested and validated
- ✅ Continuous improvement process established

### GDPR Requirements

- ✅ Data recovery procedures documented
- ✅ Backup encryption implemented
- ✅ Data integrity validation automated
- ✅ Access controls tested quarterly

---

## 📅 Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2024-11-19 | SRE Team | Initial comprehensive DR documentation |
| | | | - Complete DR plan and procedures |
| | | | - Automated backup/restore scripts |
| | | | - Testing framework and schedule |
| | | | - Monitoring and alerting setup |

---

**Document Owner:** SRE Team
**Last Updated:** 2024-11-19
**Next Review:** 2025-01-19
**Status:** ✅ Active

---

**🚨 Remember: In case of actual disaster, stay calm, follow procedures, and escalate early. The DR plan is designed to be executed under pressure!**
