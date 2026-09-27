package elasticsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/elastic/go-elasticsearch/v8"
	"github.com/org/llm-marketplace/services/discovery/internal/config"
	"go.uber.org/zap"
)

type IndexManager struct {
	client *Client
	es     *elasticsearch.Client
	config config.ElasticsearchConfig
	logger *zap.Logger
}

func NewIndexManager(client *Client, cfg config.ElasticsearchConfig, logger *zap.Logger) *IndexManager {
	return &IndexManager{
		client: client,
		es:     client.es,
		config: cfg,
		logger: logger,
	}
}

// CreateIndex creates the services index with proper mappings
func (im *IndexManager) CreateIndex(ctx context.Context) error {
	// Check if index exists
	res, err := im.es.Indices.Exists([]string{im.config.IndexName})
	if err != nil {
		return fmt.Errorf("failed to check index existence: %w", err)
	}
	defer res.Body.Close()

	// Index already exists
	if res.StatusCode == 200 {
		im.logger.Info("Index already exists", zap.String("index", im.config.IndexName))
		return nil
	}

	// Create index with mappings
	mappings := im.buildIndexMappings()

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(mappings); err != nil {
		return fmt.Errorf("failed to encode mappings: %w", err)
	}

	res, err = im.es.Indices.Create(
		im.config.IndexName,
		im.es.Indices.Create.WithBody(&buf),
		im.es.Indices.Create.WithContext(ctx),
	)
	if err != nil {
		return fmt.Errorf("failed to create index: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("index creation failed: %s - %s", res.Status(), string(body))
	}

	im.logger.Info("Index created successfully", zap.String("index", im.config.IndexName))
	return nil
}

// buildIndexMappings returns the Elasticsearch index mappings
func (im *IndexManager) buildIndexMappings() map[string]interface{} {
	return map[string]interface{}{
		"settings": map[string]interface{}{
			"number_of_shards":   im.config.Shards,
			"number_of_replicas": im.config.Replicas,
			"refresh_interval":   im.config.RefreshInterval,
			"analysis": map[string]interface{}{
				"analyzer": map[string]interface{}{
					"service_analyzer": map[string]interface{}{
						"type":      "custom",
						"tokenizer": "standard",
						"filter": []string{
							"lowercase",
							"asciifolding",
							"service_synonym",
							"english_stemmer",
						},
					},
					"autocomplete": map[string]interface{}{
						"type":      "custom",
						"tokenizer": "autocomplete_tokenizer",
						"filter": []string{
							"lowercase",
							"asciifolding",
						},
					},
				},
				"tokenizer": map[string]interface{}{
					"autocomplete_tokenizer": map[string]interface{}{
						"type":     "edge_ngram",
						"min_gram": 2,
						"max_gram": 20,
						"token_chars": []string{
							"letter",
							"digit",
						},
					},
				},
				"filter": map[string]interface{}{
					"english_stemmer": map[string]interface{}{
						"type":     "stemmer",
						"language": "english",
					},
					"service_synonym": map[string]interface{}{
						"type": "synonym",
						"synonyms": []string{
							"llm, large language model, language model",
							"ml, machine learning",
							"ai, artificial intelligence",
							"nlp, natural language processing",
							"gpt, generative pretrained transformer",
						},
					},
				},
			},
		},
		"mappings": map[string]interface{}{
			"properties": map[string]interface{}{
				"id": map[string]interface{}{
					"type": "keyword",
				},
				"name": map[string]interface{}{
					"type":     "text",
					"analyzer": "service_analyzer",
					"fields": map[string]interface{}{
						"keyword": map[string]interface{}{
							"type": "keyword",
						},
						"autocomplete": map[string]interface{}{
							"type":            "text",
							"analyzer":        "autocomplete",
							"search_analyzer": "standard",
						},
					},
				},
				"description": map[string]interface{}{
					"type":     "text",
					"analyzer": "service_analyzer",
				},
				"category": map[string]interface{}{
					"type": "keyword",
				},
				"tags": map[string]interface{}{
					"type": "keyword",
				},
				"provider": map[string]interface{}{
					"properties": map[string]interface{}{
						"id": map[string]interface{}{
							"type": "keyword",
						},
						"name": map[string]interface{}{
							"type": "text",
							"fields": map[string]interface{}{
								"keyword": map[string]interface{}{
									"type": "keyword",
								},
							},
						},
						"verified": map[string]interface{}{
							"type": "boolean",
						},
					},
				},
				"capabilities": map[string]interface{}{
					"type": "keyword",
				},
				"pricing": map[string]interface{}{
					"properties": map[string]interface{}{
						"model": map[string]interface{}{
							"type": "keyword",
						},
						"rate": map[string]interface{}{
							"type": "float",
						},
						"unit": map[string]interface{}{
							"type": "keyword",
						},
					},
				},
				"sla": map[string]interface{}{
					"properties": map[string]interface{}{
						"availability": map[string]interface{}{
							"type": "float",
						},
						"max_latency_ms": map[string]interface{}{
							"type": "integer",
						},
						"support": map[string]interface{}{
							"type": "keyword",
						},
					},
				},
				"compliance": map[string]interface{}{
					"properties": map[string]interface{}{
						"level": map[string]interface{}{
							"type": "keyword",
						},
						"certifications": map[string]interface{}{
							"type": "keyword",
						},
						"data_residency": map[string]interface{}{
							"type": "keyword",
						},
					},
				},
				"status": map[string]interface{}{
					"type": "keyword",
				},
				"metrics": map[string]interface{}{
					"properties": map[string]interface{}{
						"total_requests": map[string]interface{}{
							"type": "long",
						},
						"avg_latency_ms": map[string]interface{}{
							"type": "float",
						},
						"error_rate": map[string]interface{}{
							"type": "float",
						},
						"rating": map[string]interface{}{
							"type": "float",
						},
						"review_count": map[string]interface{}{
							"type": "integer",
						},
						"popularity_score": map[string]interface{}{
							"type": "float",
						},
					},
				},
				"embedding": map[string]interface{}{
					"type": "dense_vector",
					"dims": im.config.VectorDimensions,
					"index": true,
					"similarity": im.config.Similarity,
				},
				"created_at": map[string]interface{}{
					"type": "date",
				},
				"updated_at": map[string]interface{}{
					"type": "date",
				},
				"metadata": map[string]interface{}{
					"type":    "object",
					"enabled": true,
				},
			},
		},
	}
}

// DeleteIndex deletes the services index
func (im *IndexManager) DeleteIndex(ctx context.Context) error {
	res, err := im.es.Indices.Delete(
		[]string{im.config.IndexName},
		im.es.Indices.Delete.WithContext(ctx),
	)
	if err != nil {
		return fmt.Errorf("failed to delete index: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() && res.StatusCode != 404 {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("index deletion failed: %s - %s", res.Status(), string(body))
	}

	im.logger.Info("Index deleted", zap.String("index", im.config.IndexName))
	return nil
}

// RefreshIndex forces a refresh of the index
func (im *IndexManager) RefreshIndex(ctx context.Context) error {
	res, err := im.es.Indices.Refresh(
		im.es.Indices.Refresh.WithIndex(im.config.IndexName),
		im.es.Indices.Refresh.WithContext(ctx),
	)
	if err != nil {
		return fmt.Errorf("failed to refresh index: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("index refresh failed: %s - %s", res.Status(), string(body))
	}

	return nil
}

// GetIndexStats returns statistics about the index
func (im *IndexManager) GetIndexStats(ctx context.Context) (map[string]interface{}, error) {
	res, err := im.es.Indices.Stats(
		im.es.Indices.Stats.WithIndex(im.config.IndexName),
		im.es.Indices.Stats.WithContext(ctx),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get index stats: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("failed to get stats: %s - %s", res.Status(), string(body))
	}

	var stats map[string]interface{}
	if err := json.NewDecoder(res.Body).Decode(&stats); err != nil {
		return nil, fmt.Errorf("failed to decode stats: %w", err)
	}

	return stats, nil
}
