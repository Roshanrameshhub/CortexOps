package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds all configuration for the Policy Engine service
type Config struct {
	Server      ServerConfig      `yaml:"server"`
	Database    DatabaseConfig    `yaml:"database"`
	Cache       CacheConfig       `yaml:"cache"`
	Observability ObservabilityConfig `yaml:"observability"`
	Policies    PoliciesConfig    `yaml:"policies"`
}

// ServerConfig holds server-specific configuration
type ServerConfig struct {
	Port              int           `yaml:"port"`
	Host              string        `yaml:"host"`
	ReadTimeout       time.Duration `yaml:"read_timeout"`
	WriteTimeout      time.Duration `yaml:"write_timeout"`
	MaxConnections    int           `yaml:"max_connections"`
	EnableReflection  bool          `yaml:"enable_reflection"`
	EnableHealthCheck bool          `yaml:"enable_health_check"`
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	Host            string        `yaml:"host"`
	Port            int           `yaml:"port"`
	User            string        `yaml:"user"`
	Password        string        `yaml:"password"`
	Database        string        `yaml:"database"`
	SSLMode         string        `yaml:"ssl_mode"`
	MaxConnections  int           `yaml:"max_connections"`
	MaxIdleConns    int           `yaml:"max_idle_conns"`
	ConnMaxLifetime time.Duration `yaml:"conn_max_lifetime"`
}

// CacheConfig holds cache configuration
type CacheConfig struct {
	Enabled        bool          `yaml:"enabled"`
	TTL            time.Duration `yaml:"ttl"`
	MaxSize        int           `yaml:"max_size"`
	CleanupInterval time.Duration `yaml:"cleanup_interval"`
}

// ObservabilityConfig holds observability configuration
type ObservabilityConfig struct {
	Metrics MetricsConfig `yaml:"metrics"`
	Tracing TracingConfig `yaml:"tracing"`
	Logging LoggingConfig `yaml:"logging"`
}

// MetricsConfig holds metrics configuration
type MetricsConfig struct {
	Enabled bool   `yaml:"enabled"`
	Port    int    `yaml:"port"`
	Path    string `yaml:"path"`
}

// TracingConfig holds tracing configuration
type TracingConfig struct {
	Enabled      bool    `yaml:"enabled"`
	JaegerURL    string  `yaml:"jaeger_url"`
	ServiceName  string  `yaml:"service_name"`
	SamplingRate float64 `yaml:"sampling_rate"`
}

// LoggingConfig holds logging configuration
type LoggingConfig struct {
	Level      string `yaml:"level"`
	Format     string `yaml:"format"` // json or text
	Output     string `yaml:"output"` // stdout, stderr, or file path
	TimeFormat string `yaml:"time_format"`
}

// PoliciesConfig holds policies configuration
type PoliciesConfig struct {
	DefaultVersion    string        `yaml:"default_version"`
	ReloadInterval    time.Duration `yaml:"reload_interval"`
	EnableAutoReload  bool          `yaml:"enable_auto_reload"`
	ValidationTimeout time.Duration `yaml:"validation_timeout"`
}

// Load loads configuration from file and environment variables
func Load(configPath string) (*Config, error) {
	config := &Config{}

	// Set defaults
	config.setDefaults()

	// Load from file if provided
	if configPath != "" {
		if err := config.loadFromFile(configPath); err != nil {
			return nil, fmt.Errorf("failed to load config from file: %w", err)
		}
	}

	// Override with environment variables
	config.loadFromEnv()

	// Validate configuration
	if err := config.validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return config, nil
}

func (c *Config) setDefaults() {
	// Server defaults
	c.Server.Port = 50051
	c.Server.Host = "0.0.0.0"
	c.Server.ReadTimeout = 30 * time.Second
	c.Server.WriteTimeout = 30 * time.Second
	c.Server.MaxConnections = 1000
	c.Server.EnableReflection = true
	c.Server.EnableHealthCheck = true

	// Database defaults
	c.Database.Host = "localhost"
	c.Database.Port = 5432
	c.Database.User = "postgres"
	c.Database.Database = "policy_engine"
	c.Database.SSLMode = "disable"
	c.Database.MaxConnections = 25
	c.Database.MaxIdleConns = 5
	c.Database.ConnMaxLifetime = 5 * time.Minute

	// Cache defaults
	c.Cache.Enabled = true
	c.Cache.TTL = 5 * time.Minute
	c.Cache.MaxSize = 1000
	c.Cache.CleanupInterval = 10 * time.Minute

	// Observability defaults
	c.Observability.Metrics.Enabled = true
	c.Observability.Metrics.Port = 9090
	c.Observability.Metrics.Path = "/metrics"

	c.Observability.Tracing.Enabled = false
	c.Observability.Tracing.ServiceName = "policy-engine"
	c.Observability.Tracing.SamplingRate = 0.1

	c.Observability.Logging.Level = "info"
	c.Observability.Logging.Format = "json"
	c.Observability.Logging.Output = "stdout"
	c.Observability.Logging.TimeFormat = time.RFC3339

	// Policies defaults
	c.Policies.DefaultVersion = "1.0.0"
	c.Policies.ReloadInterval = 5 * time.Minute
	c.Policies.EnableAutoReload = true
	c.Policies.ValidationTimeout = 5 * time.Second
}

func (c *Config) loadFromFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	return yaml.Unmarshal(data, c)
}

func (c *Config) loadFromEnv() {
	// Server config
	if port := os.Getenv("POLICY_ENGINE_PORT"); port != "" {
		if p, err := strconv.Atoi(port); err == nil {
			c.Server.Port = p
		}
	}
	if host := os.Getenv("POLICY_ENGINE_HOST"); host != "" {
		c.Server.Host = host
	}

	// Database config
	if host := os.Getenv("DB_HOST"); host != "" {
		c.Database.Host = host
	}
	if port := os.Getenv("DB_PORT"); port != "" {
		if p, err := strconv.Atoi(port); err == nil {
			c.Database.Port = p
		}
	}
	if user := os.Getenv("DB_USER"); user != "" {
		c.Database.User = user
	}
	if password := os.Getenv("DB_PASSWORD"); password != "" {
		c.Database.Password = password
	}
	if database := os.Getenv("DB_NAME"); database != "" {
		c.Database.Database = database
	}
	if sslMode := os.Getenv("DB_SSL_MODE"); sslMode != "" {
		c.Database.SSLMode = sslMode
	}

	// Observability config
	if jaegerURL := os.Getenv("JAEGER_URL"); jaegerURL != "" {
		c.Observability.Tracing.JaegerURL = jaegerURL
		c.Observability.Tracing.Enabled = true
	}
	if logLevel := os.Getenv("LOG_LEVEL"); logLevel != "" {
		c.Observability.Logging.Level = logLevel
	}
}

func (c *Config) validate() error {
	if c.Server.Port < 1 || c.Server.Port > 65535 {
		return fmt.Errorf("invalid server port: %d", c.Server.Port)
	}

	if c.Database.Host == "" {
		return fmt.Errorf("database host is required")
	}

	if c.Database.User == "" {
		return fmt.Errorf("database user is required")
	}

	if c.Database.Database == "" {
		return fmt.Errorf("database name is required")
	}

	return nil
}

// GetDatabaseDSN returns the database connection string
func (c *Config) GetDatabaseDSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Database.Host,
		c.Database.Port,
		c.Database.User,
		c.Database.Password,
		c.Database.Database,
		c.Database.SSLMode,
	)
}

// GetServerAddress returns the server address
func (c *Config) GetServerAddress() string {
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.Port)
}
