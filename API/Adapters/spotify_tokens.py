"""Spotify token endpoint.

User connect and refresh stay PKCE, with no client secret. Album art uses a
separate client-credentials app token, cached until it expires.
"""

from __future__ import annotations

import time
from typing import Protocol

import httpx

TOKEN_URL = "https://accounts.spotify.com/api/token"


class SpotifyTokenError(Exception):
    """The token endpoint did not return a usable body."""


class SpotifyTokenClient(Protocol):
    def exchange(
        self,
        *,
        client_id: str,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict:
        """Exchange an authorization code for token JSON."""

    def refresh(self, *, client_id: str, refresh_token: str) -> dict:
        """Exchange a refresh token for token JSON."""


class HttpxSpotifyTokenClient:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self._client = client if client is not None else httpx.Client(timeout=30.0)
        self._owns_client = client is None
        self._app_token: tuple[tuple[str, str], str, float] | None = None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def exchange(
        self,
        *,
        client_id: str,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict:
        return self._post(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": code_verifier,
            }
        )

    def refresh(self, *, client_id: str, refresh_token: str) -> dict:
        return self._post(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
            }
        )

    def client_credentials(self, *, client_id: str, client_secret: str) -> dict:
        return self._post(
            {
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            }
        )

    def app_access_token(self, *, client_id: str, client_secret: str) -> str:
        """Client-credentials token, reused until shortly before it expires."""
        now = time.monotonic()
        cached = self._app_token
        key = (client_id, client_secret)
        if cached is not None and cached[0] == key and now < cached[2]:
            return cached[1]
        payload = self.client_credentials(client_id=client_id, client_secret=client_secret)
        token = payload.get("access_token")
        if not isinstance(token, str) or not token:
            raise SpotifyTokenError("Spotify token response had no access_token")
        expires_in = payload.get("expires_in")
        if isinstance(expires_in, bool) or not isinstance(expires_in, int):
            seconds = 3600
        else:
            seconds = expires_in
        self._app_token = (key, token, now + max(seconds - 30, 0))
        return token

    def _post(self, data: dict[str, str]) -> dict:
        try:
            response = self._client.post(
                TOKEN_URL,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.HTTPError as exc:
            raise SpotifyTokenError(str(exc)) from exc
        if response.status_code != 200:
            raise SpotifyTokenError(f"HTTP {response.status_code}")
        payload = response.json()
        if not isinstance(payload, dict):
            raise SpotifyTokenError("Spotify token response was not an object")
        return payload
