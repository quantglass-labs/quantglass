# Phase 12 - Security and Release Readiness

## Goal

Harden the application for controlled production use and repeatable distribution.

## Checklist

- [ ] Add keychain-backed secret storage.
- [ ] Add encrypted config handling for non-trade keys.
- [ ] Add audit logging for critical state changes.
- [ ] Add Windows packaging and installer strategy.
- [ ] Add backup/export and rollback procedures.
- [ ] Add release checklist and verification flow.

## Acceptance Gates

- Secrets are never stored in plaintext operational state.
- Release packaging is reproducible.
- Operational recovery steps are documented.
