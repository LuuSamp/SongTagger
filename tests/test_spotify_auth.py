"""Spotify PKCE connect and token refresh. No network."""

from __future__ import annotations

import base64
import hashlib
import os
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from db.manager import open_database

from API.Adapters.spotify_tokens import HttpxSpotifyTokenClient, SpotifyTokenError
from API.Services.errors import BadRequest, NotFound, UpstreamError
from API.app import create_app
from API.env import load_env
from tests.conftest import FakeSource, insert_user

AUTHORIZE = "https://accounts.spotify.com/authorize"
SCOPES = "playlist-read-private playlist-modify-private playlist-modify-public"
REDIRECT = "http://127.0.0.1:8001/auth/spotify/callback"


class FakeTokenClient:
    def __init__(self) -> None:
        self.exchange_body = {
            "access_token": "access-1",
            "refresh_token": "refresh-1",
            "expires_in": 3600,
        }
        self.refresh_body = {"access_token": "access-2", "expires_in": 7200}
        self.exchange_error: Exception | None = None
        self.refresh_error: Exception | None = None
        self.exchanges: list[dict] = []
        self.refreshes: list[dict] = []

    def exchange(
        self,
        *,
        client_id: str,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict:
        self.exchanges.append(
            {
                "client_id": client_id,
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            }
        )
        if self.exchange_error is not None:
            raise self.exchange_error
        return dict(self.exchange_body)

    def refresh(self, *, client_id: str, refresh_token: str) -> dict:
        self.refreshes.append({"client_id": client_id, "refresh_token": refresh_token})
        if self.refresh_error is not None:
            raise self.refresh_error
        return dict(self.refresh_body)


def test_load_env_overrides_present_names_and_keeps_absent(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "from-process")
    monkeypatch.setenv("SONGTAGGING_DB_NAME", "keep-me")
    monkeypatch.delenv("SPOTIFY_REDIRECT_URI", raising=False)
    path = tmp_path / ".env"
    path.write_text(
        "\n".join(
            [
                "# comment",
                "",
                "SPOTIFY_CLIENT_ID=",
                "SPOTIFY_REDIRECT_URI=http://127.0.0.1:8001/auth/spotify/callback",
                "  ",
            ]
        ),
        encoding="utf-8",
    )

    load_env(path)

    assert os.environ["SPOTIFY_CLIENT_ID"] == ""
    assert os.environ["SPOTIFY_REDIRECT_URI"] == REDIRECT
    assert os.environ["SONGTAGGING_DB_NAME"] == "keep-me"


def test_user_spotify_stores_tokens_without_client_id(database) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW COLUMNS FROM user_spotify")
            columns = [row["Field"] for row in cursor.fetchall()]
    finally:
        connection.close()
    assert columns == ["user_id", "access_token", "refresh_token", "expires_at"]


def test_first_callback_inserts_one_row(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    user_id = insert_user("ada")
    fake = FakeTokenClient()
    with TestClient(create_app(FakeSource(), fake)) as client:
        state, verifier = _start(client, user_id)
        saved = client.get("/auth/spotify/callback", params={"code": "code-1", "state": state})

    assert saved.status_code == 200
    assert saved.json() == {"connected": True, "user_id": user_id}
    assert fake.exchanges == [
        {
            "client_id": "client-id",
            "code": "code-1",
            "redirect_uri": REDIRECT,
            "code_verifier": verifier,
        }
    ]
    row = _spotify_row(user_id)
    assert row is not None
    assert row["access_token"] == "access-1"
    assert row["refresh_token"] == "refresh-1"
    assert row["expires_at"] > datetime.now() + timedelta(minutes=30)
    assert _row_count() == 1


def test_second_connect_replaces_the_row(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    user_id = insert_user("ada")
    fake = FakeTokenClient()
    with TestClient(create_app(FakeSource(), fake)) as client:
        state, _verifier = _start(client, user_id)
        first = client.get("/auth/spotify/callback", params={"code": "code-1", "state": state})
        assert first.status_code == 200
        fake.exchange_body = {
            "access_token": "access-new",
            "refresh_token": "refresh-new",
            "expires_in": 120,
        }
        state, _verifier = _start(client, user_id)
        second = client.get("/auth/spotify/callback", params={"code": "code-2", "state": state})

    assert second.status_code == 200
    assert second.json() == {"connected": True, "user_id": user_id}
    assert "access_token" not in second.json()
    assert "refresh_token" not in second.json()
    row = _spotify_row(user_id)
    assert row is not None
    assert row["access_token"] == "access-new"
    assert row["refresh_token"] == "refresh-new"
    assert _row_count() == 1


def test_refresh_updates_expiry_and_keeps_refresh_token_when_omitted(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    user_id = insert_user("ada")
    fake = FakeTokenClient()
    with TestClient(create_app(FakeSource(), fake)) as client:
        _connect(client, user_id)
        _expire(user_id)
        token = client.app.state.spotify_auth.access_token(user_id)

    assert token == "access-2"
    assert fake.refreshes == [{"client_id": "client-id", "refresh_token": "refresh-1"}]
    row = _spotify_row(user_id)
    assert row is not None
    assert row["access_token"] == "access-2"
    assert row["refresh_token"] == "refresh-1"
    assert row["expires_at"] > datetime.now() + timedelta(minutes=30)


def test_refresh_replaces_refresh_token_when_spotify_sends_one(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    user_id = insert_user("ada")
    fake = FakeTokenClient()
    fake.refresh_body = {
        "access_token": "access-3",
        "refresh_token": "refresh-3",
        "expires_in": 7200,
    }
    with TestClient(create_app(FakeSource(), fake)) as client:
        _connect(client, user_id)
        _expire(user_id)
        token = client.app.state.spotify_auth.access_token(user_id)

    assert token == "access-3"
    row = _spotify_row(user_id)
    assert row is not None
    assert row["refresh_token"] == "refresh-3"


def test_fresh_token_is_returned_without_refresh(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    user_id = insert_user("ada")
    fake = FakeTokenClient()
    with TestClient(create_app(FakeSource(), fake)) as client:
        _connect(client, user_id)
        token = client.app.state.spotify_auth.access_token(user_id)

    assert token == "access-1"
    assert fake.refreshes == []


def test_failed_refresh_leaves_the_row(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    user_id = insert_user("ada")
    fake = FakeTokenClient()
    fake.refresh_error = SpotifyTokenError("HTTP 500")
    with TestClient(create_app(FakeSource(), fake)) as client:
        _connect(client, user_id)
        _expire(user_id)
        before = _spotify_row(user_id)
        with pytest.raises(UpstreamError) as caught:
            client.app.state.spotify_auth.access_token(user_id)

    assert caught.value.status_code == 502
    assert caught.value.detail == "Spotify token refresh failed"
    assert _spotify_row(user_id) == before


def test_catalog_user_start_is_rejected(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    catalog_id = _catalog_user_id()
    with TestClient(create_app(FakeSource(), FakeTokenClient())) as client:
        response = client.get(f"/user/{catalog_id}/spotify/start", follow_redirects=False)

    assert response.status_code == 400
    assert response.json()["detail"] == "username catalog is not allowed"


def test_missing_spotify_row_is_rejected(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    user_id = insert_user("ada")
    with TestClient(create_app(FakeSource(), FakeTokenClient())) as client:
        with pytest.raises(BadRequest) as caught:
            client.app.state.spotify_auth.access_token(user_id)

    assert caught.value.status_code == 400
    assert caught.value.detail == "Spotify is not connected"


def test_unknown_user_and_missing_settings_and_bad_callback(database, monkeypatch) -> None:
    user_id = insert_user("ada")
    fake = FakeTokenClient()
    with TestClient(create_app(FakeSource(), fake)) as client:
        monkeypatch.delenv("SPOTIFY_CLIENT_ID", raising=False)
        monkeypatch.delenv("SPOTIFY_REDIRECT_URI", raising=False)
        missing_id = client.get(f"/user/{user_id}/spotify/start", follow_redirects=False)
        monkeypatch.setenv("SPOTIFY_CLIENT_ID", "client-id")
        missing_redirect = client.get(f"/user/{user_id}/spotify/start", follow_redirects=False)
        _spotify_env(monkeypatch)
        unknown = client.get("/user/999999/spotify/start", follow_redirects=False)
        state, _verifier = _start(client, user_id)
        denied = client.get(
            "/auth/spotify/callback",
            params={"error": "access_denied", "state": state},
        )
        reused = client.get("/auth/spotify/callback", params={"code": "code-1", "state": state})
        unknown_state = client.get(
            "/auth/spotify/callback",
            params={"code": "code-1", "state": "missing"},
        )
        fake.exchange_error = SpotifyTokenError("HTTP 503")
        state, _verifier = _start(client, user_id)
        failed = client.get("/auth/spotify/callback", params={"code": "code-1", "state": state})

    assert missing_id.status_code == 400
    assert "SPOTIFY_CLIENT_ID" in missing_id.json()["detail"]
    assert missing_redirect.status_code == 400
    assert "SPOTIFY_REDIRECT_URI" in missing_redirect.json()["detail"]
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "unknown user"
    assert denied.status_code == 400
    assert reused.status_code == 400
    assert unknown_state.status_code == 400
    assert failed.status_code == 502
    assert failed.json()["detail"] == "Spotify token exchange failed"
    assert _spotify_row(user_id) is None


def test_access_token_rejects_unknown_and_catalog_users(database, monkeypatch) -> None:
    _spotify_env(monkeypatch)
    with TestClient(create_app(FakeSource(), FakeTokenClient())) as client:
        auth = client.app.state.spotify_auth
        with pytest.raises(NotFound) as missing:
            auth.access_token(999999)
        with pytest.raises(BadRequest) as catalog:
            auth.access_token(_catalog_user_id())

    assert missing.value.detail == "unknown user"
    assert catalog.value.detail == "username catalog is not allowed"


def test_httpx_token_client_posts_code_and_refresh_without_a_secret() -> None:
    requests: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(
            {
                "url": str(request.url),
                "body": request.content.decode(),
            }
        )
        if len(requests) == 1:
            return httpx.Response(
                200,
                json={"access_token": "access", "refresh_token": "refresh", "expires_in": 60},
            )
        return httpx.Response(200, json={"access_token": "next", "expires_in": 60})

    tokens = HttpxSpotifyTokenClient(httpx.Client(transport=httpx.MockTransport(handler)))
    exchanged = tokens.exchange(
        client_id="client-id",
        code="code-1",
        redirect_uri=REDIRECT,
        code_verifier="verifier",
    )
    refreshed = tokens.refresh(client_id="client-id", refresh_token="refresh")

    assert exchanged["access_token"] == "access"
    assert refreshed["access_token"] == "next"
    assert requests[0]["url"] == "https://accounts.spotify.com/api/token"
    assert "grant_type=authorization_code" in requests[0]["body"]
    assert "client_secret" not in requests[0]["body"]
    assert "code_verifier=verifier" in requests[0]["body"]
    assert "grant_type=refresh_token" in requests[1]["body"]
    assert "client_secret" not in requests[1]["body"]


def test_httpx_token_client_raises_when_spotify_rejects() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant"})

    tokens = HttpxSpotifyTokenClient(httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(SpotifyTokenError):
        tokens.exchange(
            client_id="client-id",
            code="code-1",
            redirect_uri=REDIRECT,
            code_verifier="verifier",
        )


def _spotify_env(monkeypatch) -> None:
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "client-id")
    monkeypatch.setenv("SPOTIFY_REDIRECT_URI", REDIRECT)


def _start(client: TestClient, user_id: int) -> tuple[str, str]:
    response = client.get(f"/user/{user_id}/spotify/start", follow_redirects=False)
    assert response.status_code == 302
    parsed = urlparse(response.headers["location"])
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == AUTHORIZE
    query = parse_qs(parsed.query)
    assert query["client_id"] == ["client-id"]
    assert query["response_type"] == ["code"]
    assert query["redirect_uri"] == [REDIRECT]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == [SCOPES]
    state = query["state"][0]
    pending = client.app.state.spotify_auth.pending[state]
    assert pending["user_id"] == user_id
    verifier = pending["verifier"]
    assert query["code_challenge"] == [_code_challenge(verifier)]
    return state, verifier


def _connect(client: TestClient, user_id: int) -> None:
    state, _verifier = _start(client, user_id)
    response = client.get("/auth/spotify/callback", params={"code": "code-1", "state": state})
    assert response.status_code == 200


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _spotify_row(user_id: int) -> dict | None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id, access_token, refresh_token, expires_at "
                "FROM user_spotify WHERE user_id = %s",
                (user_id,),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def _row_count() -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS n FROM user_spotify")
            return int(cursor.fetchone()["n"])
    finally:
        connection.close()


def _expire(user_id: int) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE user_spotify SET expires_at = %s WHERE user_id = %s",
                (datetime.now() - timedelta(minutes=5), user_id),
            )
        connection.commit()
    finally:
        connection.close()


def _catalog_user_id() -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", ("catalog",))
            return int(cursor.fetchone()["id"])
    finally:
        connection.close()
