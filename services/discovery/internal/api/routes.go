package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/org/llm-marketplace/services/discovery/internal/observability"
	"github.com/org/llm-marketplace/services/discovery/internal/recommendation"
	"github.com/org/llm-marketplace/services/discovery/internal/search"
	"go.uber.org/zap"
)

// RegisterRoutes registers all API routes
func RegisterRoutes(
	router *gin.Engine,
	searchService *search.Service,
	recService *recommendation.Service,
	logger *zap.Logger,
	metrics *observability.Metrics,
) {
	api := router.Group("/api/v1")
	{
		// Search endpoints
		api.POST("/search", handleSearch(searchService, logger, metrics))
		api.GET("/search", handleSearchGET(searchService, logger, metrics))

		// Service endpoints
		api.GET("/services/:id", handleGetService(searchService, logger, metrics))
		api.GET("/services/:id/similar", handleSimilarServices(searchService, recService, logger, metrics))

		// Recommendation endpoints
		api.GET("/recommendations", handleRecommendations(recService, logger, metrics))
		api.GET("/recommendations/trending", handleTrending(recService, logger, metrics))

		// Category and tag endpoints
		api.GET("/categories", handleGetCategories(searchService, logger, metrics))
		api.GET("/tags", handleGetTags(searchService, logger, metrics))

		// Autocomplete
		api.GET("/autocomplete", handleAutocomplete(searchService, logger, metrics))
	}
}

// handleSearch handles POST /api/v1/search
func handleSearch(svc *search.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req search.SearchRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			logger.Warn("Invalid search request", zap.Error(err))
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request body",
				"details": err.Error(),
			})
			return
		}

		// Get user ID from context (set by auth middleware)
		if userID, exists := c.Get("user_id"); exists {
			req.UserID = userID.(string)
		}

		// Set defaults
		if req.Pagination.PageSize == 0 {
			req.Pagination.PageSize = 20
		}

		response, err := svc.Search(c.Request.Context(), &req)
		if err != nil {
			logger.Error("Search failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Search failed",
			})
			return
		}

		c.JSON(http.StatusOK, response)
	}
}

// handleSearchGET handles GET /api/v1/search
func handleSearchGET(svc *search.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		req := search.SearchRequest{
			Query: c.Query("q"),
			Pagination: search.PaginationRequest{
				Page:     parseIntQuery(c, "page", 0),
				PageSize: parseIntQuery(c, "page_size", 20),
			},
		}

		// Parse filters
		if category := c.Query("category"); category != "" {
			req.Filters.Categories = []string{category}
		}
		if tags := c.QueryArray("tags"); len(tags) > 0 {
			req.Filters.Tags = tags
		}
		if minRating := c.Query("min_rating"); minRating != "" {
			if rating, err := strconv.ParseFloat(minRating, 64); err == nil {
				req.Filters.MinRating = rating
			}
		}
		if verifiedOnly := c.Query("verified_only"); verifiedOnly == "true" {
			req.Filters.VerifiedOnly = true
		}

		response, err := svc.Search(c.Request.Context(), &req)
		if err != nil {
			logger.Error("Search failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Search failed",
			})
			return
		}

		c.JSON(http.StatusOK, response)
	}
}

// handleGetService handles GET /api/v1/services/:id
func handleGetService(svc *search.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		serviceID := c.Param("id")
		if serviceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Service ID is required",
			})
			return
		}

		service, err := svc.GetServiceByID(c.Request.Context(), serviceID)
		if err != nil {
			logger.Error("Failed to get service", zap.String("id", serviceID), zap.Error(err))
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Service not found",
			})
			return
		}

		c.JSON(http.StatusOK, service)
	}
}

// handleSimilarServices handles GET /api/v1/services/:id/similar
func handleSimilarServices(
	svc *search.Service,
	recSvc *recommendation.Service,
	logger *zap.Logger,
	metrics *observability.Metrics,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		serviceID := c.Param("id")
		maxResults := parseIntQuery(c, "max_results", 10)

		req := recommendation.RecommendationRequest{
			ServiceID:  serviceID,
			MaxResults: maxResults,
		}

		response, err := recSvc.GetRecommendations(c.Request.Context(), &req)
		if err != nil {
			logger.Error("Failed to get similar services", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to get recommendations",
			})
			return
		}

		c.JSON(http.StatusOK, response)
	}
}

// handleRecommendations handles GET /api/v1/recommendations
func handleRecommendations(svc *recommendation.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")

		req := recommendation.RecommendationRequest{
			UserID:          userID.(string),
			MaxResults:      parseIntQuery(c, "max_results", 10),
			IncludeTrending: c.Query("include_trending") == "true",
		}

		if categories := c.QueryArray("categories"); len(categories) > 0 {
			req.Categories = categories
		}

		response, err := svc.GetRecommendations(c.Request.Context(), &req)
		if err != nil {
			logger.Error("Failed to get recommendations", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to get recommendations",
			})
			return
		}

		c.JSON(http.StatusOK, response)
	}
}

// handleTrending handles GET /api/v1/recommendations/trending
func handleTrending(svc *recommendation.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		maxResults := parseIntQuery(c, "max_results", 10)

		req := recommendation.RecommendationRequest{
			MaxResults:      maxResults,
			IncludeTrending: true,
		}

		response, err := svc.GetRecommendations(c.Request.Context(), &req)
		if err != nil {
			logger.Error("Failed to get trending services", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to get trending services",
			})
			return
		}

		c.JSON(http.StatusOK, response)
	}
}

// handleGetCategories handles GET /api/v1/categories
func handleGetCategories(svc *search.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		categories, err := svc.GetCategories(c.Request.Context())
		if err != nil {
			logger.Error("Failed to get categories", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to get categories",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"categories": categories,
		})
	}
}

// handleGetTags handles GET /api/v1/tags
func handleGetTags(svc *search.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		tags, err := svc.GetTags(c.Request.Context())
		if err != nil {
			logger.Error("Failed to get tags", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to get tags",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"tags": tags,
		})
	}
}

// handleAutocomplete handles GET /api/v1/autocomplete
func handleAutocomplete(svc *search.Service, logger *zap.Logger, metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Query parameter 'q' is required",
			})
			return
		}

		limit := parseIntQuery(c, "limit", 10)

		suggestions, err := svc.Autocomplete(c.Request.Context(), query, limit)
		if err != nil {
			logger.Error("Autocomplete failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Autocomplete failed",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"suggestions": suggestions,
		})
	}
}

// Helper functions
func parseIntQuery(c *gin.Context, key string, defaultValue int) int {
	if value := c.Query(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
