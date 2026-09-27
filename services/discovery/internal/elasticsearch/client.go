package elasticsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/elastic/go-elasticsearch/v8"
	"github.com/elastic/go-elasticsearch/v8/esapi"
	"github.com/org/llm-marketplace/services/discovery/internal/config"
)

type Client struct {
	es     *elasticsearch.Client
	config config.ElasticsearchConfig
}

// ServiceDocument represents a service in Elasticsearch
type ServiceDocument struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Category    string                 `json:"category"`
	Tags        []string               `json:"tags"`
	Provider    ProviderInfo           `json:"provider"`
	Capabilities []string              `json:"capabilities"`
	Pricing     PricingInfo            `json:"pricing"`
	SLA         SLAInfo                `json:"sla"`
	Compliance  ComplianceInfo         `json:"compliance"`
	Status      string                 `json:"status"`
	Metrics     MetricsInfo            `json:"metrics"`
	Embedding   []float32              `json:"embedding,omitempty"` // Vector embedding for semantic search
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type ProviderInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Verified bool   `json:"verified"`
}

type PricingInfo struct {
	Model string  `json:"model"`
	Rate  float64 `json:"rate"`
	Unit  string  `json:"unit"`
}

type SLAInfo struct {
	Availability float64 `json:"availability"`
	MaxLatencyMS int     `json:"max_latency_ms"`
	Support      string  `json:"support"`
}

type ComplianceInfo struct {
	Level           string   `json:"level"`
	Certifications  []string `json:"certifications"`
	DataResidency   []string `json:"data_residency"`
}

type MetricsInfo struct {
	TotalRequests   int64   `json:"total_requests"`
	AvgLatencyMS    float64 `json:"avg_latency_ms"`
	ErrorRate       float64 `json:"error_rate"`
	Rating          float64 `json:"rating"`
	ReviewCount     int     `json:"review_count"`
	PopularityScore float64 `json:"popularity_score"`
}

// NewClient creates a new Elasticsearch client
func NewClient(cfg config.ElasticsearchConfig) (*Client, error) {
	esCfg := elasticsearch.Config{
		Addresses: cfg.GetElasticsearchAddresses(),
		Username:  cfg.Username,
		Password:  cfg.Password,
		MaxRetries: cfg.MaxRetries,
		RetryBackoff: func(i int) time.Duration {
			return time.Duration(i) * cfg.RetryBackoff
		},
	}

	es, err := elasticsearch.NewClient(esCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create elasticsearch client: %w", err)
	}

	// Ping to verify connection
	res, err := es.Ping()
	if err != nil {
		return nil, fmt.Errorf("failed to ping elasticsearch: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, fmt.Errorf("elasticsearch ping failed: %s", res.Status())
	}

	return &Client{
		es:     es,
		config: cfg,
	}, nil
}

// Ping checks if Elasticsearch is reachable
func (c *Client) Ping() error {
	res, err := c.es.Ping()
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("ping failed: %s", res.Status())
	}
	return nil
}

// Index indexes a service document
func (c *Client) Index(ctx context.Context, doc *ServiceDocument) error {
	data, err := json.Marshal(doc)
	if err != nil {
		return fmt.Errorf("failed to marshal document: %w", err)
	}

	req := esapi.IndexRequest{
		Index:      c.config.IndexName,
		DocumentID: doc.ID,
		Body:       bytes.NewReader(data),
		Refresh:    "true",
	}

	res, err := req.Do(ctx, c.es)
	if err != nil {
		return fmt.Errorf("failed to index document: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("indexing failed: %s - %s", res.Status(), string(body))
	}

	return nil
}

// BulkIndex indexes multiple documents at once
func (c *Client) BulkIndex(ctx context.Context, docs []*ServiceDocument) error {
	if len(docs) == 0 {
		return nil
	}

	var buf bytes.Buffer
	for _, doc := range docs {
		meta := map[string]interface{}{
			"index": map[string]interface{}{
				"_index": c.config.IndexName,
				"_id":    doc.ID,
			},
		}

		metaJSON, _ := json.Marshal(meta)
		buf.Write(metaJSON)
		buf.WriteByte('\n')

		docJSON, _ := json.Marshal(doc)
		buf.Write(docJSON)
		buf.WriteByte('\n')
	}

	res, err := c.es.Bulk(bytes.NewReader(buf.Bytes()))
	if err != nil {
		return fmt.Errorf("bulk indexing failed: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("bulk indexing error: %s - %s", res.Status(), string(body))
	}

	return nil
}

// Search performs a search with the given query
func (c *Client) Search(ctx context.Context, query map[string]interface{}) (*SearchResponse, error) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(query); err != nil {
		return nil, fmt.Errorf("failed to encode query: %w", err)
	}

	res, err := c.es.Search(
		c.es.Search.WithContext(ctx),
		c.es.Search.WithIndex(c.config.IndexName),
		c.es.Search.WithBody(&buf),
		c.es.Search.WithTrackTotalHits(true),
	)
	if err != nil {
		return nil, fmt.Errorf("search failed: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("search error: %s - %s", res.Status(), string(body))
	}

	var searchResp SearchResponse
	if err := json.NewDecoder(res.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &searchResp, nil
}

// Get retrieves a document by ID
func (c *Client) Get(ctx context.Context, id string) (*ServiceDocument, error) {
	res, err := c.es.Get(c.config.IndexName, id)
	if err != nil {
		return nil, fmt.Errorf("get failed: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		if res.StatusCode == 404 {
			return nil, fmt.Errorf("document not found")
		}
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("get error: %s - %s", res.Status(), string(body))
	}

	var result struct {
		Source ServiceDocument `json:"_source"`
	}

	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode document: %w", err)
	}

	return &result.Source, nil
}

// Delete removes a document by ID
func (c *Client) Delete(ctx context.Context, id string) error {
	req := esapi.DeleteRequest{
		Index:      c.config.IndexName,
		DocumentID: id,
		Refresh:    "true",
	}

	res, err := req.Do(ctx, c.es)
	if err != nil {
		return fmt.Errorf("delete failed: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() && res.StatusCode != 404 {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("delete error: %s - %s", res.Status(), string(body))
	}

	return nil
}

// SearchResponse represents Elasticsearch search response
type SearchResponse struct {
	Took     int  `json:"took"`
	TimedOut bool `json:"timed_out"`
	Hits     struct {
		Total struct {
			Value    int    `json:"value"`
			Relation string `json:"relation"`
		} `json:"total"`
		MaxScore float64 `json:"max_score"`
		Hits     []Hit   `json:"hits"`
	} `json:"hits"`
	Aggregations map[string]interface{} `json:"aggregations,omitempty"`
}

// Hit represents a search result hit
type Hit struct {
	Index  string          `json:"_index"`
	ID     string          `json:"_id"`
	Score  float64         `json:"_score"`
	Source ServiceDocument `json:"_source"`
}
