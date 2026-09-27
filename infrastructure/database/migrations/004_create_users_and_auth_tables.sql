-- Migration: 004_create_users_and_auth_tables.sql
-- Description: Create users, api_keys, and sessions tables for authentication
-- Created: 2025-11-18

-- Create enum types for user management
CREATE TYPE user_role AS ENUM ('admin', 'provider', 'consumer', 'viewer');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'consumer',
    status user_status NOT NULL DEFAULT 'active',
    email_verified BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',

    CONSTRAINT email_lowercase CHECK (email = LOWER(email))
);

-- Create indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created ON users(created_at DESC);
CREATE INDEX idx_users_metadata_gin ON users USING GIN(metadata);

-- Create trigger for users updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create API keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT key_prefix_unique UNIQUE(key_prefix)
);

-- Create indexes for api_keys table
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_created ON api_keys(created_at DESC);
CREATE INDEX idx_api_keys_active ON api_keys(user_id, created_at DESC)
    WHERE revoked_at IS NULL;

-- Create sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_expiration CHECK (expires_at > created_at)
);

-- Create indexes for sessions table
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_active ON sessions(user_id, created_at DESC)
    WHERE revoked_at IS NULL AND expires_at > NOW();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions
    WHERE expires_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE 'Cleaned up % expired sessions', deleted_count;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add foreign key to services table for provider
ALTER TABLE services
    ADD CONSTRAINT fk_services_provider
    FOREIGN KEY (provider_id)
    REFERENCES users(id)
    ON DELETE RESTRICT;

-- Update usage_records to reference users
ALTER TABLE usage_records
    ADD CONSTRAINT fk_usage_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES users(id)
    ON DELETE RESTRICT;

-- Create view for active users with API key counts
CREATE VIEW user_stats AS
SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.status,
    u.last_login_at,
    u.created_at,
    COUNT(DISTINCT ak.id) FILTER (WHERE ak.revoked_at IS NULL) as active_api_keys,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as published_services,
    MAX(ak.last_used_at) as last_api_key_usage
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.user_id
LEFT JOIN services s ON u.id = s.provider_id
GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.last_login_at, u.created_at;

-- Add comments
COMMENT ON TABLE users IS 'Application users with authentication credentials';
COMMENT ON TABLE api_keys IS 'API keys for programmatic access';
COMMENT ON TABLE sessions IS 'User sessions for refresh token management';
COMMENT ON VIEW user_stats IS 'Aggregated statistics for each user';

COMMENT ON COLUMN users.email IS 'User email address (unique, lowercase)';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash of user password';
COMMENT ON COLUMN users.role IS 'User role for RBAC';
COMMENT ON COLUMN users.status IS 'Account status';
COMMENT ON COLUMN users.email_verified IS 'Whether email has been verified';

COMMENT ON COLUMN api_keys.key_hash IS 'Bcrypt hash of the API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First few characters of the key for identification';
COMMENT ON COLUMN api_keys.scopes IS 'Array of permission scopes for this key';
COMMENT ON COLUMN api_keys.revoked_at IS 'Timestamp when key was revoked (NULL if active)';
