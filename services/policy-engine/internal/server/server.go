package server

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "github.com/llm-marketplace/policy-engine/api/proto/v1"
	"github.com/llm-marketplace/policy-engine/internal/policy"
	"github.com/llm-marketplace/policy-engine/internal/storage"
)

// PolicyEngineServer implements the gRPC PolicyEngineService
type PolicyEngineServer struct {
	pb.UnimplementedPolicyEngineServiceServer
	validator *policy.Validator
	store     *storage.PolicyStore
}

// NewPolicyEngineServer creates a new PolicyEngineServer
func NewPolicyEngineServer(validator *policy.Validator, store *storage.PolicyStore) *PolicyEngineServer {
	return &PolicyEngineServer{
		validator: validator,
		store:     store,
	}
}

// ValidateService validates a service against organizational policies
func (s *PolicyEngineServer) ValidateService(ctx context.Context, req *pb.ValidateServiceRequest) (*pb.ValidateServiceResponse, error) {
	log.Info().
		Str("service_id", req.ServiceId).
		Str("service_name", req.Name).
		Str("version", req.Version).
		Msg("Validating service")

	// Convert protobuf request to internal ServiceRequest
	serviceReq := &policy.ServiceRequest{
		ServiceID:   req.ServiceId,
		Name:        req.Name,
		Version:     req.Version,
		Description: req.Description,
		ProviderID:  req.ProviderId,
		Category:    req.Category,
	}

	if req.Endpoint != nil {
		serviceReq.Endpoint = &policy.EndpointInfo{
			URL:            req.Endpoint.Url,
			Protocol:       req.Endpoint.Protocol,
			Authentication: req.Endpoint.Authentication,
		}
	}

	if req.Compliance != nil {
		serviceReq.Compliance = &policy.ComplianceInfo{
			Level:           req.Compliance.Level,
			Certifications:  req.Compliance.Certifications,
			DataResidency:   req.Compliance.DataResidency,
			GDPRCompliant:   req.Compliance.GdprCompliant,
			HIPAACompliant:  req.Compliance.HipaaCompliant,
		}
	}

	if req.Sla != nil {
		serviceReq.SLA = &policy.SLAInfo{
			Availability:   req.Sla.Availability,
			MaxLatency:     req.Sla.MaxLatency,
			SupportLevel:   req.Sla.SupportLevel,
		}
	}

	if req.Pricing != nil {
		rates := make([]policy.PricingTier, len(req.Pricing.Rates))
		for i, rate := range req.Pricing.Rates {
			rates[i] = policy.PricingTier{
				Tier:        rate.Tier,
				Rate:        rate.Rate,
				Unit:        rate.Unit,
				Description: rate.Description,
			}
		}
		serviceReq.Pricing = &policy.PricingInfo{
			Model:    req.Pricing.Model,
			Currency: req.Pricing.Currency,
			Rates:    rates,
		}
	}

	for _, cap := range req.Capabilities {
		serviceReq.Capabilities = append(serviceReq.Capabilities, policy.Capability{
			Name:        cap.Name,
			Description: cap.Description,
		})
	}

	// Validate the service
	result, err := s.validator.ValidateService(ctx, serviceReq)
	if err != nil {
		log.Error().Err(err).Msg("Failed to validate service")
		return nil, status.Errorf(codes.Internal, "validation failed: %v", err)
	}

	// Convert internal result to protobuf response
	violations := make([]*pb.PolicyViolation, len(result.Violations))
	for i, v := range result.Violations {
		violations[i] = &pb.PolicyViolation{
			PolicyId:      v.PolicyID,
			PolicyName:    v.PolicyName,
			Severity:      v.Severity,
			Message:       v.Message,
			Remediation:   v.Remediation,
			Field:         v.Field,
			ActualValue:   v.ActualValue,
			ExpectedValue: v.ExpectedValue,
		}
	}

	response := &pb.ValidateServiceResponse{
		Compliant:     result.Compliant,
		Violations:    violations,
		PolicyVersion: result.PolicyVersion,
		ValidatedAt:   timestamppb.New(result.ValidatedAt),
		Metadata: &pb.ValidationMetadata{
			PoliciesEvaluated:   int32(result.PoliciesEvaluated),
			PoliciesPassed:      int32(result.PoliciesPassed),
			PoliciesFailed:      int32(result.PoliciesFailed),
			ValidationDurationMs: result.ValidationDuration.Milliseconds(),
		},
	}

	log.Info().
		Str("service_id", req.ServiceId).
		Bool("compliant", result.Compliant).
		Int("violations", len(result.Violations)).
		Int64("duration_ms", result.ValidationDuration.Milliseconds()).
		Msg("Service validation completed")

	return response, nil
}

// CheckAccess checks if a user can access a specific service
func (s *PolicyEngineServer) CheckAccess(ctx context.Context, req *pb.CheckAccessRequest) (*pb.CheckAccessResponse, error) {
	log.Info().
		Str("user_id", req.UserId).
		Str("service_id", req.ServiceId).
		Str("action", req.Action).
		Msg("Checking access")

	allowed, reason, requiredPerms, missingPerms, err := s.validator.CheckAccess(ctx, req.UserId, req.ServiceId, req.Action)
	if err != nil {
		log.Error().Err(err).Msg("Failed to check access")
		return nil, status.Errorf(codes.Internal, "access check failed: %v", err)
	}

	response := &pb.CheckAccessResponse{
		Allowed:             allowed,
		Reason:              reason,
		RequiredPermissions: requiredPerms,
		MissingPermissions:  missingPerms,
	}

	log.Info().
		Str("user_id", req.UserId).
		Bool("allowed", allowed).
		Msg("Access check completed")

	return response, nil
}

// ValidateConsumption validates a consumption request
func (s *PolicyEngineServer) ValidateConsumption(ctx context.Context, req *pb.ValidateConsumptionRequest) (*pb.ValidateConsumptionResponse, error) {
	log.Info().
		Str("consumer_id", req.ConsumerId).
		Str("service_id", req.ServiceId).
		Msg("Validating consumption")

	allowed, reason, err := s.validator.ValidateConsumption(ctx, req.ConsumerId, req.ServiceId)
	if err != nil {
		log.Error().Err(err).Msg("Failed to validate consumption")
		return nil, status.Errorf(codes.Internal, "consumption validation failed: %v", err)
	}

	response := &pb.ValidateConsumptionResponse{
		Allowed:    allowed,
		Reason:     reason,
		Violations: []*pb.PolicyViolation{},
		Limits: &pb.ConsumptionLimits{
			MaxTokens:             10000,
			MaxRequestsPerMinute:  1000,
			MaxRequestsPerDay:     100000,
			MaxCostPerRequest:     1.0,
		},
	}

	log.Info().
		Str("consumer_id", req.ConsumerId).
		Bool("allowed", allowed).
		Msg("Consumption validation completed")

	return response, nil
}

// GetPolicy retrieves a specific policy by ID
func (s *PolicyEngineServer) GetPolicy(ctx context.Context, req *pb.GetPolicyRequest) (*pb.GetPolicyResponse, error) {
	log.Info().Str("policy_id", req.PolicyId).Msg("Getting policy")

	pol, err := s.store.Get(ctx, req.PolicyId)
	if err != nil {
		log.Error().Err(err).Msg("Failed to get policy")
		return nil, status.Errorf(codes.NotFound, "policy not found: %v", err)
	}

	response := &pb.GetPolicyResponse{
		Policy: convertPolicyToProto(pol),
	}

	return response, nil
}

// ListPolicies lists all active policies
func (s *PolicyEngineServer) ListPolicies(ctx context.Context, req *pb.ListPoliciesRequest) (*pb.ListPoliciesResponse, error) {
	log.Info().
		Int32("page_size", req.PageSize).
		Str("filter", req.Filter).
		Msg("Listing policies")

	// Build filter from request
	filter := make(map[string]interface{})
	// Parse filter string (simple implementation)
	// In production, use a proper query parser

	policies, err := s.store.List(ctx, filter)
	if err != nil {
		log.Error().Err(err).Msg("Failed to list policies")
		return nil, status.Errorf(codes.Internal, "failed to list policies: %v", err)
	}

	protoPolicies := make([]*pb.Policy, len(policies))
	for i, pol := range policies {
		protoPolicies[i] = convertPolicyToProto(pol)
	}

	response := &pb.ListPoliciesResponse{
		Policies:      protoPolicies,
		NextPageToken: "",
		TotalCount:    int32(len(policies)),
	}

	return response, nil
}

// CreatePolicy creates a new policy
func (s *PolicyEngineServer) CreatePolicy(ctx context.Context, req *pb.CreatePolicyRequest) (*pb.CreatePolicyResponse, error) {
	log.Info().
		Str("policy_name", req.Policy.Name).
		Str("policy_type", req.Policy.Type.String()).
		Msg("Creating policy")

	pol := convertProtoToPolicy(req.Policy)
	pol.ID = uuid.New().String()

	if err := s.store.Create(ctx, pol); err != nil {
		log.Error().Err(err).Msg("Failed to create policy")
		return nil, status.Errorf(codes.Internal, "failed to create policy: %v", err)
	}

	response := &pb.CreatePolicyResponse{
		Policy:    convertPolicyToProto(pol),
		CreatedAt: timestamppb.New(pol.CreatedAt),
	}

	log.Info().
		Str("policy_id", pol.ID).
		Str("policy_name", pol.Name).
		Msg("Policy created successfully")

	return response, nil
}

// UpdatePolicy updates an existing policy
func (s *PolicyEngineServer) UpdatePolicy(ctx context.Context, req *pb.UpdatePolicyRequest) (*pb.UpdatePolicyResponse, error) {
	log.Info().
		Str("policy_id", req.PolicyId).
		Msg("Updating policy")

	pol := convertProtoToPolicy(req.Policy)
	pol.ID = req.PolicyId

	if err := s.store.Update(ctx, pol); err != nil {
		log.Error().Err(err).Msg("Failed to update policy")
		return nil, status.Errorf(codes.Internal, "failed to update policy: %v", err)
	}

	response := &pb.UpdatePolicyResponse{
		Policy:    convertPolicyToProto(pol),
		UpdatedAt: timestamppb.New(pol.UpdatedAt),
	}

	log.Info().
		Str("policy_id", pol.ID).
		Msg("Policy updated successfully")

	return response, nil
}

// DeletePolicy deletes a policy
func (s *PolicyEngineServer) DeletePolicy(ctx context.Context, req *pb.DeletePolicyRequest) (*pb.DeletePolicyResponse, error) {
	log.Info().Str("policy_id", req.PolicyId).Msg("Deleting policy")

	if err := s.store.Delete(ctx, req.PolicyId); err != nil {
		log.Error().Err(err).Msg("Failed to delete policy")
		return nil, status.Errorf(codes.Internal, "failed to delete policy: %v", err)
	}

	response := &pb.DeletePolicyResponse{
		Success:   true,
		DeletedAt: timestamppb.New(time.Now()),
	}

	log.Info().Str("policy_id", req.PolicyId).Msg("Policy deleted successfully")

	return response, nil
}

// HealthCheck checks the health of the service
func (s *PolicyEngineServer) HealthCheck(ctx context.Context, req *pb.HealthCheckRequest) (*pb.HealthCheckResponse, error) {
	// Check database connectivity
	if err := s.store.db.PingContext(ctx); err != nil {
		return &pb.HealthCheckResponse{
			Status: pb.HealthCheckResponse_NOT_SERVING,
			Details: map[string]string{
				"database": fmt.Sprintf("unhealthy: %v", err),
			},
			Timestamp: timestamppb.New(time.Now()),
		}, nil
	}

	return &pb.HealthCheckResponse{
		Status: pb.HealthCheckResponse_SERVING,
		Details: map[string]string{
			"database": "healthy",
			"version":  "1.0.0",
		},
		Timestamp: timestamppb.New(time.Now()),
	}, nil
}

// Helper functions to convert between internal and protobuf types

func convertPolicyToProto(pol *storage.Policy) *pb.Policy {
	return &pb.Policy{
		Id:          pol.ID,
		Name:        pol.Name,
		Description: pol.Description,
		Type:        convertPolicyTypeToProto(pol.Type),
		Enabled:     pol.Enabled,
		Severity:    pol.Severity,
		Rule:        convertRuleToProto(pol.Rule),
		Metadata:    pol.Metadata,
		CreatedAt:   timestamppb.New(pol.CreatedAt),
		UpdatedAt:   timestamppb.New(pol.UpdatedAt),
		Version:     pol.Version,
	}
}

func convertProtoToPolicy(proto *pb.Policy) *storage.Policy {
	return &storage.Policy{
		ID:          proto.Id,
		Name:        proto.Name,
		Description: proto.Description,
		Type:        convertProtoToPolicyType(proto.Type),
		Enabled:     proto.Enabled,
		Severity:    proto.Severity,
		Rule:        convertProtoToRule(proto.Rule),
		Metadata:    proto.Metadata,
		Version:     proto.Version,
	}
}

func convertPolicyTypeToProto(t string) pb.PolicyType {
	switch t {
	case "DATA_RESIDENCY":
		return pb.PolicyType_DATA_RESIDENCY
	case "COMPLIANCE":
		return pb.PolicyType_COMPLIANCE
	case "SECURITY":
		return pb.PolicyType_SECURITY
	case "PRICING":
		return pb.PolicyType_PRICING
	case "ACCESS_CONTROL":
		return pb.PolicyType_ACCESS_CONTROL
	case "RATE_LIMITING":
		return pb.PolicyType_RATE_LIMITING
	case "CONTENT_FILTERING":
		return pb.PolicyType_CONTENT_FILTERING
	case "DATA_CLASSIFICATION":
		return pb.PolicyType_DATA_CLASSIFICATION
	default:
		return pb.PolicyType_POLICY_TYPE_UNSPECIFIED
	}
}

func convertProtoToPolicyType(t pb.PolicyType) string {
	switch t {
	case pb.PolicyType_DATA_RESIDENCY:
		return "DATA_RESIDENCY"
	case pb.PolicyType_COMPLIANCE:
		return "COMPLIANCE"
	case pb.PolicyType_SECURITY:
		return "SECURITY"
	case pb.PolicyType_PRICING:
		return "PRICING"
	case pb.PolicyType_ACCESS_CONTROL:
		return "ACCESS_CONTROL"
	case pb.PolicyType_RATE_LIMITING:
		return "RATE_LIMITING"
	case pb.PolicyType_CONTENT_FILTERING:
		return "CONTENT_FILTERING"
	case pb.PolicyType_DATA_CLASSIFICATION:
		return "DATA_CLASSIFICATION"
	default:
		return "POLICY_TYPE_UNSPECIFIED"
	}
}

func convertRuleToProto(rule map[string]interface{}) *pb.PolicyRule {
	// Simplified conversion - in production, properly marshal/unmarshal
	return &pb.PolicyRule{}
}

func convertProtoToRule(rule *pb.PolicyRule) map[string]interface{} {
	// Simplified conversion - in production, properly marshal/unmarshal
	return make(map[string]interface{})
}
