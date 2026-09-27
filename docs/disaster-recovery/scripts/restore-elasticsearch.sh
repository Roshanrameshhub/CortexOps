#!/bin/bash

##############################################################################
# Elasticsearch Restore Script
#
# Purpose: Restore Elasticsearch from S3 snapshot
# Author: DevOps Team
# Version: 1.0.0
# Last Updated: 2024-11-19
#
# Usage:
#   ./restore-elasticsearch.sh --snapshot <snapshot-name> [options]
#   ./restore-elasticsearch.sh --latest [options]
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_HOST="${ES_HOST:-elasticsearch.llm-marketplace.svc.cluster.local}"
ES_PORT="${ES_PORT:-9200}"
S3_BUCKET="${S3_BUCKET:-llm-marketplace-backups-primary}"
S3_REPOSITORY="${S3_REPOSITORY:-elasticsearch-snapshots}"
SNAPSHOT_REPOSITORY="${SNAPSHOT_REPOSITORY:-s3_backup}"
LOG_FILE="/var/log/elasticsearch-restore.log"

# Restore options
SNAPSHOT_NAME=""
USE_LATEST=false
VALIDATE_ONLY=false
DRY_RUN=false
CLOSE_INDICES=false
RENAME_PATTERN=""
RENAME_REPLACEMENT=""

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

usage() {
    cat <<EOF
Elasticsearch Restore Script

Usage:
    $0 --snapshot <name> [options]
    $0 --latest [options]

Options:
    --snapshot NAME         Snapshot name to restore
    --latest                Restore from latest snapshot
    --close-indices         Close existing indices before restore
    --rename-pattern REGEX  Rename pattern for index names
    --rename-replacement STR Replacement string for rename
    --validate-only         Only validate snapshot without restoring
    --dry-run               Show what would be done without actually doing it
    --help                  Show this help message

Examples:
    # Restore specific snapshot
    $0 --snapshot snapshot-20241119-120000

    # Restore latest snapshot
    $0 --latest

    # Restore with index renaming (restore to new indices)
    $0 --snapshot snapshot-20241119-120000 \\
       --rename-pattern '(.+)' \\
       --rename-replacement 'restored_\$1'

    # Validate snapshot without restoring
    $0 --snapshot snapshot-20241119-120000 --validate-only

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --snapshot)
                SNAPSHOT_NAME="$2"
                shift 2
                ;;
            --latest)
                USE_LATEST=true
                shift
                ;;
            --close-indices)
                CLOSE_INDICES=true
                shift
                ;;
            --rename-pattern)
                RENAME_PATTERN="$2"
                shift 2
                ;;
            --rename-replacement)
                RENAME_REPLACEMENT="$2"
                shift 2
                ;;
            --validate-only)
                VALIDATE_ONLY=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Validation
    if [[ -z "$SNAPSHOT_NAME" ]] && [[ "$USE_LATEST" != "true" ]]; then
        error "Must specify either --snapshot or --latest"
        usage
        exit 1
    fi
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check required commands
    for cmd in curl jq; do
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

    # Check cluster health
    local health=$(curl -sf "http://$ES_HOST:$ES_PORT/_cluster/health" | jq -r '.status')
    if [[ "$health" == "red" ]]; then
        warn "Cluster health is RED - restore may have issues"
    fi

    success "Prerequisites check passed"
    return 0
}

get_latest_snapshot() {
    log "Finding latest snapshot..."

    local latest=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/_all" | \
        jq -r '.snapshots | sort_by(.start_time_in_millis) | last | .snapshot')

    if [[ -z "$latest" ]] || [[ "$latest" == "null" ]]; then
        error "No snapshots found in repository"
        return 1
    fi

    log "Latest snapshot: $latest"
    echo "$latest"
}

validate_snapshot() {
    local snapshot_name="$1"

    log "Validating snapshot: $snapshot_name"

    # Check if snapshot exists
    local snapshot_info=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot_name")

    if [[ -z "$snapshot_info" ]]; then
        error "Snapshot not found: $snapshot_name"
        return 1
    fi

    # Check snapshot state
    local state=$(echo "$snapshot_info" | jq -r '.snapshots[0].state')
    if [[ "$state" != "SUCCESS" ]]; then
        error "Snapshot state is not SUCCESS: $state"
        return 1
    fi

    # Get snapshot details
    local indices=$(echo "$snapshot_info" | jq -r '.snapshots[0].indices | join(", ")')
    local indices_count=$(echo "$snapshot_info" | jq -r '.snapshots[0].indices | length')
    local shards_total=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.total')
    local shards_successful=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.successful')
    local shards_failed=$(echo "$snapshot_info" | jq -r '.snapshots[0].shards.failed')
    local start_time=$(echo "$snapshot_info" | jq -r '.snapshots[0].start_time')

    log "Snapshot details:"
    log "  - Created: $start_time"
    log "  - Indices: $indices_count"
    log "  - Total shards: $shards_total"
    log "  - Successful shards: $shards_successful"
    log "  - Failed shards: $shards_failed"
    log "  - Indices: $indices"

    if [[ $shards_failed -gt 0 ]]; then
        warn "Snapshot has $shards_failed failed shards"
    fi

    success "Snapshot validation passed"
    return 0
}

close_existing_indices() {
    local snapshot_name="$1"

    log "Closing existing indices..."

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] Would close existing indices"
        return 0
    fi

    # Get indices from snapshot
    local indices=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot_name" | \
        jq -r '.snapshots[0].indices[]')

    local closed_count=0
    while IFS= read -r index; do
        if [[ -n "$index" ]]; then
            # Check if index exists
            if curl -sf "http://$ES_HOST:$ES_PORT/$index" > /dev/null 2>&1; then
                log "Closing index: $index"
                curl -sf -X POST "http://$ES_HOST:$ES_PORT/$index/_close" > /dev/null
                if [[ $? -eq 0 ]]; then
                    closed_count=$((closed_count + 1))
                else
                    warn "Failed to close index: $index"
                fi
            fi
        fi
    done <<< "$indices"

    success "Closed $closed_count indices"
    return 0
}

restore_snapshot() {
    local snapshot_name="$1"

    log "Starting restore..."
    log "Snapshot: $snapshot_name"
    log "Repository: $SNAPSHOT_REPOSITORY"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] Would restore snapshot: $snapshot_name"
        return 0
    fi

    local start_time=$(date +%s)

    # Build restore request
    local restore_body='{"indices": "*"'

    if [[ -n "$RENAME_PATTERN" ]] && [[ -n "$RENAME_REPLACEMENT" ]]; then
        restore_body="$restore_body, \"rename_pattern\": \"$RENAME_PATTERN\", \"rename_replacement\": \"$RENAME_REPLACEMENT\""
    fi

    restore_body="$restore_body, \"include_global_state\": false, \"partial\": false}"

    # Initiate restore
    curl -sf -X POST "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot_name/_restore?wait_for_completion=false" \
        -H 'Content-Type: application/json' \
        -d "$restore_body" | tee -a "$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        error "Failed to initiate restore"
        return 1
    fi

    # Wait for restore to complete (with timeout)
    local timeout=7200  # 2 hours
    local elapsed=0
    local check_interval=10

    while [[ $elapsed -lt $timeout ]]; do
        sleep $check_interval
        elapsed=$((elapsed + check_interval))

        # Check recovery status
        local recovery_status=$(curl -sf "http://$ES_HOST:$ES_PORT/_recovery" | \
            jq '[.[] | select(.type == "SNAPSHOT")] | length')

        if [[ "$recovery_status" == "0" ]]; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            success "Restore completed in ${duration}s"
            return 0
        else
            log "Restore in progress... ($recovery_status indices recovering, ${elapsed}s elapsed)"
        fi
    done

    error "Restore timed out after ${timeout}s"
    return 1
}

validate_restored_data() {
    local snapshot_name="$1"

    log "Validating restored data..."

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] Would validate restored data"
        return 0
    fi

    # Get expected indices from snapshot
    local expected_indices=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot_name" | \
        jq -r '.snapshots[0].indices | length')

    # Get current indices count
    local current_indices=$(curl -sf "http://$ES_HOST:$ES_PORT/_cat/indices?format=json" | jq 'length')

    log "Indices validation:"
    log "  - Expected: $expected_indices"
    log "  - Current: $current_indices"

    # Get index health
    local unhealthy_indices=$(curl -sf "http://$ES_HOST:$ES_PORT/_cat/indices?format=json" | \
        jq -r '.[] | select(.health != "green") | .index')

    if [[ -n "$unhealthy_indices" ]]; then
        warn "Unhealthy indices found:"
        echo "$unhealthy_indices" | while IFS= read -r index; do
            warn "  - $index"
        done
    fi

    # Get total documents
    local total_docs=$(curl -sf "http://$ES_HOST:$ES_PORT/_cat/indices?format=json" | \
        jq '[.[] | .["docs.count"] | tonumber] | add')

    log "Total documents: $total_docs"

    # Get cluster health
    local cluster_health=$(curl -sf "http://$ES_HOST:$ES_PORT/_cluster/health" | jq -r '.status')
    log "Cluster health: $cluster_health"

    if [[ "$cluster_health" == "red" ]]; then
        error "Cluster health is RED after restore"
        return 1
    fi

    success "Data validation completed"
    return 0
}

generate_restore_report() {
    local snapshot_name="$1"
    local duration="$2"

    local snapshot_info=$(curl -sf "http://$ES_HOST:$ES_PORT/_snapshot/$SNAPSHOT_REPOSITORY/$snapshot_name")
    local indices_count=$(echo "$snapshot_info" | jq -r '.snapshots[0].indices | length')

    local cluster_health=$(curl -sf "http://$ES_HOST:$ES_PORT/_cluster/health" | jq -r '.status')
    local total_docs=$(curl -sf "http://$ES_HOST:$ES_PORT/_cat/indices?format=json" | \
        jq '[.[] | .["docs.count"] | tonumber] | add')

    cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║           Elasticsearch Restore Report                       ║
╠══════════════════════════════════════════════════════════════╣
║ Cluster:      $ES_HOST
║ Timestamp:    $(date)
║ Duration:     ${duration}s
║ ──────────────────────────────────────────────────────────────
║ Snapshot:     $snapshot_name
║ Repository:   $SNAPSHOT_REPOSITORY
║ ──────────────────────────────────────────────────────────────
║ Indices:      $indices_count
║ Documents:    $total_docs
║ ──────────────────────────────────────────────────────────────
║ Cluster Health: $cluster_health
║ ──────────────────────────────────────────────────────────────
║ Status:       ✅ SUCCESS
╚══════════════════════════════════════════════════════════════╝

Next Steps:
1. Verify application connectivity to Elasticsearch
2. Run application-level tests
3. Check index mappings and settings
4. Monitor for 24-48 hours before marking complete

EOF
}

##############################################################################
# Main
##############################################################################

main() {
    log "========================================="
    log "Elasticsearch Restore Started"
    log "========================================="

    local overall_start=$(date +%s)

    # Parse command line arguments
    parse_arguments "$@"

    # Check prerequisites
    if ! check_prerequisites; then
        error "Prerequisites check failed"
        exit 1
    fi

    # Determine snapshot name
    if [[ "$USE_LATEST" == "true" ]]; then
        if ! SNAPSHOT_NAME=$(get_latest_snapshot); then
            error "Failed to find latest snapshot"
            exit 1
        fi
    fi

    # Validate snapshot
    if ! validate_snapshot "$SNAPSHOT_NAME"; then
        error "Snapshot validation failed"
        exit 1
    fi

    # If validate-only, exit here
    if [[ "$VALIDATE_ONLY" == "true" ]]; then
        success "Validation completed successfully"
        exit 0
    fi

    # Close existing indices if requested
    if [[ "$CLOSE_INDICES" == "true" ]]; then
        if ! close_existing_indices "$SNAPSHOT_NAME"; then
            error "Failed to close existing indices"
            exit 1
        fi
    fi

    # Restore snapshot
    if ! restore_snapshot "$SNAPSHOT_NAME"; then
        error "Restore failed"
        exit 1
    fi

    # Validate restored data
    if ! validate_restored_data "$SNAPSHOT_NAME"; then
        error "Data validation failed"
        exit 1
    fi

    # Calculate total duration
    local overall_end=$(date +%s)
    local total_duration=$((overall_end - overall_start))

    # Generate report
    generate_restore_report "$SNAPSHOT_NAME" "$total_duration"

    log "========================================="
    log "Elasticsearch Restore Completed Successfully"
    log "Total Duration: ${total_duration}s"
    log "========================================="

    exit 0
}

# Run main function
main "$@"
