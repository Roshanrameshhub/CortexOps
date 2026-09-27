package observability

import (
	"context"
	"fmt"

	"github.com/org/llm-marketplace/services/discovery/internal/config"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/jaeger"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.uber.org/zap"
)

// InitTracing initializes OpenTelemetry tracing
func InitTracing(cfg config.TracingConfig, logger *zap.Logger) (func(), error) {
	if !cfg.Enabled {
		logger.Info("Tracing is disabled")
		return func() {}, nil
	}

	// Create Jaeger exporter
	exp, err := jaeger.New(
		jaeger.WithCollectorEndpoint(
			jaeger.WithEndpoint(cfg.JaegerEndpoint),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create Jaeger exporter: %w", err)
	}

	// Create resource
	res, err := resource.New(
		context.Background(),
		resource.WithAttributes(
			semconv.ServiceName("llm-marketplace-discovery"),
			semconv.ServiceVersion("1.0.0"),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Create trace provider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.TraceIDRatioBased(cfg.SamplingRate)),
	)

	// Set global trace provider
	otel.SetTracerProvider(tp)

	logger.Info("Tracing initialized",
		zap.String("exporter", cfg.Exporter),
		zap.String("endpoint", cfg.JaegerEndpoint),
		zap.Float64("sampling_rate", cfg.SamplingRate),
	)

	// Return cleanup function
	return func() {
		if err := tp.Shutdown(context.Background()); err != nil {
			logger.Error("Failed to shutdown tracer provider", zap.Error(err))
		}
	}, nil
}
