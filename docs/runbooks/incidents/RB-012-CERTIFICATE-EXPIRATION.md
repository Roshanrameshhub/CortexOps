# RB-012: TLS Certificate Expiration

**Runbook ID**: RB-012
**Severity**: P0-P1 (Critical to High)
**Component**: Ingress, Services
**Last Updated**: 2025-11-19
**Owner**: DevOps Team

---

## Incident Description

TLS/SSL certificates have expired or are about to expire, causing secure connections to fail with certificate validation errors.

---

## Symptoms

### User-Visible Impact
- "Your connection is not secure" browser warnings
- API clients rejecting connections
- Mobile apps unable to connect
- "Certificate expired" errors

### Technical Indicators
- **Alerts**: `CertificateExpiringSoon`, `CertificateExpired`
- **Logs**: "certificate has expired", "x509: certificate has expired"
- **Browser**: NET::ERR_CERT_DATE_INVALID

---

## Immediate Response

### Step 1: Verify Certificate Status

```bash
# Check certificate expiration
echo | openssl s_client -servername api.llm-marketplace.com -connect api.llm-marketplace.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Check all certificates in namespace
kubectl get certificates -n llm-marketplace -o custom-columns=NAME:.metadata.name,READY:.status.conditions[0].status,EXPIRES:.status.notAfter

# Check cert-manager certificates
kubectl get certificate -n llm-marketplace
kubectl describe certificate api-llm-marketplace-tls -n llm-marketplace
```

---

### Step 2: Emergency Certificate Renewal

**If using cert-manager (Let's Encrypt)**:
```bash
# Force renewal
kubectl delete certificate api-llm-marketplace-tls -n llm-marketplace
kubectl apply -f k8s/certificates/api-tls.yaml

# Wait for issuance
kubectl wait --for=condition=ready certificate/api-llm-marketplace-tls -n llm-marketplace --timeout=300s

# Verify new certificate
kubectl get certificate api-llm-marketplace-tls -n llm-marketplace
```

**Expected Time**: 2-5 minutes (automated renewal)

---

### Step 3: Manual Certificate Update (If Needed)

```bash
# If automated renewal fails, upload new certificate

# Create secret from certificate files
kubectl create secret tls api-llm-marketplace-tls \
  --cert=/path/to/certificate.crt \
  --key=/path/to/private.key \
  -n llm-marketplace \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart ingress controller to pick up new cert
kubectl rollout restart deployment/nginx-ingress-controller -n ingress-nginx

# Verify
curl -vI https://api.llm-marketplace.com 2>&1 | grep "expire date"
```

**Expected Time**: 5-10 minutes

---

## Prevention

### Automated Certificate Management

```yaml
# cert-manager Certificate resource
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-llm-marketplace-tls
  namespace: llm-marketplace
spec:
  secretName: api-llm-marketplace-tls
  dnsNames:
  - api.llm-marketplace.com
  - "*.llm-marketplace.com"
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  renewBefore: 720h  # Renew 30 days before expiration
```

### Monitoring

```yaml
# Alert 30 days before expiration
- alert: CertificateExpiringSoon
  expr: (x509_cert_expiry - time()) / 86400 < 30
  annotations:
    summary: "Certificate expiring in {{ $value }} days"
```

---

## Related Runbooks
- [RB-001: Service Down](RB-001-SERVICE-DOWN.md)

---

**Document Version**: 1.0.0
