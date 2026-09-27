package observability

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics holds all Prometheus metrics
type Metrics struct {
	// Search metrics
	searchRequestsTotal   *prometheus.CounterVec
	searchDuration        *prometheus.HistogramVec
	searchResultsTotal    *prometheus.HistogramVec
	searchErrors          prometheus.Counter

	// Cache metrics
	cacheHitsTotal        prometheus.Counter
	cacheMissesTotal      prometheus.Counter

	// Recommendation metrics
	recommendationRequestsTotal *prometheus.CounterVec
	recommendationDuration      *prometheus.HistogramVec

	// HTTP metrics
	httpRequestsTotal     *prometheus.CounterVec
	httpDuration          *prometheus.HistogramVec
}

// InitMetrics initializes all Prometheus metrics
func InitMetrics() *Metrics {
	m := &Metrics{
		searchRequestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "discovery_search_requests_total",
				Help: "Total number of search requests",
			},
			[]string{"status"},
		),
		searchDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "discovery_search_duration_seconds",
				Help:    "Search request duration in seconds",
				Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0},
			},
			[]string{"status"},
		),
		searchResultsTotal: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "discovery_search_results_total",
				Help:    "Number of results returned per search",
				Buckets: []float64{0, 1, 5, 10, 25, 50, 100, 250, 500},
			},
			[]string{},
		),
		searchErrors: prometheus.NewCounter(
			prometheus.CounterOpts{
				Name: "discovery_search_errors_total",
				Help: "Total number of search errors",
			},
		),
		cacheHitsTotal: prometheus.NewCounter(
			prometheus.CounterOpts{
				Name: "discovery_cache_hits_total",
				Help: "Total number of cache hits",
			},
		),
		cacheMissesTotal: prometheus.NewCounter(
			prometheus.CounterOpts{
				Name: "discovery_cache_misses_total",
				Help: "Total number of cache misses",
			},
		),
		recommendationRequestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "discovery_recommendation_requests_total",
				Help: "Total number of recommendation requests",
			},
			[]string{"algorithm"},
		),
		recommendationDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "discovery_recommendation_duration_seconds",
				Help:    "Recommendation request duration in seconds",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"algorithm"},
		),
		httpRequestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "discovery_http_requests_total",
				Help: "Total number of HTTP requests",
			},
			[]string{"method", "path", "status"},
		),
		httpDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "discovery_http_duration_seconds",
				Help:    "HTTP request duration in seconds",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"method", "path"},
		),
	}

	// Register all metrics
	prometheus.MustRegister(
		m.searchRequestsTotal,
		m.searchDuration,
		m.searchResultsTotal,
		m.searchErrors,
		m.cacheHitsTotal,
		m.cacheMissesTotal,
		m.recommendationRequestsTotal,
		m.recommendationDuration,
		m.httpRequestsTotal,
		m.httpDuration,
	)

	return m
}

// Search metrics methods
func (m *Metrics) SearchDuration(duration time.Duration) {
	m.searchDuration.WithLabelValues("success").Observe(duration.Seconds())
	m.searchRequestsTotal.WithLabelValues("success").Inc()
}

func (m *Metrics) SearchResults(count int) {
	m.searchResultsTotal.WithLabelValues().Observe(float64(count))
}

func (m *Metrics) SearchError() {
	m.searchErrors.Inc()
	m.searchRequestsTotal.WithLabelValues("error").Inc()
}

// Cache metrics methods
func (m *Metrics) CacheHit() {
	m.cacheHitsTotal.Inc()
}

func (m *Metrics) CacheMiss() {
	m.cacheMissesTotal.Inc()
}

// Recommendation metrics methods
func (m *Metrics) RecommendationRequest(algorithm string, duration time.Duration) {
	m.recommendationRequestsTotal.WithLabelValues(algorithm).Inc()
	m.recommendationDuration.WithLabelValues(algorithm).Observe(duration.Seconds())
}

// HTTP metrics methods
func (m *Metrics) HTTPRequest(method, path, status string, duration time.Duration) {
	m.httpRequestsTotal.WithLabelValues(method, path, status).Inc()
	m.httpDuration.WithLabelValues(method, path).Observe(duration.Seconds())
}

// ServeMetrics starts the metrics HTTP server
func ServeMetrics(addr string) error {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	return http.ListenAndServe(addr, mux)
}
