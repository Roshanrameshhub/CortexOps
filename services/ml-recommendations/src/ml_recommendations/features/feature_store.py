"""
Feature store for managing and serving ML features
"""
import logging
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from functools import lru_cache
import json

logger = logging.getLogger(__name__)


class FeatureStore:
    """
    Feature store for caching and serving user and item features
    """

    def __init__(
        self,
        cache_client=None,
        database_client=None,
        cache_ttl: int = 3600
    ):
        """
        Initialize feature store

        Args:
            cache_client: Redis or similar cache client
            database_client: Database connection
            cache_ttl: Cache time-to-live in seconds
        """
        self.cache_client = cache_client
        self.database_client = database_client
        self.cache_ttl = cache_ttl

        # In-memory feature cache (fallback)
        self._user_features: Dict[str, Dict] = {}
        self._item_features: Dict[str, Dict] = {}
        self._feature_metadata: Dict[str, Any] = {}

        logger.info("FeatureStore initialized")

    async def get_user_features(
        self,
        user_id: str,
        feature_names: Optional[List[str]] = None
    ) -> Optional[Dict]:
        """
        Get features for a user

        Args:
            user_id: User identifier
            feature_names: Specific features to retrieve (None = all)

        Returns:
            Dictionary of user features
        """
        # Try cache first
        cache_key = f"user_features:{user_id}"
        features = await self._get_from_cache(cache_key)

        if features is None:
            # Fetch from database
            features = await self._fetch_user_features_from_db(user_id)

            if features:
                # Cache the result
                await self._save_to_cache(cache_key, features, self.cache_ttl)

        # Filter specific features if requested
        if features and feature_names:
            features = {k: v for k, v in features.items() if k in feature_names}

        return features

    async def get_item_features(
        self,
        item_id: str,
        feature_names: Optional[List[str]] = None
    ) -> Optional[Dict]:
        """
        Get features for an item/service

        Args:
            item_id: Item identifier
            feature_names: Specific features to retrieve (None = all)

        Returns:
            Dictionary of item features
        """
        # Try cache first
        cache_key = f"item_features:{item_id}"
        features = await self._get_from_cache(cache_key)

        if features is None:
            # Fetch from database
            features = await self._fetch_item_features_from_db(item_id)

            if features:
                # Cache the result
                await self._save_to_cache(cache_key, features, self.cache_ttl)

        # Filter specific features if requested
        if features and feature_names:
            features = {k: v for k, v in features.items() if k in feature_names}

        return features

    async def get_batch_user_features(
        self,
        user_ids: List[str],
        feature_names: Optional[List[str]] = None
    ) -> Dict[str, Dict]:
        """
        Get features for multiple users in batch

        Args:
            user_ids: List of user identifiers
            feature_names: Specific features to retrieve

        Returns:
            Dictionary mapping user_id to features
        """
        results = {}

        # Try to get from cache in batch
        cache_keys = [f"user_features:{uid}" for uid in user_ids]
        cached_features = await self._batch_get_from_cache(cache_keys)

        # Identify missing users
        missing_users = []
        for i, user_id in enumerate(user_ids):
            if cached_features[i] is not None:
                results[user_id] = cached_features[i]
            else:
                missing_users.append(user_id)

        # Fetch missing users from database
        if missing_users:
            db_features = await self._fetch_batch_user_features_from_db(missing_users)

            for user_id, features in db_features.items():
                results[user_id] = features

                # Cache the result
                cache_key = f"user_features:{user_id}"
                await self._save_to_cache(cache_key, features, self.cache_ttl)

        # Filter specific features if requested
        if feature_names:
            results = {
                uid: {k: v for k, v in feats.items() if k in feature_names}
                for uid, feats in results.items()
            }

        return results

    async def get_batch_item_features(
        self,
        item_ids: List[str],
        feature_names: Optional[List[str]] = None
    ) -> Dict[str, Dict]:
        """
        Get features for multiple items in batch

        Args:
            item_ids: List of item identifiers
            feature_names: Specific features to retrieve

        Returns:
            Dictionary mapping item_id to features
        """
        results = {}

        # Try to get from cache in batch
        cache_keys = [f"item_features:{iid}" for iid in item_ids]
        cached_features = await self._batch_get_from_cache(cache_keys)

        # Identify missing items
        missing_items = []
        for i, item_id in enumerate(item_ids):
            if cached_features[i] is not None:
                results[item_id] = cached_features[i]
            else:
                missing_items.append(item_id)

        # Fetch missing items from database
        if missing_items:
            db_features = await self._fetch_batch_item_features_from_db(missing_items)

            for item_id, features in db_features.items():
                results[item_id] = features

                # Cache the result
                cache_key = f"item_features:{item_id}"
                await self._save_to_cache(cache_key, features, self.cache_ttl)

        # Filter specific features if requested
        if feature_names:
            results = {
                iid: {k: v for k, v in feats.items() if k in feature_names}
                for iid, feats in results.items()
            }

        return results

    async def update_user_features(
        self,
        user_id: str,
        features: Dict[str, Any]
    ):
        """
        Update features for a user

        Args:
            user_id: User identifier
            features: Feature dictionary to update
        """
        # Update in database
        await self._update_user_features_in_db(user_id, features)

        # Invalidate cache
        cache_key = f"user_features:{user_id}"
        await self._invalidate_cache(cache_key)

        logger.info(f"Updated features for user {user_id}")

    async def update_item_features(
        self,
        item_id: str,
        features: Dict[str, Any]
    ):
        """
        Update features for an item

        Args:
            item_id: Item identifier
            features: Feature dictionary to update
        """
        # Update in database
        await self._update_item_features_in_db(item_id, features)

        # Invalidate cache
        cache_key = f"item_features:{item_id}"
        await self._invalidate_cache(cache_key)

        logger.info(f"Updated features for item {item_id}")

    async def get_feature_metadata(self, feature_name: str) -> Optional[Dict]:
        """
        Get metadata about a feature

        Args:
            feature_name: Name of the feature

        Returns:
            Feature metadata (type, description, etc.)
        """
        return self._feature_metadata.get(feature_name)

    def register_feature(
        self,
        feature_name: str,
        feature_type: str,
        description: str,
        **kwargs
    ):
        """
        Register a feature in the feature store

        Args:
            feature_name: Name of the feature
            feature_type: Type (numerical, categorical, text, etc.)
            description: Human-readable description
            **kwargs: Additional metadata
        """
        self._feature_metadata[feature_name] = {
            "name": feature_name,
            "type": feature_type,
            "description": description,
            "registered_at": datetime.now().isoformat(),
            **kwargs
        }

        logger.info(f"Registered feature: {feature_name}")

    # Private methods - Database operations

    async def _fetch_user_features_from_db(self, user_id: str) -> Optional[Dict]:
        """Fetch user features from database"""
        # Placeholder: In production, query from database
        # For now, return mock features

        logger.debug(f"Fetching user features from DB for {user_id}")

        return {
            "user_id": user_id,
            "account_age_days": 365,
            "total_services_used": 10,
            "avg_rating_given": 4.2,
            "interaction_frequency": 2.5,
            "preferred_categories": ["ai", "data"],
            "price_sensitivity": 0.5,
            "is_new_user": False,
            "is_heavy_user": True,
            "engagement_score": 0.85
        }

    async def _fetch_item_features_from_db(self, item_id: str) -> Optional[Dict]:
        """Fetch item features from database"""
        # Placeholder: In production, query from database

        logger.debug(f"Fetching item features from DB for {item_id}")

        return {
            "service_id": item_id,
            "category": "ai",
            "subcategory": "llm",
            "price_tier": "premium",
            "avg_rating": 4.5,
            "usage_count": 1000,
            "popularity_score": 0.8,
            "trending_score": 0.7,
            "age_days": 180,
            "tags": ["nlp", "gpt", "chatbot"]
        }

    async def _fetch_batch_user_features_from_db(
        self,
        user_ids: List[str]
    ) -> Dict[str, Dict]:
        """Fetch user features for multiple users from database"""
        # Placeholder: In production, use batch query

        logger.debug(f"Fetching batch user features from DB for {len(user_ids)} users")

        results = {}
        for user_id in user_ids:
            results[user_id] = await self._fetch_user_features_from_db(user_id)

        return results

    async def _fetch_batch_item_features_from_db(
        self,
        item_ids: List[str]
    ) -> Dict[str, Dict]:
        """Fetch item features for multiple items from database"""
        # Placeholder: In production, use batch query

        logger.debug(f"Fetching batch item features from DB for {len(item_ids)} items")

        results = {}
        for item_id in item_ids:
            results[item_id] = await self._fetch_item_features_from_db(item_id)

        return results

    async def _update_user_features_in_db(self, user_id: str, features: Dict):
        """Update user features in database"""
        # Placeholder: In production, execute UPDATE query
        logger.debug(f"Updating user features in DB for {user_id}")

    async def _update_item_features_in_db(self, item_id: str, features: Dict):
        """Update item features in database"""
        # Placeholder: In production, execute UPDATE query
        logger.debug(f"Updating item features in DB for {item_id}")

    # Private methods - Cache operations

    async def _get_from_cache(self, key: str) -> Optional[Dict]:
        """Get value from cache"""
        if not self.cache_client:
            return None

        try:
            value = self.cache_client.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.warning(f"Cache get error for key {key}: {e}")

        return None

    async def _batch_get_from_cache(self, keys: List[str]) -> List[Optional[Dict]]:
        """Get multiple values from cache"""
        if not self.cache_client:
            return [None] * len(keys)

        try:
            values = self.cache_client.mget(keys)
            return [
                json.loads(v) if v else None
                for v in values
            ]
        except Exception as e:
            logger.warning(f"Cache batch get error: {e}")
            return [None] * len(keys)

    async def _save_to_cache(self, key: str, value: Dict, ttl: int):
        """Save value to cache"""
        if not self.cache_client:
            return

        try:
            self.cache_client.setex(
                key,
                ttl,
                json.dumps(value)
            )
        except Exception as e:
            logger.warning(f"Cache set error for key {key}: {e}")

    async def _invalidate_cache(self, key: str):
        """Invalidate cache entry"""
        if not self.cache_client:
            return

        try:
            self.cache_client.delete(key)
        except Exception as e:
            logger.warning(f"Cache invalidate error for key {key}: {e}")

    def get_stats(self) -> Dict:
        """Get feature store statistics"""
        return {
            "registered_features": len(self._feature_metadata),
            "cache_enabled": self.cache_client is not None,
            "database_enabled": self.database_client is not None,
            "cache_ttl": self.cache_ttl
        }
