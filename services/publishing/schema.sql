-- Publishing Service Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registry_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    provider_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    capabilities JSONB NOT NULL,
    endpoint JSONB NOT NULL,
    pricing JSONB NOT NULL,
    sla JSONB NOT NULL,
    compliance JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_approval',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    deprecated_at TIMESTAMP WITH TIME ZONE,
    suspension_reason TEXT,
    openapi_spec JSONB,

    CONSTRAINT unique_service_version UNIQUE(name, version),
    CONSTRAINT valid_status CHECK (status IN (
        'pending_approval',
        'active',
        'deprecated',
        'suspended',
        'retired',
        'failed_validation'
    )),
    CONSTRAINT valid_category CHECK (category IN (
        'text-generation',
        'embeddings',
        'classification',
        'summarization',
        'translation',
        'question-answering',
        'code-generation',
        'image-generation',
        'speech-to-text',
        'text-to-speech'
    ))
);

-- Indexes for performance
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_provider ON services(provider_id);
CREATE INDEX idx_services_created ON services(created_at DESC);
CREATE INDEX idx_services_name ON services(name);
CREATE INDEX idx_services_tags ON services USING GIN(tags);
CREATE INDEX idx_services_registry_id ON services(registry_id);

-- Service versions table
CREATE TABLE IF NOT EXISTS service_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_version UNIQUE(service_name, version)
);

CREATE INDEX idx_service_versions_name ON service_versions(service_name);
CREATE INDEX idx_service_versions_service_id ON service_versions(service_id);

-- Usage records table (partitioned by month)
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID DEFAULT uuid_generate_v4(),
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

-- Create initial partitions (example for current and next month)
CREATE TABLE usage_records_2025_11 PARTITION OF usage_records
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE usage_records_2025_12 PARTITION OF usage_records
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Indexes for usage records
CREATE INDEX idx_usage_service ON usage_records(service_id);
CREATE INDEX idx_usage_consumer ON usage_records(consumer_id);
CREATE INDEX idx_usage_timestamp ON usage_records(timestamp DESC);

-- Audit log table (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Indexes for audit logs
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_id);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type);

-- Approval workflows table
CREATE TABLE IF NOT EXISTS approval_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id),
    provider_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    assigned_to UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    comments TEXT,
    validation_results JSONB,
    policy_results JSONB,

    CONSTRAINT valid_workflow_status CHECK (status IN (
        'pending',
        'in_review',
        'approved',
        'rejected',
        'cancelled'
    ))
);

CREATE INDEX idx_workflows_status ON approval_workflows(status);
CREATE INDEX idx_workflows_service ON approval_workflows(service_id);
CREATE INDEX idx_workflows_provider ON approval_workflows(provider_id);

-- Validation results table
CREATE TABLE IF NOT EXISTS validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id),
    validation_type VARCHAR(50) NOT NULL,
    passed BOOLEAN NOT NULL,
    errors JSONB,
    warnings JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_validation_service ON validation_results(service_id);
CREATE INDEX idx_validation_type ON validation_results(validation_type);
CREATE INDEX idx_validation_created ON validation_results(created_at DESC);

-- Triggers

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at
    BEFORE UPDATE ON approval_workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Audit logging trigger
CREATE OR REPLACE FUNCTION audit_service_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (
            event_type,
            actor_id,
            actor_type,
            resource_id,
            resource_type,
            action,
            details
        ) VALUES (
            'service_created',
            NEW.provider_id,
            'provider',
            NEW.id,
            'service',
            'CREATE',
            jsonb_build_object(
                'name', NEW.name,
                'version', NEW.version,
                'status', NEW.status
            )
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (
            event_type,
            actor_id,
            actor_type,
            resource_id,
            resource_type,
            action,
            details
        ) VALUES (
            'service_updated',
            NEW.provider_id,
            'provider',
            NEW.id,
            'service',
            'UPDATE',
            jsonb_build_object(
                'name', NEW.name,
                'old_status', OLD.status,
                'new_status', NEW.status
            )
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER audit_services
    AFTER INSERT OR UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION audit_service_changes();

-- Views

-- Active services view
CREATE OR REPLACE VIEW active_services AS
SELECT
    id,
    name,
    version,
    description,
    category,
    provider_id,
    endpoint,
    pricing,
    sla,
    compliance,
    published_at
FROM services
WHERE status = 'active'
ORDER BY published_at DESC;

-- Service statistics view
CREATE OR REPLACE VIEW service_statistics AS
SELECT
    category,
    status,
    COUNT(*) as count,
    AVG((pricing->>'model')::text) as avg_pricing_model
FROM services
GROUP BY category, status;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO publishing_service;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO publishing_service;
