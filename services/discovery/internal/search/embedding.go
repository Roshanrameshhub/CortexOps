package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/org/llm-marketplace/services/discovery/internal/config"
)

type EmbeddingClient struct {
	config     config.EmbeddingServiceConfig
	httpClient *http.Client
}

type EmbeddingRequest struct {
	Texts []string `json:"texts"`
	Model string   `json:"model"`
}

type EmbeddingResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
	Model      string      `json:"model"`
}

func NewEmbeddingClient(cfg config.EmbeddingServiceConfig) *EmbeddingClient {
	return &EmbeddingClient{
		config: cfg,
		httpClient: &http.Client{
			Timeout: cfg.Timeout,
		},
	}
}

// GetEmbedding retrieves the embedding vector for a single text
func (ec *EmbeddingClient) GetEmbedding(ctx context.Context, text string) ([]float32, error) {
	embeddings, err := ec.GetEmbeddings(ctx, []string{text})
	if err != nil {
		return nil, err
	}

	if len(embeddings) == 0 {
		return nil, fmt.Errorf("no embeddings returned")
	}

	return embeddings[0], nil
}

// GetEmbeddings retrieves embedding vectors for multiple texts
func (ec *EmbeddingClient) GetEmbeddings(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, fmt.Errorf("no texts provided")
	}

	reqBody := EmbeddingRequest{
		Texts: texts,
		Model: ec.config.Model,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		"POST",
		ec.config.URL+"/embeddings",
		bytes.NewReader(jsonData),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := ec.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call embedding service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding service returned status %d: %s", resp.StatusCode, string(body))
	}

	var embResp EmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&embResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return embResp.Embeddings, nil
}

// GetEmbeddingsBatch retrieves embeddings in batches
func (ec *EmbeddingClient) GetEmbeddingsBatch(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	var allEmbeddings [][]float32

	for i := 0; i < len(texts); i += ec.config.BatchSize {
		end := i + ec.config.BatchSize
		if end > len(texts) {
			end = len(texts)
		}

		batch := texts[i:end]
		embeddings, err := ec.GetEmbeddings(ctx, batch)
		if err != nil {
			return nil, fmt.Errorf("batch %d failed: %w", i/ec.config.BatchSize, err)
		}

		allEmbeddings = append(allEmbeddings, embeddings...)

		// Small delay between batches to avoid overwhelming the service
		if end < len(texts) {
			time.Sleep(100 * time.Millisecond)
		}
	}

	return allEmbeddings, nil
}
