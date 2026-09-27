"""
Neural Collaborative Filtering using deep learning
"""
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model
import numpy as np
from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class NeuralCollaborativeFiltering(Model):
    """
    Neural Collaborative Filtering model
    Combines matrix factorization with deep neural networks
    """

    def __init__(
        self,
        n_users: int,
        n_items: int,
        embedding_dim: int = 64,
        hidden_layers: List[int] = [128, 64, 32],
        dropout_rate: float = 0.3,
        **kwargs
    ):
        """
        Initialize NCF model

        Args:
            n_users: Number of users
            n_items: Number of items
            embedding_dim: Dimension of embeddings
            hidden_layers: List of hidden layer sizes
            dropout_rate: Dropout rate for regularization
        """
        super().__init__(**kwargs)

        self.n_users = n_users
        self.n_items = n_items
        self.embedding_dim = embedding_dim

        # User and item embeddings
        self.user_embedding = layers.Embedding(
            input_dim=n_users,
            output_dim=embedding_dim,
            embeddings_regularizer=keras.regularizers.l2(1e-6),
            name='user_embedding'
        )

        self.item_embedding = layers.Embedding(
            input_dim=n_items,
            output_dim=embedding_dim,
            embeddings_regularizer=keras.regularizers.l2(1e-6),
            name='item_embedding'
        )

        # MLP layers
        self.hidden_layers = []
        for i, units in enumerate(hidden_layers):
            self.hidden_layers.append(
                layers.Dense(
                    units,
                    activation='relu',
                    kernel_regularizer=keras.regularizers.l2(1e-6),
                    name=f'dense_{i}'
                )
            )
            self.hidden_layers.append(
                layers.Dropout(dropout_rate, name=f'dropout_{i}')
            )

        # Output layer
        self.output_layer = layers.Dense(1, activation='sigmoid', name='output')

    def call(self, inputs, training=False):
        """
        Forward pass

        Args:
            inputs: Tuple of (user_ids, item_ids)
            training: Whether in training mode

        Returns:
            Predictions
        """
        user_ids, item_ids = inputs

        # Get embeddings
        user_emb = self.user_embedding(user_ids)
        item_emb = self.item_embedding(item_ids)

        # Concatenate embeddings
        x = layers.concatenate([user_emb, item_emb])

        # Pass through MLP
        for layer in self.hidden_layers:
            x = layer(x, training=training)

        # Output
        output = self.output_layer(x)

        return output

    def get_config(self):
        """Get model configuration"""
        config = super().get_config()
        config.update({
            'n_users': self.n_users,
            'n_items': self.n_items,
            'embedding_dim': self.embedding_dim
        })
        return config


class WideAndDeepModel(Model):
    """
    Wide & Deep Learning for Recommendations
    Combines memorization (wide) and generalization (deep)
    """

    def __init__(
        self,
        n_users: int,
        n_items: int,
        n_features: int,
        embedding_dim: int = 32,
        deep_layers: List[int] = [256, 128, 64],
        dropout_rate: float = 0.3,
        **kwargs
    ):
        """
        Initialize Wide & Deep model

        Args:
            n_users: Number of users
            n_items: Number of items
            n_features: Number of additional features
            embedding_dim: Dimension of embeddings
            deep_layers: List of deep layer sizes
            dropout_rate: Dropout rate
        """
        super().__init__(**kwargs)

        # Embeddings for deep part
        self.user_embedding = layers.Embedding(
            input_dim=n_users,
            output_dim=embedding_dim,
            name='user_emb_deep'
        )

        self.item_embedding = layers.Embedding(
            input_dim=n_items,
            output_dim=embedding_dim,
            name='item_emb_deep'
        )

        # Deep layers
        self.deep_layers = []
        for i, units in enumerate(deep_layers):
            self.deep_layers.append(
                layers.Dense(units, activation='relu', name=f'deep_{i}')
            )
            self.deep_layers.append(
                layers.Dropout(dropout_rate, name=f'deep_dropout_{i}')
            )

        # Wide layer (linear)
        self.wide_layer = layers.Dense(1, name='wide')

        # Final combination layer
        self.output_layer = layers.Dense(1, activation='sigmoid', name='output')

    def call(self, inputs, training=False):
        """Forward pass"""
        user_ids, item_ids, features = inputs

        # Wide part (linear model on features)
        wide = self.wide_layer(features)

        # Deep part
        user_emb = self.user_embedding(user_ids)
        item_emb = self.item_embedding(item_ids)

        # Concatenate embeddings and features
        deep = layers.concatenate([user_emb, item_emb, features])

        # Pass through deep layers
        for layer in self.deep_layers:
            deep = layer(deep, training=training)

        # Combine wide and deep
        combined = layers.concatenate([wide, deep])

        # Output
        output = self.output_layer(combined)

        return output


class NeuralMatrixFactorization(Model):
    """
    Neural Matrix Factorization (NeuMF)
    Generalizes matrix factorization with neural networks
    """

    def __init__(
        self,
        n_users: int,
        n_items: int,
        mf_embedding_dim: int = 64,
        mlp_embedding_dim: int = 64,
        mlp_hidden: List[int] = [128, 64, 32],
        dropout_rate: float = 0.2,
        **kwargs
    ):
        """
        Initialize NeuMF model

        Args:
            n_users: Number of users
            n_items: Number of items
            mf_embedding_dim: MF embedding dimension
            mlp_embedding_dim: MLP embedding dimension
            mlp_hidden: MLP hidden layer sizes
            dropout_rate: Dropout rate
        """
        super().__init__(**kwargs)

        # MF embeddings (generalized matrix factorization)
        self.mf_user_embedding = layers.Embedding(
            n_users, mf_embedding_dim, name='mf_user_emb'
        )
        self.mf_item_embedding = layers.Embedding(
            n_items, mf_embedding_dim, name='mf_item_emb'
        )

        # MLP embeddings
        self.mlp_user_embedding = layers.Embedding(
            n_users, mlp_embedding_dim, name='mlp_user_emb'
        )
        self.mlp_item_embedding = layers.Embedding(
            n_items, mlp_embedding_dim, name='mlp_item_emb'
        )

        # MLP layers
        self.mlp_layers = []
        for i, units in enumerate(mlp_hidden):
            self.mlp_layers.append(
                layers.Dense(units, activation='relu', name=f'mlp_{i}')
            )
            self.mlp_layers.append(
                layers.Dropout(dropout_rate, name=f'mlp_dropout_{i}')
            )

        # Final prediction layer
        self.output_layer = layers.Dense(1, activation='sigmoid', name='prediction')

    def call(self, inputs, training=False):
        """Forward pass"""
        user_ids, item_ids = inputs

        # MF part (element-wise product)
        mf_user = self.mf_user_embedding(user_ids)
        mf_item = self.mf_item_embedding(item_ids)
        mf_vector = layers.multiply([mf_user, mf_item])

        # MLP part
        mlp_user = self.mlp_user_embedding(user_ids)
        mlp_item = self.mlp_item_embedding(item_ids)
        mlp_vector = layers.concatenate([mlp_user, mlp_item])

        for layer in self.mlp_layers:
            mlp_vector = layer(mlp_vector, training=training)

        # Concatenate MF and MLP parts
        combined = layers.concatenate([mf_vector, mlp_vector])

        # Prediction
        output = self.output_layer(combined)

        return output


class DeepCrossNetwork(Model):
    """
    Deep & Cross Network (DCN)
    Automatically learns feature crosses
    """

    def __init__(
        self,
        n_users: int,
        n_items: int,
        n_features: int,
        embedding_dim: int = 32,
        n_cross_layers: int = 3,
        deep_layers: List[int] = [256, 128],
        dropout_rate: float = 0.3,
        **kwargs
    ):
        """
        Initialize DCN model

        Args:
            n_users: Number of users
            n_items: Number of items
            n_features: Number of features
            embedding_dim: Embedding dimension
            n_cross_layers: Number of cross layers
            deep_layers: Deep network layer sizes
            dropout_rate: Dropout rate
        """
        super().__init__(**kwargs)

        # Embeddings
        self.user_embedding = layers.Embedding(n_users, embedding_dim)
        self.item_embedding = layers.Embedding(n_items, embedding_dim)

        # Cross layers
        self.cross_layers = []
        for i in range(n_cross_layers):
            self.cross_layers.append(
                CrossLayer(name=f'cross_{i}')
            )

        # Deep layers
        self.deep_layers = []
        for i, units in enumerate(deep_layers):
            self.deep_layers.append(
                layers.Dense(units, activation='relu', name=f'deep_{i}')
            )
            self.deep_layers.append(
                layers.Dropout(dropout_rate, name=f'deep_dropout_{i}')
            )

        # Output layer
        self.output_layer = layers.Dense(1, activation='sigmoid')

    def call(self, inputs, training=False):
        """Forward pass"""
        user_ids, item_ids, features = inputs

        # Get embeddings
        user_emb = self.user_embedding(user_ids)
        item_emb = self.item_embedding(item_ids)

        # Input vector
        x0 = layers.concatenate([user_emb, item_emb, features])

        # Cross network
        x_cross = x0
        for cross_layer in self.cross_layers:
            x_cross = cross_layer(x0, x_cross)

        # Deep network
        x_deep = x0
        for layer in self.deep_layers:
            x_deep = layer(x_deep, training=training)

        # Concatenate cross and deep
        combined = layers.concatenate([x_cross, x_deep])

        # Output
        output = self.output_layer(combined)

        return output


class CrossLayer(layers.Layer):
    """
    Cross layer for DCN
    Learns explicit feature crosses
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def build(self, input_shape):
        self.w = self.add_weight(
            shape=(input_shape[-1], 1),
            initializer='glorot_uniform',
            trainable=True,
            name='weight'
        )
        self.b = self.add_weight(
            shape=(input_shape[-1],),
            initializer='zeros',
            trainable=True,
            name='bias'
        )

    def call(self, x0, x):
        """
        Forward pass
        x_{l+1} = x_0 * x_l^T * w_l + b_l + x_l
        """
        xw = tf.tensordot(x, self.w, axes=1)
        return x0 * xw + self.b + x


class NCFTrainer:
    """Trainer for neural collaborative filtering models"""

    def __init__(
        self,
        model: Model,
        learning_rate: float = 0.001,
        loss: str = 'binary_crossentropy'
    ):
        """
        Initialize trainer

        Args:
            model: Neural CF model
            learning_rate: Learning rate
            loss: Loss function
        """
        self.model = model
        self.optimizer = keras.optimizers.Adam(learning_rate=learning_rate)
        self.loss_fn = keras.losses.get(loss)

        # Compile model
        self.model.compile(
            optimizer=self.optimizer,
            loss=self.loss_fn,
            metrics=['accuracy', 'AUC']
        )

    def train(
        self,
        train_data: Tuple,
        val_data: Optional[Tuple] = None,
        epochs: int = 10,
        batch_size: int = 256,
        callbacks: Optional[List] = None
    ):
        """
        Train the model

        Args:
            train_data: Training data (X, y)
            val_data: Validation data
            epochs: Number of epochs
            batch_size: Batch size
            callbacks: List of callbacks

        Returns:
            Training history
        """
        logger.info("Starting model training...")

        history = self.model.fit(
            x=train_data[0],
            y=train_data[1],
            validation_data=val_data,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks or self._default_callbacks(),
            verbose=1
        )

        logger.info("Training completed")
        return history

    def _default_callbacks(self) -> List:
        """Default training callbacks"""
        return [
            keras.callbacks.EarlyStopping(
                monitor='val_loss',
                patience=3,
                restore_best_weights=True
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=2,
                min_lr=1e-6
            )
        ]

    def save_model(self, filepath: str):
        """Save model to disk"""
        self.model.save(filepath)
        logger.info(f"Model saved to {filepath}")

    def load_model(self, filepath: str):
        """Load model from disk"""
        self.model = keras.models.load_model(filepath)
        logger.info(f"Model loaded from {filepath}")
