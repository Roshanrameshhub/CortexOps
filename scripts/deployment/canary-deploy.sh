#!/bin/bash
# Canary Deployment Script with gradual traffic shifting
# Usage: ./canary-deploy.sh <environment> <percentage>

set -euo pipefail

ENVIRONMENT=${1:-production}
PERCENTAGE=${2:-10}
NAMESPACE="llm-marketplace"

# Colors for output
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

# Validate percentage
if [[ ! "$PERCENTAGE" =~ ^[0-9]+$ ]] || [ "$PERCENTAGE" -lt 0 ] || [ "$PERCENTAGE" -gt 100 ]; then
    error "Invalid percentage: $PERCENTAGE (must be 0-100)"
    exit 1
fi

log "Starting canary deployment to $ENVIRONMENT with $PERCENTAGE% traffic"

SERVICES=("publishing" "discovery" "consumption" "admin")

for SERVICE in "${SERVICES[@]}"; do
    log "Configuring canary for $SERVICE..."

    # Create VirtualService for traffic splitting
    cat <<EOF | kubectl apply -f -
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: ${SERVICE}-canary
  namespace: $NAMESPACE
spec:
  hosts:
    - ${SERVICE}-service
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination:
            host: ${SERVICE}-service
            subset: canary
          weight: 100
    - route:
        - destination:
            host: ${SERVICE}-service
            subset: stable
          weight: $((100 - PERCENTAGE))
        - destination:
            host: ${SERVICE}-service
            subset: canary
          weight: $PERCENTAGE
EOF

    # Create DestinationRule for subsets
    cat <<EOF | kubectl apply -f -
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: ${SERVICE}-canary
  namespace: $NAMESPACE
spec:
  host: ${SERVICE}-service
  subsets:
    - name: stable
      labels:
        version: stable
    - name: canary
      labels:
        version: canary
EOF

    log "Canary configured for $SERVICE: $PERCENTAGE% traffic to canary"
done

# Monitor canary metrics
log "Monitoring canary metrics for 5 minutes..."
MONITOR_DURATION=300  # 5 minutes
MONITOR_INTERVAL=30

for ((i=0; i<$MONITOR_DURATION; i+=$MONITOR_INTERVAL)); do
    log "Monitoring progress: ${i}s / ${MONITOR_DURATION}s"

    for SERVICE in "${SERVICES[@]}"; do
        # Get error rate from Prometheus
        ERROR_RATE=$(kubectl exec -n $NAMESPACE prometheus-0 -- \
            wget -qO- "http://localhost:9090/api/v1/query?query=rate(http_requests_total{service=\"$SERVICE\",version=\"canary\",status=~\"5..\"}[5m])" | \
            jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")

        # Get p95 latency
        P95_LATENCY=$(kubectl exec -n $NAMESPACE prometheus-0 -- \
            wget -qO- "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,http_request_duration_seconds{service=\"$SERVICE\",version=\"canary\"})" | \
            jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")

        log "$SERVICE canary - Error rate: $ERROR_RATE, P95 latency: ${P95_LATENCY}s"

        # Alert thresholds
        if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
            error "$SERVICE canary error rate too high: $ERROR_RATE"
            exit 1
        fi

        if (( $(echo "$P95_LATENCY > 1.0" | bc -l) )); then
            warn "$SERVICE canary latency high: ${P95_LATENCY}s"
        fi
    done

    sleep $MONITOR_INTERVAL
done

log "Canary monitoring completed successfully"
log "Canary deployment at $PERCENTAGE% is healthy"

if [ "$PERCENTAGE" -eq 100 ]; then
    log "Promoting canary to stable..."

    for SERVICE in "${SERVICES[@]}"; do
        kubectl label deployment/$SERVICE -n $NAMESPACE version=stable --overwrite
        kubectl label deployment/$SERVICE -n $NAMESPACE version-
    done

    log "Canary promoted to stable. Deployment complete!"
fi
