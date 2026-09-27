#!/bin/bash
# Smoke Test Script for Deprecation Agent
#
# Verifies the Deprecation Agent is correctly deployed and functioning.
# Run this script after deployment to validate the agent.
#
# Usage:
#   ./smoke-test-deprecation-agent.sh [environment]
#
# Arguments:
#   environment: dev, staging, prod (default: dev)

set -e

ENVIRONMENT="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Determine endpoint based on environment
case "$ENVIRONMENT" in
  dev)
    BASE_URL="${DEPRECATION_AGENT_URL:-http://localhost:8080}"
    ;;
  staging)
    BASE_URL="${DEPRECATION_AGENT_URL:-https://deprecation-agent-staging.run.app}"
    ;;
  prod)
    BASE_URL="${DEPRECATION_AGENT_URL:-https://deprecation-agent.run.app}"
    ;;
  *)
    echo -e "${RED}Unknown environment: $ENVIRONMENT${NC}"
    exit 1
    ;;
esac

echo "========================================"
echo "Deprecation Agent Smoke Tests"
echo "Environment: $ENVIRONMENT"
echo "Base URL: $BASE_URL"
echo "========================================"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run a test
run_test() {
  local test_name="$1"
  local test_command="$2"
  local expected_status="$3"

  echo -n "Testing: $test_name... "

  # Run the command and capture response
  response=$(eval "$test_command" 2>&1) || true
  status=$(echo "$response" | grep -o '"success":[^,]*' | cut -d':' -f2 | tr -d ' ')

  if [ "$status" == "$expected_status" ]; then
    echo -e "${GREEN}PASSED${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}FAILED${NC}"
    echo "  Expected: success=$expected_status"
    echo "  Got: $response"
    ((TESTS_FAILED++))
  fi
}

# Test 1: Health Check
echo "--- Health Check ---"
run_test "Health endpoint" \
  "curl -s $BASE_URL/health" \
  "true"

# Test 2: Invalid Method (GET instead of POST)
echo ""
echo "--- Method Validation ---"
run_test "GET method rejected" \
  "curl -s -X GET $BASE_URL/deprecation" \
  "false"

# Test 3: Missing Input
echo ""
echo "--- Input Validation ---"
run_test "Missing input rejected" \
  "curl -s -X POST $BASE_URL/deprecation -H 'Content-Type: application/json' -d '{}'" \
  "false"

# Test 4: Invalid Asset Type
echo ""
echo "--- Schema Validation ---"
TEST_ASSET_ID=$(uuidgen 2>/dev/null || echo "550e8400-e29b-41d4-a716-446655440000")
TEST_REQUESTER_ID=$(uuidgen 2>/dev/null || echo "550e8400-e29b-41d4-a716-446655440001")

run_test "Invalid asset type rejected" \
  "curl -s -X POST $BASE_URL/deprecation -H 'Content-Type: application/json' -d '{
    \"input\": {
      \"assetId\": \"$TEST_ASSET_ID\",
      \"assetType\": \"invalid_type\",
      \"currentVersion\": \"1.0.0\",
      \"targetState\": \"deprecated\",
      \"reason\": \"end_of_life\",
      \"reasonDescription\": \"This is a test deprecation request.\",
      \"requesterId\": \"$TEST_REQUESTER_ID\"
    }
  }'" \
  "false"

# Test 5: Valid Request Structure (Dry Run)
echo ""
echo "--- Dry Run Test ---"
run_test "Valid dry run request" \
  "curl -s -X POST $BASE_URL/deprecation -H 'Content-Type: application/json' -d '{
    \"input\": {
      \"assetId\": \"$TEST_ASSET_ID\",
      \"assetType\": \"service\",
      \"currentVersion\": \"1.0.0\",
      \"targetState\": \"deprecated\",
      \"reason\": \"end_of_life\",
      \"reasonDescription\": \"This is a test deprecation request for smoke testing.\",
      \"requesterId\": \"$TEST_REQUESTER_ID\"
    },
    \"options\": {
      \"dryRun\": true
    }
  }'" \
  "true"

# Test 6: Verbose Mode
echo ""
echo "--- Verbose Mode Test ---"
run_test "Verbose mode returns decision event" \
  "curl -s -X POST $BASE_URL/deprecation -H 'Content-Type: application/json' -d '{
    \"input\": {
      \"assetId\": \"$TEST_ASSET_ID\",
      \"assetType\": \"service\",
      \"currentVersion\": \"1.0.0\",
      \"targetState\": \"deprecated\",
      \"reason\": \"end_of_life\",
      \"reasonDescription\": \"This is a test deprecation request for smoke testing.\",
      \"requesterId\": \"$TEST_REQUESTER_ID\"
    },
    \"options\": {
      \"dryRun\": true,
      \"verbose\": true
    }
  }'" \
  "true"

# Test 7: CLI Command (if installed)
echo ""
echo "--- CLI Tests ---"
if command -v deprecation-agent &> /dev/null; then
  echo "Deprecation Agent CLI found"

  run_test "CLI deprecate dry run" \
    "deprecation-agent deprecate -a $TEST_ASSET_ID -t service -r end_of_life -d 'CLI smoke test' --dry-run --json | head -1" \
    "true"

  run_test "CLI inspect command" \
    "deprecation-agent inspect -a $TEST_ASSET_ID --json | head -1 | grep -c 'assetId'" \
    "1"
else
  echo -e "${YELLOW}CLI not installed, skipping CLI tests${NC}"
fi

# Summary
echo ""
echo "========================================"
echo "SMOKE TEST SUMMARY"
echo "========================================"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
