# DR Monitoring and Alerting

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2024-11-19
**Owner:** SRE Team

---

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Strategy](#monitoring-strategy)
3. [CloudWatch Alarms](#cloudwatch-alarms)
4. [Backup Monitoring](#backup-monitoring)
5. [Replication Monitoring](#replication-monitoring)
6. [DR Environment Health](#dr-environment-health)
7. [Alert Definitions](#alert-definitions)
8. [Dashboards](#dashboards)
9. [Runbook Integration](#runbook-integration)

---

## Overview

### Purpose

This document defines the monitoring and alerting strategy for disaster recovery systems. Effective monitoring ensures we detect DR readiness issues before they impact recovery capabilities.

### Monitoring Objectives

1. **Backup Health**: Ensure all backups complete successfully
2. **Replication Lag**: Monitor cross-region replication delays
3. **DR Environment**: Verify DR infrastructure is ready
4. **Test Compliance**: Track DR test execution and results
5. **RTO/RPO Metrics**: Monitor actual vs. target recovery metrics

### Alerting Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│ Alert Severity Matrix                                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ P0 - Critical (PagerDuty + Phone):                          │
│   • All backups failed for > 6 hours                        │
│   • Replication lag > 30 minutes                            │
│   • DR environment completely unavailable                    │
│   • RTO > 2x target in actual incident                      │
│                                                               │
│ P1 - High (PagerDuty):                                      │
│   • Single backup type failed                                │
│   • Replication lag > 15 minutes                            │
│   • DR test failed                                          │
│   • Backup older than 25 hours                              │
│                                                               │
│ P2 - Medium (Slack + Email):                                │
│   • Backup completed with warnings                           │
│   • Replication lag > 5 minutes                             │
│   • DR resource usage > 70%                                 │
│   • Backup size decreased > 20%                             │
│                                                               │
│ P3 - Low (Slack only):                                      │
│   • DR test passed with degraded performance                │
│   • Minor configuration drift detected                       │
│   • Documentation out of date                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Monitoring Strategy

### Multi-Layer Monitoring

**Layer 1: Infrastructure**
- AWS service health
- Resource availability (CPU, memory, disk)
- Network connectivity
- DNS resolution

**Layer 2: Data Layer**
- Backup completion status
- Backup integrity
- Replication lag
- Data consistency

**Layer 3: Application Layer**
- Service health endpoints
- DR environment deployment status
- Configuration drift
- Secrets synchronization

**Layer 4: Process Layer**
- DR test execution
- RTO/RPO compliance
- Runbook updates
- Team training completion

---

## CloudWatch Alarms

### RDS Backup Monitoring

```yaml
# CloudFormation template for RDS backup alarms
AWSTemplateFormatVersion: '2010-09-09'
Description: 'DR Monitoring - RDS Backup Alarms'

Resources:
  # Alarm: No automated backups in 25 hours
  RDSBackupMissingAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: dr-rds-backup-missing
      AlarmDescription: No RDS automated backup in last 25 hours
      MetricName: LatestRestorableTime
      Namespace: AWS/RDS
      Statistic: Maximum
      Period: 3600
      EvaluationPeriods: 25
      Threshold: 0
      ComparisonOperator: LessThanThreshold
      Dimensions:
        - Name: DBInstanceIdentifier
          Value: llm-marketplace-db
      AlarmActions:
        - !Ref DRCriticalSNSTopic
      TreatMissingData: breaching

  # Alarm: High replication lag
  RDSReplicationLagAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: dr-rds-replication-lag-high
      AlarmDescription: RDS cross-region replication lag > 15 minutes
      MetricName: ReplicaLag
      Namespace: AWS/RDS
      Statistic: Maximum
      Period: 300
      EvaluationPeriods: 3
      Threshold: 900  # 15 minutes in seconds
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: DBInstanceIdentifier
          Value: llm-marketplace-db-replica
      AlarmActions:
        - !Ref DRHighPrioritySNSTopic
      TreatMissingData: breaching

  # Alarm: DR database unavailable
  DRDatabaseAvailabilityAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: dr-database-unavailable
      AlarmDescription: DR database is not available
      MetricName: DatabaseConnections
      Namespace: AWS/RDS
      Statistic: SampleCount
      Period: 60
      EvaluationPeriods: 5
      Threshold: 0
      ComparisonOperator: LessThanOrEqualToThreshold
      Dimensions:
        - Name: DBInstanceIdentifier
          Value: llm-marketplace-db-replica
      AlarmActions:
        - !Ref DRCriticalSNSTopic
      TreatMissingData: breaching

  # SNS Topics
  DRCriticalSNSTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: dr-critical-alerts
      DisplayName: DR Critical Alerts
      Subscription:
        - Endpoint: !Ref PagerDutyEndpoint
          Protocol: https
        - Endpoint: sre-team@company.com
          Protocol: email

  DRHighPrioritySNSTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: dr-high-priority-alerts
      DisplayName: DR High Priority Alerts
      Subscription:
        - Endpoint: !Ref PagerDutyEndpoint
          Protocol: https
        - Endpoint: sre-team@company.com
          Protocol: email

Parameters:
  PagerDutyEndpoint:
    Type: String
    Description: PagerDuty integration endpoint URL
```

### S3 Backup Monitoring

```yaml
  # Alarm: S3 backup uploads failing
  S3BackupUploadFailureAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: dr-s3-backup-upload-failures
      AlarmDescription: S3 backup uploads are failing
      MetricName: 4xxErrors
      Namespace: AWS/S3
      Statistic: Sum
      Period: 3600
      EvaluationPeriods: 1
      Threshold: 5
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: BucketName
          Value: llm-marketplace-backups-primary
      AlarmActions:
        - !Ref DRHighPrioritySNSTopic

  # Alarm: Backup bucket size not growing
  S3BackupBucketSizeAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: dr-s3-backup-size-stale
      AlarmDescription: Backup bucket size has not grown in 25 hours
      MetricName: BucketSizeBytes
      Namespace: AWS/S3
      Statistic: Average
      Period: 86400  # 1 day
      EvaluationPeriods: 2
      Threshold: 1
      ComparisonOperator: LessThanThreshold
      Dimensions:
        - Name: BucketName
          Value: llm-marketplace-backups-primary
        - Name: StorageType
          Value: StandardStorage
      AlarmActions:
        - !Ref DRHighPrioritySNSTopic
```

### Elasticsearch Snapshot Monitoring

```yaml
  # Custom metric: Elasticsearch snapshot age
  ElasticsearchSnapshotAgeAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: dr-elasticsearch-snapshot-stale
      AlarmDescription: Latest Elasticsearch snapshot is > 25 hours old
      MetricName: SnapshotAge
      Namespace: LLMMarketplace/DR
      Statistic: Maximum
      Period: 3600
      EvaluationPeriods: 25
      Threshold: 90000  # 25 hours in seconds
      ComparisonOperator: GreaterThanThreshold
      AlarmActions:
        - !Ref DRHighPrioritySNSTopic
      TreatMissingData: breaching

  # Custom metric: Elasticsearch snapshot status
  ElasticsearchSnapshotStatusAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: dr-elasticsearch-snapshot-failed
      AlarmDescription: Elasticsearch snapshot in failed state
      MetricName: SnapshotFailures
      Namespace: LLMMarketplace/DR
      Statistic: Sum
      Period: 3600
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanOrEqualToThreshold
      AlarmActions:
        - !Ref DRCriticalSNSTopic
```

---

## Backup Monitoring

### Custom Metrics Script

Create `/docs/disaster-recovery/monitoring/publish-backup-metrics.sh`:

```bash
#!/bin/bash

##############################################################################
# Publish Backup Metrics to CloudWatch
#
# Purpose: Publish custom backup health metrics to CloudWatch
# Schedule: Run every 5 minutes via cron
##############################################################################

set -euo pipefail

NAMESPACE="LLMMarketplace/DR"
REGION="${AWS_REGION:-us-east-1}"

# Function to publish metric
publish_metric() {
    local metric_name="$1"
    local value="$2"
    local unit="${3:-None}"

    aws cloudwatch put-metric-data \
        --namespace "$NAMESPACE" \
        --metric-name "$metric_name" \
        --value "$value" \
        --unit "$unit" \
        --region "$REGION"
}

# Check PostgreSQL backup age
check_postgres_backup_age() {
    local s3_bucket="${S3_BUCKET:-llm-marketplace-backups-primary}"
    local s3_path="${S3_PATH:-database/postgres}"

    # Get latest backup timestamp
    local latest_backup=$(aws s3 ls "s3://$s3_bucket/$s3_path/" --recursive | \
        grep "postgres-backup-" | \
        sort | \
        tail -1 | \
        awk '{print $1" "$2}')

    if [[ -n "$latest_backup" ]]; then
        local backup_timestamp=$(date -d "$latest_backup" +%s)
        local current_timestamp=$(date +%s)
        local age_seconds=$((current_timestamp - backup_timestamp))

        publish_metric "PostgreSQLBackupAge" "$age_seconds" "Seconds"

        # Check if backup exists (binary metric)
        if [[ $age_seconds -lt 90000 ]]; then  # < 25 hours
            publish_metric "PostgreSQLBackupExists" "1" "Count"
        else
            publish_metric "PostgreSQLBackupExists" "0" "Count"
        fi
    else
        publish_metric "PostgreSQLBackupExists" "0" "Count"
    fi
}

# Check Elasticsearch snapshot age
check_elasticsearch_snapshot_age() {
    local es_host="${ES_HOST:-elasticsearch.llm-marketplace.svc.cluster.local}"
    local repo="${SNAPSHOT_REPOSITORY:-s3_backup}"

    # Get latest snapshot
    local snapshot_info=$(curl -sf "http://$es_host:9200/_snapshot/$repo/_all" 2>/dev/null || echo "{}")

    if [[ "$snapshot_info" != "{}" ]]; then
        local latest_time=$(echo "$snapshot_info" | \
            jq -r '.snapshots | sort_by(.start_time_in_millis) | last | .start_time_in_millis')

        local snapshot_state=$(echo "$snapshot_info" | \
            jq -r '.snapshots | sort_by(.start_time_in_millis) | last | .state')

        if [[ -n "$latest_time" ]] && [[ "$latest_time" != "null" ]]; then
            local current_time=$(($(date +%s) * 1000))
            local age_ms=$((current_time - latest_time))
            local age_seconds=$((age_ms / 1000))

            publish_metric "SnapshotAge" "$age_seconds" "Seconds"

            # Snapshot status
            if [[ "$snapshot_state" == "SUCCESS" ]]; then
                publish_metric "SnapshotFailures" "0" "Count"
            else
                publish_metric "SnapshotFailures" "1" "Count"
            fi
        fi
    fi
}

# Check RDS replication lag
check_rds_replication_lag() {
    local replica_instance="${DB_REPLICA_INSTANCE:-llm-marketplace-db-replica}"
    local dr_region="${DR_REGION:-us-west-2}"

    # Get replication lag from RDS API
    local lag=$(aws rds describe-db-instances \
        --db-instance-identifier "$replica_instance" \
        --region "$dr_region" \
        --query 'DBInstances[0].StatusInfos[?StatusType==`read replication`].Status' \
        --output text | grep -oP '\d+' || echo "0")

    publish_metric "ReplicationLagSeconds" "$lag" "Seconds"

    # Check if lag is acceptable
    if [[ $lag -lt 300 ]]; then  # < 5 minutes
        publish_metric "ReplicationHealthy" "1" "Count"
    else
        publish_metric "ReplicationHealthy" "0" "Count"
    fi
}

# Check DR environment health
check_dr_environment_health() {
    local dr_region="${DR_REGION:-us-west-2}"
    local dr_context="${DR_KUBE_CONTEXT:-dr-cluster}"

    # Check EKS cluster
    if kubectl --context="$dr_context" get nodes > /dev/null 2>&1; then
        publish_metric "DRClusterHealthy" "1" "Count"

        # Count ready nodes
        local ready_nodes=$(kubectl --context="$dr_context" get nodes | grep -c "Ready" || echo "0")
        publish_metric "DRClusterReadyNodes" "$ready_nodes" "Count"
    else
        publish_metric "DRClusterHealthy" "0" "Count"
        publish_metric "DRClusterReadyNodes" "0" "Count"
    fi

    # Check DR database
    local replica_instance="${DB_REPLICA_INSTANCE:-llm-marketplace-db-replica}"
    local db_status=$(aws rds describe-db-instances \
        --db-instance-identifier "$replica_instance" \
        --region "$dr_region" \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text 2>/dev/null || echo "unavailable")

    if [[ "$db_status" == "available" ]]; then
        publish_metric "DRDatabaseHealthy" "1" "Count"
    else
        publish_metric "DRDatabaseHealthy" "0" "Count"
    fi
}

# Check DR test compliance
check_dr_test_compliance() {
    local test_results_dir="/var/log/dr-tests"
    local last_test_file="$test_results_dir/.last_test_timestamp"

    if [[ -f "$last_test_file" ]]; then
        local last_test_time=$(cat "$last_test_file")
        local current_time=$(date +%s)
        local days_since_test=$(( (current_time - last_test_time) / 86400 ))

        publish_metric "DaysSinceLastDRTest" "$days_since_test" "Count"

        # Check if monthly test is overdue (> 35 days)
        if [[ $days_since_test -lt 35 ]]; then
            publish_metric "DRTestCompliant" "1" "Count"
        else
            publish_metric "DRTestCompliant" "0" "Count"
        fi
    else
        publish_metric "DRTestCompliant" "0" "Count"
    fi
}

# Main execution
main() {
    echo "Publishing DR metrics to CloudWatch..."

    check_postgres_backup_age
    check_elasticsearch_snapshot_age
    check_rds_replication_lag
    check_dr_environment_health
    check_dr_test_compliance

    echo "Metrics published successfully"
}

main "$@"
```

### Cron Schedule

```cron
# /etc/cron.d/dr-monitoring

# Publish DR metrics every 5 minutes
*/5 * * * * /docs/disaster-recovery/monitoring/publish-backup-metrics.sh >> /var/log/dr-metrics.log 2>&1

# Daily backup verification (3 AM)
0 3 * * * /docs/disaster-recovery/scripts/verify-backups.sh >> /var/log/dr-backup-verification.log 2>&1

# Weekly DR environment health check (Sunday 2 AM)
0 2 * * 0 /docs/disaster-recovery/monitoring/check-dr-environment.sh >> /var/log/dr-environment-check.log 2>&1
```

---

## Replication Monitoring

### Database Replication Dashboard

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "AWS/RDS", "ReplicaLag", { "stat": "Maximum", "label": "Max Lag" } ],
          [ "...", { "stat": "Average", "label": "Avg Lag" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "RDS Cross-Region Replication Lag",
        "period": 300,
        "yAxis": {
          "left": {
            "label": "Seconds",
            "showUnits": false
          }
        },
        "annotations": {
          "horizontal": [
            {
              "label": "Warning (5 min)",
              "value": 300
            },
            {
              "label": "Critical (15 min)",
              "value": 900
            }
          ]
        }
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "LLMMarketplace/DR", "ReplicationLagSeconds", { "stat": "Maximum" } ]
        ],
        "view": "singleValue",
        "region": "us-east-1",
        "title": "Current Replication Lag",
        "period": 300
      }
    }
  ]
}
```

---

## DR Environment Health

### Environment Health Check Script

Create `/docs/disaster-recovery/monitoring/check-dr-environment.sh`:

```bash
#!/bin/bash

##############################################################################
# DR Environment Health Check
#
# Purpose: Comprehensive health check of DR environment
# Schedule: Run weekly
##############################################################################

set -euo pipefail

LOG_FILE="/var/log/dr-environment-check.log"
REPORT_FILE="/tmp/dr-health-$(date +%Y%m%d-%H%M%S).json"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Initialize report
cat > "$REPORT_FILE" <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "checks": {}
}
EOF

# Function to add check result
add_check_result() {
    local check_name="$1"
    local status="$2"
    local details="$3"

    local temp=$(mktemp)
    jq ".checks.\"$check_name\" = {
        \"status\": \"$status\",
        \"details\": \"$details\"
    }" "$REPORT_FILE" > "$temp"
    mv "$temp" "$REPORT_FILE"
}

# Check DR EKS cluster
check_dr_cluster() {
    log "Checking DR EKS cluster..."

    if kubectl --context=dr-cluster get nodes > /dev/null 2>&1; then
        local node_count=$(kubectl --context=dr-cluster get nodes | grep -c "Ready")
        add_check_result "dr_cluster" "PASS" "$node_count nodes ready"
        return 0
    else
        add_check_result "dr_cluster" "FAIL" "Cluster unreachable"
        return 1
    fi
}

# Check DR database
check_dr_database() {
    log "Checking DR database..."

    local replica="${DB_REPLICA_INSTANCE:-llm-marketplace-db-replica}"
    local status=$(aws rds describe-db-instances \
        --db-instance-identifier "$replica" \
        --region us-west-2 \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text)

    if [[ "$status" == "available" ]]; then
        add_check_result "dr_database" "PASS" "Status: $status"
        return 0
    else
        add_check_result "dr_database" "FAIL" "Status: $status"
        return 1
    fi
}

# Check S3 bucket accessibility
check_s3_buckets() {
    log "Checking S3 backup buckets..."

    if aws s3 ls s3://llm-marketplace-backups-primary/ > /dev/null 2>&1; then
        add_check_result "s3_primary" "PASS" "Bucket accessible"
    else
        add_check_result "s3_primary" "FAIL" "Bucket inaccessible"
    fi

    if aws s3 ls s3://llm-marketplace-backups-dr/ > /dev/null 2>&1; then
        add_check_result "s3_dr" "PASS" "Bucket accessible"
    else
        add_check_result "s3_dr" "FAIL" "Bucket inaccessible"
    fi
}

# Check DNS configuration
check_dns() {
    log "Checking DNS configuration..."

    local api_endpoint=$(dig +short api.llm-marketplace.com)
    local db_endpoint=$(dig +short db.llm-marketplace.com)

    if [[ -n "$api_endpoint" ]]; then
        add_check_result "dns_api" "PASS" "Resolves to $api_endpoint"
    else
        add_check_result "dns_api" "FAIL" "No resolution"
    fi

    if [[ -n "$db_endpoint" ]]; then
        add_check_result "dns_db" "PASS" "Resolves to $db_endpoint"
    else
        add_check_result "dns_db" "FAIL" "No resolution"
    fi
}

# Check secrets synchronization
check_secrets_sync() {
    log "Checking secrets synchronization..."

    # Compare secret counts between regions
    local primary_secrets=$(kubectl get secrets -n llm-marketplace | wc -l)
    local dr_secrets=$(kubectl --context=dr-cluster get secrets -n llm-marketplace | wc -l)

    if [[ $primary_secrets -eq $dr_secrets ]]; then
        add_check_result "secrets_sync" "PASS" "Both regions have $primary_secrets secrets"
        return 0
    else
        add_check_result "secrets_sync" "FAIL" "Primary: $primary_secrets, DR: $dr_secrets"
        return 1
    fi
}

# Main
main() {
    log "Starting DR environment health check..."

    check_dr_cluster
    check_dr_database
    check_s3_buckets
    check_dns
    check_secrets_sync

    # Generate summary
    local total_checks=$(jq '.checks | length' "$REPORT_FILE")
    local passed_checks=$(jq '[.checks[] | select(.status == "PASS")] | length' "$REPORT_FILE")

    log "Health check complete: $passed_checks/$total_checks checks passed"
    log "Report: $REPORT_FILE"

    if [[ $passed_checks -eq $total_checks ]]; then
        exit 0
    else
        exit 1
    fi
}

main "$@"
```

---

## Alert Definitions

### PagerDuty Integration

```json
{
  "routing_rules": [
    {
      "name": "DR Critical Alerts",
      "conditions": {
        "severity": "critical",
        "source": "cloudwatch",
        "tags": ["dr", "backup", "replication"]
      },
      "actions": {
        "notify": ["sre-oncall"],
        "urgency": "high",
        "auto_escalate": true,
        "escalation_delay_minutes": 15
      }
    },
    {
      "name": "DR High Priority Alerts",
      "conditions": {
        "severity": "high",
        "source": "cloudwatch",
        "tags": ["dr"]
      },
      "actions": {
        "notify": ["sre-oncall"],
        "urgency": "low",
        "auto_escalate": false
      }
    }
  ]
}
```

### Slack Alerts

```python
# Lambda function for Slack notifications
import json
import urllib3
import os

http = urllib3.PoolManager()

def lambda_handler(event, context):
    """Send DR alerts to Slack"""

    slack_webhook = os.environ['SLACK_WEBHOOK_URL']
    message = event['Records'][0]['Sns']['Message']
    alarm = json.loads(message)

    # Determine color based on state
    color = {
        'ALARM': 'danger',
        'OK': 'good',
        'INSUFFICIENT_DATA': 'warning'
    }.get(alarm['NewStateValue'], 'warning')

    # Build Slack message
    slack_message = {
        'attachments': [{
            'color': color,
            'title': f"DR Alert: {alarm['AlarmName']}",
            'text': alarm['AlarmDescription'],
            'fields': [
                {
                    'title': 'Status',
                    'value': alarm['NewStateValue'],
                    'short': True
                },
                {
                    'title': 'Reason',
                    'value': alarm['NewStateReason'],
                    'short': False
                }
            ],
            'footer': 'LLM Marketplace DR Monitoring',
            'ts': alarm['StateChangeTime']
        }]
    }

    # Send to Slack
    encoded_data = json.dumps(slack_message).encode('utf-8')
    response = http.request(
        'POST',
        slack_webhook,
        body=encoded_data,
        headers={'Content-Type': 'application/json'}
    )

    return {
        'statusCode': 200,
        'body': json.dumps('Alert sent to Slack')
    }
```

---

## Dashboards

### CloudWatch Dashboard

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "LLMMarketplace/DR", "PostgreSQLBackupAge", { "stat": "Maximum" } ],
          [ ".", "SnapshotAge", { "stat": "Maximum" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "Backup Age (Hours)",
        "period": 3600,
        "yAxis": {
          "left": {
            "min": 0,
            "max": 86400
          }
        }
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "LLMMarketplace/DR", "ReplicationLagSeconds" ],
          [ "AWS/RDS", "ReplicaLag", { "dimensions": { "DBInstanceIdentifier": "llm-marketplace-db-replica" } } ]
        ],
        "view": "timeSeries",
        "region": "us-east-1",
        "title": "Replication Lag"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "LLMMarketplace/DR", "DRClusterHealthy", { "stat": "Average" } ],
          [ ".", "DRDatabaseHealthy", { "stat": "Average" } ],
          [ ".", "PostgreSQLBackupExists", { "stat": "Average" } ]
        ],
        "view": "singleValue",
        "region": "us-east-1",
        "title": "DR Component Health (1=Healthy, 0=Unhealthy)",
        "period": 300
      }
    }
  ]
}
```

---

## Runbook Integration

### Alert → Runbook Mapping

| Alert | Severity | Runbook | Estimated Time |
|-------|----------|---------|----------------|
| RDS Backup Missing | P0 | [RB-006](../../runbooks/incidents/RB-006-DATABASE-ISSUES.md) | 30 min |
| High Replication Lag | P1 | [DR-F-002](../procedures/FAILOVER_PROCEDURES.md#db-f-002-rds-cross-region-manual-failover) | 15 min |
| DR Database Unavailable | P0 | [RB-006](../../runbooks/incidents/RB-006-DATABASE-ISSUES.md) | 1 hour |
| Elasticsearch Snapshot Failed | P1 | [Custom ES Runbook] | 30 min |
| DR Test Overdue | P2 | [DR Testing Schedule](../tests/DR_TESTING_SCHEDULE.md) | N/A |

---

## Related Documentation

- [DISASTER_RECOVERY_PLAN.md](../DISASTER_RECOVERY_PLAN.md)
- [FAILOVER_PROCEDURES.md](../procedures/FAILOVER_PROCEDURES.md)
- [DR_TESTING_SCHEDULE.md](../tests/DR_TESTING_SCHEDULE.md)
- [Incident Response Framework](../../runbooks/INCIDENT_RESPONSE_FRAMEWORK.md)

---

**Document Owner:** SRE Team
**Last Updated:** 2024-11-19
**Next Review:** 2025-01-19
**Status:** ✅ Active
