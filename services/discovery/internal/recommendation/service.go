package recommendation

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/org/llm-marketplace/services/discovery/internal/config"
	"github.com/org/llm-marketplace/services/discovery/internal/elasticsearch"
	"github.com/org/llm-marketplace/services/discovery/internal/observability"
	"github.com/org/llm-marketplace/services/discovery/internal/postgres"
	"go.uber.org/zap"
)

type Service struct {
	pgPool      *postgres.Pool
	redisClient *redis.Client
	config      *config.Config
	logger      *zap.Logger
	metrics     *observability.Metrics
}

func NewService(
	pgPool *postgres.Pool,
	redisClient *redis.Client,
	cfg *config.Config,
	logger *zap.Logger,
	metrics *observability.Metrics,
) *Service {
	return &Service{
		pgPool:      pgPool,
		redisClient: redisClient,
		config:      cfg,
		logger:      logger,
		metrics:     metrics,
	}
}

// RecommendationRequest represents a recommendation query
type RecommendationRequest struct {
	UserID       string   `json:"user_id"`
	ServiceID    string   `json:"service_id,omitempty"`
	Categories   []string `json:"categories,omitempty"`
	MaxResults   int      `json:"max_results,omitempty"`
	IncludeTrending bool  `json:"include_trending,omitempty"`
}

// RecommendationResponse contains recommended services
type RecommendationResponse struct {
	Recommendations []Recommendation `json:"recommendations"`
	Algorithm       string           `json:"algorithm"`
	Timestamp       time.Time        `json:"timestamp"`
}

// Recommendation represents a single recommendation
type Recommendation struct {
	Service     *elasticsearch.ServiceDocument `json:"service"`
	Score       float64                        `json:"score"`
	Reason      string                         `json:"reason"`
	Confidence  float64                        `json:"confidence"`
}

// GetRecommendations returns personalized recommendations
func (s *Service) GetRecommendations(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error) {
	if !s.config.Recommendations.Enabled {
		return &RecommendationResponse{
			Recommendations: []Recommendation{},
			Algorithm:       "disabled",
			Timestamp:       time.Now(),
		}, nil
	}

	maxResults := req.MaxResults
	if maxResults <= 0 || maxResults > s.config.Recommendations.MaxRecommendations {
		maxResults = s.config.Recommendations.MaxRecommendations
	}

	// Check cache
	cacheKey := fmt.Sprintf("recommendations:%s", req.UserID)
	if cached := s.getCachedRecommendations(ctx, cacheKey); cached != nil {
		s.logger.Debug("Cache hit for recommendations", zap.String("user_id", req.UserID))
		return cached, nil
	}

	// Get user interaction history
	userHistory, err := s.getUserHistory(ctx, req.UserID)
	if err != nil {
		s.logger.Warn("Failed to get user history", zap.Error(err))
		userHistory = []UserInteraction{}
	}

	var recommendations []Recommendation

	// Collaborative filtering
	if len(userHistory) >= 3 {
		collab := s.collaborativeFiltering(ctx, req.UserID, userHistory, maxResults)
		recommendations = append(recommendations, collab...)
	}

	// Content-based recommendations
	if req.ServiceID != "" {
		content := s.contentBasedRecommendations(ctx, req.ServiceID, maxResults)
		recommendations = append(recommendations, content...)
	} else if len(req.Categories) > 0 {
		content := s.categoryBasedRecommendations(ctx, req.Categories, maxResults)
		recommendations = append(recommendations, content...)
	}

	// Trending services
	if req.IncludeTrending {
		trending := s.getTrendingServices(ctx, maxResults/2)
		recommendations = append(recommendations, trending...)
	}

	// Deduplicate and sort by score
	recommendations = s.deduplicateAndRank(recommendations, maxResults)

	response := &RecommendationResponse{
		Recommendations: recommendations,
		Algorithm:       "hybrid",
		Timestamp:       time.Now(),
	}

	// Cache results
	s.cacheRecommendations(ctx, cacheKey, response)

	return response, nil
}

// UserInteraction represents a user's interaction with a service
type UserInteraction struct {
	ServiceID   string
	Type        string // view, download, rate, consume
	Rating      float64
	Timestamp   time.Time
	DurationSec int
}

// getUserHistory retrieves user's interaction history
func (s *Service) getUserHistory(ctx context.Context, userID string) ([]UserInteraction, error) {
	query := `
		SELECT service_id, interaction_type, rating, timestamp, duration_sec
		FROM user_interactions
		WHERE user_id = $1
		ORDER BY timestamp DESC
		LIMIT 100
	`

	rows, err := s.pgPool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []UserInteraction
	for rows.Next() {
		var interaction UserInteraction
		var rating sql.NullFloat64
		var duration sql.NullInt64

		err := rows.Scan(
			&interaction.ServiceID,
			&interaction.Type,
			&rating,
			&interaction.Timestamp,
			&duration,
		)
		if err != nil {
			continue
		}

		if rating.Valid {
			interaction.Rating = rating.Float64
		}
		if duration.Valid {
			interaction.DurationSec = int(duration.Int64)
		}

		history = append(history, interaction)
	}

	return history, nil
}

// collaborativeFiltering finds services liked by similar users
func (s *Service) collaborativeFiltering(ctx context.Context, userID string, history []UserInteraction, maxResults int) []Recommendation {
	// Get services the user has interacted with
	userServiceIDs := make([]string, len(history))
	for i, h := range history {
		userServiceIDs[i] = h.ServiceID
	}

	// Find similar users (users who interacted with same services)
	query := `
		SELECT DISTINCT u.user_id, COUNT(*) as common_services
		FROM user_interactions u
		WHERE u.service_id = ANY($1)
		  AND u.user_id != $2
		GROUP BY u.user_id
		HAVING COUNT(*) >= $3
		ORDER BY common_services DESC
		LIMIT 50
	`

	rows, err := s.pgPool.Query(ctx, query, userServiceIDs, userID, s.config.Recommendations.MinCommonUsers)
	if err != nil {
		s.logger.Error("Failed to find similar users", zap.Error(err))
		return []Recommendation{}
	}
	defer rows.Close()

	similarUserIDs := []string{}
	for rows.Next() {
		var similarUserID string
		var commonServices int
		if err := rows.Scan(&similarUserID, &commonServices); err != nil {
			continue
		}
		similarUserIDs = append(similarUserIDs, similarUserID)
	}

	if len(similarUserIDs) == 0 {
		return []Recommendation{}
	}

	// Get services liked by similar users but not yet tried by this user
	query = `
		SELECT service_id, AVG(rating) as avg_rating, COUNT(*) as interaction_count
		FROM user_interactions
		WHERE user_id = ANY($1)
		  AND service_id != ALL($2)
		  AND rating >= 4.0
		GROUP BY service_id
		ORDER BY avg_rating DESC, interaction_count DESC
		LIMIT $3
	`

	rows, err = s.pgPool.Query(ctx, query, similarUserIDs, userServiceIDs, maxResults)
	if err != nil {
		s.logger.Error("Failed to get collaborative recommendations", zap.Error(err))
		return []Recommendation{}
	}
	defer rows.Close()

	recommendations := []Recommendation{}
	for rows.Next() {
		var serviceID string
		var avgRating float64
		var count int

		if err := rows.Scan(&serviceID, &avgRating, &count); err != nil {
			continue
		}

		// Calculate confidence based on number of interactions
		confidence := math.Min(float64(count)/10.0, 1.0)

		recommendations = append(recommendations, Recommendation{
			Service:    nil, // Will be populated later
			Score:      avgRating * s.config.Recommendations.CollaborativeWeight,
			Reason:     "Users similar to you liked this service",
			Confidence: confidence,
		})
	}

	return recommendations
}

// contentBasedRecommendations finds similar services
func (s *Service) contentBasedRecommendations(ctx context.Context, serviceID string, maxResults int) []Recommendation {
	// Get the reference service details
	query := `
		SELECT category, tags, pricing_model
		FROM services
		WHERE id = $1
	`

	var category, pricingModel string
	var tags []string

	err := s.pgPool.QueryRow(ctx, query, serviceID).Scan(&category, &tags, &pricingModel)
	if err != nil {
		s.logger.Error("Failed to get service details", zap.Error(err))
		return []Recommendation{}
	}

	// Find similar services
	query = `
		SELECT id, name, category,
		       CASE
		         WHEN category = $1 THEN 0.5
		         ELSE 0.0
		       END +
		       CASE
		         WHEN tags && $2 THEN 0.3
		         ELSE 0.0
		       END +
		       CASE
		         WHEN pricing_model = $3 THEN 0.2
		         ELSE 0.0
		       END as similarity_score
		FROM services
		WHERE id != $4
		  AND status = 'active'
		ORDER BY similarity_score DESC
		LIMIT $5
	`

	rows, err := s.pgPool.Query(ctx, query, category, tags, pricingModel, serviceID, maxResults)
	if err != nil {
		s.logger.Error("Failed to get content recommendations", zap.Error(err))
		return []Recommendation{}
	}
	defer rows.Close()

	recommendations := []Recommendation{}
	for rows.Next() {
		var id, name, cat string
		var score float64

		if err := rows.Scan(&id, &name, &cat, &score); err != nil {
			continue
		}

		recommendations = append(recommendations, Recommendation{
			Service:    nil, // Will be populated later
			Score:      score * s.config.Recommendations.ContentWeight,
			Reason:     fmt.Sprintf("Similar to services in %s category", category),
			Confidence: score,
		})
	}

	return recommendations
}

// categoryBasedRecommendations finds top services in given categories
func (s *Service) categoryBasedRecommendations(ctx context.Context, categories []string, maxResults int) []Recommendation {
	query := `
		SELECT id, name, category, avg_rating, total_requests
		FROM services
		WHERE category = ANY($1)
		  AND status = 'active'
		  AND avg_rating >= 4.0
		ORDER BY avg_rating DESC, total_requests DESC
		LIMIT $2
	`

	rows, err := s.pgPool.Query(ctx, query, categories, maxResults)
	if err != nil {
		s.logger.Error("Failed to get category recommendations", zap.Error(err))
		return []Recommendation{}
	}
	defer rows.Close()

	recommendations := []Recommendation{}
	for rows.Next() {
		var id, name, category string
		var rating float64
		var requests int64

		if err := rows.Scan(&id, &name, &category, &rating, &requests); err != nil {
			continue
		}

		score := (rating / 5.0) * s.config.Recommendations.ContentWeight
		recommendations = append(recommendations, Recommendation{
			Service:    nil,
			Score:      score,
			Reason:     fmt.Sprintf("Top rated in %s", category),
			Confidence: rating / 5.0,
		})
	}

	return recommendations
}

// getTrendingServices returns currently trending services
func (s *Service) getTrendingServices(ctx context.Context, maxResults int) []Recommendation {
	window := s.config.Recommendations.TrendingWindow
	minInteractions := s.config.Recommendations.TrendingMinInteractions

	query := `
		SELECT service_id, COUNT(*) as interaction_count, AVG(rating) as avg_rating
		FROM user_interactions
		WHERE timestamp > NOW() - $1::interval
		GROUP BY service_id
		HAVING COUNT(*) >= $2
		ORDER BY interaction_count DESC, avg_rating DESC
		LIMIT $3
	`

	rows, err := s.pgPool.Query(ctx, query, window, minInteractions, maxResults)
	if err != nil {
		s.logger.Error("Failed to get trending services", zap.Error(err))
		return []Recommendation{}
	}
	defer rows.Close()

	recommendations := []Recommendation{}
	for rows.Next() {
		var serviceID string
		var count int
		var avgRating float64

		if err := rows.Scan(&serviceID, &count, &avgRating); err != nil {
			continue
		}

		score := (float64(count) / 100.0) * s.config.Recommendations.PopularityWeight
		recommendations = append(recommendations, Recommendation{
			Service:    nil,
			Score:      score,
			Reason:     "Trending now",
			Confidence: math.Min(float64(count)/100.0, 1.0),
		})
	}

	return recommendations
}

// deduplicateAndRank removes duplicates and ranks by score
func (s *Service) deduplicateAndRank(recommendations []Recommendation, maxResults int) []Recommendation {
	seen := make(map[string]bool)
	unique := []Recommendation{}

	for _, rec := range recommendations {
		if rec.Service != nil && !seen[rec.Service.ID] {
			seen[rec.Service.ID] = true
			unique = append(unique, rec)
		}
	}

	// Sort by score
	for i := 0; i < len(unique)-1; i++ {
		for j := i + 1; j < len(unique); j++ {
			if unique[j].Score > unique[i].Score {
				unique[i], unique[j] = unique[j], unique[i]
			}
		}
	}

	if len(unique) > maxResults {
		unique = unique[:maxResults]
	}

	return unique
}

// Cache helpers
func (s *Service) getCachedRecommendations(ctx context.Context, key string) *RecommendationResponse {
	data, err := s.redisClient.Get(ctx, key).Bytes()
	if err != nil {
		return nil
	}

	var response RecommendationResponse
	if err := json.Unmarshal(data, &response); err != nil {
		return nil
	}

	return &response
}

func (s *Service) cacheRecommendations(ctx context.Context, key string, response *RecommendationResponse) {
	data, err := json.Marshal(response)
	if err != nil {
		return
	}

	ttl := s.config.Redis.GetCacheTTL("recommendations")
	s.redisClient.Set(ctx, key, data, ttl)
}
