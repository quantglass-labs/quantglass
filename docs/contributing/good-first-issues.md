# Good First Contribution Ideas

QuantGlass is easiest to join through small, testable contributions. These
starter tasks avoid live-trading risk and keep changes reviewable.

## Provider Fixtures

- Add deterministic candle fixtures for one public provider response shape.
- Add malformed fixture cases for missing timestamps, duplicate candles, and bad
  OHLC ranges.
- Validate fixtures with:

```bash
PYTHONPATH=apps/backend ./.venv/bin/python apps/backend/scripts/validate_extension_fixture.py path/to/candles.json
```

Suggested labels: `good first issue`, `provider-adapter`, `testing`.

## Indicator Tests

- Add fixture-based tests for one built-in indicator.
- Include edge cases for short candle windows and missing values.
- Document the expected input/output shape in
  `docs/contributing/indicator-contract.md`.

Suggested labels: `good first issue`, `indicator`, `testing`.

## Local AI Profiles

- Add a documented model profile for Ollama, LM Studio, LocalAI, vLLM, LiteLLM,
  or another OpenAI-compatible local gateway.
- Include timeout/token recommendations and a failure-mode note.
- Keep prompts fact-bound: the model may explain engine facts, not invent prices
  or recommendations.

Suggested labels: `good first issue`, `ai-narration`, `docs`.

## Extension Examples

- Add a minimal extension example for one extension surface:
  notification, data quality, import/export, indicator, or strategy metadata.
- Include a manifest, permissions, settings schema, and a short README.
- Keep the example disabled by default.

Suggested labels: `good first issue`, `extensions`, `docs`.

## Desktop UX Polish

- Improve keyboard focus states on a single settings panel.
- Add empty/error/loading copy to one screen that lacks it.
- Fix one responsive layout issue with a screenshot in the pull request.

Suggested labels: `good first issue`, `frontend`, `accessibility`.

## Documentation Corrections

- Fix stale screenshots, outdated command examples, or unclear installation
  instructions.
- Add troubleshooting entries for provider rate limits or local AI startup.
- Keep wording precise: QuantGlass is research software, not financial advice.

Suggested labels: `good first issue`, `docs`.

## Before Opening A PR

- Run `npm run backend:test` for backend changes.
- Run `npm run desktop:build` for frontend changes.
- Run `npm run validate:backend` for API/storage/provider changes.
- Do not commit `.local`, build outputs, packages, logs, keys, or backups.
