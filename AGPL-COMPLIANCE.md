# AGPL Compliance

QuantGlass Community Edition is licensed under AGPL-3.0-or-later.

This document is a practical checklist for maintainers, distributors, packagers,
and commercial users. It is not legal advice.

## Repository Requirements

- Keep the full AGPL text in `LICENSE`.
- Keep `NOTICE`, `DISCLAIMER.md`, and `THIRD-PARTY-NOTICES.md` with releases.
- Preserve copyright and license notices.
- Keep package metadata aligned with `AGPL-3.0-or-later`.
- Do not remove the in-app Legal tab or source-code link from distributed builds.

## Distribution Requirements

If you distribute QuantGlass binaries, installers, AppImages, containers, or
modified builds, provide the complete corresponding source code for that build.

At minimum, publish:

- The exact source commit or source archive.
- Build scripts and packaging configuration.
- Any patches or local modifications.
- License and notice files.

## Network Use

AGPL includes network-use obligations. If you modify QuantGlass and make it
available over a network, users interacting with that modified version must have
access to the corresponding source code.

## Commercial Licensing

Companies that need proprietary embedding, private hosted deployments,
closed-source redistribution, or support terms that are not compatible with AGPL
should use a separate commercial license. See `COMMERCIAL-LICENSE.md`.

## Maintainer Release Checklist

- Run `npm run validate:backend`.
- Run `npm run desktop:build`.
- Run `npm --prefix apps/desktop audit --audit-level=moderate`.
- Confirm `LICENSE`, `NOTICE`, `DISCLAIMER.md`, `COMMERCIAL-LICENSE.md`,
  `AGPL-COMPLIANCE.md`, and `THIRD-PARTY-NOTICES.md` are included in source
  releases.
- Confirm the Settings Legal tab links to the public source repository.
- Confirm generated binaries are built from the tagged source commit.
