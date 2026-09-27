"""
Model evaluation metrics for recommendation systems
"""
import numpy as np
from typing import List, Dict, Set, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class ModelEvaluator:
    """
    Evaluator for recommendation models
    Implements standard ranking metrics
    """

    def __init__(self):
        """Initialize evaluator"""
        logger.info("ModelEvaluator initialized")

    def precision_at_k(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]],
        k: int
    ) -> float:
        """
        Calculate Precision@K

        Precision@K = (# of recommended items in top-K that are relevant) / K

        Args:
            recommendations: List of recommendation lists (one per user)
            ground_truth: List of ground truth item lists (one per user)
            k: Cutoff rank

        Returns:
            Average Precision@K across all users
        """
        precisions = []

        for recs, truth in zip(recommendations, ground_truth):
            if not recs:
                precisions.append(0.0)
                continue

            # Get top-K recommendations
            top_k = recs[:k]

            # Count hits
            hits = len(set(top_k) & set(truth))

            # Precision = hits / k
            precision = hits / k
            precisions.append(precision)

        return np.mean(precisions) if precisions else 0.0

    def recall_at_k(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]],
        k: int
    ) -> float:
        """
        Calculate Recall@K

        Recall@K = (# of recommended items in top-K that are relevant) / (# of relevant items)

        Args:
            recommendations: List of recommendation lists
            ground_truth: List of ground truth item lists
            k: Cutoff rank

        Returns:
            Average Recall@K across all users
        """
        recalls = []

        for recs, truth in zip(recommendations, ground_truth):
            if not recs or not truth:
                recalls.append(0.0)
                continue

            # Get top-K recommendations
            top_k = recs[:k]

            # Count hits
            hits = len(set(top_k) & set(truth))

            # Recall = hits / total_relevant
            recall = hits / len(truth)
            recalls.append(recall)

        return np.mean(recalls) if recalls else 0.0

    def f1_score_at_k(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]],
        k: int
    ) -> float:
        """
        Calculate F1-Score@K

        F1 = 2 * (Precision * Recall) / (Precision + Recall)

        Args:
            recommendations: List of recommendation lists
            ground_truth: List of ground truth item lists
            k: Cutoff rank

        Returns:
            Average F1@K
        """
        precision = self.precision_at_k(recommendations, ground_truth, k)
        recall = self.recall_at_k(recommendations, ground_truth, k)

        if precision + recall == 0:
            return 0.0

        return 2 * (precision * recall) / (precision + recall)

    def average_precision(
        self,
        recommendations: List[str],
        ground_truth: List[str]
    ) -> float:
        """
        Calculate Average Precision (AP) for a single user

        AP = (sum of P@k for each relevant item) / (# of relevant items)

        Args:
            recommendations: Single user's recommendations
            ground_truth: Single user's ground truth

        Returns:
            Average Precision
        """
        if not recommendations or not ground_truth:
            return 0.0

        truth_set = set(ground_truth)
        hits = 0
        sum_precisions = 0.0

        for i, item in enumerate(recommendations):
            if item in truth_set:
                hits += 1
                precision_at_i = hits / (i + 1)
                sum_precisions += precision_at_i

        if hits == 0:
            return 0.0

        return sum_precisions / len(truth_set)

    def mean_average_precision(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]]
    ) -> float:
        """
        Calculate Mean Average Precision (MAP)

        MAP = mean(AP) across all users

        Args:
            recommendations: List of recommendation lists
            ground_truth: List of ground truth lists

        Returns:
            MAP score
        """
        aps = [
            self.average_precision(recs, truth)
            for recs, truth in zip(recommendations, ground_truth)
        ]

        return np.mean(aps) if aps else 0.0

    def dcg_at_k(
        self,
        recommendations: List[str],
        ground_truth: List[str],
        k: int
    ) -> float:
        """
        Calculate Discounted Cumulative Gain @K

        DCG@K = sum(rel_i / log2(i+1)) for i in 1..K

        Args:
            recommendations: Single user's recommendations
            ground_truth: Single user's ground truth
            k: Cutoff rank

        Returns:
            DCG@K
        """
        if not recommendations:
            return 0.0

        top_k = recommendations[:k]
        truth_set = set(ground_truth)

        dcg = 0.0
        for i, item in enumerate(top_k):
            # Binary relevance: 1 if in ground truth, 0 otherwise
            relevance = 1.0 if item in truth_set else 0.0
            # Discount factor: log2(i+2) because i is 0-indexed
            dcg += relevance / np.log2(i + 2)

        return dcg

    def idcg_at_k(
        self,
        ground_truth: List[str],
        k: int
    ) -> float:
        """
        Calculate Ideal DCG @K (best possible DCG)

        Args:
            ground_truth: Ground truth items
            k: Cutoff rank

        Returns:
            IDCG@K
        """
        # Ideal ranking: all ground truth items first
        ideal_length = min(len(ground_truth), k)

        idcg = 0.0
        for i in range(ideal_length):
            idcg += 1.0 / np.log2(i + 2)

        return idcg

    def ndcg_at_k(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]],
        k: int
    ) -> float:
        """
        Calculate Normalized Discounted Cumulative Gain @K

        NDCG@K = DCG@K / IDCG@K

        Args:
            recommendations: List of recommendation lists
            ground_truth: List of ground truth lists
            k: Cutoff rank

        Returns:
            Average NDCG@K
        """
        ndcgs = []

        for recs, truth in zip(recommendations, ground_truth):
            if not truth:
                continue

            dcg = self.dcg_at_k(recs, truth, k)
            idcg = self.idcg_at_k(truth, k)

            if idcg == 0:
                ndcg = 0.0
            else:
                ndcg = dcg / idcg

            ndcgs.append(ndcg)

        return np.mean(ndcgs) if ndcgs else 0.0

    def hit_rate_at_k(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]],
        k: int
    ) -> float:
        """
        Calculate Hit Rate @K (fraction of users with at least one hit)

        Args:
            recommendations: List of recommendation lists
            ground_truth: List of ground truth lists
            k: Cutoff rank

        Returns:
            Hit Rate@K
        """
        hits = 0

        for recs, truth in zip(recommendations, ground_truth):
            if not recs or not truth:
                continue

            top_k = set(recs[:k])
            truth_set = set(truth)

            # Check if there's at least one hit
            if top_k & truth_set:
                hits += 1

        return hits / len(recommendations) if recommendations else 0.0

    def mrr(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]]
    ) -> float:
        """
        Calculate Mean Reciprocal Rank (MRR)

        MRR = mean(1 / rank_of_first_relevant_item)

        Args:
            recommendations: List of recommendation lists
            ground_truth: List of ground truth lists

        Returns:
            MRR score
        """
        reciprocal_ranks = []

        for recs, truth in zip(recommendations, ground_truth):
            if not recs or not truth:
                reciprocal_ranks.append(0.0)
                continue

            truth_set = set(truth)

            # Find rank of first relevant item
            for i, item in enumerate(recs):
                if item in truth_set:
                    reciprocal_ranks.append(1.0 / (i + 1))
                    break
            else:
                # No relevant item found
                reciprocal_ranks.append(0.0)

        return np.mean(reciprocal_ranks) if reciprocal_ranks else 0.0

    def coverage(
        self,
        recommendations: List[List[str]],
        all_items: Set[str]
    ) -> float:
        """
        Calculate catalog coverage (fraction of items recommended)

        Args:
            recommendations: List of recommendation lists
            all_items: Set of all available items

        Returns:
            Coverage (0-1)
        """
        recommended_items = set()

        for recs in recommendations:
            recommended_items.update(recs)

        if not all_items:
            return 0.0

        return len(recommended_items) / len(all_items)

    def diversity(
        self,
        recommendations: List[List[str]],
        item_similarity_matrix: Optional[np.ndarray] = None
    ) -> float:
        """
        Calculate diversity of recommendations

        Diversity = 1 - average_pairwise_similarity

        Args:
            recommendations: List of recommendation lists
            item_similarity_matrix: Similarity matrix between items

        Returns:
            Diversity score (0-1)
        """
        if item_similarity_matrix is None:
            # If no similarity matrix, calculate based on uniqueness
            all_recs = [item for recs in recommendations for item in recs]
            unique_recs = set(all_recs)

            if not all_recs:
                return 0.0

            return len(unique_recs) / len(all_recs)

        # Calculate using similarity matrix
        diversities = []

        for recs in recommendations:
            if len(recs) < 2:
                continue

            # Calculate average pairwise similarity
            similarities = []
            for i in range(len(recs)):
                for j in range(i + 1, len(recs)):
                    # Would need item indices for similarity matrix lookup
                    # Simplified version
                    pass

            # Diversity = 1 - similarity
            if similarities:
                diversity = 1.0 - np.mean(similarities)
                diversities.append(diversity)

        return np.mean(diversities) if diversities else 0.0

    def novelty(
        self,
        recommendations: List[List[str]],
        item_popularity: Dict[str, float]
    ) -> float:
        """
        Calculate novelty of recommendations

        Novelty = average(-log2(popularity)) of recommended items

        Args:
            recommendations: List of recommendation lists
            item_popularity: Dictionary of {item_id: popularity_score}

        Returns:
            Novelty score
        """
        novelties = []

        for recs in recommendations:
            for item in recs:
                popularity = item_popularity.get(item, 0.01)  # Small default
                # Novelty: items with low popularity have high novelty
                novelty = -np.log2(popularity + 1e-10)  # Add epsilon to avoid log(0)
                novelties.append(novelty)

        return np.mean(novelties) if novelties else 0.0

    def evaluate_all(
        self,
        recommendations: List[List[str]],
        ground_truth: List[List[str]],
        all_items: Set[str],
        k_values: List[int] = [5, 10, 20],
        item_popularity: Optional[Dict[str, float]] = None
    ) -> Dict[str, float]:
        """
        Evaluate all metrics

        Args:
            recommendations: List of recommendation lists
            ground_truth: List of ground truth lists
            all_items: Set of all items
            k_values: List of K values to evaluate
            item_popularity: Item popularity for novelty calculation

        Returns:
            Dictionary of all metrics
        """
        logger.info("Evaluating all metrics...")

        metrics = {}

        # Ranking metrics at different K values
        for k in k_values:
            metrics[f"precision@{k}"] = self.precision_at_k(
                recommendations, ground_truth, k
            )
            metrics[f"recall@{k}"] = self.recall_at_k(
                recommendations, ground_truth, k
            )
            metrics[f"f1@{k}"] = self.f1_score_at_k(
                recommendations, ground_truth, k
            )
            metrics[f"ndcg@{k}"] = self.ndcg_at_k(
                recommendations, ground_truth, k
            )
            metrics[f"hit_rate@{k}"] = self.hit_rate_at_k(
                recommendations, ground_truth, k
            )

        # Other metrics
        metrics["map"] = self.mean_average_precision(recommendations, ground_truth)
        metrics["mrr"] = self.mrr(recommendations, ground_truth)
        metrics["coverage"] = self.coverage(recommendations, all_items)
        metrics["diversity"] = self.diversity(recommendations)

        if item_popularity:
            metrics["novelty"] = self.novelty(recommendations, item_popularity)

        logger.info(f"Evaluation completed: {len(metrics)} metrics calculated")

        return metrics

    def compare_models(
        self,
        model_results: Dict[str, Dict[str, float]]
    ) -> pd.DataFrame:
        """
        Compare multiple models

        Args:
            model_results: Dictionary of {model_name: {metric_name: value}}

        Returns:
            DataFrame with comparison
        """
        import pandas as pd

        df = pd.DataFrame(model_results).T
        df = df.round(4)

        # Add ranking column for each metric
        for col in df.columns:
            df[f"{col}_rank"] = df[col].rank(ascending=False)

        return df
