-- Discovery Service Database Schema

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registry_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    provider_id UUID NOT NULL,
    provider_name VARCHAR(255),
    provider_verified BOOLEAN DEFAULT FALSE,
    category VARCHAR(100) NOT NULL,
    tags TEXT[],
    capabilities JSONB NOT NULL,
    pricing_model VARCHAR(50),
    pricing_rate DECIMAL(10, 4),
    pricing_unit VARCHAR(50),
    sla_availability DECIMAL(5, 2),
    sla_max_latency_ms INTEGER,
    compliance_level VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'pending_approval',

    -- Metrics
    total_requests BIGINT DEFAULT 0,
    avg_latency_ms DECIMAL(10, 2) DEFAULT 0,
    error_rate DECIMAL(5, 4) DEFAULT 0,
    avg_rating DECIMAL(3, 2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_service_version UNIQUE(name, version),
    CONSTRAINT valid_status CHECK (status IN ('pending_approval', 'active', 'deprecated', 'suspended', 'retired'))
);

-- Indexes for services
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_provider ON services(provider_id);
CREATE INDEX idx_services_created ON services(created_at DESC);
CREATE INDEX idx_services_rating ON services(avg_rating DESC);
CREATE INDEX idx_services_tags ON services USING GIN(tags);

-- User interactions table
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) NOT NULL,
    rating DECIMAL(3, 2),
    duration_sec INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,

    CONSTRAINT valid_interaction_type CHECK (interaction_type IN ('view', 'download', 'rate', 'consume', 'favorite'))
);

-- Indexes for user_interactions
CREATE INDEX idx_interactions_user ON user_interactions(user_id);
CREATE INDEX idx_interactions_service ON user_interactions(service_id);
CREATE INDEX idx_interactions_timestamp ON user_interactions(timestamp DESC);
CREATE INDEX idx_interactions_type ON user_interactions(interaction_type);

-- Service ratings table
CREATE TABLE IF NOT EXISTS service_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    rating DECIMAL(3, 2) NOT NULL CHECK (rating >= 0 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_user_service_rating UNIQUE(user_id, service_id)
);

-- Indexes for ratings
CREATE INDEX idx_ratings_service ON service_ratings(service_id);
CREATE INDEX idx_ratings_user ON service_ratings(user_id);
CREATE INDEX idx_ratings_created ON service_ratings(created_at DESC);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id),
    icon VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Search analytics table (for tracking search behavior)
CREATE TABLE IF NOT EXISTS search_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    query TEXT NOT NULL,
    filters JSONB,
    results_count INTEGER,
    clicked_result_id UUID REFERENCES services(id),
    clicked_position INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for search analytics
CREATE INDEX idx_search_analytics_timestamp ON search_analytics(timestamp DESC);
CREATE INDEX idx_search_analytics_user ON search_analytics(user_id);
CREATE INDEX idx_search_analytics_query ON search_analytics USING GIN(to_tsvector('english', query));

-- Function to update service metrics
CREATE OR REPLACE FUNCTION update_service_metrics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE services
    SET
        total_requests = total_requests + 1,
        updated_at = NOW()
    WHERE id = NEW.service_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating service metrics on interactions
CREATE TRIGGER trigger_update_service_metrics
AFTER INSERT ON user_interactions
FOR EACH ROW
EXECUTE FUNCTION update_service_metrics();

-- Function to update service ratings
CREATE OR REPLACE FUNCTION update_service_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE services
    SET
        avg_rating = (
            SELECT AVG(rating)
            FROM service_ratings
            WHERE service_id = COALESCE(NEW.service_id, OLD.service_id)
        ),
        review_count = (
            SELECT COUNT(*)
            FROM service_ratings
            WHERE service_id = COALESCE(NEW.service_id, OLD.service_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.service_id, OLD.service_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating service ratings
CREATE TRIGGER trigger_update_service_rating
AFTER INSERT OR UPDATE OR DELETE ON service_ratings
FOR EACH ROW
EXECUTE FUNCTION update_service_rating();

-- Function to update tag usage counts
CREATE OR REPLACE FUNCTION update_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment usage for new tags
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE tags
        SET usage_count = usage_count + 1
        WHERE name = ANY(NEW.tags);
    END IF;

    -- Decrement usage for removed tags
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        UPDATE tags
        SET usage_count = usage_count - 1
        WHERE name = ANY(OLD.tags);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating tag usage
CREATE TRIGGER trigger_update_tag_usage
AFTER INSERT OR UPDATE OR DELETE ON services
FOR EACH ROW
EXECUTE FUNCTION update_tag_usage();

-- Insert sample categories
INSERT INTO categories (name, description) VALUES
    ('text-generation', 'Text generation and completion services'),
    ('embeddings', 'Text and document embedding services'),
    ('classification', 'Text classification and categorization'),
    ('translation', 'Language translation services'),
    ('summarization', 'Text summarization services'),
    ('question-answering', 'Question answering systems'),
    ('sentiment-analysis', 'Sentiment and emotion analysis'),
    ('named-entity-recognition', 'Entity extraction and recognition'),
    ('code-generation', 'Code generation and completion'),
    ('image-generation', 'Image generation and manipulation')
ON CONFLICT (name) DO NOTHING;

-- Insert sample tags
INSERT INTO tags (name, usage_count) VALUES
    ('nlp', 0),
    ('machine-learning', 0),
    ('ai', 0),
    ('gpt', 0),
    ('transformer', 0),
    ('bert', 0),
    ('llm', 0),
    ('language-model', 0),
    ('deep-learning', 0),
    ('neural-network', 0)
ON CONFLICT (name) DO NOTHING;

-- Create views for analytics
CREATE OR REPLACE VIEW v_popular_services AS
SELECT
    s.id,
    s.name,
    s.category,
    s.avg_rating,
    s.review_count,
    s.total_requests,
    COUNT(DISTINCT ui.user_id) as unique_users,
    s.created_at
FROM services s
LEFT JOIN user_interactions ui ON s.id = ui.service_id
WHERE s.status = 'active'
GROUP BY s.id
ORDER BY s.total_requests DESC, s.avg_rating DESC;

CREATE OR REPLACE VIEW v_trending_services AS
SELECT
    s.id,
    s.name,
    s.category,
    COUNT(*) as recent_interactions,
    AVG(sr.rating) as avg_rating
FROM services s
JOIN user_interactions ui ON s.id = ui.service_id
LEFT JOIN service_ratings sr ON s.id = sr.service_id
WHERE ui.timestamp > NOW() - INTERVAL '24 hours'
  AND s.status = 'active'
GROUP BY s.id
HAVING COUNT(*) >= 10
ORDER BY recent_interactions DESC
LIMIT 100;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO marketplace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO marketplace;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO marketplace;
