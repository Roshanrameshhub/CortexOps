#!/bin/bash

##############################################################################
# Database Backup Script
#
# Purpose: Automated PostgreSQL backup with validation and upload to S3
# Author: DevOps Team
# Version: 1.0.0
# Last Updated: 2024-11-19
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
S3_BUCKET="${S3_BUCKET:-llm-marketplace-backups-primary}"
S3_PATH="${S3_PATH:-database/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="postgres-backup-${TIMESTAMP}.dump"
LOG_FILE="/var/log/postgres-backup.log"

# PostgreSQL connection
DB_HOST="${DB_HOST:-postgres.llm-marketplace.svc.cluster.local}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-llm_marketplace}"
# Password should be in PGPASSWORD environment variable

# Notification
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
PAGERDUTY_KEY="${PAGERDUTY_INTEGRATION_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

notify_slack() {
    local message="$1"
    local color="${2:-good}"

    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -s -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Database Backup\",
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
                    \"source\": \"backup-database.sh\",
                    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
                }
            }" > /dev/null
    fi
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check required commands
    for cmd in pg_dump psql aws gzip; do
        if ! command -v $cmd &> /dev/null; then
            error "Required command not found: $cmd"
            return 1
        fi
    done

    # Check backup directory
    mkdir -p "$BACKUP_DIR"
    if [[ ! -w "$BACKUP_DIR" ]]; then
        error "Backup directory not writable: $BACKUP_DIR"
        return 1
    fi

    # Check database connectivity
    if ! PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &> /dev/null; then
        error "Cannot connect to database: $DB_HOST:$DB_PORT"
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

get_database_size() {
    PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" | xargs
}

create_backup() {
    log "Starting database backup..."
    log "Database: $DB_NAME"
    log "Size: $(get_database_size)"
    log "Backup file: $BACKUP_FILE"

    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    local start_time=$(date +%s)

    # Create backup using pg_dump with custom format
    PGPASSWORD="$PGPASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=custom \
        --compress=9 \
        --verbose \
        --file="$backup_path" \
        2>> "$LOG_FILE"

    local exit_code=$?
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [[ $exit_code -ne 0 ]]; then
        error "Backup failed with exit code: $exit_code"
        return 1
    fi

    # Get backup file size
    local backup_size=$(du -h "$backup_path" | cut -f1)

    success "Backup created in ${duration}s (size: $backup_size)"
    echo "$backup_path"
}

validate_backup() {
    local backup_path="$1"
    log "Validating backup: $backup_path"

    # Check file exists and is not empty
    if [[ ! -f "$backup_path" ]] || [[ ! -s "$backup_path" ]]; then
        error "Backup file is missing or empty"
        return 1
    fi

    # Verify pg_dump format
    if ! pg_restore --list "$backup_path" &> /dev/null; then
        error "Backup file is corrupted or invalid format"
        return 1
    fi

    # Count objects in backup
    local object_count=$(pg_restore --list "$backup_path" | grep -c "^[0-9]")
    log "Backup contains $object_count objects"

    if [[ $object_count -lt 10 ]]; then
        warn "Backup contains fewer objects than expected"
    fi

    success "Backup validation passed"
    return 0
}

upload_to_s3() {
    local backup_path="$1"
    local s3_uri="s3://$S3_BUCKET/$S3_PATH/$BACKUP_FILE"

    log "Uploading to S3: $s3_uri"

    # Upload with server-side encryption and metadata
    aws s3 cp "$backup_path" "$s3_uri" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256 \
        --metadata "backup-date=$TIMESTAMP,database=$DB_NAME,size=$(stat -c%s "$backup_path")" \
        2>> "$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        error "S3 upload failed"
        return 1
    fi

    # Verify upload
    if ! aws s3 ls "$s3_uri" &> /dev/null; then
        error "Upload verification failed"
        return 1
    fi

    success "Upload completed: $s3_uri"
    echo "$s3_uri"
}

cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    # Local cleanup
    find "$BACKUP_DIR" -name "postgres-backup-*.dump" -type f -mtime +$RETENTION_DAYS -delete

    # S3 cleanup (older than retention period)
    local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y%m%d)

    aws s3 ls "s3://$S3_BUCKET/$S3_PATH/" | while read -r line; do
        local file_date=$(echo "$line" | awk '{print $4}' | grep -oP '\d{8}' | head -1)
        local file_name=$(echo "$line" | awk '{print $4}')

        if [[ -n "$file_date" ]] && [[ "$file_date" -lt "$cutoff_date" ]]; then
            log "Deleting old backup: $file_name"
            aws s3 rm "s3://$S3_BUCKET/$S3_PATH/$file_name"
        fi
    done

    success "Cleanup completed"
}

generate_report() {
    local backup_path="$1"
    local s3_uri="$2"
    local duration="$3"

    cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║              PostgreSQL Backup Report                         ║
╠══════════════════════════════════════════════════════════════╣
║ Database:     $DB_NAME
║ Host:         $DB_HOST
║ Timestamp:    $TIMESTAMP
║ Duration:     ${duration}s
║ ──────────────────────────────────────────────────────────────
║ Local Path:   $backup_path
║ File Size:    $(du -h "$backup_path" | cut -f1)
║ ──────────────────────────────────────────────────────────────
║ S3 Location:  $s3_uri
║ Storage Class: STANDARD_IA
║ Encryption:   AES-256
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
    log "Database Backup Started"
    log "========================================="

    local overall_start=$(date +%s)

    # Check prerequisites
    if ! check_prerequisites; then
        error "Prerequisites check failed"
        notify_slack "❌ Database backup failed: Prerequisites check failed" "danger"
        notify_pagerduty "error" "Database backup failed: Prerequisites check failed"
        exit 1
    fi

    # Create backup
    local backup_path
    if ! backup_path=$(create_backup); then
        error "Backup creation failed"
        notify_slack "❌ Database backup failed: Backup creation failed" "danger"
        notify_pagerduty "error" "Database backup failed: Backup creation failed"
        exit 1
    fi

    # Validate backup
    if ! validate_backup "$backup_path"; then
        error "Backup validation failed"
        notify_slack "❌ Database backup failed: Validation failed" "danger"
        notify_pagerduty "error" "Database backup failed: Validation failed"
        exit 1
    fi

    # Upload to S3
    local s3_uri
    if ! s3_uri=$(upload_to_s3 "$backup_path"); then
        error "S3 upload failed"
        notify_slack "❌ Database backup failed: S3 upload failed" "danger"
        notify_pagerduty "error" "Database backup failed: S3 upload failed"
        exit 1
    fi

    # Cleanup old backups
    cleanup_old_backups

    # Calculate total duration
    local overall_end=$(date +%s)
    local total_duration=$((overall_end - overall_start))

    # Generate report
    generate_report "$backup_path" "$s3_uri" "$total_duration"

    # Send success notification
    notify_slack "✅ Database backup completed successfully\nSize: $(du -h "$backup_path" | cut -f1)\nDuration: ${total_duration}s\nLocation: $s3_uri" "good"

    log "========================================="
    log "Database Backup Completed Successfully"
    log "Total Duration: ${total_duration}s"
    log "========================================="

    exit 0
}

# Run main function
main "$@"
