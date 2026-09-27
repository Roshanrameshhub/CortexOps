-- Initial database schema for consumption service

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registry_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    provider_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL,
    tags TEXT[],
    capabilities JSONB NOT NULL,
    endpoint VARCHAR(1024) NOT NULL,
    pricing JSONB NOT NULL,
    sla JSONB NOT NULL,
    compliance JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_approval',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    deprecated_at TIMESTAMP WITH TIME ZONE,
    suspension_reason TEXT,

    CONSTRAINT unique_service_version UNIQUE(name, version),
    CONSTRAINT valid_status CHECK (status IN ('pending_approval', 'active', 'deprecated', 'suspended', 'retired'))
);

CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_provider ON services(provider_id);
CREATE INDEX idx_services_created ON services(created_at DESC);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash TEXT NOT NULL UNIQUE,
    consumer_id UUID NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    tier VARCHAR(50) NOT NULL DEFAULT 'basic',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT valid_tier CHECK (tier IN ('basic', 'premium', 'enterprise'))
);

CREATE INDEX idx_api_keys_consumer ON api_keys(consumer_id);
CREATE INDEX idx_api_keys_service ON api_keys(service_id);
CREATE INDEX idx_api_keys_created ON api_keys(created_at DESC);

-- Usage records table (partitioned by month for performance)
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    consumer_id UUID NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_ms INTEGER NOT NULL,
    usage JSONB NOT NULL,
    cost JSONB NOT NULL,
    status VARCHAR(50) NOT NULL,
    error JSONB,
    metadata JSONB,

    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create initial partitions (current month and next month)
CREATE TABLE usage_records_2025_11 PARTITION OF usage_records
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE usage_records_2025_12 PARTITION OF usage_records
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE INDEX idx_usage_records_service ON usage_records(service_id, timestamp DESC);
CREATE INDEX idx_usage_records_consumer ON usage_records(consumer_id, timestamp DESC);
CREATE INDEX idx_usage_records_request ON usage_records(request_id);

-- Quota usage table
CREATE TABLE IF NOT EXISTS quota_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id UUID NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    used_tokens BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_consumer_service_month UNIQUE(consumer_id, service_id, month)
);

CREATE INDEX idx_quota_usage_consumer ON quota_usage(consumer_id, month);
CREATE INDEX idx_quota_usage_service ON quota_usage(service_id, month);

-- Audit log table (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    actor_id UUID NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    resource_type VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    details JSONB NOT NULL,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on services
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample service for testing
INSERT INTO services (
    id, registry_id, name, version, endpoint, status, pricing, sla, created_at
) VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'GPT-4 Text Generation',
    '1.0.0',
    'https://api.example.com/v1/chat/completions',
    'active',
    '{"model": "per-token", "rates": [{"tier": "basic", "rate": 0.0001, "unit": "token"}]}'::jsonb,
    '{"availability": 99.9, "max_latency_ms": 1000, "timeout_ms": 30000}'::jsonb,
    NOW()
);
