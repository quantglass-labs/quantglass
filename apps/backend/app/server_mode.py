# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Server/web-mode concerns: the AGPL §13 source offer and an optional auth gate.

These only matter when QuantGlass runs as a network service (the Docker
self-host image), not as the loopback desktop sidecar:

* **AGPL §13** requires that users interacting with the program remotely over a
  network be offered the Corresponding Source. ``/source`` serves that offer,
  pinned to the running version, and the web UI links to it.
* **Auth gate** — when ``QUANTGLASS_SERVER_AUTH_TOKEN`` is set, every request
  must present the token (Bearer header or session cookie). This protects
  operators who deliberately expose the container beyond host loopback. When the
  token is unset (desktop sidecar, default loopback-only compose) the gate is a
  no-op, so local use is unchanged.
"""

from __future__ import annotations

import secrets
from urllib.parse import parse_qs

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from app.version import __version__

_AUTH_COOKIE = "qg_auth"
_SOURCE_URL = "https://github.com/quantglass-labs/quantglass"
# Paths reachable without auth: the login endpoint itself, the source offer
# (AGPL §13 must be offerable to anyone), and the liveness probe.
_OPEN_PATHS = frozenset({"/__auth", "/source", "/api/health", "/health"})

_SOURCE_HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>QuantGlass — Source</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{{font:16px/1.6 system-ui,sans-serif;max-width:42rem;margin:4rem auto;
padding:0 1.5rem;color:#e4e4e7;background:#09090b}}a{{color:#a5b4fc}}
code{{background:#27272a;padding:.1rem .35rem;border-radius:.25rem}}</style></head>
<body>
<h1>Source code (AGPL-3.0)</h1>
<p>This is <strong>QuantGlass {__version__}</strong>, licensed under the
GNU Affero General Public License v3.0 or later.</p>
<p>Under AGPL §13, anyone interacting with this instance over a network is
offered its <strong>Corresponding Source</strong>:</p>
<ul>
<li>Upstream source for this version:
<a href="{_SOURCE_URL}/tree/v{__version__}">{_SOURCE_URL}/tree/v{__version__}</a></li>
<li>Full project: <a href="{_SOURCE_URL}">{_SOURCE_URL}</a></li>
</ul>
<p>If you are running a <em>modified</em> version, you must make your modified
Corresponding Source available to your users from this same offer.</p>
<p>Educational and research software. Paper trading only. Not financial advice.</p>
</body></html>"""

_SOURCE_JSON = {
    "name": "quantglass",
    "version": __version__,
    "license": "AGPL-3.0-or-later",
    "source": _SOURCE_URL,
    "source_for_this_version": f"{_SOURCE_URL}/tree/v{__version__}",
    "notice": (
        "AGPL §13: network users are offered the Corresponding Source. "
        "Operators of a modified version must offer their modified source."
    ),
}


def _login_page(error: bool = False) -> HTMLResponse:
    msg = '<p style="color:#f87171">Incorrect token.</p>' if error else ""
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>QuantGlass — Sign in</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{{font:16px/1.6 system-ui,sans-serif;max-width:24rem;margin:6rem auto;
padding:0 1.5rem;color:#e4e4e7;background:#09090b}}input{{width:100%;padding:.6rem;
margin:.5rem 0;background:#18181b;border:1px solid #3f3f46;border-radius:.4rem;
color:#e4e4e7}}button{{padding:.6rem 1rem;background:#4f46e5;color:#fff;border:0;
border-radius:.4rem;cursor:pointer}}</style></head>
<body><h1>QuantGlass</h1>
<p>This instance requires an access token.</p>{msg}
<form method="post" action="/__auth">
<input type="password" name="token" placeholder="Access token" autofocus
autocomplete="current-password" aria-label="Access token">
<button type="submit">Sign in</button></form></body></html>"""
    return HTMLResponse(html, status_code=200 if not error else 401)


def configure_server_mode(app: FastAPI, *, auth_token: str | None) -> None:
    """Register the source offer, and the auth gate when a token is configured."""

    @app.get("/source", include_in_schema=False)
    async def source(request: Request) -> Response:  # pragma: no cover - thin
        accept = request.headers.get("accept", "")
        if "application/json" in accept and "text/html" not in accept:
            return JSONResponse(_SOURCE_JSON)
        return HTMLResponse(_SOURCE_HTML)

    if not auth_token:
        return

    @app.post("/__auth", include_in_schema=False)
    async def authenticate(request: Request) -> Response:
        # Parse the urlencoded login form without depending on python-multipart.
        body = (await request.body()).decode("utf-8", "ignore")
        supplied = (parse_qs(body).get("token") or [""])[0]
        if secrets.compare_digest(supplied, auth_token):
            response = RedirectResponse("/", status_code=303)
            response.set_cookie(
                _AUTH_COOKIE,
                auth_token,
                httponly=True,
                samesite="strict",
                max_age=60 * 60 * 24 * 30,
            )
            return response
        return _login_page(error=True)

    @app.middleware("http")
    async def require_token(request: Request, call_next):
        if request.url.path in _OPEN_PATHS:
            return await call_next(request)

        header = request.headers.get("authorization", "")
        bearer = header[7:] if header.lower().startswith("bearer ") else ""
        cookie = request.cookies.get(_AUTH_COOKIE, "")
        if secrets.compare_digest(bearer, auth_token) or secrets.compare_digest(cookie, auth_token):
            return await call_next(request)

        # Browser navigations get the login page; programmatic clients get 401.
        accept = request.headers.get("accept", "")
        if request.method == "GET" and "text/html" in accept:
            return _login_page()
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
