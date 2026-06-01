# QuantGlass Release Readiness Checklist

## Release Validation

- Run `npm run validate:backend`
- Run `npm run desktop:build`
- Run `npm run desktop:tauri:build`
- Confirm backend smoke coverage passes against `/health`, `/api/providers/settings`, and `/api/settings/api-keys`
- Regenerate OpenAPI with `npm run backend:openapi`

## Secrets And Recovery

- Confirm secrets are stored in encrypted local config, not plaintext SQLite rows
- Export a fresh backup bundle with `npm run backend:backup`
- Verify the bundle is archived to a secure location outside the workspace
- Record the latest backup bundle path in the release notes

## Rollback Notes

- Keep the latest successful backup bundle from the target machine before rollout
- If release validation fails after deployment, restore the pre-release bundle with `apps/backend/scripts/manage_state_bundle.py restore`
- Re-run `npm run validate:backend` after rollback to confirm service integrity

## Windows Packaging Strategy

- Build the Tauri Windows artifacts from a Windows runner or signing-capable CI host
- Validate installer creation, app startup, backend startup, and `/health` route response on Windows
- Store Windows signing material outside the repository and inject it only in release environments
- Mirror the Linux release checklist on Windows before promoting any signed artifact

## Controlled Production Use Gate

- Live mode must be validated with configured Alpaca credentials on the target environment
- Alert delivery must be verified for the channels enabled in production
- Backup/restore and rollback procedures must be exercised at least once before a production cut
