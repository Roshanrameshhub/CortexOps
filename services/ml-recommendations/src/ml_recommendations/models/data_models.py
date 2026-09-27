"""
Data models for ML recommendation system
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, validator


class InteractionType(str, Enum):
    """Type of user-item interaction"""
    VIEW = "view"
    CLICK = "click"
    RATING = "rating"
    USAGE = "usage"
    FAVORITE = "favorite"
    PURCHASE = "purchase"


class PricingModel(str, Enum):
    """Service pricing model"""
    FREE = "free"
    PAY_PER_USE = "pay_per_use"
    SUBSCRIPTION = "subscription"


class UserInteraction(BaseModel):
    """User interaction with a service"""
    user_id: str
    service_id: str
    interaction_type: InteractionType
    rating: Optional[float] = Field(None, ge=0.0, le=5.0)
    timestamp: datetime
    dwell_time: Optional[float] = None  # seconds
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "user123",
                "service_id": "service456",
                "interaction_type": "rating",
                "rating": 4.5,
                "timestamp": "2025-01-19T12:00:00Z",
                "dwell_time": 120.5,
                "session_id": "session789",
                "context": {"device": "mobile", "hour": 12}
            }
        }


class UserFeatures(BaseModel):
    """User feature vector"""
    user_id: str
    # Demographics
    account_age_days: int = 0
    user_role: str = "USER"

    # Behavioral
    total_services_used: int = 0
    total_interactions: int = 0
    avg_rating_given: float = 0.0
    interaction_frequency: float = 0.0  # interactions per day

    # Preferences
    preferred_categories: List[str] = Field(default_factory=list)
    preferred_pricing_models: List[str] = Field(default_factory=list)
    price_sensitivity: float = 0.5  # 0-1

    # Engagement
    total_session_time: float = 0.0  # minutes
    avg_session_length: float = 0.0  # minutes
    recency_days: float = 0.0  # days since last interaction

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "user123",
                "account_age_days": 365,
                "user_role": "USER",
                "total_services_used": 15,
                "total_interactions": 50,
                "avg_rating_given": 4.2,
                "interaction_frequency": 0.5,
                "preferred_categories": ["AI", "NLP"],
                "preferred_pricing_models": ["FREE", "SUBSCRIPTION"],
                "price_sensitivity": 0.3,
                "total_session_time": 120.0,
                "avg_session_length": 15.0,
                "recency_days": 1.5
            }
        }


class ServiceFeatures(BaseModel):
    """Service/Item feature vector"""
    service_id: str
    # Metadata
    category: str
    tags: List[str] = Field(default_factory=list)
    provider_id: str
    description: str = ""

    # Pricing
    pricing_model: str
    price: float = 0.0
    has_free_tier: bool = False

    # Popularity
    usage_count: int = 0
    rating_score: float = 0.0
    rating_count: int = 0
    trending_score: float = 0.0

    # Temporal
    age_days: int = 0
    last_updated_days: int = 0

    class Config:
        json_schema_extra = {
            "example": {
                "service_id": "service456",
                "category": "AI",
                "tags": ["text-generation", "gpt", "nlp"],
                "provider_id": "provider789",
                "description": "Advanced text generation service",
                "pricing_model": "PAY_PER_USE",
                "price": 0.01,
                "has_free_tier": True,
                "usage_count": 1000,
                "rating_score": 4.5,
                "rating_count": 50,
                "trending_score": 0.8,
                "age_days": 180,
                "last_updated_days": 5
            }
        }


class ContextFeatures(BaseModel):
    """Context features for a recommendation request"""
    # Temporal
    hour_of_day: int = Field(..., ge=0, lt=24)
    day_of_week: int = Field(..., ge=0, lt=7)
    month: int = Field(..., ge=1, le=12)

    # Session
    session_id: Optional[str] = None
    session_length: float = 0.0  # minutes
    items_viewed_in_session: int = 0

    # Device
    device_type: str = "desktop"  # desktop, mobile, tablet
    platform: str = "web"  # web, ios, android

    # Location (optional)
    country: Optional[str] = None
    timezone: Optional[str] = None

    @validator('hour_of_day')
    def validate_hour(cls, v: int) -> int:
        if not 0 <= v < 24:
            raise ValueError('hour_of_day must be between 0 and 23')
        return v

    @validator('day_of_week')
    def validate_day(cls, v: int) -> int:
        if not 0 <= v < 7:
            raise ValueError('day_of_week must be between 0 and 6')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "hour_of_day": 14,
                "day_of_week": 2,
                "month": 1,
                "session_id": "session123",
                "session_length": 15.5,
                "items_viewed_in_session": 5,
                "device_type": "mobile",
                "platform": "ios",
                "country": "US",
                "timezone": "America/New_York"
            }
        }


class RecommendationRequest(BaseModel):
    """Request for recommendations"""
    user_id: str
    limit: int = Field(default=10, ge=1, le=100)
    context: Optional[ContextFeatures] = None
    exclude_services: List[str] = Field(default_factory=list)
    candidate_services: Optional[List[str]] = None  # If provided, rank these
    diversity_weight: float = Field(default=0.0, ge=0.0, le=1.0)
    novelty_weight: float = Field(default=0.0, ge=0.0, le=1.0)

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "user123",
                "limit": 10,
                "context": {
                    "hour_of_day": 14,
                    "day_of_week": 2,
                    "month": 1,
                    "device_type": "mobile"
                },
                "exclude_services": ["service789"],
                "diversity_weight": 0.2,
                "novelty_weight": 0.1
            }
        }


class RecommendationScore(BaseModel):
    """Score for a single recommendation"""
    service_id: str
    score: float
    rank: int
    algorithm: str
    explanation: Optional[Dict[str, Any]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "service_id": "service456",
                "score": 0.87,
                "rank": 1,
                "algorithm": "neural_cf",
                "explanation": {
                    "collaborative_score": 0.9,
                    "content_score": 0.8,
                    "popularity_score": 0.9
                }
            }
        }


class RecommendationResponse(BaseModel):
    """Response containing recommendations"""
    user_id: str
    recommendations: List[RecommendationScore]
    model_version: str
    timestamp: datetime
    experiment_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "user123",
                "recommendations": [
                    {
                        "service_id": "service456",
                        "score": 0.87,
                        "rank": 1,
                        "algorithm": "neural_cf"
                    }
                ],
                "model_version": "v1.2.3",
                "timestamp": "2025-01-19T12:00:00Z",
                "experiment_id": "exp_abc123"
            }
        }


class ModelMetrics(BaseModel):
    """Evaluation metrics for a model"""
    model_name: str
    model_version: str
    timestamp: datetime

    # Ranking metrics
    precision_at_10: float
    recall_at_10: float
    ndcg_at_10: float
    map_at_10: float
    mrr: float

    # Rating metrics (if applicable)
    rmse: Optional[float] = None
    mae: Optional[float] = None

    # Business metrics
    ctr: Optional[float] = None
    conversion_rate: Optional[float] = None
    coverage: float
    diversity: float
    novelty: float

    class Config:
        json_schema_extra = {
            "example": {
                "model_name": "neural_cf",
                "model_version": "v1.2.3",
                "timestamp": "2025-01-19T12:00:00Z",
                "precision_at_10": 0.75,
                "recall_at_10": 0.60,
                "ndcg_at_10": 0.82,
                "map_at_10": 0.78,
                "mrr": 0.85,
                "rmse": 0.65,
                "mae": 0.52,
                "ctr": 0.15,
                "conversion_rate": 0.08,
                "coverage": 0.65,
                "diversity": 0.72,
                "novelty": 0.55
            }
        }


class TrainingConfig(BaseModel):
    """Configuration for model training"""
    model_type: str
    hyperparameters: Dict[str, Any]
    training_data_start: datetime
    training_data_end: datetime
    validation_split: float = Field(default=0.2, ge=0.0, le=0.5)
    test_split: float = Field(default=0.1, ge=0.0, le=0.5)
    random_seed: int = 42
    batch_size: int = 256
    epochs: int = 10
    early_stopping_patience: int = 3

    class Config:
        json_schema_extra = {
            "example": {
                "model_type": "neural_cf",
                "hyperparameters": {
                    "embedding_dim": 64,
                    "hidden_layers": [128, 64, 32],
                    "dropout": 0.3,
                    "learning_rate": 0.001
                },
                "training_data_start": "2024-01-01T00:00:00Z",
                "training_data_end": "2025-01-01T00:00:00Z",
                "validation_split": 0.2,
                "test_split": 0.1,
                "random_seed": 42,
                "batch_size": 256,
                "epochs": 10,
                "early_stopping_patience": 3
            }
        }
