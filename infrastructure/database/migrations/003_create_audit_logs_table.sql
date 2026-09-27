-- Migration: 003_create_audit_logs_table.sql
-- Description: Create the audit_logs table for immutable audit trail
-- Created: 2025-11-18

-- Create enum for event types
CREATE TYPE audit_event_type AS ENUM (
    'service_created',
    'service_updated',
    'service_published',
    'service_deprecated',
    'service_suspended',
    'service_retired',
    'user_registered',
    'user_login',
    'user_logout',
    'api_key_created',
    'api_key_revoked',
    'permission_granted',
    'permission_revoked',
    'policy_violation',
    'access_denied',
    'configuration_changed',
    'data_exported',
    'data_deleted',
    'other'
);

-- Create enum for actor types
CREATE TYPE actor_type AS ENUM ('user', 'service', 'system', 'admin', 'api');

-- Create the audit_logs table (append-only for immutability)
CREATE TABLE audit_logs (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    -- Event classification
    event_type audit_event_type NOT NULL,

    -- Actor (who performed the action)
    actor_id UUID NOT NULL,
    actor_type actor_type NOT NULL,
    actor_name VARCHAR(255),

    -- Resource (what was acted upon)
    resource_id UUID,
    resource_type VARCHAR(100),
    resource_name VARCHAR(255),

    -- Action details
    action VARCHAR(100) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',

    -- Context information
    ip_address INET,
    user_agent TEXT,
    session_id UUID,

    -- Request metadata
    request_id UUID,
    correlation_id UUID,

    -- Results
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,

    -- Additional metadata
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT details_is_object CHECK (jsonb_typeof(details) = 'object'),
    CONSTRAINT metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

-- Create indexes for efficient querying
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type, timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, timestamp DESC);
CREATE INDEX idx_audit_success ON audit_logs(success, timestamp DESC);
CREATE INDEX idx_audit_session ON audit_logs(session_id, timestamp DESC);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id, timestamp DESC);

-- GIN indexes for JSONB columns
CREATE INDEX idx_audit_details_gin ON audit_logs USING GIN(details);
CREATE INDEX idx_audit_metadata_gin ON audit_logs USING GIN(metadata);

-- Create a function to prevent updates and deletes (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Audit logs are immutable and cannot be updated';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit logs are immutable and cannot be deleted';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to enforce immutability
CREATE TRIGGER prevent_audit_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER prevent_audit_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- Create helper function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
    p_event_type audit_event_type,
    p_actor_id UUID,
    p_actor_type actor_type,
    p_action VARCHAR(100),
    p_details JSONB DEFAULT '{}',
    p_resource_id UUID DEFAULT NULL,
    p_resource_type VARCHAR(100) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_success BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO audit_logs (
        event_type,
        actor_id,
        actor_type,
        action,
        details,
        resource_id,
        resource_type,
        ip_address,
        success
    ) VALUES (
        p_event_type,
        p_actor_id,
        p_actor_type,
        p_action,
        p_details,
        p_resource_id,
        p_resource_type,
        p_ip_address,
        p_success
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for audit summary
CREATE MATERIALIZED VIEW audit_summary_daily AS
SELECT
    date_trunc('day', timestamp) AS day,
    event_type,
    actor_type,
    action,
    success,
    COUNT(*) AS event_count,
    COUNT(DISTINCT actor_id) AS unique_actors,
    COUNT(DISTINCT resource_id) AS unique_resources
FROM audit_logs
WHERE timestamp >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY day, event_type, actor_type, action, success
WITH DATA;

-- Index on the materialized view
CREATE UNIQUE INDEX idx_audit_summary_daily_unique
    ON audit_summary_daily(day, event_type, actor_type, action, success);
CREATE INDEX idx_audit_summary_day ON audit_summary_daily(day DESC);
CREATE INDEX idx_audit_summary_event ON audit_summary_daily(event_type, day DESC);

-- Function to refresh audit summary
CREATE OR REPLACE FUNCTION refresh_audit_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY audit_summary_daily;
    RAISE NOTICE 'Refreshed audit_summary_daily materialized view';
END;
$$ LANGUAGE plpgsql;

-- Function to archive old audit logs (for compliance and storage management)
CREATE OR REPLACE FUNCTION archive_old_audit_logs(
    retention_days INTEGER DEFAULT 365,
    archive_table_name TEXT DEFAULT 'audit_logs_archive'
)
RETURNS INTEGER AS $$
DECLARE
    cutoff_date TIMESTAMP WITH TIME ZONE;
    archived_count INTEGER;
BEGIN
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;

    -- Create archive table if it doesn't exist
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I (LIKE audit_logs INCLUDING ALL)',
        archive_table_name
    );

    -- Move old records to archive
    EXECUTE format(
        'INSERT INTO %I SELECT * FROM audit_logs WHERE timestamp < %L',
        archive_table_name,
        cutoff_date
    );

    GET DIAGNOSTICS archived_count = ROW_COUNT;

    RAISE NOTICE 'Archived % audit log records older than %', archived_count, cutoff_date;

    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- Create view for security-relevant events
CREATE VIEW security_audit_events AS
SELECT
    id,
    timestamp,
    event_type,
    actor_id,
    actor_type,
    action,
    resource_id,
    resource_type,
    ip_address,
    success,
    error_message,
    details
FROM audit_logs
WHERE event_type IN (
    'user_login',
    'user_logout',
    'api_key_created',
    'api_key_revoked',
    'permission_granted',
    'permission_revoked',
    'policy_violation',
    'access_denied'
)
ORDER BY timestamp DESC;

-- Create view for failed actions
CREATE VIEW failed_audit_events AS
SELECT
    id,
    timestamp,
    event_type,
    actor_id,
    actor_type,
    action,
    resource_id,
    resource_type,
    error_message,
    details
FROM audit_logs
WHERE success = false
ORDER BY timestamp DESC;

-- Add comments
COMMENT ON TABLE audit_logs IS 'Immutable audit log for all system events (append-only)';
COMMENT ON COLUMN audit_logs.id IS 'Unique identifier for the audit event';
COMMENT ON COLUMN audit_logs.timestamp IS 'When the event occurred';
COMMENT ON COLUMN audit_logs.event_type IS 'Type of event being audited';
COMMENT ON COLUMN audit_logs.actor_id IS 'Identifier of the entity performing the action';
COMMENT ON COLUMN audit_logs.actor_type IS 'Type of actor (user, service, system, etc.)';
COMMENT ON COLUMN audit_logs.resource_id IS 'Identifier of the resource being acted upon';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource (service, user, etc.)';
COMMENT ON COLUMN audit_logs.action IS 'Specific action being performed';
COMMENT ON COLUMN audit_logs.details IS 'Detailed information about the event';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address of the actor';
COMMENT ON COLUMN audit_logs.success IS 'Whether the action was successful';
COMMENT ON VIEW security_audit_events IS 'View of security-relevant audit events';
COMMENT ON VIEW failed_audit_events IS 'View of failed audit events for monitoring';
