# Security Policy

CortexOps is an enterprise-grade AI model lifecycle, deployment, and inference operations platform. Security and privacy are central to our design.

---

## Supported Versions

Only the latest release receive active security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within CortexOps, please follow responsible disclosure practices:

1. **Do NOT open a public GitHub issue** to report vulnerabilities.
2. Report the vulnerability privately via GitHub Security Advisories:
   - Navigate to the **Security** tab of the repository.
   - Select **Advisories** and click **Report a vulnerability**.
3. Include the following details:
   - Description of the vulnerability and attack vector.
   - Exact steps or script to reproduce the issue.
   - Potential impact and affected components.
   - Any suggested remediation or patch.

---

## Response Timeline

- **Initial Acknowledgment**: Within 48 hours of report receipt.
- **Triage & Classification**: Within 7 business days.
- **Fix & Disclosure**: Coordinated release with the reporter once a fix is verified and deployed.

---

## Architecture & Threat Model

For an in-depth breakdown of authentication, authorization, token hashing (Argon2id), data encryption, RBAC, and threat modeling, refer to [docs/SECURITY.md](docs/SECURITY.md).
