"""
Tests for RecommenderService
"""
import pytest
import numpy as np
from ml_recommendations.core.recommender_service import RecommenderService
from ml_recommendations.models.data_models import UserInteraction, InteractionType
from datetime import datetime


@pytest.fixture
def recommender_service():
    """Create recommender service for testing"""
    config = {
        "svd": {"enabled": True, "n_factors": 10, "weight": 0.5},
        "als": {"enabled": False},  # Disable ALS for testing
        "nmf": {"enabled": True, "n_components": 10, "weight": 0.5},
        "cache": {"enabled": False}  # Disable cache for testing
    }
    return RecommenderService(model_config=config)


@pytest.mark.asyncio
async def test_recommend(recommender_service):
    """Test basic recommendation"""
    recommendations = await recommender_service.recommend(
        user_id="test_user_1",
        limit=10
    )

    assert isinstance(recommendations, list)
    # May be empty if models not trained, but should not error


@pytest.mark.asyncio
async def test_recommend_with_exclusions(recommender_service):
    """Test recommendation with exclusions"""
    exclude = ["service_1", "service_2"]

    recommendations = await recommender_service.recommend(
        user_id="test_user_1",
        limit=10,
        exclude_services=exclude
    )

    # Verify excluded services not in recommendations
    rec_ids = [rec["service_id"] for rec in recommendations]
    for excluded_id in exclude:
        assert excluded_id not in rec_ids


@pytest.mark.asyncio
async def test_get_similar_items(recommender_service):
    """Test similar items retrieval"""
    similar = await recommender_service.get_similar_items(
        item_id="test_service_1",
        limit=5
    )

    assert isinstance(similar, list)
    assert len(similar) <= 5


@pytest.mark.asyncio
async def test_get_trending(recommender_service):
    """Test trending items"""
    trending = await recommender_service.get_trending(limit=10)

    assert isinstance(trending, list)
    assert len(trending) <= 10


@pytest.mark.asyncio
async def test_track_interaction(recommender_service):
    """Test interaction tracking"""
    interaction = UserInteraction(
        user_id="test_user_1",
        service_id="test_service_1",
        interaction_type=InteractionType.CLICK,
        timestamp=datetime.now()
    )

    # Should not raise error
    await recommender_service.track_interaction(interaction)


@pytest.mark.asyncio
async def test_list_models(recommender_service):
    """Test model listing"""
    models = await recommender_service.list_models()

    assert isinstance(models, list)
    assert len(models) > 0

    for model in models:
        assert "name" in model
        assert "type" in model
        assert "version" in model


@pytest.mark.asyncio
async def test_get_model_metrics(recommender_service):
    """Test model metrics retrieval"""
    models = await recommender_service.list_models()

    if models:
        model_name = models[0]["name"]
        metrics = await recommender_service.get_model_metrics(model_name)

        assert metrics is not None
        assert metrics.model_name == model_name


def test_service_initialization(recommender_service):
    """Test service initialization"""
    assert recommender_service is not None
    assert recommender_service.models is not None
    assert len(recommender_service.models) > 0


def test_get_stats(recommender_service):
    """Test service statistics"""
    stats = recommender_service.get_stats()

    assert "request_count" in stats
    assert "cache_hits" in stats
    assert "models_loaded" in stats
    assert "model_version" in stats
