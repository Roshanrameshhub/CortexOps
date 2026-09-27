"""
Feature engineering for ML recommendations
"""
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from sklearn.preprocessing import StandardScaler, LabelEncoder, MinMaxScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class FeatureEngineer:
    """Main feature engineering class"""

    def __init__(self):
        self.scalers: Dict[str, StandardScaler] = {}
        self.encoders: Dict[str, LabelEncoder] = {}
        self.vectorizers: Dict[str, TfidfVectorizer] = {}
        self.fitted = False

    def engineer_user_features(
        self,
        interactions_df: pd.DataFrame,
        users_df: Optional[pd.DataFrame] = None
    ) -> pd.DataFrame:
        """
        Engineer user features from interactions and user data

        Args:
            interactions_df: DataFrame with user interactions
            users_df: Optional DataFrame with user metadata

        Returns:
            DataFrame with user features
        """
        logger.info("Engineering user features...")

        # Aggregate interaction statistics
        user_stats = self._calculate_user_statistics(interactions_df)

        # Behavioral features
        user_features = self._calculate_user_behavioral_features(interactions_df)

        # Merge with user stats
        user_features = pd.merge(
            user_features, user_stats, on='user_id', how='left'
        )

        # Add user metadata if available
        if users_df is not None:
            user_features = pd.merge(
                user_features, users_df, on='user_id', how='left'
            )

        # Calculate derived features
        user_features = self._calculate_derived_user_features(user_features)

        # Normalize features
        user_features = self._normalize_user_features(user_features)

        logger.info(f"Engineered {len(user_features)} user feature vectors")
        return user_features

    def _calculate_user_statistics(self, interactions_df: pd.DataFrame) -> pd.DataFrame:
        """Calculate basic user statistics"""
        stats = interactions_df.groupby('user_id').agg({
            'service_id': 'count',  # total interactions
            'rating': ['mean', 'std', 'count'],
            'timestamp': ['min', 'max']
        }).reset_index()

        stats.columns = [
            'user_id',
            'total_interactions',
            'avg_rating',
            'rating_std',
            'rating_count',
            'first_interaction',
            'last_interaction'
        ]

        return stats

    def _calculate_user_behavioral_features(
        self, interactions_df: pd.DataFrame
    ) -> pd.DataFrame:
        """Calculate behavioral features"""
        # Unique services used
        unique_services = interactions_df.groupby('user_id')['service_id'].nunique().reset_index()
        unique_services.columns = ['user_id', 'unique_services_used']

        # Interaction frequency
        interactions_df['date'] = pd.to_datetime(interactions_df['timestamp']).dt.date
        date_range = interactions_df.groupby('user_id')['date'].agg(['min', 'max'])
        date_range['days_active'] = (date_range['max'] - date_range['min']).dt.days + 1

        frequency = interactions_df.groupby('user_id').size() / date_range['days_active']
        frequency = frequency.reset_index()
        frequency.columns = ['user_id', 'interaction_frequency']

        # Merge features
        features = pd.merge(unique_services, frequency, on='user_id', how='outer')

        return features

    def _calculate_derived_user_features(self, user_features: pd.DataFrame) -> pd.DataFrame:
        """Calculate derived features"""
        # Recency (days since last interaction)
        if 'last_interaction' in user_features.columns:
            user_features['recency_days'] = (
                datetime.now() - pd.to_datetime(user_features['last_interaction'])
            ).dt.days

        # Account age (days since first interaction)
        if 'first_interaction' in user_features.columns:
            user_features['account_age_days'] = (
                datetime.now() - pd.to_datetime(user_features['first_interaction'])
            ).dt.days

        # Engagement score (composite)
        if all(col in user_features.columns for col in ['total_interactions', 'recency_days']):
            user_features['engagement_score'] = (
                user_features['total_interactions'] / (user_features['recency_days'] + 1)
            )

        return user_features

    def _normalize_user_features(self, user_features: pd.DataFrame) -> pd.DataFrame:
        """Normalize numerical features"""
        numerical_cols = user_features.select_dtypes(include=[np.number]).columns

        if not self.fitted:
            self.scalers['user'] = StandardScaler()
            user_features[numerical_cols] = self.scalers['user'].fit_transform(
                user_features[numerical_cols].fillna(0)
            )
        else:
            user_features[numerical_cols] = self.scalers['user'].transform(
                user_features[numerical_cols].fillna(0)
            )

        return user_features

    def engineer_item_features(
        self,
        services_df: pd.DataFrame,
        interactions_df: Optional[pd.DataFrame] = None
    ) -> pd.DataFrame:
        """
        Engineer item/service features

        Args:
            services_df: DataFrame with service metadata
            interactions_df: Optional DataFrame with interactions for popularity metrics

        Returns:
            DataFrame with service features
        """
        logger.info("Engineering item features...")

        item_features = services_df.copy()

        # Text features from description
        if 'description' in item_features.columns:
            item_features = self._extract_text_features(item_features, 'description')

        # Category encoding
        if 'category' in item_features.columns:
            item_features = self._encode_categories(item_features)

        # Tag features
        if 'tags' in item_features.columns:
            item_features = self._process_tags(item_features)

        # Popularity metrics from interactions
        if interactions_df is not None:
            popularity = self._calculate_item_popularity(interactions_df)
            item_features = pd.merge(
                item_features, popularity, on='service_id', how='left'
            )

        # Temporal features
        if 'created_at' in item_features.columns:
            item_features = self._calculate_item_temporal_features(item_features)

        # Normalize features
        item_features = self._normalize_item_features(item_features)

        logger.info(f"Engineered {len(item_features)} item feature vectors")
        return item_features

    def _extract_text_features(
        self, df: pd.DataFrame, text_column: str
    ) -> pd.DataFrame:
        """Extract TF-IDF features from text"""
        if text_column not in self.vectorizers:
            self.vectorizers[text_column] = TfidfVectorizer(
                max_features=100,
                stop_words='english',
                ngram_range=(1, 2)
            )

        if not self.fitted:
            tfidf_matrix = self.vectorizers[text_column].fit_transform(
                df[text_column].fillna('')
            )
        else:
            tfidf_matrix = self.vectorizers[text_column].transform(
                df[text_column].fillna('')
            )

        # Create DataFrame with TF-IDF features
        tfidf_df = pd.DataFrame(
            tfidf_matrix.toarray(),
            columns=[f'tfidf_{i}' for i in range(tfidf_matrix.shape[1])],
            index=df.index
        )

        return pd.concat([df, tfidf_df], axis=1)

    def _encode_categories(self, df: pd.DataFrame) -> pd.DataFrame:
        """Encode categorical features"""
        if 'category' not in self.encoders:
            self.encoders['category'] = LabelEncoder()

        if not self.fitted:
            df['category_encoded'] = self.encoders['category'].fit_transform(
                df['category'].fillna('unknown')
            )
        else:
            df['category_encoded'] = self.encoders['category'].transform(
                df['category'].fillna('unknown')
            )

        # One-hot encoding
        category_dummies = pd.get_dummies(
            df['category'], prefix='category'
        )
        df = pd.concat([df, category_dummies], axis=1)

        return df

    def _process_tags(self, df: pd.DataFrame) -> pd.DataFrame:
        """Process and encode tags"""
        # Assuming tags is a list or comma-separated string
        if df['tags'].dtype == 'object':
            # Count number of tags
            df['tag_count'] = df['tags'].apply(
                lambda x: len(x.split(',')) if isinstance(x, str) else 0
            )

            # Create TF-IDF from tags
            df['tags_text'] = df['tags'].fillna('').astype(str)
            df = self._extract_text_features(df, 'tags_text')

        return df

    def _calculate_item_popularity(self, interactions_df: pd.DataFrame) -> pd.DataFrame:
        """Calculate item popularity metrics"""
        popularity = interactions_df.groupby('service_id').agg({
            'user_id': 'count',  # usage_count
            'rating': ['mean', 'count']
        }).reset_index()

        popularity.columns = [
            'service_id', 'usage_count', 'avg_rating', 'rating_count'
        ]

        # Normalize scores
        popularity['popularity_score'] = MinMaxScaler().fit_transform(
            popularity[['usage_count']]
        )

        # Calculate trending score (weighted by recency)
        if 'timestamp' in interactions_df.columns:
            recent_interactions = interactions_df[
                pd.to_datetime(interactions_df['timestamp']) >
                (datetime.now() - timedelta(days=30))
            ]

            trending = recent_interactions.groupby('service_id').size().reset_index()
            trending.columns = ['service_id', 'recent_count']

            popularity = pd.merge(popularity, trending, on='service_id', how='left')
            popularity['recent_count'] = popularity['recent_count'].fillna(0)

            popularity['trending_score'] = MinMaxScaler().fit_transform(
                popularity[['recent_count']]
            )

        return popularity

    def _calculate_item_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate temporal features for items"""
        if 'created_at' in df.columns:
            df['age_days'] = (
                datetime.now() - pd.to_datetime(df['created_at'])
            ).dt.days

        if 'updated_at' in df.columns:
            df['days_since_update'] = (
                datetime.now() - pd.to_datetime(df['updated_at'])
            ).dt.days

        return df

    def _normalize_item_features(self, item_features: pd.DataFrame) -> pd.DataFrame:
        """Normalize numerical item features"""
        numerical_cols = item_features.select_dtypes(include=[np.number]).columns

        if not self.fitted:
            self.scalers['item'] = StandardScaler()
            item_features[numerical_cols] = self.scalers['item'].fit_transform(
                item_features[numerical_cols].fillna(0)
            )
        else:
            item_features[numerical_cols] = self.scalers['item'].transform(
                item_features[numerical_cols].fillna(0)
            )

        return item_features

    def engineer_context_features(
        self, context: Dict
    ) -> np.ndarray:
        """
        Engineer context features for real-time inference

        Args:
            context: Dictionary with context information

        Returns:
            Feature vector
        """
        features = []

        # Temporal features (cyclical encoding)
        if 'hour_of_day' in context:
            hour = context['hour_of_day']
            features.extend([
                np.sin(2 * np.pi * hour / 24),
                np.cos(2 * np.pi * hour / 24)
            ])

        if 'day_of_week' in context:
            day = context['day_of_week']
            features.extend([
                np.sin(2 * np.pi * day / 7),
                np.cos(2 * np.pi * day / 7)
            ])

        if 'month' in context:
            month = context['month']
            features.extend([
                np.sin(2 * np.pi * month / 12),
                np.cos(2 * np.pi * month / 12)
            ])

        # Session features
        if 'session_length' in context:
            features.append(context['session_length'])

        if 'items_viewed_in_session' in context:
            features.append(context['items_viewed_in_session'])

        # Device features (one-hot)
        device_types = ['desktop', 'mobile', 'tablet']
        device = context.get('device_type', 'desktop')
        features.extend([1 if d == device else 0 for d in device_types])

        return np.array(features)

    def create_interaction_matrix(
        self, interactions_df: pd.DataFrame, implicit: bool = False
    ) -> Tuple[np.ndarray, Dict, Dict]:
        """
        Create user-item interaction matrix

        Args:
            interactions_df: DataFrame with interactions
            implicit: If True, use binary matrix; else use ratings

        Returns:
            Tuple of (matrix, user_id_map, item_id_map)
        """
        # Create mappings
        unique_users = interactions_df['user_id'].unique()
        unique_items = interactions_df['service_id'].unique()

        user_id_map = {uid: idx for idx, uid in enumerate(unique_users)}
        item_id_map = {sid: idx for idx, sid in enumerate(unique_items)}

        # Create matrix
        n_users = len(unique_users)
        n_items = len(unique_items)
        matrix = np.zeros((n_users, n_items))

        for _, row in interactions_df.iterrows():
            user_idx = user_id_map[row['user_id']]
            item_idx = item_id_map[row['service_id']]

            if implicit:
                matrix[user_idx, item_idx] = 1
            else:
                if 'rating' in row and pd.notna(row['rating']):
                    matrix[user_idx, item_idx] = row['rating']
                else:
                    matrix[user_idx, item_idx] = 1

        logger.info(
            f"Created interaction matrix: {matrix.shape} "
            f"with {np.count_nonzero(matrix)} interactions "
            f"(sparsity: {1 - np.count_nonzero(matrix) / matrix.size:.4f})"
        )

        return matrix, user_id_map, item_id_map

    def fit(self, user_features: pd.DataFrame, item_features: pd.DataFrame):
        """Fit all transformers"""
        self.fitted = True

    def transform(
        self,
        user_features: pd.DataFrame,
        item_features: pd.DataFrame
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Transform features using fitted transformers"""
        user_features = self._normalize_user_features(user_features)
        item_features = self._normalize_item_features(item_features)
        return user_features, item_features
