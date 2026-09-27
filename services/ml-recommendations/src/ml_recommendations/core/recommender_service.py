"""
Core recommendation service orchestrating multiple models
"""
import logging
import numpy as np
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
import asyncio
from functools import lru_cache

from ml_recommendations.models.data_models import (
    UserInteraction,
    RecommendationScore,
    ModelMetrics
)
from ml_recommendations.algorithms.collaborative_filtering import (
    SVDRecommender,
    ALSRecommender,
    NMFRecommender
)
from ml_recommendations.algorithms.hybrid import (
    HybridRecommender,
    MultiObjectiveRecommender,
    ContextAwareHybrid
)
from ml_recommendations.features.feature_engineering import FeatureEngineer

logger = logging.getLogger(__name__)


class RecommenderService:
    """
    Main recommendation service coordinating multiple models and strategies
    """

    def __init__(
        self,
        model_config: Optional[Dict] = None,
        feature_store=None,
        cache_client=None
    ):
        """
        Initialize recommender service

        Args:
            model_config: Configuration for models
            feature_store: Feature store instance
            cache_client: Redis cache client
        """
        self.model_config = model_config or self._default_config()
        self.feature_store = feature_store
        self.cache_client = cache_client

        # Model registry
        self.models: Dict[str, Any] = {}
        self.hybrid_model: Optional[HybridRecommender] = None
        self.feature_engineer = FeatureEngineer()

        # Model metadata
        self.model_version = "1.0.0"
        self.model_updated_at = datetime.now()

        # Performance tracking
        self.request_count = 0
        self.cache_hits = 0

        # Initialize models
        self._initialize_models()

        logger.info("RecommenderService initialized")

    def _default_config(self) -> Dict:
        """Default model configuration"""
        return {
            "svd": {
                "enabled": True,
                "n_factors": 50,
                "weight": 0.3
            },
            "als": {
                "enabled": True,
                "factors": 50,
                "weight": 0.3
            },
            "nmf": {
                "enabled": True,
                "n_components": 50,
                "weight": 0.2
            },
            "neural_cf": {
                "enabled": False,  # Requires trained model
                "weight": 0.2
            },
            "hybrid": {
                "enabled": True,
                "diversity_weight": 0.1,
                "novelty_weight": 0.1
            },
            "cache": {
                "ttl": 3600,  # 1 hour
                "enabled": True
            }
        }

    def _initialize_models(self):
        """Initialize recommendation models"""
        logger.info("Initializing recommendation models...")

        # Initialize SVD
        if self.model_config.get("svd", {}).get("enabled"):
            self.models["svd"] = SVDRecommender(
                n_factors=self.model_config["svd"].get("n_factors", 50)
            )
            logger.info("SVD model initialized")

        # Initialize ALS
        if self.model_config.get("als", {}).get("enabled"):
            try:
                self.models["als"] = ALSRecommender(
                    factors=self.model_config["als"].get("factors", 50)
                )
                logger.info("ALS model initialized")
            except ImportError:
                logger.warning("ALS model disabled: implicit library not available")

        # Initialize NMF
        if self.model_config.get("nmf", {}).get("enabled"):
            self.models["nmf"] = NMFRecommender(
                n_components=self.model_config["nmf"].get("n_components", 50)
            )
            logger.info("NMF model initialized")

        # Initialize hybrid model if multiple models available
        if len(self.models) > 1:
            weights = {
                name: self.model_config.get(name, {}).get("weight", 1.0 / len(self.models))
                for name in self.models.keys()
            }
            self.hybrid_model = HybridRecommender(
                models=self.models,
                default_weights=weights
            )
            logger.info(f"Hybrid model initialized with {len(self.models)} base models")

    async def recommend(
        self,
        user_id: str,
        limit: int = 10,
        context: Optional[Dict] = None,
        exclude_services: Optional[List[str]] = None,
        candidate_services: Optional[List[str]] = None,
        diversity_weight: float = 0.0,
        novelty_weight: float = 0.0,
        model_variant: str = 'default'
    ) -> List[Dict]:
        """
        Get personalized recommendations for a user

        Args:
            user_id: User identifier
            limit: Number of recommendations
            context: Context information (time, device, etc.)
            exclude_services: Services to exclude
            candidate_services: Specific candidates to rank
            diversity_weight: Weight for diversity objective
            novelty_weight: Weight for novelty objective
            model_variant: Model variant for A/B testing

        Returns:
            List of recommendation dictionaries
        """
        self.request_count += 1

        # Check cache
        cache_key = f"rec:{user_id}:{limit}:{model_variant}"
        if self.cache_client and self.model_config.get("cache", {}).get("enabled"):
            cached = await self._get_from_cache(cache_key)
            if cached:
                self.cache_hits += 1
                logger.debug(f"Cache hit for user {user_id}")
                return cached

        try:
            # Get user history for filtering
            user_history = await self._get_user_history(user_id)

            # Add user history to exclusions
            exclude_services = exclude_services or []
            exclude_services.extend(user_history)

            # Choose recommendation strategy
            if diversity_weight > 0 or novelty_weight > 0:
                # Multi-objective optimization
                recommendations = await self._multi_objective_recommend(
                    user_id=user_id,
                    limit=limit,
                    exclude_items=exclude_services,
                    user_history=user_history,
                    diversity_weight=diversity_weight,
                    novelty_weight=novelty_weight
                )
            elif context:
                # Context-aware recommendations
                recommendations = await self._context_aware_recommend(
                    user_id=user_id,
                    context=context,
                    limit=limit,
                    exclude_items=exclude_services
                )
            elif self.hybrid_model:
                # Hybrid model
                recommendations = await self._hybrid_recommend(
                    user_id=user_id,
                    limit=limit,
                    exclude_items=exclude_services
                )
            else:
                # Single model (fallback)
                model = list(self.models.values())[0]
                recs = model.recommend(
                    user_id=user_id,
                    n=limit,
                    exclude_items=exclude_services
                )
                recommendations = [
                    {
                        "service_id": item_id,
                        "score": float(score),
                        "algorithm": "single_model"
                    }
                    for item_id, score in recs
                ]

            # Cache results
            if self.cache_client and self.model_config.get("cache", {}).get("enabled"):
                await self._save_to_cache(
                    cache_key,
                    recommendations,
                    ttl=self.model_config["cache"].get("ttl", 3600)
                )

            logger.info(f"Generated {len(recommendations)} recommendations for user {user_id}")
            return recommendations

        except Exception as e:
            logger.error(f"Error generating recommendations: {e}", exc_info=True)
            # Fallback to popular items
            return await self._get_popular_fallback(limit)

    async def _hybrid_recommend(
        self,
        user_id: str,
        limit: int,
        exclude_items: Optional[List[str]] = None
    ) -> List[Dict]:
        """Get recommendations using hybrid model"""
        if not self.hybrid_model:
            raise ValueError("Hybrid model not initialized")

        # Get user profile for personalized weights
        user_profile = await self._get_user_profile(user_id)
        weights = None
        if user_profile:
            weights = self.hybrid_model.personalized_weights(user_profile)

        # Get recommendations
        recs = self.hybrid_model.recommend(
            user_id=user_id,
            n=limit,
            exclude_items=exclude_items,
            weights=weights
        )

        return [
            {
                "service_id": item_id,
                "score": float(score),
                "algorithm": "hybrid",
                "explanation": self._generate_explanation(user_id, item_id, "hybrid")
            }
            for item_id, score in recs
        ]

    async def _multi_objective_recommend(
        self,
        user_id: str,
        limit: int,
        exclude_items: Optional[List[str]],
        user_history: List[str],
        diversity_weight: float,
        novelty_weight: float
    ) -> List[Dict]:
        """Get recommendations with multi-objective optimization"""
        # Use base recommender (hybrid or single)
        base_recommender = self.hybrid_model if self.hybrid_model else list(self.models.values())[0]

        # Create multi-objective recommender
        objectives = {
            "accuracy": 1.0 - diversity_weight - novelty_weight,
            "diversity": diversity_weight,
            "novelty": novelty_weight
        }

        mo_recommender = MultiObjectiveRecommender(
            base_recommender=base_recommender,
            objectives=objectives
        )

        recs = mo_recommender.recommend(
            user_id=user_id,
            n=limit,
            exclude_items=exclude_items,
            user_history=user_history
        )

        return [
            {
                "service_id": item_id,
                "score": float(score),
                "algorithm": "multi_objective",
                "explanation": f"Balanced for diversity ({diversity_weight:.2f}) and novelty ({novelty_weight:.2f})"
            }
            for item_id, score in recs
        ]

    async def _context_aware_recommend(
        self,
        user_id: str,
        context: Dict,
        limit: int,
        exclude_items: Optional[List[str]]
    ) -> List[Dict]:
        """Get context-aware recommendations"""
        # Define context-specific model weights
        context_weights = {
            "mobile": {
                "svd": 0.4,
                "als": 0.4,
                "nmf": 0.2
            },
            "work_hours": {
                "svd": 0.3,
                "als": 0.5,
                "nmf": 0.2
            },
            "evening": {
                "svd": 0.3,
                "als": 0.3,
                "nmf": 0.4
            },
            "default": {
                "svd": 0.33,
                "als": 0.33,
                "nmf": 0.34
            }
        }

        context_hybrid = ContextAwareHybrid(
            models=self.models,
            context_weights=context_weights
        )

        recs = context_hybrid.recommend(
            user_id=user_id,
            context=context,
            n=limit,
            exclude_items=exclude_items
        )

        return [
            {
                "service_id": item_id,
                "score": float(score),
                "algorithm": "context_aware",
                "explanation": self._generate_explanation(user_id, item_id, "context")
            }
            for item_id, score in recs
        ]

    async def get_similar_items(
        self,
        item_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """
        Get items similar to the given item

        Args:
            item_id: Item identifier
            limit: Number of similar items

        Returns:
            List of similar items
        """
        # Use ALS model for item similarity if available
        if "als" in self.models:
            try:
                similar = self.models["als"].similar_items(item_id, n=limit)
                return [
                    {
                        "service_id": similar_id,
                        "similarity_score": float(score),
                        "algorithm": "als_similarity"
                    }
                    for similar_id, score in similar
                ]
            except Exception as e:
                logger.warning(f"Error getting similar items with ALS: {e}")

        # Fallback: use item features
        return await self._content_based_similar(item_id, limit)

    async def _content_based_similar(self, item_id: str, limit: int) -> List[Dict]:
        """Get similar items using content-based filtering"""
        # This would use item features from feature store
        # Placeholder implementation
        logger.warning("Content-based similarity not fully implemented")
        return []

    async def get_trending(
        self,
        limit: int = 20,
        category: Optional[str] = None,
        time_window_days: int = 7
    ) -> List[Dict]:
        """
        Get trending items

        Args:
            limit: Number of trending items
            category: Optional category filter
            time_window_days: Time window for trending calculation

        Returns:
            List of trending items
        """
        # Get recent interactions from feature store or database
        trending_items = await self._calculate_trending(
            time_window_days=time_window_days,
            category=category
        )

        return trending_items[:limit]

    async def _calculate_trending(
        self,
        time_window_days: int,
        category: Optional[str]
    ) -> List[Dict]:
        """Calculate trending items based on recent activity"""
        # Placeholder: In production, query from analytics database
        # Trending score = weighted sum of recent interactions
        # with time decay

        # Mock trending data
        trending = [
            {
                "service_id": f"service_{i}",
                "trending_score": 0.9 - (i * 0.05),
                "interaction_count": 1000 - (i * 50),
                "category": category or "general"
            }
            for i in range(20)
        ]

        return trending

    async def get_popular_by_category(
        self,
        user_id: str,
        limit: int = 5
    ) -> Dict[str, List[Dict]]:
        """
        Get popular items by user's preferred categories

        Args:
            user_id: User identifier
            limit: Items per category

        Returns:
            Dictionary of {category: [items]}
        """
        # Get user's preferred categories
        user_profile = await self._get_user_profile(user_id)
        categories = user_profile.get("preferred_categories", ["ai", "data", "compute"]) if user_profile else ["ai", "data", "compute"]

        result = {}
        for category in categories[:3]:  # Top 3 categories
            popular = await self.get_trending(limit=limit, category=category)
            result[category] = popular

        return result

    async def get_related_to_history(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """
        Get items related to user's history

        Args:
            user_id: User identifier
            limit: Number of recommendations

        Returns:
            List of related items
        """
        # Get user history
        history = await self._get_user_history(user_id)

        if not history:
            return []

        # Get similar items for recent history items
        recent_items = history[:5]  # Last 5 items
        related = []

        for item_id in recent_items:
            similar = await self.get_similar_items(item_id, limit=3)
            related.extend(similar)

        # Remove duplicates and limit
        seen = set()
        unique_related = []
        for item in related:
            if item["service_id"] not in seen:
                seen.add(item["service_id"])
                unique_related.append(item)

        return unique_related[:limit]

    async def track_interaction(self, interaction: UserInteraction):
        """
        Track user interaction for future model updates

        Args:
            interaction: User interaction data
        """
        logger.info(
            f"Tracking {interaction.interaction_type} for user {interaction.user_id} "
            f"on service {interaction.service_id}"
        )

        # In production: save to database/data warehouse
        # For now: log for batch processing

        # Invalidate cache for user
        if self.cache_client:
            await self._invalidate_user_cache(interaction.user_id)

    async def process_feedback(
        self,
        user_id: str,
        service_id: str,
        feedback_type: str,
        value: Optional<br>
    ):
        """Process user feedback"""
        logger.info(f"Processing feedback: {feedback_type} from {user_id} on {service_id}")

        # Store feedback for model retraining
        # Invalidate cache
        if self.cache_client:
            await self._invalidate_user_cache(user_id)

    async def list_models(self) -> List[Dict]:
        """List available models"""
        return [
            {
                "name": name,
                "type": type(model).__name__,
                "version": self.model_version,
                "enabled": True,
                "weight": self.model_config.get(name, {}).get("weight", 0.0)
            }
            for name, model in self.models.items()
        ]

    async def get_model_metrics(self, model_name: str) -> Optional[ModelMetrics]:
        """Get metrics for a specific model"""
        if model_name not in self.models:
            return None

        # In production: load from metrics store
        # Placeholder metrics
        return ModelMetrics(
            model_name=model_name,
            model_version=self.model_version,
            precision_at_k=0.75,
            recall_at_k=0.65,
            ndcg_at_k=0.80,
            map_at_k=0.72,
            coverage=0.85,
            diversity=0.70,
            novelty=0.65,
            training_date=self.model_updated_at,
            evaluation_date=datetime.now(),
            sample_size=10000
        )

    # Helper methods

    async def _get_user_history(self, user_id: str) -> List[str]:
        """Get user's interaction history"""
        # In production: query from database
        # Placeholder
        return []

    async def _get_user_profile(self, user_id: str) -> Optional[Dict]:
        """Get user profile"""
        # In production: query from feature store
        # Placeholder
        return {
            "user_id": user_id,
            "is_new_user": False,
            "is_heavy_user": False,
            "preferred_categories": ["ai", "data"],
            "avg_rating": 4.2
        }

    async def _get_popular_fallback(self, limit: int) -> List[Dict]:
        """Get popular items as fallback"""
        return await self.get_trending(limit=limit)

    def _generate_explanation(self, user_id: str, item_id: str, algorithm: str) -> Optional[str]:
        """Generate human-readable explanation"""
        explanations = {
            "hybrid": "Based on your preferences and similar users",
            "context": "Recommended for your current context",
            "collaborative": "Users like you also liked this",
            "content": "Similar to items you've enjoyed"
        }
        return explanations.get(algorithm)

    async def _get_from_cache(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.cache_client:
            return None

        try:
            # Placeholder: implement Redis get
            return None
        except Exception as e:
            logger.warning(f"Cache get error: {e}")
            return None

    async def _save_to_cache(self, key: str, value: Any, ttl: int):
        """Save value to cache"""
        if not self.cache_client:
            return

        try:
            # Placeholder: implement Redis set with TTL
            pass
        except Exception as e:
            logger.warning(f"Cache set error: {e}")

    async def _invalidate_user_cache(self, user_id: str):
        """Invalidate all cache entries for a user"""
        if not self.cache_client:
            return

        try:
            # Placeholder: implement cache invalidation
            pass
        except Exception as e:
            logger.warning(f"Cache invalidation error: {e}")

    def get_stats(self) -> Dict:
        """Get service statistics"""
        return {
            "request_count": self.request_count,
            "cache_hits": self.cache_hits,
            "cache_hit_rate": self.cache_hits / max(self.request_count, 1),
            "models_loaded": len(self.models),
            "model_version": self.model_version,
            "uptime": (datetime.now() - self.model_updated_at).total_seconds()
        }
