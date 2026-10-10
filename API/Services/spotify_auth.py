"""PKCE connect state and a stored Spotify access token for one user."""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

from db.manager import CATALOG_USERNAME, open_database

from API.Adapters.spotify_tokens import SpotifyTokenClient, SpotifyTokenError
from API.Services.errors import BadRequest, NotFound, UpstreamError

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
SCOPES = "playlist-read-private playlist-modify-private playlist-modify-public"
_REFRESH_SKEW = timedelta(seconds=30)


class SpotifyAuth:
    def __init__(self, token_client: SpotifyTokenClient) -> None:
        self.token_client = token_client
        self.pending: dict[str, dict[str, int | str]] = {}

    def start(self, user_id: int) -> str:
        self._require_user(user_id)
        client_id = _required("SPOTIFY_CLIENT_ID")
        redirect_uri = _required("SPOTIFY_REDIRECT_URI")
        verifier = secrets.token_urlsafe(64)
        state = secrets.token_urlsafe(24)
        self.pending[state] = {"user_id": user_id, "verifier": verifier}
        query = urlencode(
            {
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": redirect_uri,
                "code_challenge_method": "S256",
                "code_challenge": _code_challenge(verifier),
                "state": state,
                "scope": SCOPES,
            }
        )
        return f"{AUTHORIZE_URL}?{query}"

    def callback(
        self,
        *,
        code: str | None,
        state: str | None,
        error: str | None,
    ) -> dict:
        if error:
            if state:
                self.pending.pop(state, None)
            raise BadRequest("Spotify authorization failed")
        if not state or state not in self.pending:
            raise BadRequest("unknown or reused Spotify state")
        pending = self.pending.pop(state)
        if not code:
            raise BadRequest("Spotify authorization code is missing")
        user_id = int(pending["user_id"])
        try:
            payload = self.token_client.exchange(
                client_id=_required("SPOTIFY_CLIENT_ID"),
                code=code,
                redirect_uri=_required("SPOTIFY_REDIRECT_URI"),
                code_verifier=str(pending["verifier"]),
            )
        except SpotifyTokenError as exc:
            raise UpstreamError("Spotify token exchange failed") from exc
        access_token = payload.get("access_token")
        refresh_token = payload.get("refresh_token")
        if not access_token or not refresh_token:
            raise UpstreamError("Spotify token exchange failed")
        _save(user_id, str(access_token), str(refresh_token), _expires_at(payload))
        return {"connected": True, "user_id": user_id}

    def access_token(self, user_id: int) -> str:
        self._require_user(user_id)
        row = _row(user_id)
        if row is None:
            raise BadRequest("Spotify is not connected")
        if row["expires_at"] > datetime.now() + _REFRESH_SKEW:
            return str(row["access_token"])
        try:
            payload = self.token_client.refresh(
                client_id=_required("SPOTIFY_CLIENT_ID"),
                refresh_token=str(row["refresh_token"]),
            )
        except SpotifyTokenError as exc:
            raise UpstreamError("Spotify token refresh failed") from exc
        access_token = payload.get("access_token")
        if not access_token:
            raise UpstreamError("Spotify token refresh failed")
        refresh_token = payload.get("refresh_token") or row["refresh_token"]
        _save(user_id, str(access_token), str(refresh_token), _expires_at(payload))
        return str(access_token)

    def _require_user(self, user_id: int) -> None:
        connection = open_database()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
                row = cursor.fetchone()
        finally:
            connection.close()
        if row is None:
            raise NotFound("unknown user")
        if row["username"] == CATALOG_USERNAME:
            raise BadRequest("username catalog is not allowed")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise BadRequest(f"{name} is required")
    return value


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _expires_at(payload: dict) -> datetime:
    try:
        seconds = int(payload.get("expires_in", 3600))
    except (TypeError, ValueError):
        seconds = 3600
    return datetime.now() + timedelta(seconds=seconds)


def _row(user_id: int) -> dict | None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT access_token, refresh_token, expires_at "
                "FROM user_spotify WHERE user_id = %s",
                (user_id,),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def _save(user_id: int, access_token: str, refresh_token: str, expires_at: datetime) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO user_spotify (user_id, access_token, refresh_token, expires_at) "
                "VALUES (%s, %s, %s, %s) "
                "ON DUPLICATE KEY UPDATE "
                "access_token = VALUES(access_token), "
                "refresh_token = VALUES(refresh_token), "
                "expires_at = VALUES(expires_at)",
                (user_id, access_token, refresh_token, expires_at),
            )
        connection.commit()
    finally:
        connection.close()
