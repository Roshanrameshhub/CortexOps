package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/org/llm-marketplace/services/discovery/internal/api"
	"github.com/org/llm-marketplace/services/discovery/internal/config"
	"github.com/org/llm-marketplace/services/discovery/internal/elasticsearch"
	"github.com/org/llm-marketplace/services/discovery/internal/observability"
	"github.com/org/llm-marketplace/services/discovery/internal/postgres"
	"github.com/org/llm-marketplace/services/discovery/internal/redis"
	"github.com/org/llm-marketplace/services/discovery/internal/search"
	"github.com/org/llm-marketplace/services/discovery/internal/recommendation"
)

func main() {
	// Load configuration
	cfg, err := config.Load("config.yaml")
	if err != nil {
		panic(fmt.Sprintf("Failed to load configuration: %v", err))
	}

	// Initialize logger
	logger, err := observability.NewLogger(cfg.Observability.Logging)
	if err != nil {
		panic(fmt.Sprintf("Failed to initialize logger: %v", err))
	}
	defer logger.Sync()

	logger.Info("Starting LLM-Marketplace Discovery Service",
		zap.String("version", "1.0.0"),
		zap.String("environment", os.Getenv("ENVIRONMENT")),
	)

	// Initialize observability
	cleanup, err := observability.InitTracing(cfg.Observability.Tracing, logger)
	if err != nil {
		logger.Fatal("Failed to initialize tracing", zap.Error(err))
	}
	defer cleanup()

	metrics := observability.InitMetrics()

	// Initialize database connections
	logger.Info("Initializing database connections...")

	pgPool, err := postgres.NewPool(cfg.Postgres)
	if err != nil {
		logger.Fatal("Failed to connect to PostgreSQL", zap.Error(err))
	}
	defer pgPool.Close()

	redisClient, err := redis.NewClient(cfg.Redis)
	if err != nil {
		logger.Fatal("Failed to connect to Redis", zap.Error(err))
	}
	defer redisClient.Close()

	esClient, err := elasticsearch.NewClient(cfg.Elasticsearch)
	if err != nil {
		logger.Fatal("Failed to connect to Elasticsearch", zap.Error(err))
	}

	// Initialize search index
	logger.Info("Initializing Elasticsearch index...")
	indexManager := elasticsearch.NewIndexManager(esClient, cfg.Elasticsearch, logger)
	if err := indexManager.CreateIndex(context.Background()); err != nil {
		logger.Fatal("Failed to create Elasticsearch index", zap.Error(err))
	}

	// Initialize services
	searchService := search.NewService(
		esClient,
		redisClient,
		pgPool,
		cfg,
		logger,
		metrics,
	)

	recommendationService := recommendation.NewService(
		pgPool,
		redisClient,
		cfg,
		logger,
		metrics,
	)

	// Initialize API server
	if cfg.Server.Mode == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(
		observability.GinLogger(logger),
		observability.GinRecovery(logger),
		observability.GinTracing(),
		observability.GinMetrics(metrics),
	)

	// Health checks
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "healthy",
			"timestamp": time.Now().UTC(),
		})
	})

	router.GET("/ready", func(c *gin.Context) {
		// Check all dependencies
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		checks := map[string]bool{
			"postgres": pgPool.Ping(ctx) == nil,
			"redis": redisClient.Ping(ctx).Err() == nil,
			"elasticsearch": esClient.Ping() == nil,
		}

		allHealthy := true
		for _, healthy := range checks {
			if !healthy {
				allHealthy = false
				break
			}
		}

		status := http.StatusOK
		if !allHealthy {
			status = http.StatusServiceUnavailable
		}

		c.JSON(status, gin.H{
			"status": allHealthy,
			"checks": checks,
			"timestamp": time.Now().UTC(),
		})
	})

	// API routes
	api.RegisterRoutes(router, searchService, recommendationService, logger, metrics)

	// Start metrics server
	go func() {
		metricsAddr := fmt.Sprintf(":%d", cfg.Observability.Metrics.Port)
		logger.Info("Starting metrics server", zap.String("address", metricsAddr))
		if err := observability.ServeMetrics(metricsAddr); err != nil {
			logger.Error("Metrics server failed", zap.Error(err))
		}
	}()

	// Start main HTTP server
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start server in goroutine
	go func() {
		logger.Info("Starting HTTP server", zap.String("address", addr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start HTTP server", zap.Error(err))
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}
