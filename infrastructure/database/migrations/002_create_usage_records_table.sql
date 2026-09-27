-- Migration: 002_create_usage_records_table.sql
-- Description: Create the usage_records table with partitioning by month
-- Created: 2025-11-18

-- Create enum for usage record status
CREATE TYPE usage_status AS ENUM ('success', 'error', 'timeout', 'rate_limited', 'quota_exceeded');

-- Create the main usage_records table (partitioned by timestamp)
CREATE TABLE usage_records (
    id UUID DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    consumer_id UUID NOT NULL,

    -- Timing information
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),

    -- Usage metrics (JSONB for flexibility - tokens, data transferred, etc.)
    usage JSONB NOT NULL DEFAULT '{}',

    -- Cost calculation (JSONB to support multiple currencies and pricing models)
    cost JSONB NOT NULL DEFAULT '{}',

    -- Status and error information
    status usage_status NOT NULL,
    error JSONB,

    -- Additional metadata (IP address, user agent, etc.)
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT usage_is_object CHECK (jsonb_typeof(usage) = 'object'),
    CONSTRAINT cost_is_object CHECK (jsonb_typeof(cost) = 'object'),
    CONSTRAINT error_is_object CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
    CONSTRAINT metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),

    -- Composite primary key including timestamp for partitioning
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create indexes on the partitioned table
CREATE INDEX idx_usage_timestamp ON usage_records(timestamp DESC);
CREATE INDEX idx_usage_service ON usage_records(service_id, timestamp DESC);
CREATE INDEX idx_usage_consumer ON usage_records(consumer_id, timestamp DESC);
CREATE INDEX idx_usage_request ON usage_records(request_id);
CREATE INDEX idx_usage_status ON usage_records(status, timestamp DESC);

-- GIN index for JSONB columns
CREATE INDEX idx_usage_usage_gin ON usage_records USING GIN(usage);
CREATE INDEX idx_usage_metadata_gin ON usage_records USING GIN(metadata);

-- Create partitions for the next 6 months (can be automated with a cron job)
-- Partition for current month
CREATE TABLE usage_records_2025_11 PARTITION OF usage_records
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE usage_records_2025_12 PARTITION OF usage_records
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE usage_records_2026_01 PARTITION OF usage_records
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE usage_records_2026_02 PARTITION OF usage_records
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE usage_records_2026_03 PARTITION OF usage_records
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE usage_records_2026_04 PARTITION OF usage_records
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Function to automatically create new partitions
CREATE OR REPLACE FUNCTION create_usage_partition(partition_date DATE)
RETURNS void AS $$
DECLARE
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    partition_name := 'usage_records_' || to_char(partition_date, 'YYYY_MM');
    start_date := to_char(partition_date, 'YYYY-MM-01');
    end_date := to_char(partition_date + INTERVAL '1 month', 'YYYY-MM-01');

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF usage_records FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
    );

    RAISE NOTICE 'Created partition % for period % to %', partition_name, start_date, end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old partitions (for data retention policy)
CREATE OR REPLACE FUNCTION drop_old_usage_partitions(retention_months INTEGER DEFAULT 12)
RETURNS void AS $$
DECLARE
    partition_record RECORD;
    cutoff_date DATE;
BEGIN
    cutoff_date := CURRENT_DATE - (retention_months || ' months')::INTERVAL;

    FOR partition_record IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'usage_records_%'
        AND tablename < 'usage_records_' || to_char(cutoff_date, 'YYYY_MM')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || partition_record.tablename;
        RAISE NOTICE 'Dropped old partition %', partition_record.tablename;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for usage aggregation (for analytics)
CREATE MATERIALIZED VIEW usage_summary_daily AS
SELECT
    date_trunc('day', timestamp) AS day,
    service_id,
    consumer_id,
    status,
    COUNT(*) AS request_count,
    AVG(duration_ms) AS avg_duration_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_duration_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99_duration_ms,
    SUM((usage->>'tokens')::INTEGER) AS total_tokens,
    SUM((cost->>'amount')::DECIMAL) AS total_cost
FROM usage_records
WHERE timestamp >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY day, service_id, consumer_id, status
WITH DATA;

-- Index on the materialized view
CREATE UNIQUE INDEX idx_usage_summary_daily_unique ON usage_summary_daily(day, service_id, consumer_id, status);
CREATE INDEX idx_usage_summary_day ON usage_summary_daily(day DESC);
CREATE INDEX idx_usage_summary_service ON usage_summary_daily(service_id, day DESC);

-- Refresh materialized view function
CREATE OR REPLACE FUNCTION refresh_usage_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY usage_summary_daily;
    RAISE NOTICE 'Refreshed usage_summary_daily materialized view';
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE usage_records IS 'Stores all service usage records with monthly partitioning for performance';
COMMENT ON COLUMN usage_records.request_id IS 'Unique identifier for the request (for distributed tracing)';
COMMENT ON COLUMN usage_records.service_id IS 'Foreign key to the service being consumed';
COMMENT ON COLUMN usage_records.consumer_id IS 'Identifier of the consumer (user/application)';
COMMENT ON COLUMN usage_records.timestamp IS 'When the request was made (partition key)';
COMMENT ON COLUMN usage_records.duration_ms IS 'Request duration in milliseconds';
COMMENT ON COLUMN usage_records.usage IS 'Usage metrics including tokens, data transferred, etc.';
COMMENT ON COLUMN usage_records.cost IS 'Cost calculation based on pricing model';
COMMENT ON COLUMN usage_records.status IS 'Request status (success, error, etc.)';
COMMENT ON COLUMN usage_records.error IS 'Error details if status is error';
