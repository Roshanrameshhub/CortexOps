#!/bin/bash
# PostgreSQL Backup Script with S3 upload and retention policy
# Usage: ./postgres-backup.sh <environment>

set -euo pipefail

ENVIRONMENT=${1:-production}
NAMESPACE="llm-marketplace"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/postgres-backups"
RETENTION_DAYS=30

# AWS S3 Configuration
S3_BUCKET="${S3_BACKUP_BUCKET:-llm-marketplace-backups}"
S3_PREFIX="postgres/${ENVIRONMENT}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

# Create backup directory
mkdir -p $BACKUP_DIR

# Get database credentials from Kubernetes secrets
log "Retrieving database credentials..."
DB_USER=$(kubectl get secret marketplace-secrets -n $NAMESPACE -o jsonpath='{.data.POSTGRES_USER}' | base64 -d)
DB_PASSWORD=$(kubectl get secret marketplace-secrets -n $NAMESPACE -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
DB_NAME=$(kubectl get configmap marketplace-config -n $NAMESPACE -o jsonpath='{.data.POSTGRES_DB}')
DB_HOST="postgres-service.${NAMESPACE}.svc.cluster.local"

# Get primary PostgreSQL pod
log "Finding PostgreSQL primary pod..."
POSTGRES_POD=$(kubectl get pod -n $NAMESPACE -l app=postgres -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POSTGRES_POD" ]; then
    error "PostgreSQL pod not found"
    exit 1
fi

log "Using PostgreSQL pod: $POSTGRES_POD"

# Perform backup using pg_dump
BACKUP_FILE="${BACKUP_DIR}/postgres-${ENVIRONMENT}-${TIMESTAMP}.sql"
log "Starting PostgreSQL backup..."

kubectl exec -n $NAMESPACE $POSTGRES_POD -- \
    pg_dump -U $DB_USER -d $DB_NAME --clean --if-exists --no-owner --no-acl \
    > $BACKUP_FILE

if [ $? -ne 0 ]; then
    error "pg_dump failed"
    exit 1
fi

log "Backup created: $BACKUP_FILE"

# Compress backup
log "Compressing backup..."
gzip $BACKUP_FILE
BACKUP_FILE="${BACKUP_FILE}.gz"

# Calculate checksum
CHECKSUM=$(sha256sum $BACKUP_FILE | awk '{print $1}')
log "Backup checksum: $CHECKSUM"

# Upload to S3
log "Uploading backup to S3..."
aws s3 cp $BACKUP_FILE \
    s3://${S3_BUCKET}/${S3_PREFIX}/postgres-${ENVIRONMENT}-${TIMESTAMP}.sql.gz \
    --metadata "checksum=${CHECKSUM},environment=${ENVIRONMENT},timestamp=${TIMESTAMP}" \
    --storage-class STANDARD_IA

if [ $? -ne 0 ]; then
    error "S3 upload failed"
    exit 1
fi

log "Backup uploaded to S3: s3://${S3_BUCKET}/${S3_PREFIX}/postgres-${ENVIRONMENT}-${TIMESTAMP}.sql.gz"

# Cross-region replication (if enabled)
if [ "${ENABLE_CROSS_REGION_BACKUP:-false}" == "true" ]; then
    DR_BUCKET="${S3_BACKUP_BUCKET}-dr"
    log "Replicating backup to DR region..."

    aws s3 cp $BACKUP_FILE \
        s3://${DR_BUCKET}/${S3_PREFIX}/postgres-${ENVIRONMENT}-${TIMESTAMP}.sql.gz \
        --region ${DR_REGION:-us-west-2} \
        --metadata "checksum=${CHECKSUM},environment=${ENVIRONMENT},timestamp=${TIMESTAMP}" \
        --storage-class GLACIER

    log "Backup replicated to DR region"
fi

# Clean up local backup
log "Cleaning up local backup..."
rm -f $BACKUP_FILE

# Apply retention policy - delete backups older than RETENTION_DAYS
log "Applying retention policy (${RETENTION_DAYS} days)..."
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)

aws s3 ls s3://${S3_BUCKET}/${S3_PREFIX}/ | while read -r line; do
    BACKUP_DATE=$(echo $line | awk '{print $4}' | grep -oP '\d{8}' | head -1)

    if [ -n "$BACKUP_DATE" ] && [ "$BACKUP_DATE" -lt "$CUTOFF_DATE" ]; then
        BACKUP_KEY=$(echo $line | awk '{print $4}')
        log "Deleting old backup: $BACKUP_KEY"
        aws s3 rm s3://${S3_BUCKET}/${S3_PREFIX}/$BACKUP_KEY
    fi
done

# Create backup manifest
MANIFEST_FILE="${BACKUP_DIR}/backup-manifest-${TIMESTAMP}.json"
cat > $MANIFEST_FILE <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "environment": "${ENVIRONMENT}",
  "database": "${DB_NAME}",
  "backup_file": "postgres-${ENVIRONMENT}-${TIMESTAMP}.sql.gz",
  "checksum": "${CHECKSUM}",
  "size_bytes": $(stat -f%z $BACKUP_FILE 2>/dev/null || stat -c%s $BACKUP_FILE),
  "s3_location": "s3://${S3_BUCKET}/${S3_PREFIX}/postgres-${ENVIRONMENT}-${TIMESTAMP}.sql.gz",
  "retention_days": ${RETENTION_DAYS}
}
EOF

aws s3 cp $MANIFEST_FILE s3://${S3_BUCKET}/${S3_PREFIX}/manifests/
rm -f $MANIFEST_FILE

log "PostgreSQL backup completed successfully!"
log "Backup location: s3://${S3_BUCKET}/${S3_PREFIX}/postgres-${ENVIRONMENT}-${TIMESTAMP}.sql.gz"
log "Checksum: $CHECKSUM"
