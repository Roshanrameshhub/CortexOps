"""
Collaborative Filtering algorithms for recommendations
"""
import numpy as np
import pandas as pd
from typing import List, Tuple, Optional, Dict
from scipy.sparse.linalg import svds
from scipy.sparse import csr_matrix
from sklearn.decomposition import NMF
import logging

try:
    from implicit.als import AlternatingLeastSquares
    from implicit.bpr import BayesianPersonalizedRanking
    IMPLICIT_AVAILABLE = True
except ImportError:
    IMPLICIT_AVAILABLE = False
    logging.warning("implicit library not available, some CF algorithms will be disabled")

logger = logging.getLogger(__name__)


class SVDRecommender:
    """
    SVD-based Collaborative Filtering
    Uses Singular Value Decomposition to factorize the user-item matrix
    """

    def __init__(self, n_factors: int = 50, random_state: int = 42):
        """
        Initialize SVD recommender

        Args:
            n_factors: Number of latent factors
            random_state: Random seed for reproducibility
        """
        self.n_factors = n_factors
        self.random_state = random_state
        self.user_factors: Optional[np.ndarray] = None
        self.item_factors: Optional[np.ndarray] = None
        self.sigma: Optional[np.ndarray] = None
        self.user_id_map: Optional[Dict] = None
        self.item_id_map: Optional[Dict] = None
        self.global_mean: float = 0.0

    def fit(
        self,
        interaction_matrix: np.ndarray,
        user_id_map: Dict,
        item_id_map: Dict
    ):
        """
        Fit SVD model

        Args:
            interaction_matrix: User-item interaction matrix
            user_id_map: Mapping from user_id to matrix index
            item_id_map: Mapping from item_id to matrix index
        """
        logger.info(f"Fitting SVD with {self.n_factors} factors...")

        self.user_id_map = user_id_map
        self.item_id_map = item_id_map

        # Calculate global mean for centering
        self.global_mean = np.mean(interaction_matrix[interaction_matrix > 0])

        # Center the matrix
        centered_matrix = interaction_matrix.copy()
        nonzero_mask = interaction_matrix > 0
        centered_matrix[nonzero_mask] -= self.global_mean

        # Perform SVD
        U, sigma, Vt = svds(centered_matrix, k=self.n_factors)

        # Store factors
        self.user_factors = U
        self.sigma = sigma
        self.item_factors = Vt.T

        logger.info("SVD fitting completed")

    def predict(self, user_id: str, item_id: str) -> float:
        """
        Predict rating for user-item pair

        Args:
            user_id: User identifier
            item_id: Item identifier

        Returns:
            Predicted rating
        """
        if self.user_factors is None:
            raise ValueError("Model not fitted yet")

        user_idx = self.user_id_map.get(user_id)
        item_idx = self.item_id_map.get(item_id)

        if user_idx is None or item_idx is None:
            # Return global mean for unknown users/items
            return self.global_mean

        prediction = (
            np.dot(
                self.user_factors[user_idx],
                self.sigma * self.item_factors[item_idx]
            ) + self.global_mean
        )

        # Clip to valid rating range
        return np.clip(prediction, 0, 5)

    def recommend(
        self,
        user_id: str,
        n: int = 10,
        exclude_items: Optional[List[str]] = None
    ) -> List[Tuple[str, float]]:
        """
        Get top-N recommendations for a user

        Args:
            user_id: User identifier
            n: Number of recommendations
            exclude_items: Items to exclude from recommendations

        Returns:
            List of (item_id, score) tuples
        """
        if self.user_factors is None:
            raise ValueError("Model not fitted yet")

        user_idx = self.user_id_map.get(user_id)
        if user_idx is None:
            logger.warning(f"User {user_id} not found, returning popular items")
            return self._get_popular_items(n)

        # Calculate scores for all items
        user_vector = self.user_factors[user_idx]
        scores = np.dot(self.sigma * self.item_factors, user_vector) + self.global_mean

        # Create item_id to index mapping (reverse)
        idx_to_item = {idx: item_id for item_id, idx in self.item_id_map.items()}

        # Exclude items
        if exclude_items:
            exclude_indices = [
                self.item_id_map[item_id]
                for item_id in exclude_items
                if item_id in self.item_id_map
            ]
            scores[exclude_indices] = -np.inf

        # Get top-N
        top_indices = np.argsort(scores)[::-1][:n]
        recommendations = [
            (idx_to_item[idx], float(scores[idx]))
            for idx in top_indices
            if idx in idx_to_item
        ]

        return recommendations

    def _get_popular_items(self, n: int) -> List[Tuple[str, float]]:
        """Get popular items as fallback"""
        # Simple popularity based on item factor norms
        item_popularity = np.linalg.norm(self.item_factors, axis=1)
        top_indices = np.argsort(item_popularity)[::-1][:n]

        idx_to_item = {idx: item_id for item_id, idx in self.item_id_map.items()}
        return [
            (idx_to_item[idx], float(item_popularity[idx]))
            for idx in top_indices
            if idx in idx_to_item
        ]


class ALSRecommender:
    """
    Alternating Least Squares for Implicit Feedback
    Optimized for binary/count data (clicks, views, purchases)
    """

    def __init__(
        self,
        factors: int = 50,
        regularization: float = 0.01,
        iterations: int = 15,
        use_gpu: bool = False,
        random_state: int = 42
    ):
        """
        Initialize ALS recommender

        Args:
            factors: Number of latent factors
            regularization: Regularization parameter
            iterations: Number of ALS iterations
            use_gpu: Whether to use GPU acceleration
            random_state: Random seed
        """
        self.factors = factors
        self.regularization = regularization
        self.iterations = iterations
        self.use_gpu = use_gpu
        self.random_state = random_state
        self.user_id_map: Optional[Dict] = None
        self.item_id_map: Optional[Dict] = None

        if not IMPLICIT_AVAILABLE:
            raise ImportError("implicit library required for ALS")

        self.model = AlternatingLeastSquares(
            factors=factors,
            regularization=regularization,
            iterations=iterations,
            use_gpu=use_gpu,
            random_state=random_state
        )

    def fit(
        self,
        interaction_matrix: np.ndarray,
        user_id_map: Dict,
        item_id_map: Dict
    ):
        """
        Fit ALS model

        Args:
            interaction_matrix: User-item interaction matrix
            user_id_map: Mapping from user_id to matrix index
            item_id_map: Mapping from item_id to matrix index
        """
        logger.info(f"Fitting ALS with {self.factors} factors...")

        self.user_id_map = user_id_map
        self.item_id_map = item_id_map

        # Convert to sparse matrix
        sparse_matrix = csr_matrix(interaction_matrix)

        # ALS expects item-user matrix (transposed)
        sparse_matrix = sparse_matrix.T

        # Fit model
        self.model.fit(sparse_matrix)

        logger.info("ALS fitting completed")

    def recommend(
        self,
        user_id: str,
        n: int = 10,
        exclude_items: Optional[List[str]] = None
    ) -> List[Tuple[str, float]]:
        """
        Get top-N recommendations for a user

        Args:
            user_id: User identifier
            n: Number of recommendations
            exclude_items: Items to exclude

        Returns:
            List of (item_id, score) tuples
        """
        user_idx = self.user_id_map.get(user_id)
        if user_idx is None:
            logger.warning(f"User {user_id} not found")
            return []

        # Get filter list
        filter_items = None
        if exclude_items:
            filter_items = [
                self.item_id_map[item_id]
                for item_id in exclude_items
                if item_id in self.item_id_map
            ]

        # Get recommendations
        recommendations = self.model.recommend(
            userid=user_idx,
            user_items=csr_matrix((1, len(self.item_id_map))),
            N=n,
            filter_already_liked_items=False,
            filter_items=filter_items
        )

        # Convert to item_ids
        idx_to_item = {idx: item_id for item_id, idx in self.item_id_map.items()}
        results = [
            (idx_to_item[item_idx], float(score))
            for item_idx, score in zip(recommendations[0], recommendations[1])
            if item_idx in idx_to_item
        ]

        return results

    def similar_items(self, item_id: str, n: int = 10) -> List[Tuple[str, float]]:
        """
        Find similar items

        Args:
            item_id: Item identifier
            n: Number of similar items

        Returns:
            List of (item_id, similarity_score) tuples
        """
        item_idx = self.item_id_map.get(item_id)
        if item_idx is None:
            logger.warning(f"Item {item_id} not found")
            return []

        # Get similar items
        similar = self.model.similar_items(itemid=item_idx, N=n + 1)

        # Convert to item_ids (exclude the query item)
        idx_to_item = {idx: item_id for item_id, idx in self.item_id_map.items()}
        results = [
            (idx_to_item[item_idx], float(score))
            for item_idx, score in zip(similar[0], similar[1])
            if item_idx in idx_to_item and item_idx != item_idx
        ][:n]

        return results


class NMFRecommender:
    """
    Non-negative Matrix Factorization for recommendations
    Good for interpretable factors with non-negative data
    """

    def __init__(
        self,
        n_components: int = 50,
        max_iter: int = 200,
        random_state: int = 42
    ):
        """
        Initialize NMF recommender

        Args:
            n_components: Number of latent components
            max_iter: Maximum number of iterations
            random_state: Random seed
        """
        self.n_components = n_components
        self.max_iter = max_iter
        self.random_state = random_state
        self.user_id_map: Optional[Dict] = None
        self.item_id_map: Optional[Dict] = None

        self.model = NMF(
            n_components=n_components,
            init='random',
            random_state=random_state,
            max_iter=max_iter,
            solver='mu'
        )

        self.user_factors: Optional[np.ndarray] = None
        self.item_factors: Optional[np.ndarray] = None

    def fit(
        self,
        interaction_matrix: np.ndarray,
        user_id_map: Dict,
        item_id_map: Dict
    ):
        """
        Fit NMF model

        Args:
            interaction_matrix: User-item interaction matrix
            user_id_map: Mapping from user_id to matrix index
            item_id_map: Mapping from item_id to matrix index
        """
        logger.info(f"Fitting NMF with {self.n_components} components...")

        self.user_id_map = user_id_map
        self.item_id_map = item_id_map

        # Fit NMF
        self.user_factors = self.model.fit_transform(interaction_matrix)
        self.item_factors = self.model.components_.T

        logger.info("NMF fitting completed")

    def recommend(
        self,
        user_id: str,
        n: int = 10,
        exclude_items: Optional[List[str]] = None
    ) -> List[Tuple[str, float]]:
        """
        Get top-N recommendations for a user

        Args:
            user_id: User identifier
            n: Number of recommendations
            exclude_items: Items to exclude

        Returns:
            List of (item_id, score) tuples
        """
        if self.user_factors is None:
            raise ValueError("Model not fitted yet")

        user_idx = self.user_id_map.get(user_id)
        if user_idx is None:
            logger.warning(f"User {user_id} not found")
            return []

        # Calculate scores
        user_vector = self.user_factors[user_idx]
        scores = np.dot(self.item_factors, user_vector)

        # Exclude items
        if exclude_items:
            exclude_indices = [
                self.item_id_map[item_id]
                for item_id in exclude_items
                if item_id in self.item_id_map
            ]
            scores[exclude_indices] = -np.inf

        # Get top-N
        top_indices = np.argsort(scores)[::-1][:n]
        idx_to_item = {idx: item_id for item_id, idx in self.item_id_map.items()}

        recommendations = [
            (idx_to_item[idx], float(scores[idx]))
            for idx in top_indices
            if idx in idx_to_item
        ]

        return recommendations

    def get_component_interpretation(self, component_idx: int, top_k: int = 10) -> List[str]:
        """
        Get top items for a latent component (for interpretation)

        Args:
            component_idx: Component index
            top_k: Number of top items

        Returns:
            List of item_ids
        """
        if self.item_factors is None:
            raise ValueError("Model not fitted yet")

        component_scores = self.item_factors[:, component_idx]
        top_indices = np.argsort(component_scores)[::-1][:top_k]

        idx_to_item = {idx: item_id for item_id, idx in self.item_id_map.items()}
        return [idx_to_item[idx] for idx in top_indices if idx in idx_to_item]
