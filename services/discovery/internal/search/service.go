package search

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/org/llm-marketplace/services/discovery/internal/config"
	"github.com/org/llm-marketplace/services/discovery/internal/elasticsearch"
	"github.com/org/llm-marketplace/services/discovery/internal/observability"
	"github.com/org/llm-marketplace/services/discovery/internal/postgres"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

type Service struct {
	esClient      *elasticsearch.Client
	redisClient   *redis.Client
	pgPool        *postgres.Pool
	config        *config.Config
	logger        *zap.Logger
	metrics       *observability.Metrics
	embeddingClient *EmbeddingClient
}

func NewService(
	esClient *elasticsearch.Client,
	redisClient *redis.Client,
	pgPool *postgres.Pool,
	cfg *config.Config,
	logger *zap.Logger,
	metrics *observability.Metrics,
) *Service {
	return &Service{
		esClient:    esClient,
		redisClient: redisClient,
		pgPool:      pgPool,
		config:      cfg,
		logger:      logger,
		metrics:     metrics,
		embeddingClient: NewEmbeddingClient(cfg.EmbeddingService),
	}
}

// SearchRequest represents a search query
type SearchRequest struct {
	Query      string            `json:"query"`
	Filters    SearchFilters     `json:"filters"`
	Pagination PaginationRequest `json:"pagination"`
	UserID     string            `json:"user_id,omitempty"`
}

// SearchFilters represents multi-dimensional filtering
type SearchFilters struct {
	Categories      []string `json:"categories,omitempty"`
	Tags            []string `json:"tags,omitempty"`
	MinRating       float64  `json:"min_rating,omitempty"`
	MaxPrice        float64  `json:"max_price,omitempty"`
	PricingModels   []string `json:"pricing_models,omitempty"`
	ComplianceLevel string   `json:"compliance_level,omitempty"`
	Certifications  []string `json:"certifications,omitempty"`
	DataResidency   []string `json:"data_residency,omitempty"`
	VerifiedOnly    bool     `json:"verified_only,omitempty"`
	Status          string   `json:"status,omitempty"`
	MinAvailability float64  `json:"min_availability,omitempty"`
}

// PaginationRequest represents pagination parameters
type PaginationRequest struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}

// SearchResponse represents search results
type SearchResponse struct {
	Results        []SearchResult     `json:"results"`
	Total          int                `json:"total"`
	Page           int                `json:"page"`
	PageSize       int                `json:"page_size"`
	Took           int                `json:"took_ms"`
	Aggregations   map[string]interface{} `json:"aggregations,omitempty"`
	Recommendations []SearchResult    `json:"recommendations,omitempty"`
}

// SearchResult represents a single search result
type SearchResult struct {
	Service       *elasticsearch.ServiceDocument `json:"service"`
	Score         float64                        `json:"score"`
	MatchDetails  MatchDetails                   `json:"match_details"`
}

// MatchDetails explains why a result matched
type MatchDetails struct {
	RelevanceScore  float64 `json:"relevance_score"`
	PopularityScore float64 `json:"popularity_score"`
	PerformanceScore float64 `json:"performance_score"`
	ComplianceScore float64 `json:"compliance_score"`
	SemanticMatch   bool    `json:"semantic_match"`
}

// Search performs the main search operation
func (s *Service) Search(ctx context.Context, req *SearchRequest) (*SearchResponse, error) {
	startTime := time.Now()
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.String("search.query", req.Query),
		attribute.Int("search.page", req.Pagination.Page),
	)

	// Check cache first
	cacheKey := s.buildCacheKey(req)
	if cached, err := s.getCachedResults(ctx, cacheKey); err == nil && cached != nil {
		s.logger.Debug("Cache hit", zap.String("key", cacheKey))
		s.metrics.CacheHit()
		return cached, nil
	}
	s.metrics.CacheMiss()

	// Build Elasticsearch query
	esQuery, err := s.buildSearchQuery(ctx, req)
	if err != nil {
		s.logger.Error("Failed to build search query", zap.Error(err))
		return nil, fmt.Errorf("failed to build query: %w", err)
	}

	// Execute search
	esResponse, err := s.esClient.Search(ctx, esQuery)
	if err != nil {
		s.logger.Error("Search failed", zap.Error(err))
		s.metrics.SearchError()
		return nil, fmt.Errorf("search failed: %w", err)
	}

	// Process results
	results := s.processSearchResults(esResponse, req)

	// Rank results
	rankedResults := s.rankResults(results)

	// Build response
	response := &SearchResponse{
		Results:  rankedResults,
		Total:    esResponse.Hits.Total.Value,
		Page:     req.Pagination.Page,
		PageSize: req.Pagination.PageSize,
		Took:     esResponse.Took,
		Aggregations: esResponse.Aggregations,
	}

	// Cache results
	if err := s.cacheResults(ctx, cacheKey, response); err != nil {
		s.logger.Warn("Failed to cache results", zap.Error(err))
	}

	// Record metrics
	duration := time.Since(startTime)
	s.metrics.SearchDuration(duration)
	s.metrics.SearchResults(len(results))

	s.logger.Info("Search completed",
		zap.String("query", req.Query),
		zap.Int("results", len(results)),
		zap.Duration("duration", duration),
	)

	// Track analytics
	go s.trackSearchEvent(ctx, req, response)

	return response, nil
}

// buildSearchQuery constructs the Elasticsearch query
func (s *Service) buildSearchQuery(ctx context.Context, req *SearchRequest) (map[string]interface{}, error) {
	// Calculate pagination
	from := req.Pagination.Page * req.Pagination.PageSize
	size := req.Pagination.PageSize
	if size <= 0 {
		size = s.config.Search.DefaultResults
	}
	if size > s.config.Search.MaxResults {
		size = s.config.Search.MaxResults
	}

	query := map[string]interface{}{
		"from": from,
		"size": size,
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"must":   []interface{}{},
				"filter": []interface{}{},
				"should": []interface{}{},
			},
		},
		"aggs": s.buildAggregations(),
	}

	boolQuery := query["query"].(map[string]interface{})["bool"].(map[string]interface{})

	// Text search
	if req.Query != "" {
		// Multi-match query
		multiMatch := map[string]interface{}{
			"multi_match": map[string]interface{}{
				"query": req.Query,
				"fields": []string{
					"name^3",
					"name.autocomplete^2",
					"description^2",
					"tags^1.5",
					"capabilities",
				},
				"type":       "best_fields",
				"fuzziness":  "AUTO",
				"operator":   "or",
			},
		}
		boolQuery["should"] = append(boolQuery["should"].([]interface{}), multiMatch)

		// Semantic search with embeddings
		if s.config.Search.SemanticEnabled {
			embedding, err := s.embeddingClient.GetEmbedding(ctx, req.Query)
			if err == nil && len(embedding) > 0 {
				knnQuery := map[string]interface{}{
					"script_score": map[string]interface{}{
						"query": map[string]interface{}{"match_all": map[string]interface{}{}},
						"script": map[string]interface{}{
							"source": "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
							"params": map[string]interface{}{
								"query_vector": embedding,
							},
						},
					},
				}
				boolQuery["should"] = append(boolQuery["should"].([]interface{}), knnQuery)
			}
		}

		boolQuery["minimum_should_match"] = 1
	}

	// Filters
	filters := boolQuery["filter"].([]interface{})

	// Status filter (always active services by default)
	if req.Filters.Status != "" {
		filters = append(filters, map[string]interface{}{
			"term": map[string]interface{}{
				"status": req.Filters.Status,
			},
		})
	} else {
		filters = append(filters, map[string]interface{}{
			"term": map[string]interface{}{
				"status": "active",
			},
		})
	}

	// Category filter
	if len(req.Filters.Categories) > 0 {
		filters = append(filters, map[string]interface{}{
			"terms": map[string]interface{}{
				"category": req.Filters.Categories,
			},
		})
	}

	// Tags filter
	if len(req.Filters.Tags) > 0 {
		filters = append(filters, map[string]interface{}{
			"terms": map[string]interface{}{
				"tags": req.Filters.Tags,
			},
		})
	}

	// Rating filter
	if req.Filters.MinRating > 0 {
		filters = append(filters, map[string]interface{}{
			"range": map[string]interface{}{
				"metrics.rating": map[string]interface{}{
					"gte": req.Filters.MinRating,
				},
			},
		})
	}

	// Price filter
	if req.Filters.MaxPrice > 0 {
		filters = append(filters, map[string]interface{}{
			"range": map[string]interface{}{
				"pricing.rate": map[string]interface{}{
					"lte": req.Filters.MaxPrice,
				},
			},
		})
	}

	// Pricing model filter
	if len(req.Filters.PricingModels) > 0 {
		filters = append(filters, map[string]interface{}{
			"terms": map[string]interface{}{
				"pricing.model": req.Filters.PricingModels,
			},
		})
	}

	// Compliance level filter
	if req.Filters.ComplianceLevel != "" {
		filters = append(filters, map[string]interface{}{
			"term": map[string]interface{}{
				"compliance.level": req.Filters.ComplianceLevel,
			},
		})
	}

	// Certifications filter
	if len(req.Filters.Certifications) > 0 {
		filters = append(filters, map[string]interface{}{
			"terms": map[string]interface{}{
				"compliance.certifications": req.Filters.Certifications,
			},
		})
	}

	// Data residency filter
	if len(req.Filters.DataResidency) > 0 {
		filters = append(filters, map[string]interface{}{
			"terms": map[string]interface{}{
				"compliance.data_residency": req.Filters.DataResidency,
			},
		})
	}

	// Verified providers only
	if req.Filters.VerifiedOnly {
		filters = append(filters, map[string]interface{}{
			"term": map[string]interface{}{
				"provider.verified": true,
			},
		})
	}

	// Availability filter
	if req.Filters.MinAvailability > 0 {
		filters = append(filters, map[string]interface{}{
			"range": map[string]interface{}{
				"sla.availability": map[string]interface{}{
					"gte": req.Filters.MinAvailability,
				},
			},
		})
	}

	boolQuery["filter"] = filters

	return query, nil
}

// buildAggregations builds faceted search aggregations
func (s *Service) buildAggregations() map[string]interface{} {
	return map[string]interface{}{
		"categories": map[string]interface{}{
			"terms": map[string]interface{}{
				"field": "category",
				"size":  50,
			},
		},
		"tags": map[string]interface{}{
			"terms": map[string]interface{}{
				"field": "tags",
				"size":  100,
			},
		},
		"pricing_models": map[string]interface{}{
			"terms": map[string]interface{}{
				"field": "pricing.model",
				"size":  10,
			},
		},
		"compliance_levels": map[string]interface{}{
			"terms": map[string]interface{}{
				"field": "compliance.level",
				"size":  10,
			},
		},
		"avg_rating": map[string]interface{}{
			"avg": map[string]interface{}{
				"field": "metrics.rating",
			},
		},
		"price_ranges": map[string]interface{}{
			"histogram": map[string]interface{}{
				"field":    "pricing.rate",
				"interval": 0.01,
			},
		},
	}
}

// processSearchResults processes Elasticsearch hits into search results
func (s *Service) processSearchResults(esResp *elasticsearch.SearchResponse, req *SearchRequest) []SearchResult {
	results := make([]SearchResult, 0, len(esResp.Hits.Hits))

	for _, hit := range esResp.Hits.Hits {
		result := SearchResult{
			Service: &hit.Source,
			Score:   hit.Score,
			MatchDetails: MatchDetails{
				RelevanceScore: hit.Score,
			},
		}
		results = append(results, result)
	}

	return results
}

// rankResults applies the ranking algorithm
func (s *Service) rankResults(results []SearchResult) []SearchResult {
	weights := s.config.Search.RankingWeights

	for i := range results {
		svc := results[i].Service

		// Relevance (already from Elasticsearch score)
		relevanceScore := results[i].Score / 10.0 // Normalize
		if relevanceScore > 1.0 {
			relevanceScore = 1.0
		}

		// Popularity (based on metrics)
		popularityScore := s.calculatePopularityScore(svc)

		// Performance (based on SLA metrics)
		performanceScore := s.calculatePerformanceScore(svc)

		// Compliance (based on compliance level and certifications)
		complianceScore := s.calculateComplianceScore(svc)

		// Calculate weighted score
		finalScore := (relevanceScore * weights.Relevance) +
			(popularityScore * weights.Popularity) +
			(performanceScore * weights.Performance) +
			(complianceScore * weights.Compliance)

		results[i].Score = finalScore
		results[i].MatchDetails = MatchDetails{
			RelevanceScore:   relevanceScore,
			PopularityScore:  popularityScore,
			PerformanceScore: performanceScore,
			ComplianceScore:  complianceScore,
		}
	}

	// Sort by final score
	for i := 0; i < len(results)-1; i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Score > results[i].Score {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	return results
}

// Score calculation helpers
func (s *Service) calculatePopularityScore(svc *elasticsearch.ServiceDocument) float64 {
	// Normalize based on typical values
	requestScore := min(float64(svc.Metrics.TotalRequests)/10000.0, 1.0)
	ratingScore := svc.Metrics.Rating / 5.0
	reviewScore := min(float64(svc.Metrics.ReviewCount)/100.0, 1.0)

	return (requestScore*0.4 + ratingScore*0.4 + reviewScore*0.2)
}

func (s *Service) calculatePerformanceScore(svc *elasticsearch.ServiceDocument) float64 {
	// Lower latency = higher score
	latencyScore := 1.0 - min(svc.Metrics.AvgLatencyMS/1000.0, 1.0)

	// Lower error rate = higher score
	errorScore := 1.0 - svc.Metrics.ErrorRate

	// Higher availability = higher score
	availabilityScore := svc.SLA.Availability / 100.0

	return (latencyScore*0.3 + errorScore*0.3 + availabilityScore*0.4)
}

func (s *Service) calculateComplianceScore(svc *elasticsearch.ServiceDocument) float64 {
	score := 0.5 // Base score

	// Compliance level
	switch svc.Compliance.Level {
	case "public":
		score += 0.1
	case "internal":
		score += 0.2
	case "confidential":
		score += 0.3
	}

	// Certifications bonus
	certCount := len(svc.Compliance.Certifications)
	score += min(float64(certCount)*0.1, 0.2)

	return min(score, 1.0)
}

// Cache helpers
func (s *Service) buildCacheKey(req *SearchRequest) string {
	parts := []string{
		"search",
		req.Query,
		fmt.Sprintf("p%d", req.Pagination.Page),
		fmt.Sprintf("s%d", req.Pagination.PageSize),
	}

	if len(req.Filters.Categories) > 0 {
		parts = append(parts, "cat:"+strings.Join(req.Filters.Categories, ","))
	}
	if len(req.Filters.Tags) > 0 {
		parts = append(parts, "tag:"+strings.Join(req.Filters.Tags, ","))
	}

	return strings.Join(parts, ":")
}

func (s *Service) getCachedResults(ctx context.Context, key string) (*SearchResponse, error) {
	data, err := s.redisClient.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var response SearchResponse
	if err := json.Unmarshal(data, &response); err != nil {
		return nil, err
	}

	return &response, nil
}

func (s *Service) cacheResults(ctx context.Context, key string, response *SearchResponse) error {
	data, err := json.Marshal(response)
	if err != nil {
		return err
	}

	ttl := s.config.Redis.GetCacheTTL("search_results")
	return s.redisClient.Set(ctx, key, data, ttl).Err()
}

// trackSearchEvent sends search analytics
func (s *Service) trackSearchEvent(ctx context.Context, req *SearchRequest, resp *SearchResponse) {
	// This would integrate with Analytics Hub via Kafka
	s.logger.Debug("Tracking search event",
		zap.String("query", req.Query),
		zap.Int("results", resp.Total),
	)
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
