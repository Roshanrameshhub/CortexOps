-- Migration: 001_create_services_table.sql
-- Description: Create the services table with all required columns, constraints, and indexes
-- Created: 2025-11-18

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types for service status and category
CREATE TYPE service_status AS ENUM (
    'pending_approval',
    'active',
    'deprecated',
    'suspended',
    'retired'
);

CREATE TYPE service_category AS ENUM (
    'text-generation',
    'embeddings',
    'classification',
    'translation',
    'summarization',
    'question-answering',
    'sentiment-analysis',
    'code-generation',
    'image-generation',
    'speech-to-text',
    'text-to-speech',
    'other'
);

CREATE TYPE endpoint_protocol AS ENUM ('rest', 'grpc', 'websocket');
CREATE TYPE endpoint_authentication AS ENUM ('api-key', 'oauth2', 'jwt');
CREATE TYPE pricing_model AS ENUM ('per-token', 'per-request', 'subscription', 'free');
CREATE TYPE support_level AS ENUM ('basic', 'premium', 'enterprise');
CREATE TYPE compliance_level AS ENUM ('public', 'internal', 'confidential', 'restricted');

-- Create the services table
CREATE TABLE services (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registry_id UUID NOT NULL,

    -- Service metadata
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,

    -- Provider information
    provider_id UUID NOT NULL,

    -- Categorization
    category service_category NOT NULL,
    tags TEXT[] DEFAULT '{}',

    -- Capabilities and endpoint configuration (JSONB for flexibility)
    capabilities JSONB NOT NULL DEFAULT '[]',
    endpoint JSONB NOT NULL,

    -- Pricing and SLA configuration
    pricing JSONB NOT NULL,
    sla JSONB NOT NULL,

    -- Compliance information
    compliance JSONB NOT NULL,

    -- Service status
    status service_status NOT NULL DEFAULT 'pending_approval',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    deprecated_at TIMESTAMP WITH TIME ZONE,

    -- Additional metadata
    suspension_reason TEXT,
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT unique_service_version UNIQUE(name, version),
    CONSTRAINT valid_version CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$'),
    CONSTRAINT capabilities_is_array CHECK (jsonb_typeof(capabilities) = 'array'),
    CONSTRAINT endpoint_is_object CHECK (jsonb_typeof(endpoint) = 'object'),
    CONSTRAINT pricing_is_object CHECK (jsonb_typeof(pricing) = 'object'),
    CONSTRAINT sla_is_object CHECK (jsonb_typeof(sla) = 'object'),
    CONSTRAINT compliance_is_object CHECK (jsonb_typeof(compliance) = 'object')
);

-- Create indexes for performance optimization
CREATE INDEX idx_services_status ON services(status) WHERE status IN ('active', 'pending_approval');
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_provider ON services(provider_id);
CREATE INDEX idx_services_created ON services(created_at DESC);
CREATE INDEX idx_services_published ON services(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_services_name ON services(name);
CREATE INDEX idx_services_registry ON services(registry_id);

-- GIN indexes for JSONB columns to enable efficient querying
CREATE INDEX idx_services_capabilities_gin ON services USING GIN(capabilities);
CREATE INDEX idx_services_tags_gin ON services USING GIN(tags);
CREATE INDEX idx_services_metadata_gin ON services USING GIN(metadata);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to validate service status transitions
CREATE OR REPLACE FUNCTION validate_service_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow any status on INSERT
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Validate status transitions
    IF OLD.status = 'pending_approval' AND NEW.status NOT IN ('active', 'rejected', 'suspended') THEN
        RAISE EXCEPTION 'Invalid status transition from pending_approval to %', NEW.status;
    END IF;

    IF OLD.status = 'active' AND NEW.status NOT IN ('deprecated', 'suspended', 'retired') THEN
        RAISE EXCEPTION 'Invalid status transition from active to %', NEW.status;
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status NOT IN ('retired', 'active') THEN
        RAISE EXCEPTION 'Invalid status transition from deprecated to %', NEW.status;
    END IF;

    IF OLD.status = 'retired' THEN
        RAISE EXCEPTION 'Cannot change status of retired service';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for status validation
CREATE TRIGGER validate_service_status
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION validate_service_status_transition();

-- Add comments for documentation
COMMENT ON TABLE services IS 'Stores all LLM services published in the marketplace';
COMMENT ON COLUMN services.id IS 'Unique identifier for the service';
COMMENT ON COLUMN services.registry_id IS 'Foreign key reference to LLM-Registry';
COMMENT ON COLUMN services.name IS 'Human-readable service name';
COMMENT ON COLUMN services.version IS 'Semantic version (SemVer) of the service';
COMMENT ON COLUMN services.capabilities IS 'Array of capability objects with name, description, and parameters';
COMMENT ON COLUMN services.endpoint IS 'Endpoint configuration including URL, protocol, and authentication';
COMMENT ON COLUMN services.pricing IS 'Pricing model and rates configuration';
COMMENT ON COLUMN services.sla IS 'Service Level Agreement details including availability and max latency';
COMMENT ON COLUMN services.compliance IS 'Compliance level, certifications, and data residency requirements';
COMMENT ON COLUMN services.status IS 'Current lifecycle status of the service';
