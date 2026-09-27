#!/bin/bash
# Blue-Green Deployment Script
# Usage: ./blue-green-deploy.sh <environment>

set -euo pipefail

ENVIRONMENT=${1:-staging}
NAMESPACE="llm-marketplace"
TIMEOUT="600s"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    error "Invalid environment: $ENVIRONMENT"
    exit 1
fi

log "Starting blue-green deployment for $ENVIRONMENT environment"

# Get current deployment color
CURRENT_COLOR=$(kubectl get deployment -n $NAMESPACE -l app=publishing,active=true -o jsonpath='{.items[0].metadata.labels.color}' 2>/dev/null || echo "blue")
NEW_COLOR=$([ "$CURRENT_COLOR" == "blue" ] && echo "green" || echo "blue")

log "Current active deployment: $CURRENT_COLOR"
log "New deployment will be: $NEW_COLOR"

# Apply new deployment with new color
log "Deploying $NEW_COLOR environment..."
kubectl apply -k infrastructure/kubernetes/overlays/$ENVIRONMENT

# Update deployment labels for blue-green
SERVICES=("publishing" "discovery" "consumption" "admin")

for SERVICE in "${SERVICES[@]}"; do
    log "Deploying $NEW_COLOR version of $SERVICE..."

    # Create new deployment with new color
    kubectl set image deployment/$SERVICE -n $NAMESPACE \
        $SERVICE=ghcr.io/org/llm-marketplace-$SERVICE:$GITHUB_SHA \
        --record

    # Label the new deployment
    kubectl label deployment/$SERVICE -n $NAMESPACE \
        color=$NEW_COLOR active=false --overwrite

    # Wait for new deployment to be ready
    log "Waiting for $SERVICE ($NEW_COLOR) to be ready..."
    kubectl rollout status deployment/$SERVICE -n $NAMESPACE --timeout=$TIMEOUT

    if [ $? -ne 0 ]; then
        error "Deployment of $SERVICE failed"
        exit 1
    fi
done

# Health check on new deployment
log "Running health checks on $NEW_COLOR deployment..."
sleep 30  # Wait for services to stabilize

HEALTH_CHECK_PASSED=true
for SERVICE in "${SERVICES[@]}"; do
    POD=$(kubectl get pod -n $NAMESPACE -l app=$SERVICE,color=$NEW_COLOR -o jsonpath='{.items[0].metadata.name}')

    if [ -z "$POD" ]; then
        error "No pods found for $SERVICE ($NEW_COLOR)"
        HEALTH_CHECK_PASSED=false
        continue
    fi

    log "Health checking $SERVICE pod: $POD"

    # Check if pod is ready
    kubectl wait --for=condition=ready pod/$POD -n $NAMESPACE --timeout=60s

    if [ $? -ne 0 ]; then
        error "Health check failed for $SERVICE"
        HEALTH_CHECK_PASSED=false
    fi
done

if [ "$HEALTH_CHECK_PASSED" = false ]; then
    error "Health checks failed. Aborting deployment."
    exit 1
fi

log "Health checks passed for all services"

# Switch traffic to new deployment
log "Switching traffic from $CURRENT_COLOR to $NEW_COLOR..."

for SERVICE in "${SERVICES[@]}"; do
    # Update service selector to point to new color
    kubectl patch service $SERVICE-service -n $NAMESPACE -p \
        "{\"spec\":{\"selector\":{\"color\":\"$NEW_COLOR\"}}}"

    # Mark new deployment as active
    kubectl label deployment/$SERVICE -n $NAMESPACE active=true --overwrite

    log "Traffic switched to $NEW_COLOR for $SERVICE"
done

# Wait for traffic to stabilize
log "Waiting for traffic to stabilize (60 seconds)..."
sleep 60

# Verify new deployment
log "Verifying new deployment..."
VERIFICATION_PASSED=true

for SERVICE in "${SERVICES[@]}"; do
    ERROR_RATE=$(kubectl logs -n $NAMESPACE -l app=$SERVICE,color=$NEW_COLOR --tail=1000 | grep -i "error" | wc -l)

    if [ "$ERROR_RATE" -gt 10 ]; then
        warn "High error rate detected for $SERVICE: $ERROR_RATE errors"
        VERIFICATION_PASSED=false
    fi
done

if [ "$VERIFICATION_PASSED" = false ]; then
    error "Verification failed. Consider rollback."
    exit 1
fi

log "Verification passed"

# Scale down old deployment
log "Scaling down $CURRENT_COLOR deployment..."
for SERVICE in "${SERVICES[@]}"; do
    kubectl scale deployment/$SERVICE -n $NAMESPACE --replicas=0 \
        -l color=$CURRENT_COLOR
done

# Clean up old ReplicaSets (keep last 3)
log "Cleaning up old ReplicaSets..."
kubectl delete replicaset -n $NAMESPACE \
    -l app=publishing \
    --field-selector 'status.replicas=0' \
    --sort-by=.metadata.creationTimestamp \
    --output=json | jq -r '.items[0:-3][] | .metadata.name' | \
    xargs -r kubectl delete replicaset -n $NAMESPACE

log "Blue-green deployment completed successfully!"
log "Active deployment: $NEW_COLOR"
log "Standby deployment: $CURRENT_COLOR (scaled to 0)"
