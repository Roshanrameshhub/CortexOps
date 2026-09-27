-- Seed Script: 001_seed_development_data.sql
-- Description: Populate development database with sample data
-- Created: 2025-11-18
-- WARNING: This script is for development/testing only. DO NOT run in production!

-- Clear existing data (in reverse order of dependencies)
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE usage_records CASCADE;
TRUNCATE TABLE services CASCADE;

-- Insert sample services
INSERT INTO services (
    id,
    registry_id,
    name,
    version,
    description,
    provider_id,
    category,
    tags,
    capabilities,
    endpoint,
    pricing,
    sla,
    compliance,
    status,
    published_at
) VALUES
-- Service 1: GPT-4 Text Generation
(
    '550e8400-e29b-41d4-a716-446655440001',
    '650e8400-e29b-41d4-a716-446655440001',
    'gpt-4-turbo',
    '1.0.0',
    'Advanced language model for text generation, conversation, and complex reasoning tasks',
    '750e8400-e29b-41d4-a716-446655440001', -- provider_id
    'text-generation',
    ARRAY['gpt', 'chat', 'reasoning', 'premium'],
    '[
        {
            "name": "chat_completion",
            "description": "Generate conversational responses",
            "parameters": {
                "type": "object",
                "properties": {
                    "messages": {"type": "array"},
                    "temperature": {"type": "number", "default": 0.7},
                    "max_tokens": {"type": "integer", "default": 2048}
                }
            }
        }
    ]'::jsonb,
    '{
        "url": "https://api.openai.example.com/v1/chat/completions",
        "protocol": "rest",
        "authentication": "api-key"
    }'::jsonb,
    '{
        "model": "per-token",
        "rates": [
            {"tier": "standard", "rate": 0.03, "unit": "1k tokens", "inputRate": 0.03, "outputRate": 0.06}
        ]
    }'::jsonb,
    '{
        "availability": 99.9,
        "maxLatency": 2000,
        "supportLevel": "premium"
    }'::jsonb,
    '{
        "level": "internal",
        "certifications": ["SOC2", "ISO27001"],
        "dataResidency": ["US", "EU"]
    }'::jsonb,
    'active',
    NOW() - INTERVAL '30 days'
),
-- Service 2: Embeddings Service
(
    '550e8400-e29b-41d4-a716-446655440002',
    '650e8400-e29b-41d4-a716-446655440002',
    'text-embeddings-ada',
    '2.0.0',
    'Generate high-quality text embeddings for semantic search and similarity',
    '750e8400-e29b-41d4-a716-446655440001',
    'embeddings',
    ARRAY['embeddings', 'semantic-search', 'vector'],
    '[
        {
            "name": "create_embedding",
            "description": "Create vector embeddings for text",
            "parameters": {
                "type": "object",
                "properties": {
                    "input": {"type": "string"},
                    "model": {"type": "string", "default": "text-embedding-ada-002"}
                }
            }
        }
    ]'::jsonb,
    '{
        "url": "https://api.openai.example.com/v1/embeddings",
        "protocol": "rest",
        "authentication": "api-key"
    }'::jsonb,
    '{
        "model": "per-token",
        "rates": [
            {"tier": "standard", "rate": 0.0001, "unit": "1k tokens"}
        ]
    }'::jsonb,
    '{
        "availability": 99.95,
        "maxLatency": 500,
        "supportLevel": "basic"
    }'::jsonb,
    '{
        "level": "public",
        "certifications": ["SOC2"],
        "dataResidency": ["US"]
    }'::jsonb,
    'active',
    NOW() - INTERVAL '60 days'
),
-- Service 3: Sentiment Analysis
(
    '550e8400-e29b-41d4-a716-446655440003',
    '650e8400-e29b-41d4-a716-446655440003',
    'sentiment-analyzer',
    '1.2.0',
    'Real-time sentiment analysis for text with emotion detection',
    '750e8400-e29b-41d4-a716-446655440002', -- different provider
    'sentiment-analysis',
    ARRAY['sentiment', 'nlp', 'emotions'],
    '[
        {
            "name": "analyze_sentiment",
            "description": "Analyze text sentiment and emotions",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "language": {"type": "string", "default": "en"}
                }
            }
        }
    ]'::jsonb,
    '{
        "url": "https://api.sentiment.example.com/v1/analyze",
        "protocol": "rest",
        "authentication": "oauth2"
    }'::jsonb,
    '{
        "model": "per-request",
        "rates": [
            {"tier": "basic", "rate": 0.01, "unit": "request"},
            {"tier": "premium", "rate": 0.005, "unit": "request"}
        ]
    }'::jsonb,
    '{
        "availability": 99.5,
        "maxLatency": 1000,
        "supportLevel": "basic"
    }'::jsonb,
    '{
        "level": "public",
        "certifications": [],
        "dataResidency": ["US", "EU", "APAC"]
    }'::jsonb,
    'active',
    NOW() - INTERVAL '90 days'
),
-- Service 4: Code Generation (pending approval)
(
    '550e8400-e29b-41d4-a716-446655440004',
    '650e8400-e29b-41d4-a716-446655440004',
    'codex-advanced',
    '0.9.0',
    'AI-powered code generation and completion for multiple programming languages',
    '750e8400-e29b-41d4-a716-446655440001',
    'code-generation',
    ARRAY['code', 'completion', 'programming'],
    '[
        {
            "name": "generate_code",
            "description": "Generate code from natural language",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "language": {"type": "string"},
                    "max_tokens": {"type": "integer", "default": 1024}
                }
            }
        }
    ]'::jsonb,
    '{
        "url": "https://api.codex.example.com/v1/generate",
        "protocol": "rest",
        "authentication": "api-key"
    }'::jsonb,
    '{
        "model": "per-token",
        "rates": [
            {"tier": "standard", "rate": 0.02, "unit": "1k tokens"}
        ]
    }'::jsonb,
    '{
        "availability": 99.0,
        "maxLatency": 3000,
        "supportLevel": "enterprise"
    }'::jsonb,
    '{
        "level": "confidential",
        "certifications": ["SOC2", "ISO27001", "HIPAA"],
        "dataResidency": ["US"]
    }'::jsonb,
    'pending_approval',
    NULL
),
-- Service 5: Deprecated Translation Service
(
    '550e8400-e29b-41d4-a716-446655440005',
    '650e8400-e29b-41d4-a716-446655440005',
    'neural-translator',
    '1.0.0',
    'Neural machine translation service (deprecated, use v2.0.0)',
    '750e8400-e29b-41d4-a716-446655440002',
    'translation',
    ARRAY['translation', 'multilingual', 'deprecated'],
    '[
        {
            "name": "translate",
            "description": "Translate text between languages",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "source_lang": {"type": "string"},
                    "target_lang": {"type": "string"}
                }
            }
        }
    ]'::jsonb,
    '{
        "url": "https://api.translate.example.com/v1/translate",
        "protocol": "rest",
        "authentication": "api-key"
    }'::jsonb,
    '{
        "model": "per-request",
        "rates": [
            {"tier": "standard", "rate": 0.02, "unit": "request"}
        ]
    }'::jsonb,
    '{
        "availability": 99.0,
        "maxLatency": 1500,
        "supportLevel": "basic"
    }'::jsonb,
    '{
        "level": "public",
        "certifications": [],
        "dataResidency": ["US"]
    }'::jsonb,
    'deprecated',
    NOW() - INTERVAL '180 days'
);

-- Insert sample usage records for the last 7 days
DO $$
DECLARE
    v_day INTEGER;
    v_hour INTEGER;
    v_service_id UUID;
    v_consumer_id UUID;
    v_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    FOR v_day IN 0..6 LOOP
        FOR v_hour IN 0..23 LOOP
            -- Generate some random usage records
            FOR v_service_id IN
                SELECT id FROM services WHERE status = 'active' LIMIT 3
            LOOP
                -- Generate 5-15 requests per hour per service
                FOR i IN 1..(5 + floor(random() * 10)::INTEGER) LOOP
                    v_consumer_id := uuid_generate_v4();
                    v_timestamp := NOW() - (v_day || ' days')::INTERVAL - (v_hour || ' hours')::INTERVAL - (random() * 3600 || ' seconds')::INTERVAL;

                    INSERT INTO usage_records (
                        request_id,
                        service_id,
                        consumer_id,
                        timestamp,
                        duration_ms,
                        usage,
                        cost,
                        status
                    ) VALUES (
                        uuid_generate_v4(),
                        v_service_id,
                        v_consumer_id,
                        v_timestamp,
                        50 + floor(random() * 2000)::INTEGER, -- 50-2050ms
                        jsonb_build_object(
                            'tokens', 100 + floor(random() * 1900)::INTEGER,
                            'input_tokens', 50 + floor(random() * 450)::INTEGER,
                            'output_tokens', 50 + floor(random() * 450)::INTEGER
                        ),
                        jsonb_build_object(
                            'amount', (random() * 0.1)::DECIMAL(10,4),
                            'currency', 'USD'
                        ),
                        CASE
                            WHEN random() < 0.95 THEN 'success'::usage_status
                            WHEN random() < 0.98 THEN 'error'::usage_status
                            ELSE 'timeout'::usage_status
                        END
                    );
                END LOOP;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- Insert sample audit logs
DO $$
DECLARE
    v_service_id UUID;
    v_actor_id UUID := '850e8400-e29b-41d4-a716-446655440001';
BEGIN
    -- Log service creation events
    FOR v_service_id IN SELECT id FROM services LOOP
        INSERT INTO audit_logs (
            event_type,
            actor_id,
            actor_type,
            action,
            resource_id,
            resource_type,
            details,
            ip_address,
            success
        ) VALUES (
            'service_created',
            v_actor_id,
            'admin',
            'CREATE',
            v_service_id,
            'service',
            jsonb_build_object('service_name', (SELECT name FROM services WHERE id = v_service_id)),
            '192.168.1.100'::INET,
            true
        );
    END LOOP;

    -- Log some API key creation events
    FOR i IN 1..10 LOOP
        INSERT INTO audit_logs (
            event_type,
            actor_id,
            actor_type,
            action,
            details,
            ip_address,
            success
        ) VALUES (
            'api_key_created',
            uuid_generate_v4(),
            'user',
            'CREATE_API_KEY',
            jsonb_build_object('key_prefix', 'llm_' || substr(md5(random()::text), 1, 8)),
            ('192.168.1.' || floor(random() * 255)::INTEGER)::INET,
            true
        );
    END LOOP;

    -- Log some login events
    FOR i IN 1..50 LOOP
        INSERT INTO audit_logs (
            event_type,
            actor_id,
            actor_type,
            action,
            details,
            ip_address,
            success,
            timestamp
        ) VALUES (
            'user_login',
            uuid_generate_v4(),
            'user',
            'LOGIN',
            jsonb_build_object('method', 'oauth2'),
            ('192.168.1.' || floor(random() * 255)::INTEGER)::INET,
            CASE WHEN random() < 0.95 THEN true ELSE false END,
            NOW() - (random() * 7 || ' days')::INTERVAL
        );
    END LOOP;
END $$;

-- Refresh materialized views
SELECT refresh_usage_summary();
SELECT refresh_audit_summary();

-- Display summary statistics
SELECT 'Services' AS table_name, COUNT(*) AS count FROM services
UNION ALL
SELECT 'Usage Records', COUNT(*) FROM usage_records
UNION ALL
SELECT 'Audit Logs', COUNT(*) FROM audit_logs;

SELECT
    status,
    COUNT(*) AS count
FROM services
GROUP BY status
ORDER BY status;
