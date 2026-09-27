package main

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	pb "github.com/llm-marketplace/policy-engine/api/proto/v1"
	"github.com/llm-marketplace/policy-engine/internal/config"
	"github.com/llm-marketplace/policy-engine/internal/policy"
	"github.com/llm-marketplace/policy-engine/internal/server"
	"github.com/llm-marketplace/policy-engine/internal/storage"
)

var (
	// Prometheus metrics
	validationCounter = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "policy_engine_validations_total",
			Help: "Total number of policy validations",
		},
		[]string{"result"},
	)

	validationDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "policy_engine_validation_duration_seconds",
			Help:    "Duration of policy validations in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"result"},
	)

	activePolicies = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "policy_engine_active_policies",
			Help: "Number of active policies",
		},
	)
)

func init() {
	// Register Prometheus metrics
	prometheus.MustRegister(validationCounter)
	prometheus.MustRegister(validationDuration)
	prometheus.MustRegister(activePolicies)
}

func main() {
	// Load configuration
	configPath := os.Getenv("CONFIG_PATH")
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// Setup logging
	setupLogging(cfg.Observability.Logging)

	log.Info().Msg("Starting Policy Engine Server")
	log.Info().
		Str("version", "1.0.0").
		Str("host", cfg.Server.Host).
		Int("port", cfg.Server.Port).
		Msg("Configuration loaded")

	// Connect to database
	db, err := connectDatabase(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	// Initialize policy store
	policyStore := storage.NewPolicyStore(
		db,
		cfg.Cache.Enabled,
		cfg.Cache.TTL,
		cfg.Cache.MaxSize,
	)

	// Initialize database schema
	ctx := context.Background()
	if err := policyStore.Initialize(ctx); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize policy store")
	}

	// Seed default policies
	if err := policyStore.SeedDefaultPolicies(ctx); err != nil {
		log.Fatal().Err(err).Msg("Failed to seed default policies")
	}

	// Create policy validator
	validator := policy.NewValidator(policyStore)

	// Create gRPC server
	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(10*1024*1024), // 10MB
		grpc.MaxSendMsgSize(10*1024*1024), // 10MB
	)

	// Register services
	policyEngineServer := server.NewPolicyEngineServer(validator, policyStore)
	pb.RegisterPolicyEngineServiceServer(grpcServer, policyEngineServer)

	// Enable gRPC reflection for development
	if cfg.Server.EnableReflection {
		reflection.Register(grpcServer)
		log.Info().Msg("gRPC reflection enabled")
	}

	// Register health check
	if cfg.Server.EnableHealthCheck {
		grpc_health_v1.RegisterHealthServer(grpcServer, &healthServer{})
		log.Info().Msg("Health check service registered")
	}

	// Start metrics server
	if cfg.Observability.Metrics.Enabled {
		go startMetricsServer(cfg)
	}

	// Start gRPC server
	listener, err := net.Listen("tcp", cfg.GetServerAddress())
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create listener")
	}

	// Start server in goroutine
	go func() {
		log.Info().
			Str("address", cfg.GetServerAddress()).
			Msg("gRPC server listening")

		if err := grpcServer.Serve(listener); err != nil {
			log.Fatal().Err(err).Msg("Failed to serve gRPC")
		}
	}()

	// Update metrics
	go updateMetrics(ctx, policyStore)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	// Graceful shutdown
	grpcServer.GracefulStop()
	policyStore.Close()

	log.Info().Msg("Server stopped")
}

func setupLogging(cfg config.LoggingConfig) {
	// Set log level
	level, err := zerolog.ParseLevel(cfg.Level)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	// Set output format
	if cfg.Format == "text" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout})
	}

	// Set time format
	zerolog.TimeFieldFormat = cfg.TimeFormat
}

func connectDatabase(cfg *config.Config) (*sql.DB, error) {
	log.Info().
		Str("host", cfg.Database.Host).
		Int("port", cfg.Database.Port).
		Str("database", cfg.Database.Database).
		Msg("Connecting to database")

	db, err := sql.Open("postgres", cfg.GetDatabaseDSN())
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(cfg.Database.MaxConnections)
	db.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.Database.ConnMaxLifetime)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Info().Msg("Database connection established")
	return db, nil
}

func startMetricsServer(cfg *config.Config) {
	metricsAddr := fmt.Sprintf(":%d", cfg.Observability.Metrics.Port)

	http.Handle(cfg.Observability.Metrics.Path, promhttp.Handler())

	log.Info().
		Str("address", metricsAddr).
		Str("path", cfg.Observability.Metrics.Path).
		Msg("Starting metrics server")

	if err := http.ListenAndServe(metricsAddr, nil); err != nil {
		log.Error().Err(err).Msg("Metrics server failed")
	}
}

func updateMetrics(ctx context.Context, store *storage.PolicyStore) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			policies, err := store.GetEnabledPolicies(ctx)
			if err != nil {
				log.Error().Err(err).Msg("Failed to get enabled policies for metrics")
				continue
			}
			activePolicies.Set(float64(len(policies)))

		case <-ctx.Done():
			return
		}
	}
}

// healthServer implements the gRPC health check service
type healthServer struct {
	grpc_health_v1.UnimplementedHealthServer
}

func (s *healthServer) Check(ctx context.Context, req *grpc_health_v1.HealthCheckRequest) (*grpc_health_v1.HealthCheckResponse, error) {
	return &grpc_health_v1.HealthCheckResponse{
		Status: grpc_health_v1.HealthCheckResponse_SERVING,
	}, nil
}

func (s *healthServer) Watch(req *grpc_health_v1.HealthCheckRequest, server grpc_health_v1.Health_WatchServer) error {
	return server.Send(&grpc_health_v1.HealthCheckResponse{
		Status: grpc_health_v1.HealthCheckResponse_SERVING,
	})
}
