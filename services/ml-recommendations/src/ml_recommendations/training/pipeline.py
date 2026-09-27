"""
Model training pipeline for recommendation models
"""
import logging
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import pickle
import json
from pathlib import Path

from ml_recommendations.features.feature_engineering import FeatureEngineer
from ml_recommendations.algorithms.collaborative_filtering import (
    SVDRecommender,
    ALSRecommender,
    NMFRecommender
)
from ml_recommendations.algorithms.neural_cf import (
    NeuralCollaborativeFiltering,
    NCFTrainer
)
from ml_recommendations.training.evaluation import ModelEvaluator

logger = logging.getLogger(__name__)


class TrainingPipeline:
    """
    End-to-end training pipeline for recommendation models
    """

    def __init__(
        self,
        config: Optional[Dict] = None,
        output_dir: str = "./models"
    ):
        """
        Initialize training pipeline

        Args:
            config: Training configuration
            output_dir: Directory to save trained models
        """
        self.config = config or self._default_config()
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.feature_engineer = FeatureEngineer()
        self.evaluator = ModelEvaluator()

        # Training metadata
        self.training_metadata = {
            "start_time": None,
            "end_time": None,
            "models_trained": [],
            "metrics": {}
        }

        logger.info("TrainingPipeline initialized")

    def _default_config(self) -> Dict:
        """Default training configuration"""
        return {
            "data": {
                "train_split": 0.8,
                "val_split": 0.1,
                "test_split": 0.1,
                "min_interactions_per_user": 5,
                "min_interactions_per_item": 5
            },
            "models": {
                "svd": {
                    "enabled": True,
                    "n_factors": 50,
                    "random_state": 42
                },
                "als": {
                    "enabled": True,
                    "factors": 50,
                    "regularization": 0.01,
                    "iterations": 15
                },
                "nmf": {
                    "enabled": True,
                    "n_components": 50,
                    "max_iter": 200
                },
                "neural_cf": {
                    "enabled": False,  # Requires GPU for efficient training
                    "embedding_dim": 64,
                    "hidden_layers": [128, 64, 32],
                    "dropout_rate": 0.3,
                    "epochs": 10,
                    "batch_size": 256,
                    "learning_rate": 0.001
                }
            },
            "evaluation": {
                "metrics": ["precision", "recall", "ndcg", "map", "coverage"],
                "k_values": [5, 10, 20]
            },
            "output": {
                "save_models": True,
                "save_metrics": True,
                "save_feature_mappings": True
            }
        }

    def train_all_models(
        self,
        interactions_df: pd.DataFrame,
        users_df: Optional[pd.DataFrame] = None,
        services_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Any]:
        """
        Train all enabled models

        Args:
            interactions_df: User-item interactions
            users_df: User metadata
            services_df: Service/item metadata

        Returns:
            Dictionary of trained models and metrics
        """
        self.training_metadata["start_time"] = datetime.now()
        logger.info("Starting training pipeline...")

        # Step 1: Data preparation and validation
        logger.info("Step 1: Data preparation and validation")
        interactions_df = self._prepare_data(interactions_df)

        # Step 2: Train-test split
        logger.info("Step 2: Train-test split")
        train_df, val_df, test_df = self._split_data(interactions_df)
        logger.info(
            f"Split sizes - Train: {len(train_df)}, "
            f"Val: {len(val_df)}, Test: {len(test_df)}"
        )

        # Step 3: Feature engineering
        logger.info("Step 3: Feature engineering")
        feature_data = self._engineer_features(
            train_df,
            users_df,
            services_df
        )

        # Step 4: Train models
        logger.info("Step 4: Training models")
        trained_models = {}

        # Train SVD
        if self.config["models"]["svd"]["enabled"]:
            svd_model = self._train_svd(
                feature_data["interaction_matrix"],
                feature_data["user_id_map"],
                feature_data["item_id_map"]
            )
            trained_models["svd"] = svd_model
            self.training_metadata["models_trained"].append("svd")

        # Train ALS
        if self.config["models"]["als"]["enabled"]:
            try:
                als_model = self._train_als(
                    feature_data["interaction_matrix"],
                    feature_data["user_id_map"],
                    feature_data["item_id_map"]
                )
                trained_models["als"] = als_model
                self.training_metadata["models_trained"].append("als")
            except ImportError as e:
                logger.warning(f"Skipping ALS: {e}")

        # Train NMF
        if self.config["models"]["nmf"]["enabled"]:
            nmf_model = self._train_nmf(
                feature_data["interaction_matrix"],
                feature_data["user_id_map"],
                feature_data["item_id_map"]
            )
            trained_models["nmf"] = nmf_model
            self.training_metadata["models_trained"].append("nmf")

        # Train Neural CF (if enabled and GPU available)
        if self.config["models"]["neural_cf"]["enabled"]:
            try:
                ncf_model = self._train_neural_cf(
                    train_df,
                    val_df,
                    feature_data["user_id_map"],
                    feature_data["item_id_map"]
                )
                trained_models["neural_cf"] = ncf_model
                self.training_metadata["models_trained"].append("neural_cf")
            except Exception as e:
                logger.warning(f"Skipping Neural CF: {e}")

        # Step 5: Evaluate models
        logger.info("Step 5: Evaluating models")
        evaluation_results = self._evaluate_models(
            trained_models,
            test_df,
            feature_data["user_id_map"],
            feature_data["item_id_map"]
        )
        self.training_metadata["metrics"] = evaluation_results

        # Step 6: Save models and artifacts
        if self.config["output"]["save_models"]:
            logger.info("Step 6: Saving models and artifacts")
            self._save_models(trained_models, feature_data, evaluation_results)

        self.training_metadata["end_time"] = datetime.now()
        duration = (
            self.training_metadata["end_time"] - self.training_metadata["start_time"]
        ).total_seconds()
        logger.info(f"Training pipeline completed in {duration:.2f} seconds")

        return {
            "models": trained_models,
            "metrics": evaluation_results,
            "feature_data": feature_data,
            "metadata": self.training_metadata
        }

    def _prepare_data(self, interactions_df: pd.DataFrame) -> pd.DataFrame:
        """Prepare and validate interaction data"""
        logger.info("Validating interaction data...")

        # Required columns
        required_cols = ["user_id", "service_id"]
        for col in required_cols:
            if col not in interactions_df.columns:
                raise ValueError(f"Missing required column: {col}")

        # Remove duplicates
        before_count = len(interactions_df)
        interactions_df = interactions_df.drop_duplicates(
            subset=["user_id", "service_id"]
        )
        after_count = len(interactions_df)
        if before_count != after_count:
            logger.info(f"Removed {before_count - after_count} duplicate interactions")

        # Filter users and items with minimum interactions
        min_user_interactions = self.config["data"]["min_interactions_per_user"]
        min_item_interactions = self.config["data"]["min_interactions_per_item"]

        user_counts = interactions_df["user_id"].value_counts()
        item_counts = interactions_df["service_id"].value_counts()

        valid_users = user_counts[user_counts >= min_user_interactions].index
        valid_items = item_counts[item_counts >= min_item_interactions].index

        before_count = len(interactions_df)
        interactions_df = interactions_df[
            interactions_df["user_id"].isin(valid_users) &
            interactions_df["service_id"].isin(valid_items)
        ]
        after_count = len(interactions_df)

        logger.info(
            f"Filtered to {len(valid_users)} users and {len(valid_items)} items "
            f"({before_count - after_count} interactions removed)"
        )

        return interactions_df

    def _split_data(
        self,
        interactions_df: pd.DataFrame
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Split data into train, validation, and test sets"""
        # Temporal split (most recent for test)
        if "timestamp" in interactions_df.columns:
            interactions_df = interactions_df.sort_values("timestamp")

        n = len(interactions_df)
        train_size = int(n * self.config["data"]["train_split"])
        val_size = int(n * self.config["data"]["val_split"])

        train_df = interactions_df[:train_size]
        val_df = interactions_df[train_size:train_size + val_size]
        test_df = interactions_df[train_size + val_size:]

        return train_df, val_df, test_df

    def _engineer_features(
        self,
        train_df: pd.DataFrame,
        users_df: Optional[pd.DataFrame],
        services_df: Optional[pd.DataFrame]
    ) -> Dict:
        """Engineer features for training"""
        logger.info("Engineering features...")

        # Create interaction matrix
        matrix, user_id_map, item_id_map = self.feature_engineer.create_interaction_matrix(
            train_df,
            implicit=False
        )

        # Engineer user features (if metadata available)
        user_features = None
        if users_df is not None:
            user_features = self.feature_engineer.engineer_user_features(
                train_df,
                users_df
            )

        # Engineer item features (if metadata available)
        item_features = None
        if services_df is not None:
            item_features = self.feature_engineer.engineer_item_features(
                services_df,
                train_df
            )

        # Mark feature engineer as fitted
        self.feature_engineer.fitted = True

        return {
            "interaction_matrix": matrix,
            "user_id_map": user_id_map,
            "item_id_map": item_id_map,
            "user_features": user_features,
            "item_features": item_features
        }

    def _train_svd(
        self,
        interaction_matrix: np.ndarray,
        user_id_map: Dict,
        item_id_map: Dict
    ):
        """Train SVD model"""
        logger.info("Training SVD model...")

        model = SVDRecommender(
            n_factors=self.config["models"]["svd"]["n_factors"],
            random_state=self.config["models"]["svd"]["random_state"]
        )

        model.fit(interaction_matrix, user_id_map, item_id_map)

        logger.info("SVD model training completed")
        return model

    def _train_als(
        self,
        interaction_matrix: np.ndarray,
        user_id_map: Dict,
        item_id_map: Dict
    ):
        """Train ALS model"""
        logger.info("Training ALS model...")

        model = ALSRecommender(
            factors=self.config["models"]["als"]["factors"],
            regularization=self.config["models"]["als"]["regularization"],
            iterations=self.config["models"]["als"]["iterations"]
        )

        model.fit(interaction_matrix, user_id_map, item_id_map)

        logger.info("ALS model training completed")
        return model

    def _train_nmf(
        self,
        interaction_matrix: np.ndarray,
        user_id_map: Dict,
        item_id_map: Dict
    ):
        """Train NMF model"""
        logger.info("Training NMF model...")

        model = NMFRecommender(
            n_components=self.config["models"]["nmf"]["n_components"],
            max_iter=self.config["models"]["nmf"]["max_iter"]
        )

        model.fit(interaction_matrix, user_id_map, item_id_map)

        logger.info("NMF model training completed")
        return model

    def _train_neural_cf(
        self,
        train_df: pd.DataFrame,
        val_df: pd.DataFrame,
        user_id_map: Dict,
        item_id_map: Dict
    ):
        """Train Neural Collaborative Filtering model"""
        logger.info("Training Neural CF model...")

        # Prepare data
        train_users = [user_id_map[uid] for uid in train_df["user_id"]]
        train_items = [item_id_map[sid] for sid in train_df["service_id"]]
        train_labels = train_df["rating"].values if "rating" in train_df.columns else np.ones(len(train_df))

        val_users = [user_id_map.get(uid, 0) for uid in val_df["user_id"]]
        val_items = [item_id_map.get(sid, 0) for sid in val_df["service_id"]]
        val_labels = val_df["rating"].values if "rating" in val_df.columns else np.ones(len(val_df))

        # Create model
        model = NeuralCollaborativeFiltering(
            n_users=len(user_id_map),
            n_items=len(item_id_map),
            embedding_dim=self.config["models"]["neural_cf"]["embedding_dim"],
            hidden_layers=self.config["models"]["neural_cf"]["hidden_layers"],
            dropout_rate=self.config["models"]["neural_cf"]["dropout_rate"]
        )

        # Create trainer
        trainer = NCFTrainer(
            model=model,
            learning_rate=self.config["models"]["neural_cf"]["learning_rate"]
        )

        # Train
        history = trainer.train(
            train_data=([np.array(train_users), np.array(train_items)], train_labels),
            val_data=([np.array(val_users), np.array(val_items)], val_labels),
            epochs=self.config["models"]["neural_cf"]["epochs"],
            batch_size=self.config["models"]["neural_cf"]["batch_size"]
        )

        logger.info("Neural CF model training completed")
        return trainer

    def _evaluate_models(
        self,
        models: Dict,
        test_df: pd.DataFrame,
        user_id_map: Dict,
        item_id_map: Dict
    ) -> Dict:
        """Evaluate all trained models"""
        logger.info("Evaluating models...")

        results = {}
        k_values = self.config["evaluation"]["k_values"]

        for model_name, model in models.items():
            logger.info(f"Evaluating {model_name}...")

            model_metrics = {}

            for k in k_values:
                # Get recommendations for test users
                test_users = test_df["user_id"].unique()
                all_recommendations = []
                ground_truth = []

                for user_id in test_users[:100]:  # Evaluate on subset for speed
                    # Get recommendations
                    try:
                        if model_name == "neural_cf":
                            # Neural CF has different interface
                            continue
                        else:
                            recs = model.recommend(user_id, n=k)
                            all_recommendations.append([item_id for item_id, score in recs])
                    except:
                        all_recommendations.append([])

                    # Get ground truth
                    user_items = test_df[test_df["user_id"] == user_id]["service_id"].tolist()
                    ground_truth.append(user_items)

                # Calculate metrics
                if all_recommendations:
                    precision = self.evaluator.precision_at_k(
                        all_recommendations,
                        ground_truth,
                        k
                    )
                    recall = self.evaluator.recall_at_k(
                        all_recommendations,
                        ground_truth,
                        k
                    )
                    ndcg = self.evaluator.ndcg_at_k(
                        all_recommendations,
                        ground_truth,
                        k
                    )

                    model_metrics[f"precision@{k}"] = precision
                    model_metrics[f"recall@{k}"] = recall
                    model_metrics[f"ndcg@{k}"] = ndcg

            results[model_name] = model_metrics

        return results

    def _save_models(
        self,
        models: Dict,
        feature_data: Dict,
        metrics: Dict
    ):
        """Save trained models and artifacts"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = self.output_dir / f"run_{timestamp}"
        run_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Saving models to {run_dir}")

        # Save each model
        for model_name, model in models.items():
            model_path = run_dir / f"{model_name}_model.pkl"
            with open(model_path, "wb") as f:
                pickle.dump(model, f)
            logger.info(f"Saved {model_name} to {model_path}")

        # Save feature mappings
        if self.config["output"]["save_feature_mappings"]:
            mappings = {
                "user_id_map": feature_data["user_id_map"],
                "item_id_map": feature_data["item_id_map"]
            }
            mappings_path = run_dir / "feature_mappings.pkl"
            with open(mappings_path, "wb") as f:
                pickle.dump(mappings, f)
            logger.info(f"Saved feature mappings to {mappings_path}")

        # Save metrics
        if self.config["output"]["save_metrics"]:
            metrics_path = run_dir / "metrics.json"
            with open(metrics_path, "w") as f:
                json.dump(metrics, f, indent=2)
            logger.info(f"Saved metrics to {metrics_path}")

        # Save training metadata
        metadata_path = run_dir / "training_metadata.json"
        metadata = {
            **self.training_metadata,
            "start_time": self.training_metadata["start_time"].isoformat(),
            "end_time": self.training_metadata["end_time"].isoformat()
        }
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Saved metadata to {metadata_path}")

        logger.info(f"All artifacts saved to {run_dir}")
