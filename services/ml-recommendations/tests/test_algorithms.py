"""
Tests for recommendation algorithms
"""
import pytest
import numpy as np
from ml_recommendations.algorithms.collaborative_filtering import (
    SVDRecommender,
    NMFRecommender
)
from ml_recommendations.algorithms.hybrid import HybridRecommender


@pytest.fixture
def sample_interaction_matrix():
    """Create sample interaction matrix for testing"""
    # 10 users x 20 items
    matrix = np.random.rand(10, 20)
    # Add some sparsity
    matrix[matrix < 0.7] = 0
    return matrix


@pytest.fixture
def sample_id_maps():
    """Create sample ID mappings"""
    user_id_map = {f"user_{i}": i for i in range(10)}
    item_id_map = {f"item_{i}": i for i in range(20)}
    return user_id_map, item_id_map


def test_svd_fit(sample_interaction_matrix, sample_id_maps):
    """Test SVD model fitting"""
    user_id_map, item_id_map = sample_id_maps

    model = SVDRecommender(n_factors=5)
    model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    assert model.user_factors is not None
    assert model.item_factors is not None
    assert model.sigma is not None
    assert model.user_factors.shape == (10, 5)


def test_svd_recommend(sample_interaction_matrix, sample_id_maps):
    """Test SVD recommendations"""
    user_id_map, item_id_map = sample_id_maps

    model = SVDRecommender(n_factors=5)
    model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    recommendations = model.recommend("user_0", n=5)

    assert len(recommendations) <= 5
    assert all(isinstance(item_id, str) for item_id, score in recommendations)
    assert all(isinstance(score, float) for item_id, score in recommendations)


def test_svd_predict(sample_interaction_matrix, sample_id_maps):
    """Test SVD prediction"""
    user_id_map, item_id_map = sample_id_maps

    model = SVDRecommender(n_factors=5)
    model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    prediction = model.predict("user_0", "item_0")

    assert isinstance(prediction, (int, float))
    assert 0 <= prediction <= 5


def test_nmf_fit(sample_interaction_matrix, sample_id_maps):
    """Test NMF model fitting"""
    user_id_map, item_id_map = sample_id_maps

    model = NMFRecommender(n_components=5, max_iter=10)
    model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    assert model.user_factors is not None
    assert model.item_factors is not None
    assert model.user_factors.shape == (10, 5)


def test_nmf_recommend(sample_interaction_matrix, sample_id_maps):
    """Test NMF recommendations"""
    user_id_map, item_id_map = sample_id_maps

    model = NMFRecommender(n_components=5, max_iter=10)
    model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    recommendations = model.recommend("user_0", n=5)

    assert len(recommendations) <= 5
    assert all(isinstance(item_id, str) for item_id, score in recommendations)


def test_hybrid_recommender(sample_interaction_matrix, sample_id_maps):
    """Test hybrid recommender"""
    user_id_map, item_id_map = sample_id_maps

    # Create base models
    svd_model = SVDRecommender(n_factors=5)
    svd_model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    nmf_model = NMFRecommender(n_components=5, max_iter=10)
    nmf_model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    # Create hybrid
    models = {"svd": svd_model, "nmf": nmf_model}
    weights = {"svd": 0.5, "nmf": 0.5}

    hybrid = HybridRecommender(models=models, default_weights=weights)

    recommendations = hybrid.recommend("user_0", n=5)

    assert len(recommendations) <= 5
    assert all(isinstance(item_id, str) for item_id, score in recommendations)


def test_hybrid_personalized_weights(sample_interaction_matrix, sample_id_maps):
    """Test personalized weight calculation"""
    user_id_map, item_id_map = sample_id_maps

    svd_model = SVDRecommender(n_factors=5)
    svd_model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    nmf_model = NMFRecommender(n_components=5, max_iter=10)
    nmf_model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    models = {"svd": svd_model, "nmf": nmf_model}
    weights = {"svd": 0.5, "nmf": 0.5}

    hybrid = HybridRecommender(models=models, default_weights=weights)

    # Test with new user profile
    user_profile = {"is_new_user": True}
    personalized = hybrid.personalized_weights(user_profile)

    assert isinstance(personalized, dict)
    assert sum(personalized.values()) == pytest.approx(1.0, rel=0.01)


def test_recommend_with_exclusions(sample_interaction_matrix, sample_id_maps):
    """Test recommendations with exclusions"""
    user_id_map, item_id_map = sample_id_maps

    model = SVDRecommender(n_factors=5)
    model.fit(sample_interaction_matrix, user_id_map, item_id_map)

    exclude = ["item_0", "item_1", "item_2"]
    recommendations = model.recommend("user_0", n=5, exclude_items=exclude)

    rec_ids = [item_id for item_id, score in recommendations]

    for excluded in exclude:
        assert excluded not in rec_ids
