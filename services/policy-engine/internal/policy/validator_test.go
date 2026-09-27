package policy

import (
	"context"
	"testing"

	"github.com/llm-marketplace/policy-engine/internal/storage"
)

func TestValidateService_DataResidency(t *testing.T) {
	// Create a mock policy store
	store := &mockPolicyStore{
		policies: []*storage.Policy{
			{
				ID:       "1",
				Name:     "data-residency-required",
				Type:     "DATA_RESIDENCY",
				Enabled:  true,
				Severity: "high",
				Rule: map[string]interface{}{
					"data_residency": map[string]interface{}{
						"require_specification": true,
						"minimum_locations":     float64(1),
					},
				},
			},
			{
				ID:       "2",
				Name:     "restricted-countries",
				Type:     "DATA_RESIDENCY",
				Enabled:  true,
				Severity: "critical",
				Rule: map[string]interface{}{
					"data_residency": map[string]interface{}{
						"blocked_countries": []interface{}{"KP", "IR"},
					},
				},
			},
		},
	}

	validator := NewValidator(store)

	tests := []struct {
		name          string
		request       *ServiceRequest
		wantCompliant bool
		wantViolations int
	}{
		{
			name: "Valid service with data residency",
			request: &ServiceRequest{
				ServiceID: "test-1",
				Name:      "Test Service",
				Compliance: &ComplianceInfo{
					DataResidency: []string{"US", "EU"},
				},
			},
			wantCompliant: true,
			wantViolations: 0,
		},
		{
			name: "Missing data residency",
			request: &ServiceRequest{
				ServiceID: "test-2",
				Name:      "Test Service",
				Compliance: &ComplianceInfo{
					DataResidency: []string{},
				},
			},
			wantCompliant: false,
			wantViolations: 1,
		},
		{
			name: "Blocked country",
			request: &ServiceRequest{
				ServiceID: "test-3",
				Name:      "Test Service",
				Compliance: &ComplianceInfo{
					DataResidency: []string{"US", "KP"},
				},
			},
			wantCompliant: false,
			wantViolations: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := validator.ValidateService(context.Background(), tt.request)
			if err != nil {
				t.Fatalf("ValidateService() error = %v", err)
			}

			if result.Compliant != tt.wantCompliant {
				t.Errorf("ValidateService() compliant = %v, want %v", result.Compliant, tt.wantCompliant)
			}

			if len(result.Violations) != tt.wantViolations {
				t.Errorf("ValidateService() violations = %d, want %d", len(result.Violations), tt.wantViolations)
			}
		})
	}
}

func TestValidateService_Security(t *testing.T) {
	store := &mockPolicyStore{
		policies: []*storage.Policy{
			{
				ID:       "1",
				Name:     "https-required",
				Type:     "SECURITY",
				Enabled:  true,
				Severity: "critical",
				Rule: map[string]interface{}{
					"security": map[string]interface{}{
						"require_https":          true,
						"require_authentication": true,
					},
				},
			},
		},
	}

	validator := NewValidator(store)

	tests := []struct {
		name          string
		request       *ServiceRequest
		wantCompliant bool
		wantViolations int
	}{
		{
			name: "Valid HTTPS endpoint",
			request: &ServiceRequest{
				ServiceID: "test-1",
				Name:      "Test Service",
				Endpoint: &EndpointInfo{
					URL:            "https://api.example.com",
					Authentication: "api-key",
				},
			},
			wantCompliant: true,
			wantViolations: 0,
		},
		{
			name: "HTTP endpoint (should fail)",
			request: &ServiceRequest{
				ServiceID: "test-2",
				Name:      "Test Service",
				Endpoint: &EndpointInfo{
					URL:            "http://api.example.com",
					Authentication: "api-key",
				},
			},
			wantCompliant: false,
			wantViolations: 1,
		},
		{
			name: "Missing authentication (should fail)",
			request: &ServiceRequest{
				ServiceID: "test-3",
				Name:      "Test Service",
				Endpoint: &EndpointInfo{
					URL:            "https://api.example.com",
					Authentication: "",
				},
			},
			wantCompliant: false,
			wantViolations: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := validator.ValidateService(context.Background(), tt.request)
			if err != nil {
				t.Fatalf("ValidateService() error = %v", err)
			}

			if result.Compliant != tt.wantCompliant {
				t.Errorf("ValidateService() compliant = %v, want %v", result.Compliant, tt.wantCompliant)
			}

			if len(result.Violations) != tt.wantViolations {
				t.Errorf("ValidateService() violations = %d, want %d", len(result.Violations), tt.wantViolations)
			}
		})
	}
}

func TestValidateService_Pricing(t *testing.T) {
	store := &mockPolicyStore{
		policies: []*storage.Policy{
			{
				ID:       "1",
				Name:     "enterprise-sla-minimum",
				Type:     "PRICING",
				Enabled:  true,
				Severity: "medium",
				Rule: map[string]interface{}{
					"pricing": map[string]interface{}{
						"minimum_sla_for_enterprise": 99.9,
					},
				},
			},
		},
	}

	validator := NewValidator(store)

	tests := []struct {
		name          string
		request       *ServiceRequest
		wantCompliant bool
		wantViolations int
	}{
		{
			name: "Enterprise with sufficient SLA",
			request: &ServiceRequest{
				ServiceID: "test-1",
				Name:      "Test Service",
				SLA: &SLAInfo{
					Availability:   99.95,
					SupportLevel:   "enterprise",
				},
			},
			wantCompliant: true,
			wantViolations: 0,
		},
		{
			name: "Enterprise with insufficient SLA (should fail)",
			request: &ServiceRequest{
				ServiceID: "test-2",
				Name:      "Test Service",
				SLA: &SLAInfo{
					Availability:   99.0,
					SupportLevel:   "enterprise",
				},
			},
			wantCompliant: false,
			wantViolations: 1,
		},
		{
			name: "Basic support level (should pass)",
			request: &ServiceRequest{
				ServiceID: "test-3",
				Name:      "Test Service",
				SLA: &SLAInfo{
					Availability:   95.0,
					SupportLevel:   "basic",
				},
			},
			wantCompliant: true,
			wantViolations: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := validator.ValidateService(context.Background(), tt.request)
			if err != nil {
				t.Fatalf("ValidateService() error = %v", err)
			}

			if result.Compliant != tt.wantCompliant {
				t.Errorf("ValidateService() compliant = %v, want %v", result.Compliant, tt.wantCompliant)
			}

			if len(result.Violations) != tt.wantViolations {
				t.Errorf("ValidateService() violations = %d, want %d", len(result.Violations), tt.wantViolations)
			}
		})
	}
}

// Mock policy store for testing
type mockPolicyStore struct {
	policies []*storage.Policy
}

func (m *mockPolicyStore) GetEnabledPolicies(ctx context.Context) ([]*storage.Policy, error) {
	enabled := []*storage.Policy{}
	for _, p := range m.policies {
		if p.Enabled {
			enabled = append(enabled, p)
		}
	}
	return enabled, nil
}

func (m *mockPolicyStore) GetPoliciesByType(ctx context.Context, policyType string) ([]*storage.Policy, error) {
	filtered := []*storage.Policy{}
	for _, p := range m.policies {
		if p.Type == policyType && p.Enabled {
			filtered = append(filtered, p)
		}
	}
	return filtered, nil
}

func (m *mockPolicyStore) Get(ctx context.Context, id string) (*storage.Policy, error) {
	for _, p := range m.policies {
		if p.ID == id {
			return p, nil
		}
	}
	return nil, nil
}

func (m *mockPolicyStore) List(ctx context.Context, filter map[string]interface{}) ([]*storage.Policy, error) {
	return m.policies, nil
}

func (m *mockPolicyStore) Create(ctx context.Context, policy *storage.Policy) error {
	m.policies = append(m.policies, policy)
	return nil
}

func (m *mockPolicyStore) Update(ctx context.Context, policy *storage.Policy) error {
	return nil
}

func (m *mockPolicyStore) Delete(ctx context.Context, id string) error {
	return nil
}
