#!/bin/bash
# SLO Validation Script for Chaos Engineering
# Validates system SLOs before and after chaos experiments

set -e

# Configuration
PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus.monitoring.svc.cluster.local:9090}"
NAMESPACE="${NAMESPACE:-llm-marketplace}"
CHECK_TYPE="${1:-pre-chaos}"  # pre-chaos, post-chaos, emergency

# SLO Thresholds
ERROR_RATE_THRESHOLD=0.01  # 1%
LATENCY_P95_THRESHOLD=2.0  # 2 seconds
LATENCY_P99_THRESHOLD=5.0  # 5 seconds
POD_AVAILABILITY_THRESHOLD=95  # 95%
DB_CONNECTION_THRESHOLD=80  # 80% of max connections
CACHE_HIT_RATE_THRESHOLD=70  # 70%

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to query Prometheus
query_prometheus() {
    local query="$1"
    curl -s -G "$PROMETHEUS_URL/api/v1/query" \
        --data-urlencode "query=$query" \
        | jq -r '.data.result[0].value[1] // "0"'
}

# Function to print status
print_status() {
    local status=$1
    local message=$2
    local value=$3
    local threshold=$4

    case $status in
        pass)
            echo -e "${GREEN}✓${NC} $message: $value (threshold: $threshold)"
            ;;
        fail)
            echo -e "${RED}✗${NC} $message: $value (threshold: $threshold)"
            ;;
        warn)
            echo -e "${YELLOW}⚠${NC} $message: $value (threshold: $threshold)"
            ;;
    esac
}

# Function to validate error rate
validate_error_rate() {
    echo "Checking error rate..."

    local error_rate=$(query_prometheus 'sum(rate(http_requests_total{status=~"5.."}[5m]))/sum(rate(http_requests_total[5m]))')

    # Convert to percentage for display
    local error_rate_pct=$(echo "$error_rate * 100" | bc -l | xargs printf "%.2f")
    local threshold_pct=$(echo "$ERROR_RATE_THRESHOLD * 100" | bc -l | xargs printf "%.2f")

    if (( $(echo "$error_rate <= $ERROR_RATE_THRESHOLD" | bc -l) )); then
        print_status "pass" "Error Rate" "${error_rate_pct}%" "${threshold_pct}%"
        return 0
    else
        print_status "fail" "Error Rate" "${error_rate_pct}%" "${threshold_pct}%"
        return 1
    fi
}

# Function to validate latency
validate_latency() {
    echo "Checking latency..."

    # P95 latency
    local p95_latency=$(query_prometheus 'histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket[5m])) by (le))')

    if (( $(echo "$p95_latency <= $LATENCY_P95_THRESHOLD" | bc -l) )); then
        print_status "pass" "P95 Latency" "${p95_latency}s" "${LATENCY_P95_THRESHOLD}s"
        P95_PASS=0
    else
        print_status "fail" "P95 Latency" "${p95_latency}s" "${LATENCY_P95_THRESHOLD}s"
        P95_PASS=1
    fi

    # P99 latency
    local p99_latency=$(query_prometheus 'histogram_quantile(0.99,sum(rate(http_request_duration_seconds_bucket[5m])) by (le))')

    if (( $(echo "$p99_latency <= $LATENCY_P99_THRESHOLD" | bc -l) )); then
        print_status "pass" "P99 Latency" "${p99_latency}s" "${LATENCY_P99_THRESHOLD}s"
        P99_PASS=0
    else
        print_status "warn" "P99 Latency" "${p99_latency}s" "${LATENCY_P99_THRESHOLD}s"
        P99_PASS=1
    fi

    return $P95_PASS
}

# Function to validate pod availability
validate_pod_availability() {
    echo "Checking pod availability..."

    local total_pods=$(kubectl get pods -n $NAMESPACE -o json \
        | jq '.items | length')

    local ready_pods=$(kubectl get pods -n $NAMESPACE -o json \
        | jq '[.items[] | select(.status.phase == "Running" and (.status.conditions[] | select(.type == "Ready" and .status == "True")))] | length')

    if [ "$total_pods" -eq 0 ]; then
        print_status "fail" "Pod Availability" "No pods found" "N/A"
        return 1
    fi

    local availability=$(echo "scale=2; $ready_pods * 100 / $total_pods" | bc)

    if (( $(echo "$availability >= $POD_AVAILABILITY_THRESHOLD" | bc -l) )); then
        print_status "pass" "Pod Availability" "${availability}%" "${POD_AVAILABILITY_THRESHOLD}%"

        # List pods that are not ready
        local not_ready=$(kubectl get pods -n $NAMESPACE -o json \
            | jq -r '.items[] | select(.status.phase != "Running" or (.status.conditions[] | select(.type == "Ready" and .status != "True"))) | .metadata.name')

        if [ -n "$not_ready" ]; then
            echo "  Pods not ready:"
            echo "$not_ready" | while read pod; do
                echo "    - $pod"
            done
        fi

        return 0
    else
        print_status "fail" "Pod Availability" "${availability}%" "${POD_AVAILABILITY_THRESHOLD}%"
        return 1
    fi
}

# Function to validate database health
validate_database() {
    echo "Checking database health..."

    # Check if PostgreSQL pods are running
    local postgres_pods=$(kubectl get pods -n $NAMESPACE -l app=postgres -o json \
        | jq '[.items[] | select(.status.phase == "Running")] | length')

    if [ "$postgres_pods" -eq 0 ]; then
        print_status "fail" "PostgreSQL Pods" "0 running" ">= 1"
        return 1
    fi

    print_status "pass" "PostgreSQL Pods" "$postgres_pods running" ">= 1"

    # Check connection pool utilization
    local conn_utilization=$(query_prometheus 'pg_stat_database_numbackends / pg_settings_max_connections * 100')

    if (( $(echo "$conn_utilization <= $DB_CONNECTION_THRESHOLD" | bc -l) )); then
        print_status "pass" "DB Connection Pool" "${conn_utilization}%" "${DB_CONNECTION_THRESHOLD}%"
        return 0
    else
        print_status "warn" "DB Connection Pool" "${conn_utilization}%" "${DB_CONNECTION_THRESHOLD}%"
        return 0  # Warning, not failure
    fi
}

# Function to validate cache health
validate_cache() {
    echo "Checking cache health..."

    # Check if Redis pods are running
    local redis_pods=$(kubectl get pods -n $NAMESPACE -l app=redis -o json \
        | jq '[.items[] | select(.status.phase == "Running")] | length')

    if [ "$redis_pods" -eq 0 ]; then
        print_status "fail" "Redis Pods" "0 running" ">= 1"
        return 1
    fi

    print_status "pass" "Redis Pods" "$redis_pods running" ">= 1"

    # Check cache hit rate
    local hit_rate=$(query_prometheus 'rate(redis_keyspace_hits_total[5m])/(rate(redis_keyspace_hits_total[5m])+rate(redis_keyspace_misses_total[5m])) * 100')

    if [ "$hit_rate" == "0" ] || [ -z "$hit_rate" ]; then
        print_status "warn" "Cache Hit Rate" "No data" "${CACHE_HIT_RATE_THRESHOLD}%"
        return 0
    fi

    if (( $(echo "$hit_rate >= $CACHE_HIT_RATE_THRESHOLD" | bc -l) )); then
        print_status "pass" "Cache Hit Rate" "${hit_rate}%" "${CACHE_HIT_RATE_THRESHOLD}%"
        return 0
    else
        print_status "warn" "Cache Hit Rate" "${hit_rate}%" "${CACHE_HIT_RATE_THRESHOLD}%"
        return 0  # Warning, not failure
    fi
}

# Function to check for active alerts
check_active_alerts() {
    echo "Checking for active alerts..."

    local critical_alerts=$(query_prometheus 'count(ALERTS{severity="critical"})')
    local warning_alerts=$(query_prometheus 'count(ALERTS{severity="warning"})')

    echo "  Critical alerts: $critical_alerts"
    echo "  Warning alerts: $warning_alerts"

    if [ "$critical_alerts" != "0" ] && [ "$critical_alerts" != "null" ]; then
        print_status "fail" "Critical Alerts" "$critical_alerts active" "0"

        # List active critical alerts
        local alert_names=$(curl -s -G "$PROMETHEUS_URL/api/v1/query" \
            --data-urlencode 'query=ALERTS{severity="critical"}' \
            | jq -r '.data.result[].labels.alertname')

        echo "  Active critical alerts:"
        echo "$alert_names" | while read alert; do
            echo "    - $alert"
        done

        return 1
    else
        print_status "pass" "Critical Alerts" "0 active" "0"
        return 0
    fi
}

# Function to export metrics to JSON
export_metrics() {
    local output_file="${2:-/tmp/chaos-metrics-$(date +%Y%m%d-%H%M%S).json}"

    echo "Exporting metrics to $output_file..."

    cat > "$output_file" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "check_type": "$CHECK_TYPE",
  "metrics": {
    "error_rate": $(query_prometheus 'sum(rate(http_requests_total{status=~"5.."}[5m]))/sum(rate(http_requests_total[5m]))'),
    "latency_p95": $(query_prometheus 'histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket[5m])) by (le))'),
    "latency_p99": $(query_prometheus 'histogram_quantile(0.99,sum(rate(http_request_duration_seconds_bucket[5m])) by (le))'),
    "pod_availability": $(kubectl get pods -n $NAMESPACE -o json | jq '[.items[] | select(.status.phase == "Running")] | length / ([.items] | length) * 100'),
    "db_connection_utilization": $(query_prometheus 'pg_stat_database_numbackends / pg_settings_max_connections * 100'),
    "cache_hit_rate": $(query_prometheus 'rate(redis_keyspace_hits_total[5m])/(rate(redis_keyspace_hits_total[5m])+rate(redis_keyspace_misses_total[5m])) * 100')
  },
  "pods": $(kubectl get pods -n $NAMESPACE -o json | jq '{total: (.items | length), running: ([.items[] | select(.status.phase == "Running")] | length), ready: ([.items[] | select(.status.conditions[] | select(.type == "Ready" and .status == "True"))] | length)}')
}
EOF

    echo "Metrics exported to: $output_file"
}

# Main validation flow
main() {
    echo "========================================="
    echo "  SLO Validation: $CHECK_TYPE"
    echo "  Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo "  Namespace: $NAMESPACE"
    echo "========================================="
    echo ""

    local failures=0

    # Run all validations
    validate_error_rate || ((failures++))
    echo ""

    validate_latency || ((failures++))
    echo ""

    validate_pod_availability || ((failures++))
    echo ""

    validate_database || ((failures++))
    echo ""

    validate_cache || ((failures++))
    echo ""

    check_active_alerts || ((failures++))
    echo ""

    # Export metrics
    if [ "$2" == "--export" ]; then
        export_metrics "$CHECK_TYPE" "$3"
        echo ""
    fi

    # Summary
    echo "========================================="
    if [ $failures -eq 0 ]; then
        echo -e "${GREEN}✓ All SLO validations passed${NC}"
        echo "========================================="
        exit 0
    else
        echo -e "${RED}✗ $failures validation(s) failed${NC}"
        echo "========================================="

        if [ "$CHECK_TYPE" == "pre-chaos" ]; then
            echo "Cannot proceed with chaos experiments. Fix issues and retry."
        elif [ "$CHECK_TYPE" == "post-chaos" ]; then
            echo "System has not fully recovered. Manual intervention may be required."
        fi

        exit 1
    fi
}

# Run main function
main "$@"
