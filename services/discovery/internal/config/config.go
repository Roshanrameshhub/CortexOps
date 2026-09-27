package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server            ServerConfig            `yaml:"server"`
	Elasticsearch     ElasticsearchConfig     `yaml:"elasticsearch"`
	Redis             RedisConfig             `yaml:"redis"`
	Postgres          PostgresConfig          `yaml:"postgres"`
	EmbeddingService  EmbeddingServiceConfig  `yaml:"embedding_service"`
	Search            SearchConfig            `yaml:"search"`
	Recommendations   RecommendationsConfig   `yaml:"recommendations"`
	Performance       PerformanceConfig       `yaml:"performance"`
	Observability     ObservabilityConfig     `yaml:"observability"`
	PolicyEngine      PolicyEngineConfig      `yaml:"policy_engine"`
	AnalyticsHub      AnalyticsHubConfig      `yaml:"analytics_hub"`
}

type ServerConfig struct {
	Host         string        `yaml:"host"`
	Port         int           `yaml:"port"`
	Mode         string        `yaml:"mode"` // development, production
	ReadTimeout  time.Duration `yaml:"read_timeout"`
	WriteTimeout time.Duration `yaml:"write_timeout"`
	IdleTimeout  time.Duration `yaml:"idle_timeout"`
}

type ElasticsearchConfig struct {
	Addresses        []string      `yaml:"addresses"`
	Username         string        `yaml:"username"`
	Password         string        `yaml:"password"`
	IndexName        string        `yaml:"index_name"`
	MaxRetries       int           `yaml:"max_retries"`
	RetryBackoff     time.Duration `yaml:"retry_backoff"`
	EnableMetrics    bool          `yaml:"enable_metrics"`
	Shards           int           `yaml:"shards"`
	Replicas         int           `yaml:"replicas"`
	RefreshInterval  string        `yaml:"refresh_interval"`
	VectorDimensions int           `yaml:"vector_dimensions"`
	Similarity       string        `yaml:"similarity"`
}

type RedisConfig struct {
	Address      string            `yaml:"address"`
	Password     string            `yaml:"password"`
	DB           int               `yaml:"db"`
	MaxRetries   int               `yaml:"max_retries"`
	PoolSize     int               `yaml:"pool_size"`
	MinIdleConns int               `yaml:"min_idle_conns"`
	CacheTTL     map[string]string `yaml:"cache_ttl"`
}

type PostgresConfig struct {
	Host            string        `yaml:"host"`
	Port            int           `yaml:"port"`
	Database        string        `yaml:"database"`
	User            string        `yaml:"user"`
	Password        string        `yaml:"password"`
	SSLMode         string        `yaml:"ssl_mode"`
	MaxOpenConns    int           `yaml:"max_open_conns"`
	MaxIdleConns    int           `yaml:"max_idle_conns"`
	ConnMaxLifetime time.Duration `yaml:"conn_max_lifetime"`
}

type EmbeddingServiceConfig struct {
	URL       string        `yaml:"url"`
	Model     string        `yaml:"model"`
	Timeout   time.Duration `yaml:"timeout"`
	BatchSize int           `yaml:"batch_size"`
}

type SearchConfig struct {
	MaxResults      int                    `yaml:"max_results"`
	DefaultResults  int                    `yaml:"default_results"`
	RankingWeights  RankingWeights         `yaml:"ranking_weights"`
	FuzzyEnabled    bool                   `yaml:"fuzzy_enabled"`
	FuzzyDistance   int                    `yaml:"fuzzy_distance"`
	SemanticEnabled bool                   `yaml:"semantic_enabled"`
	SemanticThreshold float64              `yaml:"semantic_threshold"`
	HybridAlpha     float64                `yaml:"hybrid_alpha"`
}

type RankingWeights struct {
	Relevance  float64 `yaml:"relevance"`
	Popularity float64 `yaml:"popularity"`
	Performance float64 `yaml:"performance"`
	Compliance float64 `yaml:"compliance"`
}

type RecommendationsConfig struct {
	Enabled               bool          `yaml:"enabled"`
	MaxRecommendations    int           `yaml:"max_recommendations"`
	CollaborativeWeight   float64       `yaml:"collaborative_weight"`
	ContentWeight         float64       `yaml:"content_weight"`
	PopularityWeight      float64       `yaml:"popularity_weight"`
	MinCommonUsers        int           `yaml:"min_common_users"`
	SimilarityThreshold   float64       `yaml:"similarity_threshold"`
	TrendingWindow        time.Duration `yaml:"trending_window"`
	TrendingMinInteractions int         `yaml:"trending_min_interactions"`
}

type PerformanceConfig struct {
	TargetP95LatencyMS       int           `yaml:"target_p95_latency_ms"`
	TargetP99LatencyMS       int           `yaml:"target_p99_latency_ms"`
	MaxConcurrentRequests    int           `yaml:"max_concurrent_requests"`
	CircuitBreakerThreshold  float64       `yaml:"circuit_breaker_threshold"`
	CircuitBreakerTimeout    time.Duration `yaml:"circuit_breaker_timeout"`
}

type ObservabilityConfig struct {
	Metrics MetricsConfig `yaml:"metrics"`
	Tracing TracingConfig `yaml:"tracing"`
	Logging LoggingConfig `yaml:"logging"`
}

type MetricsConfig struct {
	Enabled         bool          `yaml:"enabled"`
	Port            int           `yaml:"port"`
	Path            string        `yaml:"path"`
	CollectInterval time.Duration `yaml:"collect_interval"`
}

type TracingConfig struct {
	Enabled        bool    `yaml:"enabled"`
	Exporter       string  `yaml:"exporter"`
	JaegerEndpoint string  `yaml:"jaeger_endpoint"`
	SamplingRate   float64 `yaml:"sampling_rate"`
}

type LoggingConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
	Output string `yaml:"output"`
}

type PolicyEngineConfig struct {
	GRPCEndpoint string        `yaml:"grpc_endpoint"`
	Timeout      time.Duration `yaml:"timeout"`
	CacheTTL     time.Duration `yaml:"cache_ttl"`
}

type AnalyticsHubConfig struct {
	KafkaBrokers  []string      `yaml:"kafka_brokers"`
	Topic         string        `yaml:"topic"`
	BatchSize     int           `yaml:"batch_size"`
	FlushInterval time.Duration `yaml:"flush_interval"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Expand environment variables
	content := os.ExpandEnv(string(data))

	var cfg Config
	if err := yaml.Unmarshal([]byte(content), &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Validate configuration
	if err := validate(&cfg); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return &cfg, nil
}

func validate(cfg *Config) error {
	// Validate server config
	if cfg.Server.Port <= 0 || cfg.Server.Port > 65535 {
		return fmt.Errorf("invalid server port: %d", cfg.Server.Port)
	}

	// Validate Elasticsearch config
	if len(cfg.Elasticsearch.Addresses) == 0 {
		return fmt.Errorf("elasticsearch addresses cannot be empty")
	}

	// Validate ranking weights sum to 1.0
	weights := cfg.Search.RankingWeights
	sum := weights.Relevance + weights.Popularity + weights.Performance + weights.Compliance
	if sum < 0.99 || sum > 1.01 {
		return fmt.Errorf("ranking weights must sum to 1.0, got: %.2f", sum)
	}

	// Validate recommendation weights
	recWeights := cfg.Recommendations.CollaborativeWeight +
		cfg.Recommendations.ContentWeight +
		cfg.Recommendations.PopularityWeight
	if recWeights < 0.99 || recWeights > 1.01 {
		return fmt.Errorf("recommendation weights must sum to 1.0, got: %.2f", recWeights)
	}

	return nil
}

// GetCacheTTL returns the cache TTL duration for a given key
func (c *RedisConfig) GetCacheTTL(key string) time.Duration {
	if ttl, ok := c.CacheTTL[key]; ok {
		duration, err := time.ParseDuration(ttl)
		if err == nil {
			return duration
		}
	}
	return 5 * time.Minute // default
}

// GetDSN returns PostgreSQL connection string
func (c *PostgresConfig) GetDSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.Database, c.SSLMode,
	)
}

// GetElasticsearchAddresses returns clean elasticsearch addresses
func (c *ElasticsearchConfig) GetElasticsearchAddresses() []string {
	addresses := make([]string, len(c.Addresses))
	for i, addr := range c.Addresses {
		addresses[i] = strings.TrimSpace(addr)
	}
	return addresses
}
