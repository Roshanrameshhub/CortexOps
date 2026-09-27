# Policy Engine API Documentation

**Version:** 1.0.0
**Protocol:** gRPC
**Port:** 50051

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Service Methods](#service-methods)
4. [Data Types](#data-types)
5. [Error Handling](#error-handling)
6. [Examples](#examples)

## Overview

The Policy Engine provides a gRPC API for validating services, checking access permissions, and managing organizational policies. All requests and responses use Protocol Buffers encoding.

### Base URL

```
grpc://localhost:50051
```

### Health Check

```
grpc://localhost:50051/policyengine.v1.PolicyEngineService/HealthCheck
```

## Authentication

Currently, the Policy Engine operates within a trusted network environment (service mesh with mTLS). Future versions will support:
- API key authentication
- OAuth 2.0 / JWT tokens
- mTLS client certificates

## Service Methods

### 1. ValidateService

Validates a service against all active organizational policies.

**Method:** `ValidateService`

**Request:** `ValidateServiceRequest`

**Response:** `ValidateServiceResponse`

**Performance:** P99 < 100ms

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| service_id | string | Yes | Unique identifier for the service |
| name | string | Yes | Service name |
| version | string | Yes | Semantic version (e.g., "1.0.0") |
| description | string | No | Service description |
| provider_id | string | Yes | Provider identifier |
| category | string | Yes | Service category |
| endpoint | ServiceEndpoint | Yes | Endpoint configuration |
| compliance | ServiceCompliance | Yes | Compliance information |
| sla | ServiceSLA | Yes | SLA commitments |
| pricing | ServicePricing | No | Pricing information |
| capabilities | ServiceCapability[] | No | Service capabilities |

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| compliant | bool | True if service passes all policies |
| violations | PolicyViolation[] | List of policy violations |
| policy_version | string | Version of policy set used |
| validated_at | Timestamp | Validation timestamp |
| metadata | ValidationMetadata | Validation statistics |

#### Example Request (gRPC)

```json
{
  "service_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "GPT-4 Text Generation",
  "version": "1.0.0",
  "description": "Advanced text generation service",
  "provider_id": "provider-123",
  "category": "text-generation",
  "endpoint": {
    "url": "https://api.example.com/v1/generate",
    "protocol": "rest",
    "authentication": "api-key"
  },
  "compliance": {
    "level": "confidential",
    "certifications": ["SOC2", "ISO27001"],
    "data_residency": ["US", "EU"],
    "gdpr_compliant": true,
    "hipaa_compliant": false
  },
  "sla": {
    "availability": 99.95,
    "max_latency": 200,
    "support_level": "enterprise"
  },
  "pricing": {
    "model": "per-token",
    "currency": "USD",
    "rates": [
      {
        "tier": "standard",
        "rate": 0.03,
        "unit": "1k tokens",
        "description": "Standard pricing tier"
      }
    ]
  }
}
```

#### Example Response (Success)

```json
{
  "compliant": true,
  "violations": [],
  "policy_version": "1.0.0",
  "validated_at": "2025-11-19T10:30:00Z",
  "metadata": {
    "policies_evaluated": 5,
    "policies_passed": 5,
    "policies_failed": 0,
    "validation_duration_ms": 45
  }
}
```

#### Example Response (Violations)

```json
{
  "compliant": false,
  "violations": [
    {
      "policy_id": "policy-001",
      "policy_name": "https-required",
      "severity": "critical",
      "message": "Production services must use HTTPS endpoints",
      "remediation": "Update endpoint URL to use HTTPS protocol",
      "field": "endpoint.url",
      "actual_value": "http://api.example.com/v1/generate",
      "expected_value": "https://..."
    },
    {
      "policy_id": "policy-003",
      "policy_name": "confidential-certification-required",
      "severity": "high",
      "message": "Confidential services must have security certifications",
      "remediation": "Add SOC2 or ISO27001 certification",
      "field": "compliance.certifications",
      "actual_value": "",
      "expected_value": "SOC2, ISO27001, or equivalent"
    }
  ],
  "policy_version": "1.0.0",
  "validated_at": "2025-11-19T10:30:00Z",
  "metadata": {
    "policies_evaluated": 5,
    "policies_passed": 3,
    "policies_failed": 2,
    "validation_duration_ms": 52
  }
}
```

---

### 2. CheckAccess

Checks if a user has permission to perform an action on a service.

**Method:** `CheckAccess`

**Request:** `CheckAccessRequest`

**Response:** `CheckAccessResponse`

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_id | string | Yes | User identifier |
| service_id | string | Yes | Service identifier |
| action | string | Yes | Action: read, consume, publish, delete |
| context | map<string, string> | No | Additional context (IP, region, etc.) |

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| allowed | bool | True if access is permitted |
| reason | string | Reason for denial (if not allowed) |
| required_permissions | string[] | Required permissions |
| missing_permissions | string[] | Missing permissions |

#### Example Request

```json
{
  "user_id": "user-456",
  "service_id": "550e8400-e29b-41d4-a716-446655440000",
  "action": "consume",
  "context": {
    "ip_address": "192.168.1.100",
    "region": "us-east-1"
  }
}
```

#### Example Response

```json
{
  "allowed": true,
  "reason": "",
  "required_permissions": ["service.consume"],
  "missing_permissions": []
}
```

---

### 3. ValidateConsumption

Validates a consumption request against policies and rate limits.

**Method:** `ValidateConsumption`

**Request:** `ValidateConsumptionRequest`

**Response:** `ValidateConsumptionResponse`

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| consumer_id | string | Yes | Consumer identifier |
| service_id | string | Yes | Service identifier |
| request_payload | string | No | Request payload for content filtering |
| headers | map<string, string> | No | Request headers |
| context | ConsumptionContext | No | Additional context |

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| allowed | bool | True if consumption is permitted |
| reason | string | Reason for denial (if not allowed) |
| violations | PolicyViolation[] | Policy violations |
| limits | ConsumptionLimits | Rate limits and quotas |

---

### 4. GetPolicy

Retrieves a specific policy by ID.

**Method:** `GetPolicy`

**Request:** `GetPolicyRequest`

**Response:** `GetPolicyResponse`

#### Example

```json
// Request
{
  "policy_id": "policy-001"
}

// Response
{
  "policy": {
    "id": "policy-001",
    "name": "https-required",
    "description": "Production services must use HTTPS endpoints",
    "type": "SECURITY",
    "enabled": true,
    "severity": "critical",
    "rule": { ... },
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z",
    "version": "1.0.0"
  }
}
```

---

### 5. ListPolicies

Lists all policies with optional filtering.

**Method:** `ListPolicies`

**Request:** `ListPoliciesRequest`

**Response:** `ListPoliciesResponse`

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| page_size | int32 | No | Number of policies per page (default: 50) |
| page_token | string | No | Token for pagination |
| filter | string | No | Filter expression (e.g., "type=SECURITY") |
| order_by | string | No | Sort order (e.g., "created_at desc") |

#### Example

```json
// Request
{
  "page_size": 10,
  "filter": "type=SECURITY AND enabled=true",
  "order_by": "created_at desc"
}

// Response
{
  "policies": [ ... ],
  "next_page_token": "",
  "total_count": 5
}
```

---

### 6. CreatePolicy

Creates a new policy.

**Method:** `CreatePolicy`

**Request:** `CreatePolicyRequest`

**Response:** `CreatePolicyResponse`

**Permissions Required:** `policy.create`

---

### 7. UpdatePolicy

Updates an existing policy.

**Method:** `UpdatePolicy`

**Request:** `UpdatePolicyRequest`

**Response:** `UpdatePolicyResponse`

**Permissions Required:** `policy.update`

---

### 8. DeletePolicy

Deletes a policy.

**Method:** `DeletePolicy`

**Request:** `DeletePolicyRequest`

**Response:** `DeletePolicyResponse`

**Permissions Required:** `policy.delete`

---

### 9. HealthCheck

Checks service health.

**Method:** `HealthCheck`

**Request:** `HealthCheckRequest`

**Response:** `HealthCheckResponse`

## Data Types

### PolicyType Enum

```protobuf
enum PolicyType {
  POLICY_TYPE_UNSPECIFIED = 0;
  DATA_RESIDENCY = 1;
  COMPLIANCE = 2;
  SECURITY = 3;
  PRICING = 4;
  ACCESS_CONTROL = 5;
  RATE_LIMITING = 6;
  CONTENT_FILTERING = 7;
  DATA_CLASSIFICATION = 8;
}
```

### PolicyViolation

```protobuf
message PolicyViolation {
  string policy_id = 1;
  string policy_name = 2;
  string severity = 3;  // critical, high, medium, low
  string message = 4;
  string remediation = 5;
  string field = 6;
  string actual_value = 7;
  string expected_value = 8;
}
```

### ServiceCompliance

```protobuf
message ServiceCompliance {
  string level = 1;  // public, internal, confidential, restricted
  repeated string certifications = 2;
  repeated string data_residency = 3;
  bool gdpr_compliant = 4;
  bool hipaa_compliant = 5;
}
```

## Error Handling

The Policy Engine uses standard gRPC status codes:

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Success |
| 3 | INVALID_ARGUMENT | Invalid request parameters |
| 5 | NOT_FOUND | Policy or resource not found |
| 13 | INTERNAL | Internal server error |
| 14 | UNAVAILABLE | Service temporarily unavailable |

### Error Response Example

```json
{
  "error": {
    "code": 3,
    "message": "Invalid service specification: missing endpoint URL",
    "details": []
  }
}
```

## Examples

### Using grpcurl

```bash
# Health check
grpcurl -plaintext localhost:50051 \
  policyengine.v1.PolicyEngineService/HealthCheck

# Validate service
grpcurl -plaintext -d @ localhost:50051 \
  policyengine.v1.PolicyEngineService/ValidateService <<EOF
{
  "service_id": "test-123",
  "name": "Test Service",
  "version": "1.0.0",
  "endpoint": {
    "url": "https://api.example.com",
    "protocol": "rest",
    "authentication": "api-key"
  },
  "compliance": {
    "level": "public",
    "certifications": [],
    "data_residency": ["US"]
  },
  "sla": {
    "availability": 99.9,
    "max_latency": 500,
    "support_level": "basic"
  }
}
EOF

# List policies
grpcurl -plaintext localhost:50051 \
  policyengine.v1.PolicyEngineService/ListPolicies
```

### Using Go Client

```go
package main

import (
    "context"
    "log"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"

    pb "github.com/llm-marketplace/policy-engine/api/proto/v1"
)

func main() {
    // Connect to server
    conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer conn.Close()

    client := pb.NewPolicyEngineServiceClient(conn)

    // Validate service
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    req := &pb.ValidateServiceRequest{
        ServiceId: "test-123",
        Name:      "Test Service",
        Version:   "1.0.0",
        Endpoint: &pb.ServiceEndpoint{
            Url:            "https://api.example.com",
            Protocol:       "rest",
            Authentication: "api-key",
        },
        Compliance: &pb.ServiceCompliance{
            Level:         "public",
            DataResidency: []string{"US"},
        },
        Sla: &pb.ServiceSLA{
            Availability:   99.9,
            MaxLatency:     500,
            SupportLevel:   "basic",
        },
    }

    resp, err := client.ValidateService(ctx, req)
    if err != nil {
        log.Fatalf("Validation failed: %v", err)
    }

    log.Printf("Compliant: %v", resp.Compliant)
    log.Printf("Violations: %d", len(resp.Violations))
    for _, v := range resp.Violations {
        log.Printf("  - %s: %s", v.PolicyName, v.Message)
    }
}
```

## Performance Characteristics

- **Latency:** P95 < 50ms, P99 < 100ms
- **Throughput:** 1,500+ requests/second per instance
- **Concurrent Connections:** 1,000+
- **Validation Time:** ~45ms average (5 policies)

## Rate Limits

- **Per Client:** 1,000 requests/second (burst: 2,000)
- **Global:** 50,000 requests/second (scales with replicas)

## Monitoring

- **Metrics:** `http://localhost:9090/metrics` (Prometheus)
- **Tracing:** Jaeger UI at `http://localhost:16686`
- **Logs:** Structured JSON logs to stdout
