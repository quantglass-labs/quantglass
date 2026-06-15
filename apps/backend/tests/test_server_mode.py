# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Server/web-mode auth gate and AGPL §13 source offer."""

import unittest

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.server_mode import configure_server_mode
from app.version import __version__


def _app(auth_token: str | None) -> FastAPI:
    app = FastAPI()

    @app.get("/api/ping")
    async def ping() -> JSONResponse:
        return JSONResponse({"ok": True})

    configure_server_mode(app, auth_token=auth_token)
    return app


class SourceOfferTests(unittest.TestCase):
    def test_source_offer_reports_running_version(self) -> None:
        client = TestClient(_app(None))
        html = client.get("/source")
        self.assertEqual(html.status_code, 200)
        self.assertIn(__version__, html.text)
        self.assertIn("AGPL", html.text)
        json_offer = client.get("/source", headers={"accept": "application/json"})
        self.assertEqual(json_offer.json()["version"], __version__)
        self.assertEqual(json_offer.json()["license"], "AGPL-3.0-or-later")


class AuthGateDisabledTests(unittest.TestCase):
    def test_no_token_means_no_gate(self) -> None:
        client = TestClient(_app(None))
        self.assertEqual(client.get("/api/ping").status_code, 200)


class AuthGateEnabledTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(_app("s3cret"))

    def test_blocks_unauthenticated_api_client(self) -> None:
        resp = self.client.get("/api/ping", headers={"accept": "application/json"})
        self.assertEqual(resp.status_code, 401)

    def test_browser_navigation_gets_login_page(self) -> None:
        resp = self.client.get("/api/ping", headers={"accept": "text/html"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access token", resp.text.lower())

    def test_bearer_token_passes(self) -> None:
        resp = self.client.get(
            "/api/ping",
            headers={"authorization": "Bearer s3cret", "accept": "application/json"},
        )
        self.assertEqual(resp.status_code, 200)

    def test_wrong_bearer_token_blocked(self) -> None:
        resp = self.client.get(
            "/api/ping",
            headers={"authorization": "Bearer nope", "accept": "application/json"},
        )
        self.assertEqual(resp.status_code, 401)

    def test_login_sets_cookie_then_requests_pass(self) -> None:
        login = self.client.post("/__auth", data={"token": "s3cret"}, follow_redirects=False)
        self.assertEqual(login.status_code, 303)
        # TestClient persists the cookie; the gated route now passes.
        self.assertEqual(self.client.get("/api/ping").status_code, 200)

    def test_source_offer_stays_open_without_auth(self) -> None:
        self.assertEqual(self.client.get("/source").status_code, 200)


if __name__ == "__main__":
    unittest.main()
