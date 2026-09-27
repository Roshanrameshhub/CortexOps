package policy

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/llm-marketplace/policy-engine/internal/storage"
)

// ServiceRequest represents a service validation request
type ServiceRequest struct {
	ServiceID   string
	Name        string
	Version     string
	Description string
	ProviderID  string
	Category    string
	Endpoint    *EndpointInfo
	Compliance  *ComplianceInfo
	SLA         *SLAInfo
	Pricing     *PricingInfo
	Capabilities []Capability
}

// EndpointInfo represents service endpoint information
type EndpointInfo struct {
	URL            string
	Protocol       string
	Authentication string
}

// ComplianceInfo represents compliance information
type ComplianceInfo struct {
	Level           string
	Certifications  []string
	DataResidency   []string
	GDPRCompliant   bool
	HIPAACompliant  bool
}

// SLAInfo represents SLA information
type SLAInfo struct {
	Availability   float64
	MaxLatency     int32
	SupportLevel   string
}

// PricingInfo represents pricing information
type PricingInfo struct {
	Model    string
	Currency string
	Rates    []PricingTier
}

// PricingTier represents a pricing tier
type PricingTier struct {
	Tier        string
	Rate        float64
	Unit        string
	Description string
}

// Capability represents a service capability
type Capability struct {
	Name        string
	Description string
}

// ValidationResult represents the result of policy validation
type ValidationResult struct {
	Compliant          bool
	Violations         []Violation
	PolicyVersion      string
	ValidatedAt        time.Time
	PoliciesEvaluated  int
	PoliciesPassed     int
	PoliciesFailed     int
	ValidationDuration time.Duration
}

// Violation represents a policy violation
type Violation struct {
	PolicyID      string
	PolicyName    string
	Severity      string
	Message       string
	Remediation   string
	Field         string
	ActualValue   string
	ExpectedValue string
}

// Validator performs policy validation
type Validator struct {
	store *storage.PolicyStore
}

// NewValidator creates a new policy validator
func NewValidator(store *storage.PolicyStore) *Validator {
	return &Validator{
		store: store,
	}
}

// ValidateService validates a service against all enabled policies
func (v *Validator) ValidateService(ctx context.Context, req *ServiceRequest) (*ValidationResult, error) {
	startTime := time.Now()

	result := &ValidationResult{
		Compliant:     true,
		Violations:    []Violation{},
		PolicyVersion: "1.0.0",
		ValidatedAt:   time.Now(),
	}

	// Get all enabled policies
	policies, err := v.store.GetEnabledPolicies(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get enabled policies: %w", err)
	}

	result.PoliciesEvaluated = len(policies)

	// Validate against each policy
	for _, policy := range policies {
		violations := v.validateAgainstPolicy(policy, req)
		if len(violations) > 0 {
			result.Violations = append(result.Violations, violations...)
			result.PoliciesFailed++
		} else {
			result.PoliciesPassed++
		}
	}

	result.Compliant = len(result.Violations) == 0
	result.ValidationDuration = time.Since(startTime)

	return result, nil
}

func (v *Validator) validateAgainstPolicy(policy *storage.Policy, req *ServiceRequest) []Violation {
	violations := []Violation{}

	switch policy.Type {
	case "DATA_RESIDENCY":
		violations = v.validateDataResidency(policy, req)
	case "COMPLIANCE":
		violations = v.validateCompliance(policy, req)
	case "SECURITY":
		violations = v.validateSecurity(policy, req)
	case "PRICING":
		violations = v.validatePricing(policy, req)
	}

	return violations
}

func (v *Validator) validateDataResidency(policy *storage.Policy, req *ServiceRequest) []Violation {
	violations := []Violation{}

	rule, ok := policy.Rule["data_residency"].(map[string]interface{})
	if !ok {
		return violations
	}

	// Check if data residency specification is required
	if requireSpec, ok := rule["require_specification"].(bool); ok && requireSpec {
		if req.Compliance == nil || len(req.Compliance.DataResidency) == 0 {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       "Service must specify at least one data residency location",
				Remediation:   "Add data residency information to compliance section",
				Field:         "compliance.dataResidency",
				ActualValue:   "none",
				ExpectedValue: "at least 1 location",
			})
			return violations
		}
	}

	// Check minimum locations
	if minLoc, ok := rule["minimum_locations"].(float64); ok {
		if req.Compliance != nil && len(req.Compliance.DataResidency) < int(minLoc) {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       fmt.Sprintf("Service must specify at least %d data residency locations", int(minLoc)),
				Remediation:   fmt.Sprintf("Add at least %d data residency locations", int(minLoc)),
				Field:         "compliance.dataResidency",
				ActualValue:   fmt.Sprintf("%d", len(req.Compliance.DataResidency)),
				ExpectedValue: fmt.Sprintf("at least %d", int(minLoc)),
			})
			return violations
		}
	}

	// Check blocked countries
	if blockedCountries, ok := rule["blocked_countries"].([]interface{}); ok && req.Compliance != nil {
		blockedMap := make(map[string]bool)
		for _, country := range blockedCountries {
			if countryStr, ok := country.(string); ok {
				blockedMap[countryStr] = true
			}
		}

		for _, country := range req.Compliance.DataResidency {
			if blockedMap[country] {
				violations = append(violations, Violation{
					PolicyID:      policy.ID,
					PolicyName:    policy.Name,
					Severity:      policy.Severity,
					Message:       fmt.Sprintf("Service cannot have data residency in restricted country: %s", country),
					Remediation:   "Remove restricted countries from data residency list",
					Field:         "compliance.dataResidency",
					ActualValue:   country,
					ExpectedValue: "not in blocked list",
				})
			}
		}
	}

	// Check allowed countries
	if allowedCountries, ok := rule["allowed_countries"].([]interface{}); ok && req.Compliance != nil {
		allowedMap := make(map[string]bool)
		for _, country := range allowedCountries {
			if countryStr, ok := country.(string); ok {
				allowedMap[countryStr] = true
			}
		}

		for _, country := range req.Compliance.DataResidency {
			if !allowedMap[country] {
				violations = append(violations, Violation{
					PolicyID:      policy.ID,
					PolicyName:    policy.Name,
					Severity:      policy.Severity,
					Message:       fmt.Sprintf("Service data residency in country not in allowed list: %s", country),
					Remediation:   "Use only allowed countries for data residency",
					Field:         "compliance.dataResidency",
					ActualValue:   country,
					ExpectedValue: "in allowed list",
				})
			}
		}
	}

	return violations
}

func (v *Validator) validateCompliance(policy *storage.Policy, req *ServiceRequest) []Violation {
	violations := []Violation{}

	rule, ok := policy.Rule["compliance"].(map[string]interface{})
	if !ok {
		return violations
	}

	// Check required certifications
	if requiredCerts, ok := rule["required_certifications"].([]interface{}); ok && req.Compliance != nil {
		certMap := make(map[string]bool)
		for _, cert := range req.Compliance.Certifications {
			certMap[strings.ToUpper(cert)] = true
		}

		for _, reqCert := range requiredCerts {
			if certStr, ok := reqCert.(string); ok {
				if !certMap[strings.ToUpper(certStr)] {
					violations = append(violations, Violation{
						PolicyID:      policy.ID,
						PolicyName:    policy.Name,
						Severity:      policy.Severity,
						Message:       fmt.Sprintf("Service is missing required certification: %s", certStr),
						Remediation:   fmt.Sprintf("Add %s certification", certStr),
						Field:         "compliance.certifications",
						ActualValue:   strings.Join(req.Compliance.Certifications, ", "),
						ExpectedValue: certStr,
					})
				}
			}
		}
	}

	// Check minimum compliance level
	if minLevel, ok := rule["minimum_compliance_level"].(string); ok && req.Compliance != nil {
		complianceLevels := map[string]int{
			"public":       0,
			"internal":     1,
			"confidential": 2,
			"restricted":   3,
		}

		minLevelNum := complianceLevels[minLevel]
		actualLevelNum := complianceLevels[req.Compliance.Level]

		if actualLevelNum < minLevelNum {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       fmt.Sprintf("Service compliance level must be at least %s", minLevel),
				Remediation:   fmt.Sprintf("Increase compliance level to %s or higher", minLevel),
				Field:         "compliance.level",
				ActualValue:   req.Compliance.Level,
				ExpectedValue: fmt.Sprintf("at least %s", minLevel),
			})
		}
	}

	// Check GDPR compliance
	if requireGDPR, ok := rule["require_gdpr_compliance"].(bool); ok && requireGDPR {
		if req.Compliance == nil || !req.Compliance.GDPRCompliant {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       "Service must be GDPR compliant",
				Remediation:   "Ensure service is GDPR compliant and update compliance information",
				Field:         "compliance.gdprCompliant",
				ActualValue:   "false",
				ExpectedValue: "true",
			})
		}
	}

	// Check HIPAA compliance
	if requireHIPAA, ok := rule["require_hipaa_compliance"].(bool); ok && requireHIPAA {
		if req.Compliance == nil || !req.Compliance.HIPAACompliant {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       "Service must be HIPAA compliant",
				Remediation:   "Ensure service is HIPAA compliant and update compliance information",
				Field:         "compliance.hipaaCompliant",
				ActualValue:   "false",
				ExpectedValue: "true",
			})
		}
	}

	return violations
}

func (v *Validator) validateSecurity(policy *storage.Policy, req *ServiceRequest) []Violation {
	violations := []Violation{}

	rule, ok := policy.Rule["security"].(map[string]interface{})
	if !ok {
		return violations
	}

	// Check HTTPS requirement
	if requireHTTPS, ok := rule["require_https"].(bool); ok && requireHTTPS {
		if req.Endpoint != nil && !strings.HasPrefix(strings.ToLower(req.Endpoint.URL), "https://") {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       "Production services must use HTTPS endpoints",
				Remediation:   "Update endpoint URL to use HTTPS",
				Field:         "endpoint.url",
				ActualValue:   req.Endpoint.URL,
				ExpectedValue: "https://...",
			})
		}
	}

	// Check authentication requirement
	if requireAuth, ok := rule["require_authentication"].(bool); ok && requireAuth {
		if req.Endpoint == nil || req.Endpoint.Authentication == "" {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       "Service must specify authentication type",
				Remediation:   "Add authentication configuration to endpoint",
				Field:         "endpoint.authentication",
				ActualValue:   "none",
				ExpectedValue: "api-key, oauth2, or jwt",
			})
		}
	}

	// Check allowed authentication types
	if allowedAuthTypes, ok := rule["allowed_authentication_types"].([]interface{}); ok && req.Endpoint != nil {
		if req.Endpoint.Authentication != "" {
			allowed := false
			for _, authType := range allowedAuthTypes {
				if authTypeStr, ok := authType.(string); ok && authTypeStr == req.Endpoint.Authentication {
					allowed = true
					break
				}
			}
			if !allowed {
				violations = append(violations, Violation{
					PolicyID:      policy.ID,
					PolicyName:    policy.Name,
					Severity:      policy.Severity,
					Message:       fmt.Sprintf("Authentication type %s is not allowed", req.Endpoint.Authentication),
					Remediation:   "Use an allowed authentication type",
					Field:         "endpoint.authentication",
					ActualValue:   req.Endpoint.Authentication,
					ExpectedValue: "one of allowed types",
				})
			}
		}
	}

	return violations
}

func (v *Validator) validatePricing(policy *storage.Policy, req *ServiceRequest) []Violation {
	violations := []Violation{}

	rule, ok := policy.Rule["pricing"].(map[string]interface{})
	if !ok {
		return violations
	}

	// Check minimum SLA for enterprise support
	if minSLA, ok := rule["minimum_sla_for_enterprise"].(float64); ok {
		if req.SLA != nil && req.SLA.SupportLevel == "enterprise" && req.SLA.Availability < minSLA {
			violations = append(violations, Violation{
				PolicyID:      policy.ID,
				PolicyName:    policy.Name,
				Severity:      policy.Severity,
				Message:       fmt.Sprintf("Enterprise support level requires at least %.1f%% availability SLA", minSLA),
				Remediation:   fmt.Sprintf("Increase availability SLA to %.1f%% or higher", minSLA),
				Field:         "sla.availability",
				ActualValue:   fmt.Sprintf("%.1f%%", req.SLA.Availability),
				ExpectedValue: fmt.Sprintf("at least %.1f%%", minSLA),
			})
		}
	}

	// Check free tier requirement
	if requireFreeTier, ok := rule["require_free_tier"].(bool); ok && requireFreeTier {
		if req.Pricing != nil {
			hasFree := false
			for _, tier := range req.Pricing.Rates {
				if tier.Rate == 0 || strings.ToLower(tier.Tier) == "free" {
					hasFree = true
					break
				}
			}
			if !hasFree {
				violations = append(violations, Violation{
					PolicyID:      policy.ID,
					PolicyName:    policy.Name,
					Severity:      policy.Severity,
					Message:       "Service must offer a free tier",
					Remediation:   "Add a free pricing tier",
					Field:         "pricing.rates",
					ActualValue:   "no free tier",
					ExpectedValue: "at least one free tier",
				})
			}
		}
	}

	return violations
}

// ValidateConsumption validates a consumption request
func (v *Validator) ValidateConsumption(ctx context.Context, consumerID, serviceID string) (bool, string, error) {
	// Get access control policies
	policies, err := v.store.GetPoliciesByType(ctx, "ACCESS_CONTROL")
	if err != nil {
		return false, fmt.Sprintf("failed to get policies: %v", err), err
	}

	// If no access control policies, allow by default
	if len(policies) == 0 {
		return true, "", nil
	}

	// Validate against access control policies
	for _, policy := range policies {
		rule, ok := policy.Rule["access_control"].(map[string]interface{})
		if !ok {
			continue
		}

		// Check blocked users
		if blockedUsers, ok := rule["blocked_user_ids"].([]interface{}); ok {
			for _, blocked := range blockedUsers {
				if blockedStr, ok := blocked.(string); ok && blockedStr == consumerID {
					return false, fmt.Sprintf("User %s is blocked by policy %s", consumerID, policy.Name), nil
				}
			}
		}

		// Check required approval
		if requireApproval, ok := rule["require_approval"].(bool); ok && requireApproval {
			// In a real implementation, this would check an approval database
			// For now, we'll just allow it
		}
	}

	return true, "", nil
}

// CheckAccess checks if a user can perform an action on a service
func (v *Validator) CheckAccess(ctx context.Context, userID, serviceID, action string) (bool, string, []string, []string, error) {
	// Get access control policies
	policies, err := v.store.GetPoliciesByType(ctx, "ACCESS_CONTROL")
	if err != nil {
		return false, fmt.Sprintf("failed to get policies: %v", err), nil, nil, err
	}

	// If no access control policies, allow by default
	if len(policies) == 0 {
		return true, "", nil, nil, nil
	}

	requiredPermissions := []string{}
	missingPermissions := []string{}

	// Validate against access control policies
	for _, policy := range policies {
		rule, ok := policy.Rule["access_control"].(map[string]interface{})
		if !ok {
			continue
		}

		// Check blocked users
		if blockedUsers, ok := rule["blocked_user_ids"].([]interface{}); ok {
			for _, blocked := range blockedUsers {
				if blockedStr, ok := blocked.(string); ok && blockedStr == userID {
					return false, fmt.Sprintf("User %s is blocked by policy %s", userID, policy.Name), requiredPermissions, missingPermissions, nil
				}
			}
		}

		// Check allowed roles
		if allowedRoles, ok := rule["allowed_user_roles"].([]interface{}); ok {
			// In a real implementation, this would check user roles
			for _, role := range allowedRoles {
				if roleStr, ok := role.(string); ok {
					requiredPermissions = append(requiredPermissions, roleStr)
				}
			}
		}
	}

	return true, "", requiredPermissions, missingPermissions, nil
}
