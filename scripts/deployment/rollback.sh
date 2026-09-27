#!/bin/bash
# Rollback Script - Reverts to previous stable deployment
# Usage: ./rollback.sh <environment>

set -euo pipefail

ENVIRONMENT=${1:-staging}
NAMESPACE="llm-marketplace"

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

log "Starting rollback for $ENVIRONMENT environment"

SERVICES=("publishing" "discovery" "consumption" "admin")

# Get current and previous deployments
CURRENT_COLOR=$(kubectl get deployment -n $NAMESPACE -l app=publishing,active=true -o jsonpath='{.items[0].metadata.labels.color}' 2>/dev/null || echo "")
PREVIOUS_COLOR=$([ "$CURRENT_COLOR" == "blue" ] && echo "green" || echo "blue")

if [ -z "$CURRENT_COLOR" ]; then
    error "Cannot determine current deployment color"
    exit 1
fi

warn "Current deployment: $CURRENT_COLOR"
warn "Rolling back to: $PREVIOUS_COLOR"

# Verify previous deployment exists
PREVIOUS_EXISTS=$(kubectl get deployment -n $NAMESPACE -l color=$PREVIOUS_COLOR -o name | wc -l)

if [ "$PREVIOUS_EXISTS" -eq 0 ]; then
    error "Previous deployment ($PREVIOUS_COLOR) not found. Cannot rollback."
    exit 1
fi

# Scale up previous deployment
log "Scaling up $PREVIOUS_COLOR deployment..."
for SERVICE in "${SERVICES[@]}"; do
    DESIRED_REPLICAS=$(kubectl get hpa ${SERVICE}-hpa -n $NAMESPACE -o jsonpath='{.spec.minReplicas}')
    kubectl scale deployment/$SERVICE -n $NAMESPACE --replicas=$DESIRED_REPLICAS -l color=$PREVIOUS_COLOR

    log "Waiting for $SERVICE ($PREVIOUS_COLOR) to be ready..."
    kubectl rollout status deployment -n $NAMESPACE -l app=$SERVICE,color=$PREVIOUS_COLOR --timeout=300s
done

# Switch traffic back
log "Switching traffic from $CURRENT_COLOR to $PREVIOUS_COLOR..."
for SERVICE in "${SERVICES[@]}"; do
    kubectl patch service $SERVICE-service -n $NAMESPACE -p \
        "{\"spec\":{\"selector\":{\"color\":\"$PREVIOUS_COLOR\"}}}"

    kubectl label deployment/$SERVICE -n $NAMESPACE active=true --overwrite -l color=$PREVIOUS_COLOR
    kubectl label deployment/$SERVICE -n $NAMESPACE active=false --overwrite -l color=$CURRENT_COLOR
done

log "Traffic switched to $PREVIOUS_COLOR"

# Wait for traffic to stabilize
log "Waiting for traffic to stabilize (30 seconds)..."
sleep 30

# Verify rollback
log "Verifying rollback..."
for SERVICE in "${SERVICES[@]}"; do
    POD=$(kubectl get pod -n $NAMESPACE -l app=$SERVICE,color=$PREVIOUS_COLOR -o jsonpath='{.items[0].metadata.name}')

    if kubectl wait --for=condition=ready pod/$POD -n $NAMESPACE --timeout=60s; then
        log "$SERVICE rollback verified: $POD is ready"
    else
        error "$SERVICE rollback verification failed"
        exit 1
    fi
done

# Scale down failed deployment
log "Scaling down failed deployment ($CURRENT_COLOR)..."
for SERVICE in "${SERVICES[@]}"; do
    kubectl scale deployment/$SERVICE -n $NAMESPACE --replicas=0 -l color=$CURRENT_COLOR
done

log "Rollback completed successfully!"
log "Active deployment: $PREVIOUS_COLOR"
log "Failed deployment: $CURRENT_COLOR (scaled to 0)"

# Send alert
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -X POST $SLACK_WEBHOOK_URL \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"⚠️ Rollback executed for $ENVIRONMENT environment. Active: $PREVIOUS_COLOR\"}"
fi
