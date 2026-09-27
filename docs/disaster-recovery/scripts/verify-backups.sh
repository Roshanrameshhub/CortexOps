#!/bin/bash

##############################################################################
# Backup Verification Script
#
# Purpose: Verify integrity and completeness of all backup systems
# Author: DevOps Team
# Version: 1.0.0
# Last Updated: 2024-11-19
#
# Usage:
#   ./verify-backups.sh [--component <name>] [--verbose]
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/backup-verification.log"
REPORT_FILE="/tmp/backup-verification-report-$(date +%Y%m%d-%H%M%S).json"

# Components to verify
VERIFY_COMPONENT="${1:-all}"
VERBOSE=false

# Thresholds
MAX_BACKUP_AGE_HOURS=25  # Daily backups should be < 25 hours old
MIN_BACKUP_SIZE_MB=1     # Backups should be at least 1MB

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

##############################################################################
# Functions
##############################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE" >&2
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

# Initialize report structure
init_report() {
    cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "components": {}
}
EOF
}

# Add component result to report
add_component_result() {
    local component="$1"
    local status="$2"
    local details="$3"

    local temp_file=$(mktemp)
    jq ".components.\"$component\" = {\"status\": \"$status\", \"details\": $details}" "$REPORT_FILE" > "$temp_file"
    mv "$temp_file" "$REPORT_FILE"
}

verify_postgresql_backups() {
    log "Verifying PostgreSQL backups..."

    local status="PASS"
    local issues=()

    # Check S3 bucket
    local s3_bucket="${S3_BUCKET:-llm-marketplace-backups-primary}"
    local s3_path="${S3_PATH:-database/postgres}"

    # Get latest backup
    local latest_backup=$(aws s3 ls "s3://$s3_bucket/$s3_path/" --recursive | \
        grep "postgres-backup-" | \
        sort | \
        tail -1 | \
        awk '{print $4}')

    if [[ -z "$latest_backup" ]]; then
        error "No PostgreSQL backups found in S3"
        status="FAIL"
        issues+=("No backups found in S3")
    else
        log "Latest backup: $latest_backup"

        # Check backup age
        local backup_date=$(echo "$latest_backup" | grep -oP '\d{8}-\d{6}' | head -1)
        local backup_timestamp=$(date -d "${backup_date:0:8} ${backup_date:9:2}:${backup_date:11:2}:${backup_date:13:2}" +%s)
        local current_timestamp=$(date +%s)
        local age_hours=$(( (current_timestamp - backup_timestamp) / 3600 ))

        log "Backup age: ${age_hours} hours"

        if [[ $age_hours -gt $MAX_BACKUP_AGE_HOURS ]]; then
            warn "Backup is older than ${MAX_BACKUP_AGE_HOURS} hours"
            status="WARN"
            issues+=("Backup age: ${age_hours} hours")
        fi

        # Check backup size
        local backup_size=$(aws s3 ls "s3://$s3_bucket/$latest_backup" | awk '{print $3}')
        local backup_size_mb=$((backup_size / 1024 / 1024))

        log "Backup size: ${backup_size_mb}MB"

        if [[ $backup_size_mb -lt $MIN_BACKUP_SIZE_MB ]]; then
            error "Backup size too small: ${backup_size_mb}MB"
            status="FAIL"
            issues+=("Backup size too small: ${backup_size_mb}MB")
        fi

        # Verify backup can be listed (corruption check)
        local temp_backup="/tmp/postgres-backup-verify.dump"
        aws s3 cp "s3://$s3_bucket/$latest_backup" "$temp_backup" 2>/dev/null

        if pg_restore --list "$temp_backup" &> /dev/null; then
            success "Backup integrity check passed"
        else
            error "Backup integrity check failed"
            status="FAIL"
            issues+=("Backup file is corrupted")
        fi

        rm -f "$temp_backup"
    fi

    # Count total backups
    local total_backups=$(aws s3 ls "s3://$s3_bucket/$s3_path/" --recursive | grep -c "postgres-backup-" || echo "0")
    log "Total backups in S3: $total_backups"

    # Build details JSON
    local details=$(jq -n \
        --arg latest "$latest_backup" \
        --arg age "$age_hours" \
        --arg size "$backup_size_mb" \
        --arg total "$total_backups" \
        --argjson issues "$(printf '%s\n' "${issues[@]}" | jq -R . | jq -s .)" \
        '{
            latest_backup: $latest,
            age_hours: ($age | tonumber),
            size_mb: ($size | tonumber),
            total_backups: ($total | tonumber),
            issues: $issues
        }')

    add_component_result "postgresql" "$status" "$details"

    if [[ "$status" == "PASS" ]]; then
        success "PostgreSQL backup verification: PASS"
        return 0
    else
        error "PostgreSQL backup verification: $status"
        return 1
    fi
}

verify_elasticsearch_backups() {
    log "Verifying Elasticsearch backups..."

    local status="PASS"
    local issues=()

    local es_host="${ES_HOST:-elasticsearch.llm-marketplace.svc.cluster.local}"
    local es_port="${ES_PORT:-9200}"
    local snapshot_repo="${SNAPSHOT_REPOSITORY:-s3_backup}"

    # Check if Elasticsearch is accessible
    if ! curl -sf "http://$es_host:$es_port/_cluster/health" > /dev/null; then
        error "Cannot connect to Elasticsearch"
        status="FAIL"
        issues+=("Elasticsearch not accessible")
        add_component_result "elasticsearch" "$status" "$(echo '{}' | jq --argjson issues "$(printf '%s\n' "${issues[@]}" | jq -R . | jq -s .)" '. + {issues: $issues}')"
        return 1
    fi

    # Get latest snapshot
    local latest_snapshot=$(curl -sf "http://$es_host:$es_port/_snapshot/$snapshot_repo/_all" | \
        jq -r '.snapshots | sort_by(.start_time_in_millis) | last | .snapshot')

    if [[ -z "$latest_snapshot" ]] || [[ "$latest_snapshot" == "null" ]]; then
        error "No Elasticsearch snapshots found"
        status="FAIL"
        issues+=("No snapshots found")
    else
        log "Latest snapshot: $latest_snapshot"

        # Get snapshot info
        local snapshot_info=$(curl -sf "http://$es_host:$es_port/_snapshot/$snapshot_repo/$latest_snapshot")

        # Check snapshot state
        local snapshot_state=$(echo "$snapshot_info" | jq -r '.snapshots[0].state')
        if [[ "$snapshot_state" != "SUCCESS" ]]; then
            error "Latest snapshot state is not SUCCESS: $snapshot_state"
            status="FAIL"
            issues+=("Snapshot state: $snapshot_state")
        fi

        # Check snapshot age
        local snapshot_time=$(echo "$snapshot_info" | jq -r '.snapshots[0].start_time_in_millis')
        local current_time=$(($(date +%s) * 1000))
        local age_hours=$(( (current_time - snapshot_time) / 3600000 ))

        log "Snapshot age: ${age_hours} hours"

        if [[ $age_hours -gt $MAX_BACKUP_AGE_HOURS ]]; then
            warn "Snapshot is older than ${MAX_BACKUP_AGE_HOURS} hours"
            status="WARN"
            issues+=("Snapshot age: ${age_hours} hours")
        fi

        # Check failed shards
        local failed_shards=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.failed')
        if [[ $failed_shards -gt 0 ]]; then
            warn "Snapshot has $failed_shards failed shards"
            status="WARN"
            issues+=("Failed shards: $failed_shards")
        fi

        # Get indices count
        local indices_count=$(echo "$snapshot_info" | jq -r '.snapshots[0].indices | length')
        log "Indices in snapshot: $indices_count"
    fi

    # Count total snapshots
    local total_snapshots=$(curl -sf "http://$es_host:$es_port/_snapshot/$snapshot_repo/_all" | jq '.snapshots | length')
    log "Total snapshots: $total_snapshots"

    # Build details JSON
    local details=$(jq -n \
        --arg latest "$latest_snapshot" \
        --arg age "$age_hours" \
        --arg indices "$indices_count" \
        --arg total "$total_snapshots" \
        --argjson issues "$(printf '%s\n' "${issues[@]}" | jq -R . | jq -s .)" \
        '{
            latest_snapshot: $latest,
            age_hours: ($age | tonumber),
            indices_count: ($indices | tonumber),
            total_snapshots: ($total | tonumber),
            issues: $issues
        }')

    add_component_result "elasticsearch" "$status" "$details"

    if [[ "$status" == "PASS" ]]; then
        success "Elasticsearch backup verification: PASS"
        return 0
    else
        error "Elasticsearch backup verification: $status"
        return 1
    fi
}

verify_rds_backups() {
    log "Verifying RDS automated backups..."

    local status="PASS"
    local issues=()

    local db_instance="${DB_INSTANCE:-llm-marketplace-db}"

    # Get RDS instance info
    local rds_info=$(aws rds describe-db-instances --db-instance-identifier "$db_instance" 2>/dev/null || echo "{}")

    if [[ "$rds_info" == "{}" ]]; then
        error "RDS instance not found: $db_instance"
        status="FAIL"
        issues+=("RDS instance not found")
        add_component_result "rds" "$status" "$(echo '{}' | jq --argjson issues "$(printf '%s\n' "${issues[@]}" | jq -R . | jq -s .)" '. + {issues: $issues}')"
        return 1
    fi

    # Check if automated backups are enabled
    local backup_retention=$(echo "$rds_info" | jq -r '.DBInstances[0].BackupRetentionPeriod')
    log "Backup retention period: $backup_retention days"

    if [[ $backup_retention -lt 7 ]]; then
        warn "Backup retention period is less than 7 days"
        status="WARN"
        issues+=("Low retention period: $backup_retention days")
    fi

    # Get latest automated backup
    local latest_backup=$(aws rds describe-db-snapshots \
        --db-instance-identifier "$db_instance" \
        --snapshot-type automated \
        --query 'DBSnapshots | sort_by(@, &SnapshotCreateTime) | [-1]' \
        2>/dev/null || echo "{}")

    if [[ "$latest_backup" == "{}" ]] || [[ "$latest_backup" == "null" ]]; then
        error "No automated backups found"
        status="FAIL"
        issues+=("No automated backups found")
    else
        local backup_time=$(echo "$latest_backup" | jq -r '.SnapshotCreateTime')
        local backup_status=$(echo "$latest_backup" | jq -r '.Status')

        log "Latest backup: $backup_time"
        log "Backup status: $backup_status"

        if [[ "$backup_status" != "available" ]]; then
            error "Latest backup status is not 'available': $backup_status"
            status="FAIL"
            issues+=("Backup status: $backup_status")
        fi

        # Check backup age
        local backup_timestamp=$(date -d "$backup_time" +%s 2>/dev/null || echo "0")
        local current_timestamp=$(date +%s)
        local age_hours=$(( (current_timestamp - backup_timestamp) / 3600 ))

        log "Backup age: ${age_hours} hours"

        if [[ $age_hours -gt $MAX_BACKUP_AGE_HOURS ]]; then
            warn "Backup is older than ${MAX_BACKUP_AGE_HOURS} hours"
            status="WARN"
            issues+=("Backup age: ${age_hours} hours")
        fi
    fi

    # Check Multi-AZ status
    local multi_az=$(echo "$rds_info" | jq -r '.DBInstances[0].MultiAZ')
    log "Multi-AZ enabled: $multi_az"

    if [[ "$multi_az" != "true" ]]; then
        warn "Multi-AZ is not enabled"
        status="WARN"
        issues+=("Multi-AZ not enabled")
    fi

    # Build details JSON
    local details=$(jq -n \
        --arg retention "$backup_retention" \
        --arg latest "$backup_time" \
        --arg age "$age_hours" \
        --arg multi_az "$multi_az" \
        --argjson issues "$(printf '%s\n' "${issues[@]}" | jq -R . | jq -s .)" \
        '{
            retention_days: ($retention | tonumber),
            latest_backup: $latest,
            age_hours: ($age | tonumber),
            multi_az: ($multi_az == "true"),
            issues: $issues
        }')

    add_component_result "rds" "$status" "$details"

    if [[ "$status" == "PASS" ]]; then
        success "RDS backup verification: PASS"
        return 0
    else
        error "RDS backup verification: $status"
        return 1
    fi
}

generate_summary_report() {
    log "Generating summary report..."

    local report_content=$(cat "$REPORT_FILE")

    # Count statuses
    local pass_count=$(echo "$report_content" | jq '[.components[] | select(.status == "PASS")] | length')
    local warn_count=$(echo "$report_content" | jq '[.components[] | select(.status == "WARN")] | length')
    local fail_count=$(echo "$report_content" | jq '[.components[] | select(.status == "FAIL")] | length')
    local total_count=$(echo "$report_content" | jq '.components | length')

    # Determine overall status
    local overall_status="PASS"
    if [[ $fail_count -gt 0 ]]; then
        overall_status="FAIL"
    elif [[ $warn_count -gt 0 ]]; then
        overall_status="WARN"
    fi

    # Add summary to report
    local temp_file=$(mktemp)
    jq ".summary = {
        overall_status: \"$overall_status\",
        total_components: $total_count,
        passed: $pass_count,
        warnings: $warn_count,
        failed: $fail_count
    }" "$REPORT_FILE" > "$temp_file"
    mv "$temp_file" "$REPORT_FILE"

    # Print summary
    cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║           Backup Verification Summary                        ║
╠══════════════════════════════════════════════════════════════╣
║ Timestamp:    $(date)
║ Overall Status: $overall_status
║ ──────────────────────────────────────────────────────────────
║ Total Components:  $total_count
║ Passed:            $pass_count
║ Warnings:          $warn_count
║ Failed:            $fail_count
║ ──────────────────────────────────────────────────────────────
║ Report File: $REPORT_FILE
╚══════════════════════════════════════════════════════════════╝

Component Details:
EOF

    # Print component details
    echo "$report_content" | jq -r '.components | to_entries[] |
        "  " + .key + ": " + .value.status +
        (if (.value.details.issues | length) > 0 then
            " (" + (.value.details.issues | join(", ")) + ")"
        else "" end)'

    echo ""

    if [[ "$overall_status" == "PASS" ]]; then
        success "All backup verifications passed"
        return 0
    elif [[ "$overall_status" == "WARN" ]]; then
        warn "Backup verification completed with warnings"
        return 0
    else
        error "Backup verification failed"
        return 1
    fi
}

##############################################################################
# Main
##############################################################################

main() {
    log "========================================="
    log "Backup Verification Started"
    log "========================================="

    init_report

    local exit_code=0

    # Verify components
    case "$VERIFY_COMPONENT" in
        all)
            verify_postgresql_backups || exit_code=1
            verify_elasticsearch_backups || exit_code=1
            verify_rds_backups || exit_code=1
            ;;
        postgresql|postgres)
            verify_postgresql_backups || exit_code=1
            ;;
        elasticsearch|es)
            verify_elasticsearch_backups || exit_code=1
            ;;
        rds)
            verify_rds_backups || exit_code=1
            ;;
        *)
            error "Unknown component: $VERIFY_COMPONENT"
            echo "Valid components: all, postgresql, elasticsearch, rds"
            exit 1
            ;;
    esac

    # Generate summary
    generate_summary_report || exit_code=1

    log "========================================="
    log "Backup Verification Completed"
    log "========================================="

    exit $exit_code
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --component)
            VERIFY_COMPONENT="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            cat <<EOF
Backup Verification Script

Usage:
    $0 [--component <name>] [--verbose]

Options:
    --component NAME    Verify specific component (all, postgresql, elasticsearch, rds)
    --verbose           Enable verbose output
    --help              Show this help message

Examples:
    # Verify all backups
    $0

    # Verify only PostgreSQL backups
    $0 --component postgresql

    # Verify with verbose output
    $0 --verbose
EOF
            exit 0
            ;;
        *)
            VERIFY_COMPONENT="$1"
            shift
            ;;
    esac
done

# Run main function
main
