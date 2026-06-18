# Roadmap

This roadmap is designed to make contribution areas visible. It is not a promise
of dates or investment performance.

## Recently Shipped

- GitHub Actions CI for backend tests, desktop build, audits, packaging, and
  license reports — running on every PR and on tag-driven releases.
- Tag-driven release automation publishing checksummed Windows, macOS, and Linux
  installers (`v0.2.x`–`v0.3.0`).
- 20-language interface and content localization (with right-to-left Arabic,
  Persian, Urdu, and Sindhi); native-speaker review is the open follow-up below.
- Refreshed documentation and screenshots.

## Near Term

- Native-speaker review of the machine-translated locales, prioritizing Arabic,
  Persian, Urdu, and Sindhi (see [issues labeled `i18n`](https://github.com/quantglass-labs/quantglass/labels/i18n)).
- Harden Tauri CSP and command capabilities.
- Make pytest the official backend test runner.
- Add provider-adapter and strategy-extension examples.
- Keep live trading disabled unless safety gates are complete.

## Community Contribution Tracks

- **Provider adapters:** market data, news, broker paper endpoints, and alert
  channels.
- **Indicators:** deterministic, fixture-tested indicator implementations.
- **Strategies:** regime-aware signal families with honest backtests.
- **Backtesting:** slippage, fees, partial exits, walk-forward validation, and
  sample-size reporting.
- **AI narration:** local model profiles, prompt tests, and hallucination guards.
- **Desktop UX:** accessibility, keyboard navigation, responsive layout, and
  chart interactions.
- **Docs:** tutorials, installation guides, screenshots, and troubleshooting.

## Commercial Tracks

- Signed desktop installers.
- Priority support.
- Custom provider and broker integrations.
- Enterprise deployment guidance.
- Commercial licensing for proprietary embedding or hosted products.

## Not In Scope For Community Edition Right Now

- Cloud-first architecture.
- Multi-tenant hosted SaaS.
- Automated live trading without explicit operator control.
- Claims of guaranteed profit, predictive certainty, or financial advice.
