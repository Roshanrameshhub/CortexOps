"""
A/B Testing and Experimentation Framework
"""
import logging
import hashlib
import random
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class VariantType(str, Enum):
    """Experiment variant types"""
    CONTROL = "control"
    TREATMENT = "treatment"
    TREATMENT_A = "treatment_a"
    TREATMENT_B = "treatment_b"
    TREATMENT_C = "treatment_c"


@dataclass
class Experiment:
    """Experiment configuration"""
    experiment_id: str
    name: str
    description: str
    variants: List[str]
    traffic_allocation: Dict[str, float]  # variant -> percentage
    start_date: datetime
    end_date: Optional[datetime] = None
    is_active: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        """Validate experiment configuration"""
        # Ensure traffic allocation sums to 1.0
        total_allocation = sum(self.traffic_allocation.values())
        if not (0.99 <= total_allocation <= 1.01):  # Allow small floating point errors
            raise ValueError(
                f"Traffic allocation must sum to 1.0, got {total_allocation}"
            )

        # Ensure all variants are in traffic allocation
        for variant in self.variants:
            if variant not in self.traffic_allocation:
                raise ValueError(f"Variant {variant} missing from traffic allocation")


@dataclass
class Assignment:
    """User assignment to experiment variant"""
    user_id: str
    experiment_id: str
    variant: str
    assigned_at: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)


class ABTestManager:
    """
    A/B Testing Manager for experimentation
    """

    def __init__(self, storage_client=None):
        """
        Initialize A/B test manager

        Args:
            storage_client: Storage for experiment configurations and assignments
        """
        self.storage_client = storage_client

        # In-memory experiment registry
        self.experiments: Dict[str, Experiment] = {}

        # In-memory assignment cache
        self.assignments: Dict[str, Dict[str, Assignment]] = {}  # user_id -> {experiment_id -> assignment}

        # Metrics tracking
        self.metrics: Dict[str, Dict] = {}  # experiment_id -> metrics

        logger.info("ABTestManager initialized")

    def create_experiment(
        self,
        experiment_id: str,
        name: str,
        description: str,
        variants: List[str],
        traffic_allocation: Dict[str, float],
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        metadata: Optional[Dict] = None
    ) -> Experiment:
        """
        Create a new experiment

        Args:
            experiment_id: Unique experiment identifier
            name: Human-readable name
            description: Experiment description
            variants: List of variant names
            traffic_allocation: Percentage allocation for each variant
            start_date: Experiment start date
            end_date: Experiment end date
            metadata: Additional metadata

        Returns:
            Created experiment
        """
        experiment = Experiment(
            experiment_id=experiment_id,
            name=name,
            description=description,
            variants=variants,
            traffic_allocation=traffic_allocation,
            start_date=start_date or datetime.now(),
            end_date=end_date,
            is_active=True,
            metadata=metadata or {}
        )

        self.experiments[experiment_id] = experiment

        logger.info(f"Created experiment: {experiment_id} with variants {variants}")

        return experiment

    def assign_variant(
        self,
        user_id: str,
        experiment_id: str,
        override_variant: Optional[str] = None
    ) -> str:
        """
        Assign a user to an experiment variant

        Args:
            user_id: User identifier
            experiment_id: Experiment identifier
            override_variant: Force specific variant (for testing)

        Returns:
            Assigned variant name
        """
        # Check if user already has assignment
        if user_id in self.assignments:
            if experiment_id in self.assignments[user_id]:
                existing_assignment = self.assignments[user_id][experiment_id]
                logger.debug(
                    f"Returning existing assignment for user {user_id}: "
                    f"{existing_assignment.variant}"
                )
                return existing_assignment.variant

        # Get experiment
        experiment = self.experiments.get(experiment_id)
        if not experiment:
            logger.warning(f"Experiment {experiment_id} not found, using default")
            return "default"

        # Check if experiment is active
        if not experiment.is_active:
            logger.debug(f"Experiment {experiment_id} not active, using control")
            return "control"

        # Check date range
        now = datetime.now()
        if experiment.end_date and now > experiment.end_date:
            logger.debug(f"Experiment {experiment_id} ended, using control")
            return "control"
        if now < experiment.start_date:
            logger.debug(f"Experiment {experiment_id} not started, using control")
            return "control"

        # Assign variant
        if override_variant and override_variant in experiment.variants:
            variant = override_variant
        else:
            variant = self._deterministic_assign(
                user_id,
                experiment_id,
                experiment.variants,
                experiment.traffic_allocation
            )

        # Store assignment
        assignment = Assignment(
            user_id=user_id,
            experiment_id=experiment_id,
            variant=variant,
            assigned_at=now
        )

        if user_id not in self.assignments:
            self.assignments[user_id] = {}
        self.assignments[user_id][experiment_id] = assignment

        logger.debug(f"Assigned user {user_id} to variant {variant} in {experiment_id}")

        return variant

    def _deterministic_assign(
        self,
        user_id: str,
        experiment_id: str,
        variants: List[str],
        traffic_allocation: Dict[str, float]
    ) -> str:
        """
        Deterministically assign user to variant based on hash

        Args:
            user_id: User identifier
            experiment_id: Experiment identifier
            variants: Available variants
            traffic_allocation: Traffic allocation percentages

        Returns:
            Assigned variant
        """
        # Create deterministic hash
        hash_input = f"{user_id}:{experiment_id}"
        hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)

        # Convert to 0-1 range
        ratio = (hash_value % 10000) / 10000.0

        # Assign based on traffic allocation
        cumulative = 0.0
        for variant in variants:
            cumulative += traffic_allocation[variant]
            if ratio < cumulative:
                return variant

        # Fallback to last variant
        return variants[-1]

    def track_metric(
        self,
        user_id: str,
        experiment_id: str,
        metric_name: str,
        value: float,
        metadata: Optional[Dict] = None
    ):
        """
        Track a metric for an experiment

        Args:
            user_id: User identifier
            experiment_id: Experiment identifier
            metric_name: Name of the metric
            value: Metric value
            metadata: Additional metadata
        """
        # Get user's variant
        variant = None
        if user_id in self.assignments:
            if experiment_id in self.assignments[user_id]:
                variant = self.assignments[user_id][experiment_id].variant

        if not variant:
            logger.warning(
                f"No variant found for user {user_id} in experiment {experiment_id}"
            )
            return

        # Initialize metrics structure
        if experiment_id not in self.metrics:
            self.metrics[experiment_id] = {}

        if variant not in self.metrics[experiment_id]:
            self.metrics[experiment_id][variant] = {}

        if metric_name not in self.metrics[experiment_id][variant]:
            self.metrics[experiment_id][variant][metric_name] = {
                "count": 0,
                "sum": 0.0,
                "min": float('inf'),
                "max": float('-inf'),
                "values": []
            }

        # Update metrics
        metric_data = self.metrics[experiment_id][variant][metric_name]
        metric_data["count"] += 1
        metric_data["sum"] += value
        metric_data["min"] = min(metric_data["min"], value)
        metric_data["max"] = max(metric_data["max"], value)
        metric_data["values"].append(value)

        logger.debug(
            f"Tracked metric {metric_name}={value} for user {user_id} "
            f"in experiment {experiment_id}, variant {variant}"
        )

    def get_experiment_results(self, experiment_id: str) -> Optional[Dict]:
        """
        Get results for an experiment

        Args:
            experiment_id: Experiment identifier

        Returns:
            Experiment results by variant
        """
        if experiment_id not in self.metrics:
            logger.warning(f"No metrics found for experiment {experiment_id}")
            return None

        results = {}
        for variant, metrics in self.metrics[experiment_id].items():
            variant_results = {}

            for metric_name, metric_data in metrics.items():
                if metric_data["count"] > 0:
                    variant_results[metric_name] = {
                        "count": metric_data["count"],
                        "mean": metric_data["sum"] / metric_data["count"],
                        "min": metric_data["min"],
                        "max": metric_data["max"],
                        "sum": metric_data["sum"]
                    }

                    # Calculate standard deviation
                    if len(metric_data["values"]) > 1:
                        mean = variant_results[metric_name]["mean"]
                        variance = sum(
                            (x - mean) ** 2 for x in metric_data["values"]
                        ) / len(metric_data["values"])
                        variant_results[metric_name]["std"] = variance ** 0.5

            results[variant] = variant_results

        return results

    def get_experiment(self, experiment_id: str) -> Optional[Experiment]:
        """Get experiment configuration"""
        return self.experiments.get(experiment_id)

    def list_experiments(self, active_only: bool = False) -> List[Experiment]:
        """
        List all experiments

        Args:
            active_only: Only return active experiments

        Returns:
            List of experiments
        """
        experiments = list(self.experiments.values())

        if active_only:
            now = datetime.now()
            experiments = [
                exp for exp in experiments
                if exp.is_active
                and exp.start_date <= now
                and (exp.end_date is None or exp.end_date >= now)
            ]

        return experiments

    def stop_experiment(self, experiment_id: str):
        """Stop an experiment"""
        if experiment_id in self.experiments:
            self.experiments[experiment_id].is_active = False
            self.experiments[experiment_id].end_date = datetime.now()
            logger.info(f"Stopped experiment: {experiment_id}")

    def get_user_assignments(self, user_id: str) -> Dict[str, str]:
        """
        Get all experiment assignments for a user

        Args:
            user_id: User identifier

        Returns:
            Dictionary of {experiment_id: variant}
        """
        if user_id not in self.assignments:
            return {}

        return {
            exp_id: assignment.variant
            for exp_id, assignment in self.assignments[user_id].items()
        }

    def get_assignment_counts(self, experiment_id: str) -> Dict[str, int]:
        """
        Get assignment counts for each variant

        Args:
            experiment_id: Experiment identifier

        Returns:
            Dictionary of {variant: count}
        """
        counts = {}

        for user_assignments in self.assignments.values():
            if experiment_id in user_assignments:
                variant = user_assignments[experiment_id].variant
                counts[variant] = counts.get(variant, 0) + 1

        return counts

    def initialize_default_experiments(self):
        """Initialize default experiments for testing"""
        # Recommendation model variant testing
        self.create_experiment(
            experiment_id="recommendation_model_v2",
            name="Recommendation Model V2",
            description="Test new hybrid recommendation model",
            variants=["control", "treatment"],
            traffic_allocation={
                "control": 0.5,
                "treatment": 0.5
            },
            start_date=datetime.now(),
            metadata={
                "owner": "ml-team",
                "hypothesis": "New hybrid model improves CTR by 10%"
            }
        )

        # Diversity weighting experiment
        self.create_experiment(
            experiment_id="diversity_weight_test",
            name="Diversity Weight Test",
            description="Test different diversity weights in recommendations",
            variants=["no_diversity", "low_diversity", "high_diversity"],
            traffic_allocation={
                "no_diversity": 0.33,
                "low_diversity": 0.34,
                "high_diversity": 0.33
            },
            start_date=datetime.now()
        )

        logger.info("Initialized default experiments")

    def get_stats(self) -> Dict:
        """Get A/B testing statistics"""
        return {
            "total_experiments": len(self.experiments),
            "active_experiments": sum(
                1 for exp in self.experiments.values() if exp.is_active
            ),
            "total_assignments": sum(
                len(assignments) for assignments in self.assignments.values()
            ),
            "unique_users": len(self.assignments)
        }
