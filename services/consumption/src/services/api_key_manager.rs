use anyhow::{Context, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use chrono::{Duration, Utc};
use rand::Rng;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::models::{ApiKey, ApiKeyResponse, CreateApiKeyRequest};

/// API key manager for generation, validation, and revocation
#[derive(Clone)]
pub struct ApiKeyManager {
    db: Arc<PgPool>,
}

impl ApiKeyManager {
    pub fn new(db: PgPool) -> Self {
        Self { db: Arc::new(db) }
    }

    /// Generate a new API key
    pub async fn create_api_key(
        &self,
        consumer_id: Uuid,
        request: CreateApiKeyRequest,
    ) -> Result<ApiKeyResponse> {
        // Generate random API key
        let api_key = self.generate_key();

        // Hash the key for storage
        let key_hash = self.hash_key(&api_key)?;

        // Calculate expiry
        let expires_at = request
            .expires_in_days
            .map(|days| Utc::now() + Duration::days(days));

        let service_id = Uuid::parse_str(&request.service_id)
            .context("Invalid service ID")?;

        let id = Uuid::new_v4();

        // Insert into database
        sqlx::query(
            r#"
            INSERT INTO api_keys (
                id, key_hash, consumer_id, service_id, tier,
                created_at, expires_at, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(id)
        .bind(&key_hash)
        .bind(consumer_id)
        .bind(service_id)
        .bind(format!("{:?}", request.tier).to_lowercase())
        .bind(Utc::now())
        .bind(expires_at)
        .bind(sqlx::types::Json(serde_json::json!({})))
        .execute(self.db.as_ref())
        .await
        .context("Failed to create API key")?;

        debug!(
            id = %id,
            consumer_id = %consumer_id,
            service_id = %service_id,
            tier = ?request.tier,
            "API key created"
        );

        Ok(ApiKeyResponse {
            id,
            key: api_key,
            service_id,
            tier: request.tier,
            created_at: Utc::now(),
            expires_at,
        })
    }

    /// Validate an API key and return the associated ApiKey record
    pub async fn validate_key(&self, api_key: &str) -> Result<ApiKey> {
        // We need to fetch all keys and compare hashes (not ideal for scale)
        // In production, consider using a key prefix to narrow down candidates
        let key_hash = self.hash_key(api_key)?;

        let api_key_record = sqlx::query_as::<_, ApiKey>(
            r#"
            SELECT id, key_hash, consumer_id, service_id, tier,
                   created_at, expires_at, revoked_at, metadata
            FROM api_keys
            WHERE key_hash = $1
            "#,
        )
        .bind(&key_hash)
        .fetch_optional(self.db.as_ref())
        .await
        .context("Failed to validate API key")?
        .context("Invalid API key")?;

        if !api_key_record.is_valid() {
            anyhow::bail!("API key is expired or revoked");
        }

        Ok(api_key_record)
    }

    /// Revoke an API key
    pub async fn revoke_key(&self, key_id: Uuid, consumer_id: Uuid) -> Result<()> {
        let result = sqlx::query(
            r#"
            UPDATE api_keys
            SET revoked_at = NOW()
            WHERE id = $1 AND consumer_id = $2 AND revoked_at IS NULL
            "#,
        )
        .bind(key_id)
        .bind(consumer_id)
        .execute(self.db.as_ref())
        .await
        .context("Failed to revoke API key")?;

        if result.rows_affected() == 0 {
            anyhow::bail!("API key not found or already revoked");
        }

        debug!(
            key_id = %key_id,
            consumer_id = %consumer_id,
            "API key revoked"
        );

        Ok(())
    }

    /// List all API keys for a consumer
    pub async fn list_keys(&self, consumer_id: Uuid) -> Result<Vec<ApiKey>> {
        let keys = sqlx::query_as::<_, ApiKey>(
            r#"
            SELECT id, key_hash, consumer_id, service_id, tier,
                   created_at, expires_at, revoked_at, metadata
            FROM api_keys
            WHERE consumer_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(consumer_id)
        .fetch_all(self.db.as_ref())
        .await
        .context("Failed to list API keys")?;

        Ok(keys)
    }

    /// Generate a random API key
    fn generate_key(&self) -> String {
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ\
                                  abcdefghijklmnopqrstuvwxyz\
                                  0123456789";
        const KEY_LENGTH: usize = 48;

        let mut rng = rand::thread_rng();

        let key: String = (0..KEY_LENGTH)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect();

        format!("llm_mk_{}", key)
    }

    /// Hash an API key using Argon2
    fn hash_key(&self, key: &str) -> Result<String> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();

        let hash = argon2
            .hash_password(key.as_bytes(), &salt)
            .map_err(|e| anyhow::anyhow!("Failed to hash key: {}", e))?
            .to_string();

        Ok(hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_key() {
        let manager = ApiKeyManager {
            db: Arc::new(PgPool::connect_lazy("postgres://localhost").unwrap()),
        };

        let key1 = manager.generate_key();
        let key2 = manager.generate_key();

        assert!(key1.starts_with("llm_mk_"));
        assert!(key2.starts_with("llm_mk_"));
        assert_ne!(key1, key2);
        assert_eq!(key1.len(), 55); // "llm_mk_" + 48 chars
    }

    #[test]
    fn test_hash_key() {
        let manager = ApiKeyManager {
            db: Arc::new(PgPool::connect_lazy("postgres://localhost").unwrap()),
        };

        let key = "test_key_12345";
        let hash1 = manager.hash_key(key).unwrap();
        let hash2 = manager.hash_key(key).unwrap();

        // Argon2 produces different hashes for same input (due to salt)
        assert_ne!(hash1, hash2);
        assert!(hash1.starts_with("$argon2"));
    }
}
