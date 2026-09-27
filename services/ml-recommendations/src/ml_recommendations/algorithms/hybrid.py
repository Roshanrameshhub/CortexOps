"""
Hybrid recommendation models combining multiple algorithms
"""
import numpy as np
from typing import List, Dict, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class HybridRecommender:
    """
    Hybrid recommender combining multiple recommendation algorithms
    """

    def __init__(self, models: Dict[str, any], default_weights: Optional[Dict[str, float]] = None):
        """
        Initialize hybrid recommender

        Args:
            models: Dictionary of {model_name: model_instance}
            default_weights: Default weights for each model
        """
        self.models = models
        self.default_weights = default_weights or {name: 1.0 / len(models) for name in models}

        # Normalize weights
        total_weight = sum(self.default_weights.values())
        self.default_weights = {k: v / total_weight for k, v in self.default_weights.items()}

        logger.info(f"Initialized hybrid recommender with {len(models)} models")
        logger.info(f"Model weights: {self.default_weights}")

    def recommend(
        self,
        user_id: str,
        n: int = 10,
        exclude_items: Optional[List[str]] = None,
        weights: Optional[Dict[str, float]] = None
    ) -> List[Tuple[str, float]]:
        """
        Get hybrid recommendations

        Args:
            user_id: User identifier
            n: Number of recommendations
            exclude_items: Items to exclude
            weights: Custom weights for this request

        Returns:
            List of (item_id, score) tuples
        """
        # Use custom weights or default
        weights = weights or self.default_weights

        # Get recommendations from each model
        all_recommendations: Dict[str, Dict[str, float]] = {}

        for model_name, model in self.models.items():
            try:
                recs = model.recommend(user_id, n=n * 2, exclude_items=exclude_items)
                all_recommendations[model_name] = {item_id: score for item_id, score in recs}
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")
                continue

        # Combine scores
        combined_scores = self._weighted_average(all_recommendations, weights)

        # Sort and get top-N
        sorted_items = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_items[:n]

    def _weighted_average(
        self,
        model_scores: Dict[str, Dict[str, float]],
        weights: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Combine scores using weighted average

        Args:
            model_scores: Scores from each model
            weights: Weights for each model

        Returns:
            Combined scores
        """
        combined: Dict[str, float] = {}
        item_counts: Dict[str, int] = {}

        # Collect all items
        all_items = set()
        for scores in model_scores.values():
            all_items.update(scores.keys())

        # Calculate weighted average
        for item_id in all_items:
            total_score = 0.0
            total_weight = 0.0

            for model_name, scores in model_scores.items():
                if item_id in scores:
                    model_weight = weights.get(model_name, 0.0)
                    total_score += scores[item_id] * model_weight
                    total_weight += model_weight

            if total_weight > 0:
                combined[item_id] = total_score / total_weight

        return combined

    def personalized_weights(self, user_profile: Dict) -> Dict[str, float]:
        """
        Calculate personalized model weights based on user profile

        Args:
            user_profile: User profile information

        Returns:
            Personalized model weights
        """
        weights = self.default_weights.copy()

        # Adjust weights based on user characteristics
        if user_profile.get('is_new_user', False):
            # New users: favor popularity and content-based
            weights['popularity'] = weights.get('popularity', 0.0) * 1.5
            weights['content_based'] = weights.get('content_based', 0.0) * 1.3
            weights['collaborative'] = weights.get('collaborative', 0.0) * 0.5

        elif user_profile.get('is_heavy_user', False):
            # Heavy users: favor collaborative and deep learning
            weights['collaborative'] = weights.get('collaborative', 0.0) * 1.5
            weights['neural_cf'] = weights.get('neural_cf', 0.0) * 1.5
            weights['popularity'] = weights.get('popularity', 0.0) * 0.5

        # Normalize
        total = sum(weights.values())
        if total > 0:
            weights = {k: v / total for k, v in weights.items()}

        return weights


class StackingEnsemble:
    """
    Stacking ensemble for recommendations
    Uses a meta-learner to combine base model predictions
    """

    def __init__(
        self,
        base_models: Dict[str, any],
        meta_learner: any
    ):
        """
        Initialize stacking ensemble

        Args:
            base_models: Dictionary of base models
            meta_learner: Meta-learner model
        """
        self.base_models = base_models
        self.meta_learner = meta_learner
        logger.info(f"Initialized stacking ensemble with {len(base_models)} base models")

    def fit_meta_learner(
        self,
        train_data: Tuple[np.ndarray, np.ndarray],
        val_data: Optional[Tuple[np.ndarray, np.ndarray]] = None
    ):
        """
        Train meta-learner on base model predictions

        Args:
            train_data: Training data (X, y)
            val_data: Validation data
        """
        X, y = train_data

        # Get predictions from base models
        base_predictions = []
        for model_name, model in self.base_models.items():
            logger.info(f"Getting predictions from {model_name}...")
            preds = model.predict(X)
            base_predictions.append(preds)

        # Stack predictions as features
        stacked_features = np.column_stack(base_predictions)

        # Train meta-learner
        logger.info("Training meta-learner...")
        self.meta_learner.fit(stacked_features, y)
        logger.info("Meta-learner trained")

    def recommend(
        self,
        user_id: str,
        candidate_items: List[str],
        n: int = 10
    ) -> List[Tuple[str, float]]:
        """
        Get recommendations using stacking ensemble

        Args:
            user_id: User identifier
            candidate_items: Candidate items to rank
            n: Number of recommendations

        Returns:
            List of (item_id, score) tuples
        """
        # Get predictions from base models for each candidate
        scores_matrix = []

        for model_name, model in self.base_models.items():
            model_scores = []
            for item_id in candidate_items:
                score = model.predict(user_id, item_id)
                model_scores.append(score)
            scores_matrix.append(model_scores)

        # Stack as features
        stacked_features = np.column_stack(scores_matrix)

        # Get meta-learner predictions
        final_scores = self.meta_learner.predict(stacked_features)

        # Combine with item_ids and sort
        item_scores = list(zip(candidate_items, final_scores))
        item_scores.sort(key=lambda x: x[1], reverse=True)

        return item_scores[:n]


class MultiObjectiveRecommender:
    """
    Multi-objective recommender optimizing multiple goals
    E.g., accuracy, diversity, novelty, coverage
    """

    def __init__(
        self,
        base_recommender: any,
        objectives: Dict[str, float]
    ):
        """
        Initialize multi-objective recommender

        Args:
            base_recommender: Base recommendation model
            objectives: Dictionary of {objective_name: weight}
        """
        self.base_recommender = base_recommender
        self.objectives = objectives

        # Normalize weights
        total = sum(objectives.values())
        self.objectives = {k: v / total for k, v in objectives.items()}

        logger.info(f"Initialized multi-objective recommender")
        logger.info(f"Objectives: {self.objectives}")

    def recommend(
        self,
        user_id: str,
        n: int = 10,
        exclude_items: Optional[List[str]] = None,
        user_history: Optional[List[str]] = None
    ) -> List[Tuple[str, float]]:
        """
        Get multi-objective recommendations

        Args:
            user_id: User identifier
            n: Number of recommendations
            exclude_items: Items to exclude
            user_history: User's historical items

        Returns:
            List of (item_id, score) tuples
        """
        # Get base recommendations (more than needed for diversity)
        base_recs = self.base_recommender.recommend(
            user_id,
            n=n * 5,
            exclude_items=exclude_items
        )

        # Calculate multi-objective scores
        scored_items = []
        for item_id, base_score in base_recs:
            scores = {'accuracy': base_score}

            # Diversity score
            if self.objectives.get('diversity', 0) > 0 and scored_items:
                diversity = self._calculate_diversity(item_id, [s[0] for s in scored_items])
                scores['diversity'] = diversity

            # Novelty score
            if self.objectives.get('novelty', 0) > 0 and user_history:
                novelty = self._calculate_novelty(item_id, user_history)
                scores['novelty'] = novelty

            # Combined score
            combined_score = sum(
                scores.get(obj, 0) * weight
                for obj, weight in self.objectives.items()
            )

            scored_items.append((item_id, combined_score))

        # Re-rank based on combined scores
        scored_items.sort(key=lambda x: x[1], reverse=True)
        return scored_items[:n]

    def _calculate_diversity(self, item_id: str, current_items: List[str]) -> float:
        """Calculate diversity score"""
        # Simple diversity: inverse of similarity to current items
        # In production, use actual item similarity
        return 1.0 / (len(current_items) + 1)

    def _calculate_novelty(self, item_id: str, user_history: List[str]) -> float:
        """Calculate novelty score"""
        # Novelty: 1.0 if item not in history, lower if similar items in history
        if item_id in user_history:
            return 0.0
        return 1.0


class ContextAwareHybrid:
    """
    Context-aware hybrid recommender
    Adjusts model weights based on context
    """

    def __init__(
        self,
        models: Dict[str, any],
        context_weights: Dict[str, Dict[str, float]]
    ):
        """
        Initialize context-aware hybrid

        Args:
            models: Dictionary of models
            context_weights: Model weights for different contexts
        """
        self.models = models
        self.context_weights = context_weights
        logger.info("Initialized context-aware hybrid recommender")

    def recommend(
        self,
        user_id: str,
        context: Dict,
        n: int = 10,
        exclude_items: Optional[List[str]] = None
    ) -> List[Tuple[str, float]]:
        """
        Get context-aware recommendations

        Args:
            user_id: User identifier
            context: Context information
            n: Number of recommendations
            exclude_items: Items to exclude

        Returns:
            List of (item_id, score) tuples
        """
        # Determine context type
        context_type = self._determine_context(context)

        # Get context-specific weights
        weights = self.context_weights.get(context_type, {})
        if not weights:
            # Default equal weights
            weights = {name: 1.0 / len(self.models) for name in self.models}

        logger.info(f"Using context: {context_type} with weights: {weights}")

        # Get recommendations from each model
        all_recs = {}
        for model_name, model in self.models.items():
            try:
                recs = model.recommend(user_id, n=n * 2, exclude_items=exclude_items)
                all_recs[model_name] = {item_id: score for item_id, score in recs}
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")

        # Weighted combination
        combined = {}
        for model_name, recs in all_recs.items():
            weight = weights.get(model_name, 0.0)
            for item_id, score in recs.items():
                combined[item_id] = combined.get(item_id, 0.0) + score * weight

        # Sort and return top-N
        sorted_items = sorted(combined.items(), key=lambda x: x[1], reverse=True)
        return sorted_items[:n]

    def _determine_context(self, context: Dict) -> str:
        """Determine context type from context features"""
        # Example logic - customize based on your needs
        hour = context.get('hour_of_day', 12)
        device = context.get('device_type', 'desktop')

        if device == 'mobile':
            return 'mobile'
        elif 9 <= hour < 17:
            return 'work_hours'
        elif 17 <= hour < 22:
            return 'evening'
        else:
            return 'default'
