# Security Policy

## Reporting Security Vulnerabilities

We take the security of LLM-Marketplace seriously. If you discover a security vulnerability, please follow these steps:

### Do NOT

- Open a public GitHub issue
- Disclose the vulnerability publicly before we've had a chance to address it
- Exploit the vulnerability beyond the minimum necessary to demonstrate the issue

### DO

1. **Email us privately** at security@llm-marketplace.dev
2. **Provide details** including:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
3. **Allow us time** to investigate and fix (we aim for 90 days maximum)

### Response Timeline

- **24 hours**: Initial acknowledgment
- **7 days**: Preliminary assessment and severity classification
- **30-90 days**: Fix development and deployment
- **After fix**: Public disclosure (coordinated with reporter)

### Rewards

We operate a bug bounty program for qualifying vulnerabilities:

- **Critical**: Up to $5,000
- **High**: Up to $2,000
- **Medium**: Up to $500
- **Low**: Public acknowledgment

---

## Security Architecture

### Threat Model

#### Assets to Protect

1. **User Data**: Credentials, personal information, API keys
2. **Asset Content**: Uploaded prompts, tools, configurations
3. **System Integrity**: Preventing malicious asset uploads
4. **Service Availability**: Protection against DDoS and abuse

#### Threat Actors

1. **External Attackers**: Attempting unauthorized access
2. **Malicious Publishers**: Uploading compromised assets
3. **Compromised Accounts**: Stolen credentials
4. **Supply Chain Attacks**: Dependency poisoning

#### Attack Vectors

1. **Network**: API exploitation, DDoS
2. **Application**: Injection attacks, XSS, CSRF
3. **Authentication**: Credential theft, session hijacking
4. **Content**: Malicious assets, prompt injection
5. **Infrastructure**: Container escape, privilege escalation

---

## Security Controls

### 1. Authentication & Authorization

#### Password Security

- **Hashing**: Argon2id with secure parameters
- **Complexity**: Minimum 12 characters, complexity requirements
- **Breach Detection**: Integration with HaveIBeenPwned API
- **Rate Limiting**: 5 failed attempts = 15-minute lockout

```rust
// Password hashing implementation
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2, ParamsBuilder,
};

pub fn hash_password(password: &str) -> Result<String, Error> {
    let salt = SaltString::generate(&mut OsRng);

    let params = ParamsBuilder::new()
        .m_cost(19456)      // 19 MB memory
        .t_cost(2)          // 2 iterations
        .p_cost(1)          // 1 lane
        .build()
        .unwrap();

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;

    Ok(hash.to_string())
}
```

#### Multi-Factor Authentication (2FA)

- **TOTP**: Time-based one-time passwords (RFC 6238)
- **Backup Codes**: 10 single-use recovery codes
- **WebAuthn**: FIDO2 hardware key support

#### JWT Tokens

- **Algorithm**: RS256 (RSA with SHA-256)
- **Expiry**: 1 hour (access), 7 days (refresh)
- **Rotation**: Automatic key rotation every 90 days
- **Revocation**: Token blacklist in Redis

```rust
// JWT configuration
pub struct JwtConfig {
    pub algorithm: Algorithm::RS256,
    pub access_token_expiry: Duration::hours(1),
    pub refresh_token_expiry: Duration::days(7),
    pub issuer: "llm-marketplace.dev",
    pub audience: "api.llm-marketplace.dev",
}
```

#### API Keys

- **Format**: `llm_mp_{32-char-random}`
- **Hashing**: SHA-256 before storage
- **Scopes**: Fine-grained permissions (read:assets, write:assets, etc.)
- **Expiry**: Optional expiration dates
- **Rate Limits**: Per-key rate limiting

#### Authorization Model (RBAC + ABAC)

```rust
// Role-Based Access Control
pub enum Role {
    User,          // Basic user
    Publisher,     // Can publish assets
    Moderator,     // Can moderate content
    Admin,         // Full access
}

// Attribute-Based Access Control
pub fn can_modify_asset(user: &User, asset: &Asset) -> bool {
    // Owner can always modify
    if asset.author_id == user.id {
        return true;
    }

    // Organization admins can modify org assets
    if let Some(org_id) = asset.organization_id {
        if user.is_org_admin(org_id) {
            return true;
        }
    }

    // Admins can modify anything
    if user.role == Role::Admin {
        return true;
    }

    false
}
```

---

### 2. Asset Security

#### Digital Signatures

All published assets must be cryptographically signed:

```rust
use ed25519_dalek::{Keypair, Signature, Signer};

pub fn sign_asset(keypair: &Keypair, asset: &Asset) -> Signature {
    let message = canonical_serialize(asset);
    keypair.sign(&message)
}

pub fn verify_signature(
    public_key: &PublicKey,
    asset: &Asset,
    signature: &Signature,
) -> bool {
    let message = canonical_serialize(asset);
    public_key.verify(&message, signature).is_ok()
}

// Canonical serialization for consistent hashing
fn canonical_serialize(asset: &Asset) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(asset.id.as_bytes());
    data.extend_from_slice(asset.version.as_bytes());
    data.extend_from_slice(asset.content_hash.as_bytes());
    data.extend_from_slice(&asset.size_bytes.to_le_bytes());
    data
}
```

#### Malware Scanning

Multi-layered scanning approach:

1. **ClamAV**: Traditional malware detection
2. **YARA Rules**: Custom pattern matching
3. **Static Analysis**: Code analysis for suspicious patterns
4. **Sandboxed Execution**: Runtime behavior analysis

```rust
pub async fn comprehensive_scan(asset: &Asset) -> Result<ScanReport, Error> {
    let content = download_asset_content(asset).await?;

    // Parallel scanning
    let (clamav_result, yara_result, static_result, sandbox_result) = tokio::join!(
        scan_with_clamav(&content),
        scan_with_yara(&content),
        static_analysis(&content),
        sandbox_execution(&content),
    );

    let findings = vec![
        clamav_result?,
        yara_result?,
        static_result?,
        sandbox_result?,
    ];

    // Aggregate results
    ScanReport::from_findings(findings)
}
```

#### Prompt Injection Detection

LLM-specific security scanning:

```rust
pub struct PromptInjectionScanner {
    patterns: Vec<InjectionPattern>,
    llm_detector: LLMClassifier,
}

impl PromptInjectionScanner {
    pub async fn scan(&self, prompt: &str) -> ScanResult {
        let mut findings = Vec::new();

        // Pattern matching
        for pattern in &self.patterns {
            if pattern.matches(prompt) {
                findings.push(Finding {
                    severity: pattern.severity,
                    description: format!("Potential injection: {}", pattern.name),
                    location: pattern.location(prompt),
                });
            }
        }

        // ML-based detection
        let ml_score = self.llm_detector.predict(prompt).await?;
        if ml_score > 0.7 {
            findings.push(Finding {
                severity: Severity::High,
                description: format!("ML detector confidence: {:.2}", ml_score),
            });
        }

        ScanResult { findings }
    }
}

// Common injection patterns
const INJECTION_PATTERNS: &[&str] = &[
    r"ignore (previous|all) instructions?",
    r"disregard (previous|all) (instructions?|prompts?)",
    r"you are now in.*mode",
    r"<\|.*\|>",  // Special tokens
    r"system:.*\n",
];
```

#### Content Hash Verification

```rust
use sha2::{Sha256, Digest};

pub fn calculate_content_hash(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
}

pub fn verify_content_integrity(
    content: &[u8],
    expected_hash: &str,
) -> Result<(), IntegrityError> {
    let actual_hash = calculate_content_hash(content);

    if actual_hash != expected_hash {
        return Err(IntegrityError::HashMismatch {
            expected: expected_hash.to_string(),
            actual: actual_hash,
        });
    }

    Ok(())
}
```

---

### 3. Network Security

#### TLS Configuration

```nginx
# Nginx TLS configuration
ssl_protocols TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_prefer_server_ciphers off;

ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

ssl_stapling on;
ssl_stapling_verify on;

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

#### CORS Policy

```rust
use actix_cors::Cors;

pub fn configure_cors() -> Cors {
    Cors::default()
        .allowed_origin_fn(|origin, _req_head| {
            // Only allow trusted domains
            origin.as_bytes().ends_with(b".llm-marketplace.dev") ||
            origin.as_bytes() == b"https://llm-marketplace.dev"
        })
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
        ])
        .expose_headers(vec![
            header::CONTENT_LENGTH,
            header::CONTENT_TYPE,
        ])
        .max_age(3600)
        .supports_credentials()
}
```

#### Rate Limiting

```rust
use actix_web_lab::middleware::RateLimiter;
use std::time::Duration;

pub fn configure_rate_limits() -> RateLimiter {
    RateLimiter::builder()
        // Global limit
        .add_bucket(
            "global",
            1000,
            Duration::from_secs(60),
        )
        // Per-IP limit
        .add_bucket(
            "per-ip",
            100,
            Duration::from_secs(60),
        )
        // Auth endpoint limit
        .add_bucket(
            "auth",
            5,
            Duration::from_secs(60),
        )
        .build()
}
```

#### DDoS Protection

- **Cloudflare**: Layer 7 DDoS protection
- **Rate Limiting**: Application-level rate limits
- **Connection Limits**: Max connections per IP
- **Request Size Limits**: 10MB max upload

---

### 4. Data Protection

#### Encryption at Rest

**Database Encryption:**

```sql
-- PostgreSQL encryption
CREATE EXTENSION pgcrypto;

-- Encrypt sensitive columns
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    key_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash
    encrypted_metadata BYTEA,        -- Encrypted with key
    created_at TIMESTAMPTZ
);

-- Encrypt data
INSERT INTO api_keys (id, user_id, key_hash, encrypted_metadata)
VALUES (
    gen_random_uuid(),
    $1,
    encode(digest($2, 'sha256'), 'hex'),
    pgp_sym_encrypt($3::text, current_setting('app.encryption_key'))
);

-- Decrypt data
SELECT
    id,
    pgp_sym_decrypt(encrypted_metadata, current_setting('app.encryption_key'))::json
FROM api_keys
WHERE user_id = $1;
```

**File Encryption:**

```rust
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

pub fn encrypt_file(content: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, Error> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(&generate_nonce());

    let ciphertext = cipher.encrypt(nonce, content)
        .map_err(|_| Error::EncryptionFailed)?;

    // Prepend nonce to ciphertext
    let mut result = nonce.to_vec();
    result.extend_from_slice(&ciphertext);

    Ok(result)
}
```

#### PII Handling

```rust
// Anonymize sensitive data in logs
pub fn sanitize_log(log: &str) -> String {
    log
        // Redact emails
        .regex_replace_all(
            r"\b[\w\.-]+@[\w\.-]+\.\w+\b",
            "[EMAIL_REDACTED]"
        )
        // Redact API keys
        .regex_replace_all(
            r"llm_mp_[a-zA-Z0-9]{32}",
            "llm_mp_[REDACTED]"
        )
        // Redact bearer tokens
        .regex_replace_all(
            r"Bearer \S+",
            "Bearer [REDACTED]"
        )
        // Redact IP addresses (keep first octet)
        .regex_replace_all(
            r"\b(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
            "$1.xxx.xxx.xxx"
        )
        .to_string()
}

// Hash PII for analytics
pub fn hash_pii(value: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(value);
    hasher.update(env::var("PII_SALT").unwrap());
    format!("{:x}", hasher.finalize())
}
```

#### Data Retention

```sql
-- Automatically delete old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete old download events (>1 year)
    DELETE FROM download_events
    WHERE downloaded_at < NOW() - INTERVAL '1 year';

    -- Delete old audit logs (>2 years)
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '2 years';

    -- Anonymize deleted user data
    UPDATE users
    SET
        email = 'deleted-' || id || '@example.com',
        username = 'deleted-' || id,
        display_name = NULL,
        bio = NULL,
        avatar_url = NULL
    WHERE deleted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule daily cleanup
SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data()');
```

---

### 5. Dependency Security

#### Supply Chain Security

```toml
# Cargo.toml - Pinned dependencies
[dependencies]
actix-web = "=4.5.1"  # Exact version
serde = "=1.0.195"

# Audit dependencies
[profile.release]
cargo-audit = true
```

#### Automated Scanning

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Cargo Audit
        run: cargo audit

      - name: Dependency Review
        uses: actions/dependency-review-action@v4

      - name: Trivy Scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
```

#### Vulnerability Management

1. **Detection**: Automated scanning with cargo-audit, Dependabot
2. **Assessment**: Severity classification (CVSS scores)
3. **Remediation**: Patching within 30 days (critical), 90 days (high)
4. **Communication**: Security advisories for affected users

---

### 6. Monitoring & Incident Response

#### Security Logging

```rust
pub struct AuditLog {
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub ip_address: String,
    pub action: AuditAction,
    pub resource: String,
    pub status: ActionStatus,
    pub metadata: serde_json::Value,
}

pub enum AuditAction {
    Login,
    LoginFailed,
    Logout,
    AssetPublish,
    AssetDelete,
    PermissionChange,
    ApiKeyCreated,
    ApiKeyRevoked,
    PasswordChange,
    TwoFactorEnabled,
    AdminAction,
}

// Log all security-relevant events
pub async fn log_security_event(event: AuditLog) {
    // Store in database
    store_audit_log(&event).await;

    // Send to SIEM
    send_to_siem(&event).await;

    // Alert on suspicious activity
    if is_suspicious(&event) {
        send_alert(&event).await;
    }
}
```

#### Intrusion Detection

```rust
// Detect brute-force attacks
pub async fn detect_brute_force(ip: &str) -> bool {
    let key = format!("failed-login:{}", ip);
    let count: u32 = redis.get(&key).await.unwrap_or(0);

    if count > 5 {
        // Alert security team
        alert_security(format!("Brute force from {}", ip));
        return true;
    }

    false
}

// Detect credential stuffing
pub async fn detect_credential_stuffing(username: &str) -> bool {
    let key = format!("login-attempts:{}", username);
    let attempts: Vec<LoginAttempt> = redis.lrange(&key, 0, -1).await?;

    // Multiple IPs in short time = suspicious
    let unique_ips: HashSet<_> = attempts.iter()
        .filter(|a| a.timestamp > Utc::now() - Duration::minutes(5))
        .map(|a| &a.ip_address)
        .collect();

    if unique_ips.len() > 3 {
        alert_security(format!("Credential stuffing for {}", username));
        return true;
    }

    false
}
```

#### Incident Response Plan

1. **Detection**: Automated alerts, user reports
2. **Containment**: Isolate affected systems, revoke credentials
3. **Eradication**: Remove threat, patch vulnerabilities
4. **Recovery**: Restore services, verify integrity
5. **Lessons Learned**: Post-mortem, update procedures

**Incident Severity Levels:**

- **P0 (Critical)**: Data breach, complete service outage
  - Response time: 15 minutes
  - Escalation: Immediate executive notification

- **P1 (High)**: Partial outage, security compromise
  - Response time: 1 hour
  - Escalation: Security team lead

- **P2 (Medium)**: Degraded performance, minor vulnerability
  - Response time: 4 hours
  - Escalation: On-call engineer

- **P3 (Low)**: Non-critical issues
  - Response time: 24 hours
  - Escalation: Standard ticketing

---

## Security Best Practices

### For Users

1. **Use strong, unique passwords** (12+ characters, mixed case, numbers, symbols)
2. **Enable 2FA** on your account
3. **Review asset signatures** before downloading
4. **Report suspicious assets** immediately
5. **Keep API keys secure** (never commit to Git)
6. **Use scoped API keys** (minimal required permissions)
7. **Regularly rotate credentials**

### For Publishers

1. **Sign all assets** with your verified key
2. **Test assets thoroughly** before publishing
3. **Document dependencies** clearly
4. **Respond to vulnerability reports** promptly
5. **Use semantic versioning** properly
6. **Provide security contact** information
7. **Maintain assets** (security updates)

### For Administrators

1. **Keep software updated** (patch within SLA)
2. **Monitor security logs** regularly
3. **Conduct security audits** quarterly
4. **Test backup restoration** monthly
5. **Review access controls** monthly
6. **Train staff** on security awareness
7. **Maintain incident response plan**

---

## Compliance

### GDPR Compliance

- **Right to Access**: Users can export their data
- **Right to Erasure**: Account deletion within 30 days
- **Data Minimization**: Only collect necessary data
- **Consent Management**: Clear opt-in for marketing
- **Data Portability**: Export in machine-readable format
- **Breach Notification**: 72-hour notification requirement

### SOC 2 Type II

Controls for:
- **Security**: Access controls, encryption
- **Availability**: Uptime monitoring, redundancy
- **Processing Integrity**: Validation, error handling
- **Confidentiality**: Data classification, DLP
- **Privacy**: GDPR compliance, consent management

### Supply Chain Levels for Software Artifacts (SLSA)

- **Level 1**: Build provenance
- **Level 2**: Signed build provenance
- **Level 3**: Hardened build platform
- **Level 4**: Hermetic, reproducible builds

---

## Security Roadmap

### Q1 2026
- [ ] Bug bounty program launch
- [ ] SOC 2 Type II certification
- [ ] Advanced threat detection (ML-based)
- [ ] Zero-trust architecture implementation

### Q2 2026
- [ ] Security key (WebAuthn) support
- [ ] Enhanced audit logging
- [ ] Automated vulnerability scanning
- [ ] Security training program

### Q3 2026
- [ ] Penetration testing (external firm)
- [ ] ISO 27001 certification
- [ ] Red team exercises
- [ ] Security champions program

### Q4 2026
- [ ] Advanced DDoS mitigation
- [ ] Chaos engineering for security
- [ ] Threat intelligence integration
- [ ] Annual security audit

---

## Contact

- **Security Issues**: security@llm-marketplace.dev
- **General Support**: support@llm-marketplace.dev
- **Bug Bounty**: bugbounty@llm-marketplace.dev

**PGP Key**: [Download](https://llm-marketplace.dev/.well-known/pgp-key.asc)

---

**Last Updated:** 2025-11-18
**Version:** 1.0
