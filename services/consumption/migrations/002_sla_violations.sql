-- SLA Violations table for monitoring service level agreement breaches
CREATE TABLE IF NOT EXISTS sla_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL,
    metric VARCHAR(100) NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    actual DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('warning', 'critical')),

    CONSTRAINT fk_service
        FOREIGN KEY (service_id)
        REFERENCES services(id)
        ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX idx_sla_violations_service_id ON sla_violations(service_id);
CREATE INDEX idx_sla_violations_timestamp ON sla_violations(timestamp DESC);
CREATE INDEX idx_sla_violations_severity ON sla_violations(severity);
CREATE INDEX idx_sla_violations_metric ON sla_violations(metric);

-- Composite index for common queries
CREATE INDEX idx_sla_violations_service_timestamp ON sla_violations(service_id, timestamp DESC);

-- Comment for documentation
COMMENT ON TABLE sla_violations IS 'Records all SLA violations for monitoring and alerting';
COMMENT ON COLUMN sla_violations.metric IS 'Type of SLA metric violated (latency, error_rate, uptime)';
COMMENT ON COLUMN sla_violations.severity IS 'Violation severity level (warning, critical)';
