"""List the connected user's Spotify playlists. No network."""

from __future__ import annotations

from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from db.manager import open_database

from API.Adapters.spotify_library import HttpxSpotifyLibrary, SpotifyImage, SpotifyPlaylist
from API.app import create_app
from tests.conftest import FakeSource, count_rows, insert_user


class FakeLibrary:
    def __init__(self) -> None:
        self.playlists_result: list[SpotifyPlaylist] = []
        self.calls: list[str] = []

    def playlists(self, access_token: str) -> list[SpotifyPlaylist]:
        self.calls.append(access_token)
        return list(self.playlists_result)


@pytest.fixture
def library() -> FakeLibrary:
    return FakeLibrary()


@pytest.fixture
def client(database: str, source: FakeSource, library: FakeLibrary):
    with TestClient(create_app(source, library=library)) as test_client:
        yield test_client


def test_http_library_reads_every_playlist_page() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        assert request.headers["Authorization"] == "Bearer token-1"
        if str(request.url) == "https://api.spotify.com/v1/me/playlists":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "abc",
                            "name": "Night Drive",
                            "images": [
                                {"url": "https://i.scdn.co/image/abc", "height": 640, "width": 640},
                                {"url": "https://i.scdn.co/image/small", "height": 64, "width": 64},
                                {"height": 300, "width": 300},
                                {"url": 12, "height": 1, "width": 1},
                            ],
                        },
                        {"id": "", "name": "Dropped"},
                        {"name": "Missing id", "images": [{"url": "https://i.scdn.co/image/nope"}]},
                        {"id": "bare", "name": "Bare"},
                    ],
                    "next": "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
                },
            )
        if str(request.url) == "https://api.spotify.com/v1/me/playlists?offset=50&limit=50":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "def",
                            "images": [
                                {"url": "https://i.scdn.co/image/def", "height": None, "width": "640"},
                                {"url": "https://i.scdn.co/image/ok", "height": True, "width": 10},
                            ],
                        }
                    ],
                    "next": None,
                },
            )
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        playlists = HttpxSpotifyLibrary(http).playlists("token-1")

    assert seen == [
        "https://api.spotify.com/v1/me/playlists",
        "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
    ]
    assert playlists == [
        SpotifyPlaylist(
            "abc",
            "Night Drive",
            (
                SpotifyImage("https://i.scdn.co/image/abc", 640, 640),
                SpotifyImage("https://i.scdn.co/image/small", 64, 64),
            ),
        ),
        SpotifyPlaylist("bare", "Bare", ()),
        SpotifyPlaylist(
            "def",
            "",
            (
                SpotifyImage("https://i.scdn.co/image/def", None, None),
                SpotifyImage("https://i.scdn.co/image/ok", None, 10),
            ),
        ),
    ]


def test_list_returns_spotify_playlists_without_writing_local_rows(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.playlists_result = [
        SpotifyPlaylist(
            "abc",
            "Night Drive",
            (SpotifyImage("https://i.scdn.co/image/abc", 640, 640),),
        ),
        SpotifyPlaylist("bare", "", ()),
    ]
    before = count_rows("playlists")

    listed = client.get(f"/user/{user_id}/spotify/playlists")

    assert listed.status_code == 200
    assert listed.json() == {
        "playlists": [
            {
                "spotify_playlist_id": "abc",
                "name": "Night Drive",
                "images": [{"url": "https://i.scdn.co/image/abc", "height": 640, "width": 640}],
            },
            {
                "spotify_playlist_id": "bare",
                "name": "",
                "images": [],
            },
        ]
    }
    assert library.calls == ["access-token"]
    assert count_rows("playlists") == before


def test_missing_connection_does_not_call_spotify(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")

    listed = client.get(f"/user/{user_id}/spotify/playlists")

    assert listed.status_code == 400
    assert listed.json()["detail"] == "Spotify is not connected"
    assert library.calls == []
    assert count_rows("playlists") == 0


def test_catalog_user_is_rejected(client, library: FakeLibrary) -> None:
    listed = client.get(f"/user/{_catalog_user_id()}/spotify/playlists")

    assert listed.status_code == 400
    assert listed.json()["detail"] == "username catalog is not allowed"
    assert library.calls == []


def connect_spotify(user_id: int) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO user_spotify (user_id, access_token, refresh_token, expires_at) "
                "VALUES (%s, %s, %s, %s)",
                (user_id, "access-token", "refresh-token", datetime.now() + timedelta(hours=1)),
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
