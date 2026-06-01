# Security Policy

QuantGlass is a local-first desktop application with a loopback backend. Security
work focuses on protecting secrets, preventing accidental live trading, and
keeping local network exposure narrow.

## Supported Versions

Security fixes are accepted for the current `main` branch until formal releases
are established.

## Report A Vulnerability

Do not open a public issue for vulnerabilities involving:

- API keys or secret storage.
- Live-trading safeguards.
- Remote code execution.
- Tauri command permissions.
- Local backend exposure.
- Provider credential leakage.

Instead, contact the repository maintainers privately through GitHub.

Include:

- Affected commit or release.
- Steps to reproduce.
- Expected impact.
- Any logs or screenshots that do not expose secrets.

## Scope

In scope:

- Secret storage and masking.
- Loopback API exposure.
- Tauri permissions and sidecar launch behavior.
- Build, packaging, and update integrity.
- Provider and broker credential handling.

Out of scope:

- Financial loss from user trading decisions.
- Third-party provider outages or pricing changes.
- Issues requiring access to a user's private broker or data-provider account.

## Security Expectations For Contributors

- Never commit credentials, local databases, backups, or generated state.
- Mask provider tokens in logs and UI.
- Keep live trading behind explicit safety gates.
- Prefer least-privilege provider capabilities.
- Add tests for secret migration and live-trading gates.
