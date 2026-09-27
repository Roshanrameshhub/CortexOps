# RB-007: Security Breach / Unauthorized Access

**Runbook ID**: RB-007
**Severity**: P0 (Critical)
**Component**: All Systems
**Last Updated**: 2025-11-19
**Owner**: Security Team

---

## Incident Description

Suspected or confirmed security breach including unauthorized access, data exfiltration, malicious activity, or compromise of systems/credentials.

---

## ⚠️ CRITICAL: DO NOT ALERT ATTACKER

- Do NOT shut down systems immediately (may destroy evidence)
- Do NOT communicate about breach in public channels
- Use encrypted communication only
- Follow legal/compliance notification requirements

---

## Immediate Response (First 10 Minutes)

### Step 1: Assess Severity

**Indicators of Active Breach**:
- Unusual admin access patterns
- Data exfiltration detected
- Unfamiliar processes running
- Unauthorized API keys created
- Suspicious database queries
- Unknown IP addresses accessing systems

```bash
# Check recent admin actions
kubectl logs -n llm-marketplace -l app=admin-service --tail=1000 | \
  grep -i "admin\|create\|delete\|update" | \
  grep -v "user@company.com"

# Check unusual API access
kubectl logs -n llm-marketplace --tail=5000 | \
  awk '{print $1}' | sort | uniq -c | sort -rn | head -20

# Check for privilege escalation
kubectl get clusterrolebindings -o json | \
  jq '.items[] | select(.subjects[]?.name | test("^system:")? | not)'
```

---

### Step 2: Activate Security Incident Response

```bash
# PRIVATE communication only
# Create secure war room
# Signal: Create private group "SEC-INC-YYYY-MM-DD"
# Add: Security Lead, CTO, Legal, PR (as needed)

🚨 CONFIDENTIAL - SECURITY INCIDENT

Type: [Unauthorized Access / Data Breach / Compromise]
Severity: P0
Discovery: [How/when discovered]
Scope: [Systems affected - INITIAL ASSESSMENT]

DO NOT DISCUSS OUTSIDE THIS CHANNEL

IC: @security-lead
Participants: @cto @legal
```

---

### Step 3: Preserve Evidence

```bash
# Take snapshots of affected systems
kubectl exec -it <affected-pod> -- ps aux > /tmp/process-snapshot-$(date +%s).txt
kubectl logs <affected-pod> > /tmp/pod-logs-$(date +%s).txt

# Capture network connections
kubectl exec -it <affected-pod> -- netstat -tupn > /tmp/network-$(date +%s).txt

# Database query log
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres <<EOF
\copy (SELECT * FROM pg_stat_activity) TO '/tmp/db-activity-$(date +%s).csv' CSV HEADER;
EOF

# Store evidence in secure location
# DO NOT modify original systems yet
```

---

## Investigation Phase

### Step 4: Identify Attack Vector

**Common Attack Vectors**:

1. **Compromised Credentials**
```bash
# Check recent authentications
kubectl logs -n llm-marketplace -l app=admin-service | grep -i "login\|auth"

# Review API key usage
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
SELECT user_id, api_key_id, created_at, last_used_at, request_count
FROM api_keys
WHERE last_used_at > now() - interval '24 hours'
ORDER BY request_count DESC;
EOF
```

2. **SQL Injection**
```bash
# Check for suspicious query patterns
kubectl logs -n llm-marketplace --tail=10000 | \
  grep -iE "select.*from|union.*select|drop.*table|insert.*into"
```

3. **Container Escape / Privilege Escalation**
```bash
# Check for privileged pods
kubectl get pods -n llm-marketplace -o json | \
  jq '.items[] | select(.spec.containers[].securityContext.privileged == true)'

# Check host mounts
kubectl get pods -n llm-marketplace -o json | \
  jq '.items[] | select(.spec.volumes[]?.hostPath != null)'
```

4. **Supply Chain Attack**
```bash
# Check image digests
kubectl get pods -n llm-marketplace -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'

# Compare with known good digests
```

---

### Step 5: Determine Scope of Compromise

```bash
# Affected systems checklist:
# [ ] Publishing Service
# [ ] Discovery Service
# [ ] Consumption Service
# [ ] Admin Service
# [ ] Policy Engine
# [ ] Database (PostgreSQL)
# [ ] Cache (Redis)
# [ ] Search (Elasticsearch)
# [ ] Message Queue (Kafka)
# [ ] Secrets/ConfigMaps
# [ ] AWS Infrastructure

# Data exposure assessment:
# [ ] Customer PII
# [ ] API keys/credentials
# [ ] Service configurations
# [ ] Source code
# [ ] Business data
```

---

## Containment Actions

### Step 6: Immediate Containment

**1. Revoke Compromised Credentials**
```bash
# Rotate all API keys
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
UPDATE api_keys SET revoked = true, revoked_at = now()
WHERE revoked = false;
EOF

# Rotate database passwords
kubectl create secret generic postgres-credentials \
  --from-literal=password=$(openssl rand -base64 32) \
  --dry-run=client -o yaml | kubectl apply -f -

# Force all users to re-authenticate
# Update JWT secret
kubectl create secret generic jwt-secret \
  --from-literal=secret=$(openssl rand -base64 64) \
  --dry-run=client -o yaml | kubectl apply -f -
```

**2. Block Malicious IPs**
```bash
# Add to network policy
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: block-malicious-ips
  namespace: llm-marketplace
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - ipBlock:
        cidr: 0.0.0.0/0
        except:
        - 203.0.113.0/24  # Malicious IP range
EOF
```

**3. Isolate Compromised Pods**
```bash
# Label compromised pods
kubectl label pod <compromised-pod> -n llm-marketplace security=quarantine

# Apply isolation policy
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: quarantine-policy
  namespace: llm-marketplace
spec:
  podSelector:
    matchLabels:
      security: quarantine
  policyTypes:
  - Ingress
  - Egress
  ingress: []
  egress: []
EOF
```

---

## Eradication

### Step 7: Remove Threat

**Clean Compromised Systems**:
```bash
# Delete compromised pods (will be recreated)
kubectl delete pod <compromised-pod> -n llm-marketplace

# Redeploy from known good images
kubectl rollout restart deployment/<service> -n llm-marketplace

# Verify image digests match known good
```

**Database Cleanup**:
```bash
# Remove malicious data/accounts
kubectl exec -it postgres-0 -n llm-marketplace -- psql -U postgres -d llm_marketplace <<EOF
-- Remove suspicious user accounts
DELETE FROM users WHERE email LIKE '%suspicious%';

-- Remove malicious API keys
DELETE FROM api_keys WHERE created_at > 'YYYY-MM-DD HH:MM:SS';

-- Audit trail
SELECT * FROM audit_log WHERE timestamp > 'YYYY-MM-DD HH:MM:SS';
EOF
```

---

## Recovery

### Step 8: Restore Secure State

```bash
# Rotate all secrets
./scripts/rotate-all-secrets.sh

# Update all service configurations
kubectl rollout restart deployment -n llm-marketplace

# Re-enable services with monitoring
kubectl scale deployment/<service> -n llm-marketplace --replicas=3

# Verify no malicious activity
# Monitor for 24 hours
```

---

## Communication

### Internal Communication

```
🚨 SECURITY INCIDENT - CONFIDENTIAL

A security incident has been identified and contained.
All credentials have been rotated as a precaution.

Impact: [Brief, factual description]
Status: Contained and under investigation
Actions: [What we've done]

DO NOT share outside company.
More details in secure channel.
```

### Customer Communication (if data breach)

**Required Notifications**:
- Within 72 hours: GDPR/regulatory authorities
- Without undue delay: Affected customers
- Legal review required before communication

**Template** (legal approval required):
```
Subject: Important Security Notice

We are writing to inform you of a security incident that may have
affected your account.

What Happened:
[Factual description]

What Information Was Involved:
[Specific data types]

What We Are Doing:
[Actions taken]

What You Should Do:
[User actions: change password, monitor account, etc.]

Contact:
security@company.com
```

---

## Post-Incident Actions

### Step 9: Forensic Analysis

```bash
# Preserve all evidence
# Engage forensic specialist if needed
# Determine:
# - Exact entry point
# - Timeline of attacker actions
# - Data accessed/exfiltrated
# - How to prevent recurrence
```

### Step 10: Security Improvements

**Immediate** (within 1 week):
- [ ] Patch vulnerability that was exploited
- [ ] Implement additional monitoring/alerting
- [ ] Enhanced access controls
- [ ] Security audit of similar systems

**Long-term** (within 1 month):
- [ ] Penetration testing
- [ ] Security training for team
- [ ] Incident response plan update
- [ ] Third-party security audit

---

## Prevention

1. **Access Controls**
   - MFA for all admin accounts
   - Principle of least privilege
   - Regular access reviews
   - API key rotation policy

2. **Monitoring**
   - SIEM implementation
   - Anomaly detection
   - Failed login monitoring
   - Data exfiltration detection

3. **Security Hardening**
   - Pod security policies
   - Network segmentation
   - Secrets encryption at rest
   - Image vulnerability scanning

4. **Incident Preparedness**
   - Regular security drills
   - Incident response training
   - Runbook testing
   - Backup verification

---

## Escalation

**Immediate**:
- Security Lead
- CTO
- Legal (if customer data involved)
- PR (if public disclosure needed)

**Legal Requirements**:
- GDPR notification: 72 hours
- State breach notification laws
- Industry regulations (SOC2, etc.)

---

## Related Runbooks
- [RB-008: Suspicious Activity](RB-008-SUSPICIOUS-ACTIVITY.md)
- [RB-009: DDoS Attack](RB-009-DDOS-ATTACK.md)
- [RB-013: Data Integrity](RB-013-DATA-INTEGRITY.md)

---

## Appendix

### Security Contacts
- **Security Lead**: security-lead@company.com | +1-555-0203
- **CTO**: cto@company.com | +1-555-0302
- **Legal**: legal@company.com | +1-555-0402
- **PR**: pr@company.com | +1-555-0403

### External Resources
- **Incident Response Partner**: security-firm@example.com
- **Forensics**: forensics@example.com
- **Legal Counsel**: law-firm@example.com

---

**Document Version**: 1.0.0
**Classification**: CONFIDENTIAL
**Last Tested**: 2024-11-19
**Next Review**: 2024-12-01 (monthly)
