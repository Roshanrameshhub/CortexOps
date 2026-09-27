# ML Recommendations Service

Enterprise-grade machine learning recommendation system with advanced algorithms, deep learning, and real-time personalization.

## Features

- **Multiple Recommendation Algorithms**
  - Matrix Factorization (SVD, ALS, NMF)
  - Neural Collaborative Filtering
  - Deep Learning Models (Wide & Deep, NeuMF, DCN)
  - Hybrid Ensemble Models

- **Advanced Capabilities**
  - Real-time personalization
  - Context-aware recommendations
  - Multi-objective optimization (accuracy, diversity, novelty)
  - A/B testing framework
  - Feature engineering pipeline

- **Production-Ready**
  - FastAPI REST API
  - Prometheus metrics
  - Health checks
  - Redis caching
  - Kubernetes deployment
  - Horizontal auto-scaling

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Install package in development mode
pip install -e .

# Run service
uvicorn ml_recommendations.api.main:app --reload

# Access API documentation
open http://localhost:8000/docs
```

### Docker

```bash
# Build image
docker build -t ml-recommendations:latest .

# Run container
docker run -p 8000:8000 ml-recommendations:latest

# Or use docker-compose
docker-compose up
```

### Kubernetes

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/deployment.yaml

# Check deployment
kubectl get pods -n llm-marketplace
```

## API Endpoints

### Recommendations

**POST /api/v1/recommend**
```json
{
  "user_id": "user_123",
  "limit": 10,
  "context": {
    "hour_of_day": 14,
    "device_type": "mobile"
  },
  "diversity_weight": 0.1,
  "novelty_weight": 0.1
}
```

**Response:**
```json
{
  "user_id": "user_123",
  "recommendations": [
    {
      "service_id": "service_456",
      "score": 0.95,
      "rank": 1,
      "algorithm": "hybrid",
      "explanation": "Based on your preferences and similar users"
    }
  ],
  "model_version": "1.0.0",
  "timestamp": "2025-01-19T10:30:00Z"
}
```

### Similar Items

**GET /api/v1/similar/{item_id}?limit=10**

Returns items similar to the given item.

### Trending

**GET /api/v1/trending?limit=20&category=ai**

Returns trending items, optionally filtered by category.

### Personalized Home

**GET /api/v1/personalized/{user_id}**

Returns multiple recommendation sections for a personalized home page.

### Tracking

**POST /api/v1/track**
```json
{
  "user_id": "user_123",
  "service_id": "service_456",
  "interaction_type": "CLICK",
  "timestamp": "2025-01-19T10:30:00Z"
}
```

### Model Metrics

**GET /api/v1/models/{model_name}/metrics**

Returns performance metrics for a specific model.

## Training Pipeline

### Train Models

```python
from ml_recommendations.training.pipeline import TrainingPipeline
import pandas as pd

# Load data
interactions_df = pd.read_csv("interactions.csv")
users_df = pd.read_csv("users.csv")
services_df = pd.read_csv("services.csv")

# Create pipeline
pipeline = TrainingPipeline(
    config={
        "models": {
            "svd": {"enabled": True, "n_factors": 50},
            "als": {"enabled": True, "factors": 50},
            "nmf": {"enabled": True, "n_components": 50}
        }
    },
    output_dir="./models"
)

# Train all models
results = pipeline.train_all_models(
    interactions_df=interactions_df,
    users_df=users_df,
    services_df=services_df
)

print(f"Trained models: {results['metadata']['models_trained']}")
print(f"Metrics: {results['metrics']}")
```

## Configuration

### Model Configuration

Create `config/model_config.json`:

```json
{
  "svd": {
    "enabled": true,
    "n_factors": 50,
    "weight": 0.3
  },
  "als": {
    "enabled": true,
    "factors": 50,
    "regularization": 0.01,
    "iterations": 15,
    "weight": 0.3
  },
  "nmf": {
    "enabled": true,
    "n_components": 50,
    "max_iter": 200,
    "weight": 0.2
  },
  "neural_cf": {
    "enabled": false,
    "embedding_dim": 64,
    "hidden_layers": [128, 64, 32],
    "dropout_rate": 0.3,
    "weight": 0.2
  },
  "hybrid": {
    "enabled": true,
    "diversity_weight": 0.1,
    "novelty_weight": 0.1
  },
  "cache": {
    "ttl": 3600,
    "enabled": true
  }
}
```

### Environment Variables

```bash
# Service
LOG_LEVEL=INFO
PORT=8000
WORKERS=4

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/llm_marketplace

# Models
MODEL_PATH=/app/models
MODEL_VERSION=1.0.0

# Feature Store
FEATURE_STORE_CACHE_TTL=3600
```

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=ml_recommendations --cov-report=html

# Run specific test file
pytest tests/test_recommender_service.py

# Run with markers
pytest -m unit
pytest -m integration
```

## Monitoring

### Prometheus Metrics

Access Prometheus metrics at `http://localhost:8000/metrics`

Key metrics:
- `recommendation_requests_total` - Total recommendation requests
- `recommendation_latency_seconds` - Request latency histogram
- `model_precision` - Model precision gauge
- `model_recall` - Model recall gauge
- `cache_hit_rate` - Cache hit rate
- `ab_test_assignments_total` - A/B test assignments

### Health Checks

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-19T10:30:00Z",
  "uptime_seconds": 3600,
  "components": {
    "models": {
      "status": "healthy",
      "message": "All models loaded"
    },
    "cache": {
      "status": "healthy",
      "message": "Cache operational"
    },
    "database": {
      "status": "healthy",
      "message": "Database operational"
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────┐
│         Client Applications                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│       ML Recommendation Service (FastAPI)   │
├─────────────────────────────────────────────┤
│  ┌──────────┐  ┌───────────┐  ┌──────────┐ │
│  │ Inference│  │ A/B Test  │  │  Cache   │ │
│  │  Engine  │  │  Manager  │  │  Layer   │ │
│  └──────────┘  └───────────┘  └──────────┘ │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │   Recommendation Models (Ensemble)   │  │
│  ├──────────────────────────────────────┤  │
│  │ SVD │ ALS │ NMF │ NCF │ Wide & Deep │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │      Feature Engineering             │  │
│  └──────────────────────────────────────┘  │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│           Data Layer                        │
├─────────────────────────────────────────────┤
│  PostgreSQL │ Redis │ Feature Store       │
└─────────────────────────────────────────────┘
```

## Performance

- **Latency**: < 100ms for cached recommendations
- **Throughput**: 1000+ requests/second per instance
- **Model Training**: Batch processing with distributed training support
- **Scalability**: Horizontal scaling with Kubernetes HPA

## Contributing

See [DESIGN.md](DESIGN.md) for detailed architecture and design decisions.

## License

Proprietary - LLM Marketplace Platform
