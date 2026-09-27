package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// Policy represents a policy in the system
type Policy struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Type        string                 `json:"type"`
	Enabled     bool                   `json:"enabled"`
	Severity    string                 `json:"severity"`
	Rule        map[string]interface{} `json:"rule"`
	Metadata    map[string]string      `json:"metadata"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	Version     string                 `json:"version"`
}

// PolicyStore manages policy storage and retrieval
type PolicyStore struct {
	db           *sql.DB
	cache        *PolicyCache
	enableCache  bool
	mu           sync.RWMutex
	autoReload   bool
	reloadTicker *time.Ticker
	stopCh       chan struct{}
}

// PolicyCache is an in-memory cache for policies
type PolicyCache struct {
	policies map[string]*Policy
	mu       sync.RWMutex
	ttl      time.Duration
	maxSize  int
}

// NewPolicyStore creates a new policy store
func NewPolicyStore(db *sql.DB, enableCache bool, cacheTTL time.Duration, cacheMaxSize int) *PolicyStore {
	store := &PolicyStore{
		db:          db,
		enableCache: enableCache,
		stopCh:      make(chan struct{}),
	}

	if enableCache {
		store.cache = &PolicyCache{
			policies: make(map[string]*Policy),
			ttl:      cacheTTL,
			maxSize:  cacheMaxSize,
		}
	}

	return store
}

// Initialize creates the policies table if it doesn't exist
func (s *PolicyStore) Initialize(ctx context.Context) error {
	query := `
		CREATE TABLE IF NOT EXISTS policies (
			id UUID PRIMARY KEY,
			name VARCHAR(255) NOT NULL UNIQUE,
			description TEXT,
			type VARCHAR(50) NOT NULL,
			enabled BOOLEAN NOT NULL DEFAULT true,
			severity VARCHAR(20) NOT NULL,
			rule JSONB NOT NULL,
			metadata JSONB,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
			version VARCHAR(50) NOT NULL DEFAULT '1.0.0'
		);

		CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type);
		CREATE INDEX IF NOT EXISTS idx_policies_enabled ON policies(enabled);
		CREATE INDEX IF NOT EXISTS idx_policies_severity ON policies(severity);

		CREATE OR REPLACE FUNCTION update_updated_at_column()
		RETURNS TRIGGER AS $$
		BEGIN
			NEW.updated_at = NOW();
			RETURN NEW;
		END;
		$$ language 'plpgsql';

		DROP TRIGGER IF EXISTS update_policies_updated_at ON policies;
		CREATE TRIGGER update_policies_updated_at
			BEFORE UPDATE ON policies
			FOR EACH ROW
			EXECUTE FUNCTION update_updated_at_column();
	`

	_, err := s.db.ExecContext(ctx, query)
	return err
}

// SeedDefaultPolicies seeds the database with default policies
func (s *PolicyStore) SeedDefaultPolicies(ctx context.Context) error {
	defaultPolicies := []Policy{
		{
			ID:          uuid.New().String(),
			Name:        "data-residency-required",
			Description: "Services must specify at least one data residency location",
			Type:        "DATA_RESIDENCY",
			Enabled:     true,
			Severity:    "high",
			Rule: map[string]interface{}{
				"data_residency": map[string]interface{}{
					"require_specification": true,
					"minimum_locations":     1,
				},
			},
			Metadata: map[string]string{
				"category": "compliance",
			},
			Version: "1.0.0",
		},
		{
			ID:          uuid.New().String(),
			Name:        "restricted-countries",
			Description: "Services cannot have data residency in restricted countries",
			Type:        "DATA_RESIDENCY",
			Enabled:     true,
			Severity:    "critical",
			Rule: map[string]interface{}{
				"data_residency": map[string]interface{}{
					"blocked_countries": []string{"KP", "IR", "SY", "CU"},
				},
			},
			Metadata: map[string]string{
				"category": "compliance",
				"sanctions": "true",
			},
			Version: "1.0.0",
		},
		{
			ID:          uuid.New().String(),
			Name:        "confidential-certification-required",
			Description: "Confidential services must have security certifications",
			Type:        "COMPLIANCE",
			Enabled:     true,
			Severity:    "high",
			Rule: map[string]interface{}{
				"compliance": map[string]interface{}{
					"required_certifications": []string{"SOC2", "ISO27001"},
					"minimum_compliance_level": "confidential",
				},
			},
			Metadata: map[string]string{
				"category": "security",
			},
			Version: "1.0.0",
		},
		{
			ID:          uuid.New().String(),
			Name:        "https-required",
			Description: "Production services must use HTTPS endpoints",
			Type:        "SECURITY",
			Enabled:     true,
			Severity:    "critical",
			Rule: map[string]interface{}{
				"security": map[string]interface{}{
					"require_https":             true,
					"minimum_tls_version":       13,
					"require_authentication":    true,
				},
			},
			Metadata: map[string]string{
				"category": "security",
			},
			Version: "1.0.0",
		},
		{
			ID:          uuid.New().String(),
			Name:        "enterprise-sla-minimum",
			Description: "Enterprise support level requires at least 99.9% availability SLA",
			Type:        "PRICING",
			Enabled:     true,
			Severity:    "medium",
			Rule: map[string]interface{}{
				"pricing": map[string]interface{}{
					"minimum_sla_for_enterprise": 99.9,
				},
			},
			Metadata: map[string]string{
				"category": "sla",
			},
			Version: "1.0.0",
		},
	}

	for _, policy := range defaultPolicies {
		// Check if policy already exists
		var exists bool
		err := s.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM policies WHERE name = $1)", policy.Name).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check policy existence: %w", err)
		}

		if !exists {
			if err := s.Create(ctx, &policy); err != nil {
				return fmt.Errorf("failed to seed policy %s: %w", policy.Name, err)
			}
		}
	}

	return nil
}

// Create creates a new policy
func (s *PolicyStore) Create(ctx context.Context, policy *Policy) error {
	if policy.ID == "" {
		policy.ID = uuid.New().String()
	}

	ruleJSON, err := json.Marshal(policy.Rule)
	if err != nil {
		return fmt.Errorf("failed to marshal rule: %w", err)
	}

	metadataJSON, err := json.Marshal(policy.Metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	query := `
		INSERT INTO policies (id, name, description, type, enabled, severity, rule, metadata, version)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING created_at, updated_at
	`

	err = s.db.QueryRowContext(
		ctx,
		query,
		policy.ID,
		policy.Name,
		policy.Description,
		policy.Type,
		policy.Enabled,
		policy.Severity,
		ruleJSON,
		metadataJSON,
		policy.Version,
	).Scan(&policy.CreatedAt, &policy.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create policy: %w", err)
	}

	// Invalidate cache
	if s.enableCache {
		s.cache.mu.Lock()
		delete(s.cache.policies, policy.ID)
		s.cache.mu.Unlock()
	}

	return nil
}

// Get retrieves a policy by ID
func (s *PolicyStore) Get(ctx context.Context, id string) (*Policy, error) {
	// Check cache first
	if s.enableCache {
		s.cache.mu.RLock()
		if cached, ok := s.cache.policies[id]; ok {
			s.cache.mu.RUnlock()
			return cached, nil
		}
		s.cache.mu.RUnlock()
	}

	// Query database
	policy := &Policy{}
	var ruleJSON, metadataJSON []byte

	query := `
		SELECT id, name, description, type, enabled, severity, rule, metadata, created_at, updated_at, version
		FROM policies
		WHERE id = $1
	`

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&policy.ID,
		&policy.Name,
		&policy.Description,
		&policy.Type,
		&policy.Enabled,
		&policy.Severity,
		&ruleJSON,
		&metadataJSON,
		&policy.CreatedAt,
		&policy.UpdatedAt,
		&policy.Version,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("policy not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get policy: %w", err)
	}

	if err := json.Unmarshal(ruleJSON, &policy.Rule); err != nil {
		return nil, fmt.Errorf("failed to unmarshal rule: %w", err)
	}

	if err := json.Unmarshal(metadataJSON, &policy.Metadata); err != nil {
		return nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
	}

	// Update cache
	if s.enableCache {
		s.cache.mu.Lock()
		s.cache.policies[id] = policy
		s.cache.mu.Unlock()
	}

	return policy, nil
}

// List retrieves all policies with optional filtering
func (s *PolicyStore) List(ctx context.Context, filter map[string]interface{}) ([]*Policy, error) {
	query := `
		SELECT id, name, description, type, enabled, severity, rule, metadata, created_at, updated_at, version
		FROM policies
		WHERE 1=1
	`
	args := []interface{}{}
	argPos := 1

	// Apply filters
	if policyType, ok := filter["type"].(string); ok && policyType != "" {
		query += fmt.Sprintf(" AND type = $%d", argPos)
		args = append(args, policyType)
		argPos++
	}

	if enabled, ok := filter["enabled"].(bool); ok {
		query += fmt.Sprintf(" AND enabled = $%d", argPos)
		args = append(args, enabled)
		argPos++
	}

	if severity, ok := filter["severity"].(string); ok && severity != "" {
		query += fmt.Sprintf(" AND severity = $%d", argPos)
		args = append(args, severity)
		argPos++
	}

	query += " ORDER BY created_at DESC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list policies: %w", err)
	}
	defer rows.Close()

	policies := []*Policy{}
	for rows.Next() {
		policy := &Policy{}
		var ruleJSON, metadataJSON []byte

		err := rows.Scan(
			&policy.ID,
			&policy.Name,
			&policy.Description,
			&policy.Type,
			&policy.Enabled,
			&policy.Severity,
			&ruleJSON,
			&metadataJSON,
			&policy.CreatedAt,
			&policy.UpdatedAt,
			&policy.Version,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan policy: %w", err)
		}

		if err := json.Unmarshal(ruleJSON, &policy.Rule); err != nil {
			return nil, fmt.Errorf("failed to unmarshal rule: %w", err)
		}

		if err := json.Unmarshal(metadataJSON, &policy.Metadata); err != nil {
			return nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
		}

		policies = append(policies, policy)
	}

	return policies, rows.Err()
}

// Update updates an existing policy
func (s *PolicyStore) Update(ctx context.Context, policy *Policy) error {
	ruleJSON, err := json.Marshal(policy.Rule)
	if err != nil {
		return fmt.Errorf("failed to marshal rule: %w", err)
	}

	metadataJSON, err := json.Marshal(policy.Metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	query := `
		UPDATE policies
		SET name = $2, description = $3, type = $4, enabled = $5, severity = $6, rule = $7, metadata = $8, version = $9
		WHERE id = $1
		RETURNING updated_at
	`

	err = s.db.QueryRowContext(
		ctx,
		query,
		policy.ID,
		policy.Name,
		policy.Description,
		policy.Type,
		policy.Enabled,
		policy.Severity,
		ruleJSON,
		metadataJSON,
		policy.Version,
	).Scan(&policy.UpdatedAt)

	if err == sql.ErrNoRows {
		return fmt.Errorf("policy not found: %s", policy.ID)
	}
	if err != nil {
		return fmt.Errorf("failed to update policy: %w", err)
	}

	// Invalidate cache
	if s.enableCache {
		s.cache.mu.Lock()
		delete(s.cache.policies, policy.ID)
		s.cache.mu.Unlock()
	}

	return nil
}

// Delete deletes a policy
func (s *PolicyStore) Delete(ctx context.Context, id string) error {
	query := "DELETE FROM policies WHERE id = $1"

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete policy: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("policy not found: %s", id)
	}

	// Invalidate cache
	if s.enableCache {
		s.cache.mu.Lock()
		delete(s.cache.policies, id)
		s.cache.mu.Unlock()
	}

	return nil
}

// GetEnabledPolicies retrieves all enabled policies
func (s *PolicyStore) GetEnabledPolicies(ctx context.Context) ([]*Policy, error) {
	return s.List(ctx, map[string]interface{}{"enabled": true})
}

// GetPoliciesByType retrieves all policies of a specific type
func (s *PolicyStore) GetPoliciesByType(ctx context.Context, policyType string) ([]*Policy, error) {
	return s.List(ctx, map[string]interface{}{"type": policyType, "enabled": true})
}

// Close closes the policy store
func (s *PolicyStore) Close() error {
	if s.autoReload && s.reloadTicker != nil {
		s.reloadTicker.Stop()
		close(s.stopCh)
	}
	return s.db.Close()
}

// ClearCache clears the policy cache
func (s *PolicyStore) ClearCache() {
	if s.enableCache {
		s.cache.mu.Lock()
		s.cache.policies = make(map[string]*Policy)
		s.cache.mu.Unlock()
	}
}
