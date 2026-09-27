#!/bin/bash

##############################################################################
# Database Restore Script
#
# Purpose: Restore PostgreSQL database from backup
# Author: DevOps Team
# Version: 1.0.0
# Last Updated: 2024-11-19
#
# Usage:
#   ./restore-database.sh --backup-file <file> [options]
#   ./restore-database.sh --backup-s3 <s3-uri> [options]
#   ./restore-database.sh --point-in-time <timestamp> [options]
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="/tmp/db-restore-$$"
LOG_FILE="/var/log/postgres-restore.log"

# PostgreSQL connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-llm_marketplace}"
TARGET_DB="${TARGET_DB:-llm_marketplace_restored}"

# Restore options
BACKUP_FILE=""
BACKUP_S3=""
POINT_IN_TIME=""
VALIDATE_ONLY=false
DRY_RUN=false
SKIP_VALIDATION=false

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
Database Restore Script

Usage:
    $0 --backup-file <file> [options]
    $0 --backup-s3 <s3-uri> [options]
    $0 --point-in-time <timestamp> [options]

Options:
    --backup-file FILE       Path to local backup file
    --backup-s3 S3_URI      S3 URI of backup file
    --point-in-time TIME    Restore to specific point in time (YYYY-MM-DD HH:MM:SS)
    --target-db NAME        Target database name (default: llm_marketplace_restored)
    --validate-only         Only validate backup without restoring
    --dry-run               Show what would be done without actually doing it
    --skip-validation       Skip pre-restore validation
    --help                  Show this help message

Examples:
    # Restore from local file
    $0 --backup-file /backups/postgres-backup-20241119.dump

    # Restore from S3
    $0 --backup-s3 s3://backups/postgres/postgres-backup-20241119.dump

    # Point-in-time restore
    $0 --point-in-time "2024-11-19 14:30:00"

    # Validate backup without restoring
    $0 --backup-file /backups/latest.dump --validate-only

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backup-file)
                BACKUP_FILE="$2"
                shift 2
                ;;
            --backup-s3)
                BACKUP_S3="$2"
                shift 2
                ;;
            --point-in-time)
                POINT_IN_TIME="$2"
                shift 2
                ;;
            --target-db)
                TARGET_DB="$2"
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
            --skip-validation)
                SKIP_VALIDATION=true
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
    if [[ -z "$BACKUP_FILE" ]] && [[ -z "$BACKUP_S3" ]] && [[ -z "$POINT_IN_TIME" ]]; then
        error "Must specify one of: --backup-file, --backup-s3, or --point-in-time"
        usage
        exit 1
    fi
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check required commands
    for cmd in psql pg_restore aws; do
        if ! command -v $cmd &> /dev/null; then
            error "Required command not found: $cmd"
            return 1
        fi
    done

    # Check database connectivity
    if ! PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" &> /dev/null; then
        error "Cannot connect to database server: $DB_HOST:$DB_PORT"
        return 1
    fi

    success "Prerequisites check passed"
    return 0
}

download_from_s3() {
    local s3_uri="$1"
    local local_path="$TEMP_DIR/backup.dump"

    log "Downloading backup from S3: $s3_uri"

    mkdir -p "$TEMP_DIR"

    aws s3 cp "$s3_uri" "$local_path" 2>> "$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        error "Failed to download from S3"
        return 1
    fi

    success "Downloaded to: $local_path"
    echo "$local_path"
}

validate_backup() {
    local backup_file="$1"

    log "Validating backup file: $backup_file"

    # Check file exists
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
        return 1
    fi

    # Check file size
    local file_size=$(stat -c%s "$backup_file")
    if [[ $file_size -lt 1024 ]]; then
        error "Backup file too small (< 1KB), likely corrupted"
        return 1
    fi

    log "Backup file size: $(du -h "$backup_file" | cut -f1)"

    # Validate pg_restore can read it
    if ! pg_restore --list "$backup_file" &> /dev/null; then
        error "Backup file is corrupted or invalid format"
        return 1
    fi

    # Get backup info
    local table_count=$(pg_restore --list "$backup_file" | grep "TABLE DATA" | wc -l)
    local index_count=$(pg_restore --list "$backup_file" | grep "INDEX" | wc -l)

    log "Backup contains:"
    log "  - $table_count tables"
    log "  - $index_count indexes"

    success "Backup validation passed"
    return 0
}

create_target_database() {
    local db_name="$1"

    log "Creating target database: $db_name"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] Would create database: $db_name"
        return 0
    fi

    # Check if database already exists
    local exists=$(PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname='$db_name'")

    if [[ "$exists" == "1" ]]; then
        warn "Database already exists: $db_name"
        read -p "Drop and recreate? (yes/no): " confirm
        if [[ "$confirm" != "yes" ]]; then
            error "Restore aborted by user"
            return 1
        fi

        # Terminate existing connections
        PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db_name';" \
            2>> "$LOG_FILE"

        # Drop database
        PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
            "DROP DATABASE \"$db_name\";" 2>> "$LOG_FILE"
    fi

    # Create database
    PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
        "CREATE DATABASE \"$db_name\" WITH ENCODING='UTF8';" 2>> "$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        error "Failed to create database"
        return 1
    fi

    success "Database created: $db_name"
    return 0
}

restore_backup() {
    local backup_file="$1"
    local target_db="$2"

    log "Starting restore..."
    log "Backup file: $backup_file"
    log "Target database: $target_db"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] Would restore backup to: $target_db"
        return 0
    fi

    local start_time=$(date +%s)

    # Restore using pg_restore
    PGPASSWORD="$PGPASSWORD" pg_restore \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$target_db" \
        --verbose \
        --no-owner \
        --no-acl \
        "$backup_file" \
        2>> "$LOG_FILE"

    local exit_code=$?
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [[ $exit_code -ne 0 ]]; then
        error "Restore failed with exit code: $exit_code"
        error "Check log file for details: $LOG_FILE"
        return 1
    fi

    success "Restore completed in ${duration}s"
    return 0
}

validate_restored_data() {
    local db_name="$1"

    log "Validating restored data..."

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] Would validate restored data"
        return 0
    fi

    # Get table counts
    local table_counts=$(PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db_name" -t -c "
        SELECT
            schemaname || '.' || tablename AS table_name,
            n_live_tup AS row_count
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 10;
    ")

    log "Top 10 tables by row count:"
    echo "$table_counts" | tee -a "$LOG_FILE"

    # Check for critical tables
    local critical_tables=("services" "users" "api_keys" "service_versions")
    for table in "${critical_tables[@]}"; do
        local count=$(PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db_name" -tAc \
            "SELECT COUNT(*) FROM $table;")

        if [[ $count -gt 0 ]]; then
            log "✓ Table '$table' has $count rows"
        else
            warn "⚠ Table '$table' is empty"
        fi
    done

    # Verify database size
    local db_size=$(PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db_name" -tAc \
        "SELECT pg_size_pretty(pg_database_size('$db_name'));")

    log "Database size: $db_size"

    success "Data validation completed"
    return 0
}

generate_restore_report() {
    local backup_file="$1"
    local target_db="$2"
    local duration="$3"
    local db_size="$4"

    cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║              Database Restore Report                          ║
╠══════════════════════════════════════════════════════════════╣
║ Target Database: $target_db
║ Host:            $DB_HOST
║ Timestamp:       $(date)
║ Duration:        ${duration}s
║ ──────────────────────────────────────────────────────────────
║ Backup Source:   $backup_file
║ Backup Size:     $(du -h "$backup_file" | cut -f1 2>/dev/null || echo "N/A")
║ ──────────────────────────────────────────────────────────────
║ Restored Size:   $db_size
║ ──────────────────────────────────────────────────────────────
║ Status:          ✅ SUCCESS
╚══════════════════════════════════════════════════════════════╝

Next Steps:
1. Validate application connectivity to restored database
2. Run application-level tests
3. If validation successful, switch application to use restored database
4. Monitor for 24-48 hours before decommissioning old database

EOF
}

cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        log "Cleaning up temporary files..."
        rm -rf "$TEMP_DIR"
    fi
}

##############################################################################
# Main
##############################################################################

main() {
    log "========================================="
    log "Database Restore Started"
    log "========================================="

    trap cleanup EXIT

    local overall_start=$(date +%s)

    # Parse command line arguments
    parse_arguments "$@"

    # Check prerequisites
    if ! check_prerequisites; then
        error "Prerequisites check failed"
        exit 1
    fi

    # Determine backup file
    local backup_file="$BACKUP_FILE"

    if [[ -n "$BACKUP_S3" ]]; then
        if ! backup_file=$(download_from_s3 "$BACKUP_S3"); then
            error "Failed to download backup from S3"
            exit 1
        fi
    elif [[ -n "$POINT_IN_TIME" ]]; then
        error "Point-in-time restore not yet implemented"
        error "Use AWS RDS console for PITR restore"
        exit 1
    fi

    # Validate backup
    if [[ "$SKIP_VALIDATION" != "true" ]]; then
        if ! validate_backup "$backup_file"; then
            error "Backup validation failed"
            exit 1
        fi
    fi

    # If validate-only, exit here
    if [[ "$VALIDATE_ONLY" == "true" ]]; then
        success "Validation completed successfully"
        exit 0
    fi

    # Create target database
    if ! create_target_database "$TARGET_DB"; then
        error "Failed to create target database"
        exit 1
    fi

    # Restore backup
    if ! restore_backup "$backup_file" "$TARGET_DB"; then
        error "Restore failed"
        exit 1
    fi

    # Validate restored data
    if ! validate_restored_data "$TARGET_DB"; then
        error "Data validation failed"
        exit 1
    fi

    # Get final database size
    local db_size=$(PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc \
        "SELECT pg_size_pretty(pg_database_size('$TARGET_DB'));" || echo "Unknown")

    # Calculate total duration
    local overall_end=$(date +%s)
    local total_duration=$((overall_end - overall_start))

    # Generate report
    generate_restore_report "$backup_file" "$TARGET_DB" "$total_duration" "$db_size"

    log "========================================="
    log "Database Restore Completed Successfully"
    log "Total Duration: ${total_duration}s"
    log "========================================="

    exit 0
}

# Run main function
main "$@"
