#!/bin/bash

##############################################################################
# Elasticsearch Backup Script
#
# Purpose: Automated Elasticsearch snapshot backup to S3
# Author: DevOps Team
# Version: 1.0.0
# Last Updated: 2024-11-19
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_HOST="${ES_HOST:-elasticsearch.llm-marketplace.svc.cluster.local}"
ES_PORT="${ES_PORT:-9200}"
S3_BUCKET="${S3_BUCKET:-llm-marketplace-backups-primary}"
S3_REPOSITORY="${S3_REPOSITORY:-elasticsearch-snapshots}"
SNAPSHOT_REPOSITORY="${SNAPSHOT_REPOSITORY:-s3_backup}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SNAPSHOT_NAME="snapshot-${TIMESTAMP}"
LOG_FILE="/var/log/elasticsearch-backup.log"
RETENTION_DAYS="${RETENTION_DAYS:-90}"

# Notification
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
PAGERDUTY_KEY="${PAGERDUTY_INTEGRATION_KEY:-}"

# Colors for output
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

notify_slack() {
    local message="$1"
    local color="${2:-good}"

    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -s -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Elasticsearch Backup\",
                    \"text\": \"$message\",
                    \"ts\": $(date +%s)
                }]
            }" > /dev/null
    fi
}

notify_pagerduty() {
    local severity="$1"
    local summary="$2"

    if [[ -n "$PAGERDUTY_KEY" ]]; then
        curl -s -X POST 'https://events.pagerduty.com/v2/enqueue' \
            -H 'Content-Type: application/json' \
            -d "{
                \"routing_key\": \"$PAGERDUTY_KEY\",
                \"event_action\": \"trigger\",
                \"payload\": {
                    \"summary\": \"$summary\",
                    \"severity\": \"$severity\",
                    \"source\": \"backup-elasticsearch.sh\",
                    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
                }
            }" > /dev/null
    fi
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check required commands
    for cmd in curl jq aws; do
        if ! command -v $cmd &> /dev/null; then
            error "Required command not found: $cmd"
            return 1
        fi
    done

    # Check Elasticsearch connectivity
    if ! curl -sf "http://$ES_HOST:$ES_PORT/_cluster/health" > /dev/null; then
        error "Cannot connect to Elasticsearch: $ES_HOST:$ES_PORT"
        return 1
    fi

    # Check S3 access
    if ! aws s3 ls "s3://$S3_BUCKET" &> /dev/null; then
        error "Cannot access S3 bucket: $S3_BUCKET"
        return 1
    fi

    success "Prerequisites check passed"
    return 0
}

get_cluster_health() {
    curl -sf "http://$ES_HOST:$ES_PORT/_cluster/health" | jq -r '.status'
}

get_cluster_stats() {
    curl -sf "http://$ES_HOST:$ES_PORT/_cluster/stats" | jq '{
        indices_count: .indices.count,
        docs_count: .indices.docs.count,
        store_size: .indices.store.size_in_bytes
    }'
}

setup_snapshot_repository() {
    log "Setting up snapshot repository..."

    # Check if repository exists
    local repo_exists=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY" 2>/dev/null | jq -r 'keys | length')

    if [[ "$repo_exists" == "0" ]] || [[ -z "$repo_exists" ]]; then
        log "Creating snapshot repository: $SNAPSHOT_REPOSITORY"

        # Create repository
        curl -sf -X PUT "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY" \
            -H 'Content-Type: application/json' \
            -d "{
                \"type\": \"s3\",
                \"settings\": {
                    \"bucket\": \"$S3_BUCKET\",
                    \"base_path\": \"$S3_REPOSITORY\",
                    \"compress\": true,
                    \"server_side_encryption\": true,
                    \"storage_class\": \"standard_ia\"
                }
            }" | tee -a "$LOG_FILE"

        if [[ $? -ne 0 ]]; then
            error "Failed to create snapshot repository"
            return 1
        fi
    fi

    # Verify repository
    local verify_result=$(curl -sf -X POST "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/_verify" | jq -r '.nodes | length')

    if [[ "$verify_result" -lt 1 ]]; then
        error "Snapshot repository verification failed"
        return 1
    fi

    success "Snapshot repository ready: $SNAPSHOT_REPOSITORY"
    return 0
}

create_snapshot() {
    log "Creating snapshot: $SNAPSHOT_NAME"
    log "Cluster health: $(get_cluster_health)"

    local cluster_stats=$(get_cluster_stats)
    log "Cluster stats: $cluster_stats"

    local start_time=$(date +%s)

    # Create snapshot
    curl -sf -X PUT "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$SNAPSHOT_NAME?wait_for_completion=false" \
        -H 'Content-Type: application/json' \
        -d '{
            "indices": "*",
            "ignore_unavailable": true,
            "include_global_state": true,
            "metadata": {
                "taken_by": "backup-elasticsearch.sh",
                "taken_because": "scheduled_backup"
            }
        }' | tee -a "$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        error "Failed to initiate snapshot"
        return 1
    fi

    # Wait for snapshot to complete (with timeout)
    local timeout=3600  # 1 hour
    local elapsed=0
    local check_interval=10

    while [[ $elapsed -lt $timeout ]]; do
        sleep $check_interval
        elapsed=$((elapsed + check_interval))

        local state=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$SNAPSHOT_NAME" | \
            jq -r ".snapshots[0].state")

        case "$state" in
            "SUCCESS")
                local end_time=$(date +%s)
                local duration=$((end_time - start_time))
                success "Snapshot completed in ${duration}s"
                echo "$SNAPSHOT_REPOSITORY/$SNAPSHOT_NAME"
                return 0
                ;;
            "FAILED")
                error "Snapshot failed"
                return 1
                ;;
            "IN_PROGRESS")
                log "Snapshot in progress... (${elapsed}s elapsed)"
                ;;
            *)
                warn "Unknown snapshot state: $state"
                ;;
        esac
    done

    error "Snapshot timed out after ${timeout}s"
    return 1
}

validate_snapshot() {
    local snapshot_name="$1"

    log "Validating snapshot: $snapshot_name"

    local snapshot_info=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot_name")

    # Check snapshot state
    local state=$(echo "$snapshot_info" | jq -r '.snapshots[0].state')
    if [[ "$state" != "SUCCESS" ]]; then
        error "Snapshot state is not SUCCESS: $state"
        return 1
    fi

    # Get snapshot details
    local indices_count=$(echo "$snapshot_info" | jq -r '.snapshots[0].indices | length')
    local shards_total=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.total')
    local shards_successful=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.successful')
    local shards_failed=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.failed')

    log "Snapshot details:"
    log "  - Indices: $indices_count"
    log "  - Total shards: $shards_total"
    log "  - Successful shards: $shards_successful"
    log "  - Failed shards: $shards_failed"

    if [[ $shards_failed -gt 0 ]]; then
        warn "Snapshot has $shards_failed failed shards"
    fi

    if [[ $indices_count -lt 1 ]]; then
        error "Snapshot contains no indices"
        return 1
    fi

    success "Snapshot validation passed"
    return 0
}

cleanup_old_snapshots() {
    log "Cleaning up snapshots older than $RETENTION_DAYS days..."

    # Get all snapshots
    local snapshots=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/_all" | \
        jq -r '.snapshots[] | select(.start_time_in_millis < ((now - ('"$RETENTION_DAYS"' * 86400)) * 1000)) | .snapshot')

    if [[ -z "$snapshots" ]]; then
        log "No old snapshots to delete"
        return 0
    fi

    local deleted_count=0
    while IFS= read -r snapshot; do
        if [[ -n "$snapshot" ]]; then
            log "Deleting old snapshot: $snapshot"
            curl -sf -X DELETE "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot" > /dev/null
            if [[ $? -eq 0 ]]; then
                deleted_count=$((deleted_count + 1))
            else
                warn "Failed to delete snapshot: $snapshot"
            fi
        fi
    done <<< "$snapshots"

    success "Cleanup completed: $deleted_count snapshots deleted"
}

generate_report() {
    local snapshot_name="$1"
    local duration="$2"

    local snapshot_info=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot_name")
    local indices_count=$(echo "$snapshot_info" | jq -r '.snapshots[0].indices | length')
    local shards_total=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.total')

    cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║           Elasticsearch Snapshot Report                      ║
╠══════════════════════════════════════════════════════════════╣
║ Cluster:      $ES_HOST
║ Timestamp:    $TIMESTAMP
║ Duration:     ${duration}s
║ ──────────────────────────────────────────────────────────────
║ Repository:   $SNAPSHOT_REPOSITORY
║ Snapshot:     $snapshot_name
║ ──────────────────────────────────────────────────────────────
║ Indices:      $indices_count
║ Shards:       $shards_total
║ ──────────────────────────────────────────────────────────────
║ S3 Bucket:    $S3_BUCKET
║ S3 Path:      $S3_REPOSITORY
║ Encryption:   Server-side (AES-256)
║ ──────────────────────────────────────────────────────────────
║ Status:       ✅ SUCCESS
╚══════════════════════════════════════════════════════════════╝

EOF
}

##############################################################################
# Main
##############################################################################

main() {
    log "========================================="
    log "Elasticsearch Backup Started"
    log "========================================="

    local overall_start=$(date +%s)

    # Check prerequisites
    if ! check_prerequisites; then
        error "Prerequisites check failed"
        notify_slack "❌ Elasticsearch backup failed: Prerequisites check failed" "danger"
        notify_pagerduty "error" "Elasticsearch backup failed: Prerequisites check failed"
        exit 1
    fi

    # Setup snapshot repository
    if ! setup_snapshot_repository; then
        error "Failed to setup snapshot repository"
        notify_slack "❌ Elasticsearch backup failed: Repository setup failed" "danger"
        notify_pagerduty "error" "Elasticsearch backup failed: Repository setup failed"
        exit 1
    fi

    # Create snapshot
    local snapshot_path
    if ! snapshot_path=$(create_snapshot); then
        error "Snapshot creation failed"
        notify_slack "❌ Elasticsearch backup failed: Snapshot creation failed" "danger"
        notify_pagerduty "error" "Elasticsearch backup failed: Snapshot creation failed"
        exit 1
    fi

    # Validate snapshot
    if ! validate_snapshot "$SNAPSHOT_NAME"; then
        error "Snapshot validation failed"
        notify_slack "❌ Elasticsearch backup failed: Validation failed" "danger"
        notify_pagerduty "error" "Elasticsearch backup failed: Validation failed"
        exit 1
    fi

    # Cleanup old snapshots
    cleanup_old_snapshots

    # Calculate total duration
    local overall_end=$(date +%s)
    local total_duration=$((overall_end - overall_start))

    # Generate report
    generate_report "$SNAPSHOT_NAME" "$total_duration"

    # Send success notification
    notify_slack "✅ Elasticsearch backup completed successfully\nSnapshot: $SNAPSHOT_NAME\nDuration: ${total_duration}s\nRepository: $SNAPSHOT_REPOSITORY" "good"

    log "========================================="
    log "Elasticsearch Backup Completed Successfully"
    log "Total Duration: ${total_duration}s"
    log "========================================="

    exit 0
}

# Run main function
main "$@"
