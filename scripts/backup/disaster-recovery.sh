#!/bin/bash
# Disaster Recovery Script - Full system restore from backups
# Usage: ./disaster-recovery.sh <environment> <backup-timestamp>

set -euo pipefail

ENVIRONMENT=${1:-production}
BACKUP_TIMESTAMP=${2:-latest}
NAMESPACE="llm-marketplace"
S3_BUCKET="${S3_BACKUP_BUCKET:-llm-marketplace-backups}"
RESTORE_DIR="/tmp/restore-${TIMESTAMP}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

warn "========================================"
warn "DISASTER RECOVERY PROCEDURE"
warn "Environment: $ENVIRONMENT"
warn "Backup: $BACKUP_TIMESTAMP"
warn "========================================"
warn "This will restore the system from backup."
warn "All current data will be replaced!"
warn "Press Ctrl+C to cancel, or Enter to continue..."
read

log "Starting disaster recovery procedure..."

# Create restore directory
mkdir -p $RESTORE_DIR

# Step 1: Download backups from S3
log "Step 1/7: Downloading backups from S3..."

if [ "$BACKUP_TIMESTAMP" == "latest" ]; then
    # Get latest backup
    POSTGRES_BACKUP=$(aws s3 ls s3://${S3_BUCKET}/postgres/${ENVIRONMENT}/ | sort | tail -n 1 | awk '{print $4}')
    REDIS_BACKUP=$(aws s3 ls s3://${S3_BUCKET}/redis/${ENVIRONMENT}/ | sort | tail -n 1 | awk '{print $4}')
    KAFKA_BACKUP=$(aws s3 ls s3://${S3_BUCKET}/kafka/${ENVIRONMENT}/ | sort | tail -n 1 | awk '{print $4}')
else
    POSTGRES_BACKUP="postgres-${ENVIRONMENT}-${BACKUP_TIMESTAMP}.sql.gz"
    REDIS_BACKUP="redis-${ENVIRONMENT}-${BACKUP_TIMESTAMP}.rdb.gz"
    KAFKA_BACKUP="kafka-${ENVIRONMENT}-${BACKUP_TIMESTAMP}.tar.gz"
fi

log "Downloading PostgreSQL backup: $POSTGRES_BACKUP"
aws s3 cp s3://${S3_BUCKET}/postgres/${ENVIRONMENT}/$POSTGRES_BACKUP $RESTORE_DIR/

log "Downloading Redis backup: $REDIS_BACKUP"
aws s3 cp s3://${S3_BUCKET}/redis/${ENVIRONMENT}/$REDIS_BACKUP $RESTORE_DIR/

log "Downloading Kafka backup: $KAFKA_BACKUP"
aws s3 cp s3://${S3_BUCKET}/kafka/${ENVIRONMENT}/$KAFKA_BACKUP $RESTORE_DIR/

# Step 2: Verify backup integrity
log "Step 2/7: Verifying backup integrity..."

for BACKUP in $POSTGRES_BACKUP $REDIS_BACKUP $KAFKA_BACKUP; do
    BACKUP_PATH="${RESTORE_DIR}/${BACKUP}"

    # Get checksum from S3 metadata
    S3_CHECKSUM=$(aws s3api head-object \
        --bucket $S3_BUCKET \
        --key "${BACKUP%/*}/${BACKUP}" \
        --query 'Metadata.checksum' \
        --output text)

    # Calculate local checksum
    LOCAL_CHECKSUM=$(sha256sum $BACKUP_PATH | awk '{print $1}')

    if [ "$S3_CHECKSUM" != "$LOCAL_CHECKSUM" ]; then
        error "Checksum mismatch for $BACKUP"
        error "Expected: $S3_CHECKSUM"
        error "Got: $LOCAL_CHECKSUM"
        exit 1
    fi

    log "Checksum verified for $BACKUP"
done

# Step 3: Scale down all services
log "Step 3/7: Scaling down all services..."
SERVICES=("publishing" "discovery" "consumption" "admin")

for SERVICE in "${SERVICES[@]}"; do
    kubectl scale deployment/$SERVICE -n $NAMESPACE --replicas=0
done

log "Waiting for all pods to terminate..."
kubectl wait --for=delete pod -n $NAMESPACE -l app.kubernetes.io/part-of=llm-marketplace --timeout=300s

# Step 4: Restore PostgreSQL
log "Step 4/7: Restoring PostgreSQL database..."

# Decompress backup
gunzip -c $RESTORE_DIR/$POSTGRES_BACKUP > $RESTORE_DIR/postgres.sql

# Get PostgreSQL pod
POSTGRES_POD=$(kubectl get pod -n $NAMESPACE -l app=postgres -o jsonpath='{.items[0].metadata.name}')

# Drop and recreate database
kubectl exec -n $NAMESPACE $POSTGRES_POD -- \
    psql -U $DB_USER -c "DROP DATABASE IF EXISTS ${DB_NAME};"

kubectl exec -n $NAMESPACE $POSTGRES_POD -- \
    psql -U $DB_USER -c "CREATE DATABASE ${DB_NAME};"

# Restore data
kubectl exec -i -n $NAMESPACE $POSTGRES_POD -- \
    psql -U $DB_USER -d $DB_NAME < $RESTORE_DIR/postgres.sql

log "PostgreSQL restore completed"

# Step 5: Restore Redis
log "Step 5/7: Restoring Redis cache..."

# Decompress backup
gunzip -c $RESTORE_DIR/$REDIS_BACKUP > $RESTORE_DIR/dump.rdb

# Get Redis pod
REDIS_POD=$(kubectl get pod -n $NAMESPACE -l app=redis -o jsonpath='{.items[0].metadata.name}')

# Stop Redis, copy backup, restart
kubectl exec -n $NAMESPACE $REDIS_POD -- redis-cli SHUTDOWN NOSAVE
kubectl cp $RESTORE_DIR/dump.rdb $NAMESPACE/$REDIS_POD:/data/dump.rdb
kubectl delete pod $REDIS_POD -n $NAMESPACE

# Wait for Redis to restart
kubectl wait --for=condition=ready pod -n $NAMESPACE -l app=redis --timeout=120s

log "Redis restore completed"

# Step 6: Restore Kafka topics
log "Step 6/7: Restoring Kafka topics..."

# Extract backup
tar -xzf $RESTORE_DIR/$KAFKA_BACKUP -C $RESTORE_DIR

# Get Kafka pod
KAFKA_POD=$(kubectl get pod -n $NAMESPACE -l app=kafka -o jsonpath='{.items[0].metadata.name}')

# Restore each topic
for TOPIC_BACKUP in $RESTORE_DIR/kafka-topics/*.json; do
    TOPIC_NAME=$(basename $TOPIC_BACKUP .json)
    log "Restoring topic: $TOPIC_NAME"

    # Create topic
    kubectl exec -n $NAMESPACE $KAFKA_POD -- \
        kafka-topics --bootstrap-server localhost:9092 \
        --create --topic $TOPIC_NAME --if-not-exists \
        --config $(cat $TOPIC_BACKUP | jq -r '.config | to_entries[] | "\(.key)=\(.value)"' | tr '\n' ',')

    # Restore messages (if message backup exists)
    if [ -f "$RESTORE_DIR/kafka-messages/${TOPIC_NAME}.json" ]; then
        kubectl exec -i -n $NAMESPACE $KAFKA_POD -- \
            kafka-console-producer --bootstrap-server localhost:9092 \
            --topic $TOPIC_NAME < $RESTORE_DIR/kafka-messages/${TOPIC_NAME}.json
    fi
done

log "Kafka restore completed"

# Step 7: Scale up services and verify
log "Step 7/7: Scaling up services..."

for SERVICE in "${SERVICES[@]}"; do
    DESIRED_REPLICAS=$(kubectl get hpa ${SERVICE}-hpa -n $NAMESPACE -o jsonpath='{.spec.minReplicas}')
    kubectl scale deployment/$SERVICE -n $NAMESPACE --replicas=$DESIRED_REPLICAS

    log "Waiting for $SERVICE to be ready..."
    kubectl rollout status deployment/$SERVICE -n $NAMESPACE --timeout=600s
done

# Verify system health
log "Verifying system health..."
sleep 30

HEALTH_PASSED=true
for SERVICE in "${SERVICES[@]}"; do
    POD=$(kubectl get pod -n $NAMESPACE -l app=$SERVICE -o jsonpath='{.items[0].metadata.name}')

    if kubectl exec -n $NAMESPACE $POD -- wget -qO- http://localhost:3001/health > /dev/null 2>&1; then
        log "$SERVICE is healthy"
    else
        error "$SERVICE health check failed"
        HEALTH_PASSED=false
    fi
done

# Clean up restore directory
log "Cleaning up restore files..."
rm -rf $RESTORE_DIR

if [ "$HEALTH_PASSED" = true ]; then
    log "=========================================="
    log "DISASTER RECOVERY COMPLETED SUCCESSFULLY!"
    log "Environment: $ENVIRONMENT"
    log "Restored from: $BACKUP_TIMESTAMP"
    log "All services are healthy"
    log "=========================================="
else
    error "=========================================="
    error "DISASTER RECOVERY COMPLETED WITH ERRORS"
    error "Some services are unhealthy"
    error "Manual intervention required"
    error "=========================================="
    exit 1
fi

# Send notification
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -X POST $SLACK_WEBHOOK_URL \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"✅ Disaster recovery completed for $ENVIRONMENT from backup $BACKUP_TIMESTAMP\"}"
fi
