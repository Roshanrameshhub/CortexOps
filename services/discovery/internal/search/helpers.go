package search

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/org/llm-marketplace/services/discovery/internal/elasticsearch"
	"go.uber.org/zap"
)

// GetServiceByID retrieves a service by its ID
func (s *Service) GetServiceByID(ctx context.Context, id string) (*elasticsearch.ServiceDocument, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("service:%s", id)
	if cached, err := s.getCachedService(ctx, cacheKey); err == nil && cached != nil {
		return cached, nil
	}

	// Get from Elasticsearch
	service, err := s.esClient.Get(ctx, id)
	if err != nil {
		return nil, err
	}

	// Cache the result
	if err := s.cacheService(ctx, cacheKey, service); err != nil {
		s.logger.Warn("Failed to cache service", zap.Error(err))
	}

	return service, nil
}

// GetCategories returns all available categories
func (s *Service) GetCategories(ctx context.Context) ([]CategoryInfo, error) {
	// Check cache
	cacheKey := "categories:all"
	if cached, err := s.getCachedCategories(ctx, cacheKey); err == nil && cached != nil {
		return cached, nil
	}

	// Query Elasticsearch aggregations
	query := map[string]interface{}{
		"size": 0,
		"aggs": map[string]interface{}{
			"categories": map[string]interface{}{
				"terms": map[string]interface{}{
					"field": "category",
					"size":  100,
				},
				"aggs": map[string]interface{}{
					"avg_rating": map[string]interface{}{
						"avg": map[string]interface{}{
							"field": "metrics.rating",
						},
					},
				},
			},
		},
	}

	resp, err := s.esClient.Search(ctx, query)
	if err != nil {
		return nil, err
	}

	// Parse aggregation results
	categories := []CategoryInfo{}
	if aggs, ok := resp.Aggregations["categories"].(map[string]interface{}); ok {
		if buckets, ok := aggs["buckets"].([]interface{}); ok {
			for _, bucket := range buckets {
				b := bucket.(map[string]interface{})
				category := CategoryInfo{
					Name:  b["key"].(string),
					Count: int(b["doc_count"].(float64)),
				}

				if avgRating, ok := b["avg_rating"].(map[string]interface{}); ok {
					if value, ok := avgRating["value"].(float64); ok {
						category.AvgRating = value
					}
				}

				categories = append(categories, category)
			}
		}
	}

	// Cache results
	s.cacheCategories(ctx, cacheKey, categories)

	return categories, nil
}

// GetTags returns all available tags
func (s *Service) GetTags(ctx context.Context) ([]TagInfo, error) {
	// Check cache
	cacheKey := "tags:all"
	if cached, err := s.getCachedTags(ctx, cacheKey); err == nil && cached != nil {
		return cached, nil
	}

	// Query Elasticsearch aggregations
	query := map[string]interface{}{
		"size": 0,
		"aggs": map[string]interface{}{
			"tags": map[string]interface{}{
				"terms": map[string]interface{}{
					"field": "tags",
					"size":  500,
				},
			},
		},
	}

	resp, err := s.esClient.Search(ctx, query)
	if err != nil {
		return nil, err
	}

	// Parse aggregation results
	tags := []TagInfo{}
	if aggs, ok := resp.Aggregations["tags"].(map[string]interface{}); ok {
		if buckets, ok := aggs["buckets"].([]interface{}); ok {
			for _, bucket := range buckets {
				b := bucket.(map[string]interface{})
				tag := TagInfo{
					Name:  b["key"].(string),
					Count: int(b["doc_count"].(float64)),
				}
				tags = append(tags, tag)
			}
		}
	}

	// Cache results
	s.cacheTags(ctx, cacheKey, tags)

	return tags, nil
}

// Autocomplete provides search suggestions
func (s *Service) Autocomplete(ctx context.Context, query string, limit int) ([]string, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}

	// Use the autocomplete analyzer
	esQuery := map[string]interface{}{
		"size": limit,
		"query": map[string]interface{}{
			"multi_match": map[string]interface{}{
				"query": query,
				"fields": []string{
					"name.autocomplete^2",
					"name^1",
				},
				"type": "bool_prefix",
			},
		},
		"_source": []string{"name"},
	}

	resp, err := s.esClient.Search(ctx, esQuery)
	if err != nil {
		return nil, err
	}

	suggestions := []string{}
	seen := make(map[string]bool)

	for _, hit := range resp.Hits.Hits {
		name := hit.Source.Name
		if !seen[name] {
			seen[name] = true
			suggestions = append(suggestions, name)
		}
	}

	return suggestions, nil
}

// CategoryInfo represents category metadata
type CategoryInfo struct {
	Name      string  `json:"name"`
	Count     int     `json:"count"`
	AvgRating float64 `json:"avg_rating"`
}

// TagInfo represents tag metadata
type TagInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Cache helpers for additional data types
func (s *Service) getCachedService(ctx context.Context, key string) (*elasticsearch.ServiceDocument, error) {
	data, err := s.redisClient.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var service elasticsearch.ServiceDocument
	if err := json.Unmarshal(data, &service); err != nil {
		return nil, err
	}

	return &service, nil
}

func (s *Service) cacheService(ctx context.Context, key string, service *elasticsearch.ServiceDocument) error {
	data, err := json.Marshal(service)
	if err != nil {
		return err
	}

	ttl := s.config.Redis.GetCacheTTL("service_details")
	return s.redisClient.Set(ctx, key, data, ttl).Err()
}

func (s *Service) getCachedCategories(ctx context.Context, key string) ([]CategoryInfo, error) {
	data, err := s.redisClient.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var categories []CategoryInfo
	if err := json.Unmarshal(data, &categories); err != nil {
		return nil, err
	}

	return categories, nil
}

func (s *Service) cacheCategories(ctx context.Context, key string, categories []CategoryInfo) error {
	data, err := json.Marshal(categories)
	if err != nil {
		return err
	}

	ttl := s.config.Redis.GetCacheTTL("categories")
	return s.redisClient.Set(ctx, key, data, ttl).Err()
}

func (s *Service) getCachedTags(ctx context.Context, key string) ([]TagInfo, error) {
	data, err := s.redisClient.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var tags []TagInfo
	if err := json.Unmarshal(data, &tags); err != nil {
		return nil, err
	}

	return tags, nil
}

func (s *Service) cacheTags(ctx context.Context, key string, tags []TagInfo) error {
	data, err := json.Marshal(tags)
	if err != nil {
		return err
	}

	ttl := s.config.Redis.GetCacheTTL("tags")
	return s.redisClient.Set(ctx, key, data, ttl).Err()
}
