"""Spotify playlist export. No network."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from db.manager import open_database

from API.Adapters.spotify_library import SpotifyItem
from API.Adapters.spotify_publish import HttpxSpotifyPublisher, SpotifyPublishError
from API.app import create_app
from tests.conftest import FakeSource, insert_song, insert_user


class FakePublisher:
    def __init__(self) -> None:
        self.isrc_hits: dict[str, list[SpotifyItem]] = {}
        self.title_hits: dict[tuple[str, str], list[SpotifyItem]] = {}
        self.isrc_calls: list[tuple[str, str]] = []
        self.title_calls: list[tuple[str, str, str]] = []
        self.created: list[tuple[str, str]] = []
        self.added: list[tuple[str, str, list[str]]] = []
        self.fail_create = False
        self.fail_add = False
        self.fail_isrcs: set[str] = set()
        self.playlist_id = "sp-playlist"
        self.url = "https://open.spotify.com/playlist/sp-playlist"

    def search_by_isrc(self, access_token: str, isrc: str) -> list[SpotifyItem]:
        self.isrc_calls.append((access_token, isrc))
        if isrc in self.fail_isrcs:
            raise SpotifyPublishError("search failed")
        return list(self.isrc_hits.get(isrc, []))

    def search_by_title_artist(self, access_token: str, title: str, artist: str) -> list[SpotifyItem]:
        self.title_calls.append((access_token, title, artist))
        return list(self.title_hits.get((title, artist), []))

    def create_playlist(self, access_token: str, name: str) -> tuple[str, str]:
        self.created.append((access_token, name))
        if self.fail_create:
            raise SpotifyPublishError("create failed")
        return self.playlist_id, self.url

    def add_tracks(self, access_token: str, playlist_id: str, track_ids: list[str]) -> None:
        self.added.append((access_token, playlist_id, list(track_ids)))
        if self.fail_add:
            raise SpotifyPublishError("add failed")


@pytest.fixture
def publisher() -> FakePublisher:
    return FakePublisher()


@pytest.fixture
def client(database: str, source: FakeSource, publisher: FakePublisher):
    with TestClient(create_app(source, publisher=publisher)) as test_client:
        yield test_client


def test_existing_spotify_id_is_added_without_a_search(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("Yesterday", "The Beatles")
    attach_spotify(song_id, "track-1")
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])

    exported = _export(client, user_id, playlist_id)

    assert exported.status_code == 201
    assert exported.json() == {
        "spotify_playlist_id": "sp-playlist",
        "url": "https://open.spotify.com/playlist/sp-playlist",
        "skipped": [],
    }
    assert publisher.isrc_calls == []
    assert publisher.title_calls == []
    assert publisher.created == [("access-token", "Night Drive")]
    assert publisher.added == [("access-token", "sp-playlist", ["track-1"])]
    assert _local_songs(client, user_id, playlist_id) == [(song_id, "Yesterday", 1)]


def test_isrc_lookup_wins_and_is_stored(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("Yesterday", "The Beatles")
    set_isrc(song_id, "USRC17607839")
    publisher.isrc_hits["USRC17607839"] = [
        item("other", "Yesterday", ("The Beatles",), isrc="USXXX0000000"),
        item("isrc-hit", "Some Other Title", ("Someone",), isrc="USRC17607839"),
    ]
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])

    exported = _export(client, user_id, playlist_id)

    assert exported.status_code == 201
    assert exported.json()["skipped"] == []
    assert publisher.isrc_calls == [("access-token", "USRC17607839")]
    assert publisher.title_calls == []
    assert publisher.added == [("access-token", "sp-playlist", ["isrc-hit"])]
    assert spotify_link(song_id) == ("isrc-hit", "https://open.spotify.com/track/isrc-hit")


def test_exact_title_and_artist_wins_after_a_missed_isrc(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song(" Yesterday ", " The Beatles ")
    set_isrc(song_id, "USRC17607839")
    publisher.isrc_hits["USRC17607839"] = [
        item("wrong-isrc", "Yesterday", ("The Beatles",), isrc="USXXX0000000")
    ]
    publisher.title_hits[(" Yesterday ", " The Beatles ")] = [
        item("near", "Yesterday", ("Other",)),
        item("exact", "Yesterday", ("The Beatles",)),
        item("spaced", " Yesterday ", ("The Beatles",)),
    ]
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])

    exported = _export(client, user_id, playlist_id)

    assert exported.status_code == 201
    assert publisher.title_calls == [("access-token", " Yesterday ", " The Beatles ")]
    assert publisher.added == [("access-token", "sp-playlist", ["exact"])]
    assert spotify_link(song_id)[0] == "exact"


def test_unmatched_song_is_named_and_the_playlist_is_still_created(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    first = insert_song("One", "A")
    missing = insert_song("Gone", "Nobody")
    third = insert_song("Three", "C")
    attach_spotify(first, "t1")
    attach_spotify(third, "t3")
    publisher.title_hits[("Gone", "Nobody")] = [item("near", "Gone", ("Someone",))]
    playlist_id = _playlist(client, user_id, "Night Drive", [first, missing, third])

    exported = _export(client, user_id, playlist_id)

    assert exported.status_code == 201
    assert exported.json()["spotify_playlist_id"] == "sp-playlist"
    assert exported.json()["skipped"] == [
        {"song_id": missing, "title": "Gone", "artist_credit": "Nobody"}
    ]
    assert publisher.created == [("access-token", "Night Drive")]
    assert publisher.added == [("access-token", "sp-playlist", ["t1", "t3"])]
    assert [song[0] for song in _local_songs(client, user_id, playlist_id)] == [first, missing, third]


def test_order_follows_playlist_positions(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    first = insert_song("One", "A")
    second = insert_song("Two", "B")
    third = insert_song("Three", "C")
    attach_spotify(first, "t1")
    attach_spotify(second, "t2")
    attach_spotify(third, "t3")
    playlist_id = _playlist(client, user_id, "Night Drive", [third, first, second])

    exported = _export(client, user_id, playlist_id)

    assert exported.status_code == 201
    assert publisher.added == [("access-token", "sp-playlist", ["t3", "t1", "t2"])]


def test_repeated_song_is_added_twice(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("One", "A")
    attach_spotify(song_id, "t1")
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id, song_id])

    exported = _export(client, user_id, playlist_id)

    assert exported.status_code == 201
    assert publisher.added == [("access-token", "sp-playlist", ["t1", "t1"])]
    assert len(_local_songs(client, user_id, playlist_id)) == 2


def test_missing_playlist_is_not_found(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    grace = insert_user("grace")
    song_id = insert_song("One", "A")
    playlist_id = _playlist(client, user_id, "Ada", [song_id])

    missing = _export(client, user_id, 999999)
    other = _export(client, grace, playlist_id)

    assert missing.status_code == 404
    assert missing.json()["detail"] == "unknown playlist"
    assert other.status_code == 404
    assert other.json()["detail"] == "unknown playlist"
    assert publisher.created == []
    assert _local_songs(client, user_id, playlist_id) == [(song_id, "One", 1)]


def test_catalog_user_is_rejected(client, publisher: FakePublisher) -> None:
    exported = _export(client, _catalog_user_id(), 1)

    assert exported.status_code == 400
    assert exported.json()["detail"] == "username catalog is not allowed"
    assert publisher.created == []


def test_missing_connection_and_spotify_failure_leave_the_local_playlist(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    song_id = insert_song("One", "A")
    attach_spotify(song_id, "t1")
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])

    disconnected = _export(client, user_id, playlist_id)
    assert disconnected.status_code == 400
    assert disconnected.json()["detail"] == "Spotify is not connected"
    assert publisher.created == []

    connect_spotify(user_id)
    publisher.fail_create = True
    failed = _export(client, user_id, playlist_id)
    assert failed.status_code == 502
    assert failed.json()["detail"] == "Spotify playlist export failed"
    assert publisher.added == []
    assert _local_songs(client, user_id, playlist_id) == [(song_id, "One", 1)]

    publisher.fail_create = False
    publisher.fail_add = True
    added = _export(client, user_id, playlist_id)
    assert added.status_code == 502
    assert _local_songs(client, user_id, playlist_id) == [(song_id, "One", 1)]


def test_search_failure_is_an_upstream_error_and_stores_nothing(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    found = insert_song("Yesterday", "The Beatles")
    missed = insert_song("One", "A")
    set_isrc(found, "USRC17607839")
    set_isrc(missed, "USRC17607840")
    publisher.isrc_hits["USRC17607839"] = [
        item("isrc-hit", "Yesterday", ("The Beatles",), isrc="USRC17607839")
    ]
    publisher.fail_isrcs.add("USRC17607840")
    playlist_id = _playlist(client, user_id, "Night Drive", [found, missed])

    failed = _export(client, user_id, playlist_id)

    assert failed.status_code == 502
    assert failed.json()["detail"] == "Spotify playlist export failed"
    assert publisher.created == []
    assert publisher.added == []
    assert spotify_link(found) is None
    assert _local_songs(client, user_id, playlist_id) == [(found, "Yesterday", 1), (missed, "One", 2)]


def test_http_publisher_creates_a_private_playlist_and_chunks_tracks() -> None:
    seen: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, str(request.url), body))
        assert request.headers["Authorization"] == "Bearer token-1"
        if request.url.path == "/v1/search" and request.url.params.get("q", "").startswith("isrc:"):
            return httpx.Response(
                200,
                json={
                    "tracks": {
                        "items": [
                            {
                                "id": "isrc-track",
                                "name": "Song",
                                "artists": [{"name": "Ada"}],
                                "external_ids": {"isrc": "USRC17607839"},
                                "duration_ms": 1000,
                            }
                        ]
                    }
                },
            )
        if request.url.path == "/v1/search":
            return httpx.Response(
                200,
                json={
                    "tracks": {
                        "items": [
                            {
                                "id": "title-track",
                                "name": "Yesterday",
                                "artists": [{"name": "The Beatles"}],
                            }
                        ]
                    }
                },
            )
        if request.method == "POST" and request.url.path == "/v1/me/playlists":
            return httpx.Response(
                201,
                json={
                    "id": "pl-1",
                    "external_urls": {"spotify": "https://open.spotify.com/playlist/pl-1"},
                },
            )
        if request.method == "POST" and request.url.path == "/v1/playlists/pl-1/items":
            return httpx.Response(201, json={"snapshot_id": "snap"})
        return httpx.Response(500)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        publisher = HttpxSpotifyPublisher(http)
        found = publisher.search_by_isrc("token-1", "USRC17607839")
        titled = publisher.search_by_title_artist("token-1", "Yesterday", "The Beatles")
        created = publisher.create_playlist("token-1", "Night Drive")
        publisher.add_tracks("token-1", "pl-1", [f"t{index}" for index in range(101)])

    assert found == [SpotifyItem("isrc-track", "Song", ("Ada",), "USRC17607839", 1000, True)]
    assert titled == [SpotifyItem("title-track", "Yesterday", ("The Beatles",), None, None, True)]
    assert created == ("pl-1", "https://open.spotify.com/playlist/pl-1")
    assert seen[0][0:2] == ("GET", "https://api.spotify.com/v1/search?q=isrc%3AUSRC17607839&type=track")
    assert seen[1][0] == "GET"
    assert seen[1][1].startswith("https://api.spotify.com/v1/search?")
    assert "track%3A%22Yesterday%22" in seen[1][1] or 'track:"Yesterday"' in seen[1][1]
    assert "artist%3A%22The+Beatles%22" in seen[1][1] or "artist%3A%22The%20Beatles%22" in seen[1][1]
    assert seen[2] == (
        "POST",
        "https://api.spotify.com/v1/me/playlists",
        {"name": "Night Drive", "public": False},
    )
    assert seen[3][0:2] == ("POST", "https://api.spotify.com/v1/playlists/pl-1/items")
    assert seen[4][0:2] == ("POST", "https://api.spotify.com/v1/playlists/pl-1/items")
    assert seen[3][2]["uris"] == [f"spotify:track:t{index}" for index in range(100)]
    assert seen[4][2]["uris"] == ["spotify:track:t100"]


def test_http_publisher_raises_when_create_fails() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": "nope"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(SpotifyPublishError):
            HttpxSpotifyPublisher(http).create_playlist("token-1", "Night Drive")


def item(
    spotify_id: str,
    title: str,
    artists: tuple[str, ...],
    *,
    isrc: str | None = None,
) -> SpotifyItem:
    return SpotifyItem(spotify_id, title, artists, isrc, 1000, True)


def _playlist(client: TestClient, user_id: int, name: str, song_ids: list[int]) -> int:
    created = client.post(f"/user/{user_id}/playlist", json={"name": name})
    assert created.status_code == 201
    playlist_id = int(created.json()["id"])
    for song_id in song_ids:
        added = client.post(
            f"/user/{user_id}/playlist/{playlist_id}/song",
            json={"song_id": song_id},
        )
        assert added.status_code == 200
    return playlist_id


def _export(client: TestClient, user_id: int, playlist_id: int):
    return client.post(f"/user/{user_id}/playlist/{playlist_id}/spotify")


def _local_songs(client: TestClient, user_id: int, playlist_id: int) -> list[tuple[int, str, int]]:
    response = client.get(f"/user/{user_id}/playlist/{playlist_id}")
    assert response.status_code == 200
    return [
        (song["song_id"], song["title"], song["position"])
        for song in response.json()["songs"]
    ]


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


def attach_spotify(song_id: int, external_id: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM sources WHERE name = %s", ("spotify",))
            source_id = int(cursor.fetchone()["id"])
            cursor.execute(
                "INSERT INTO song_sources (song_id, source_id, external_id, url) "
                "VALUES (%s, %s, %s, %s)",
                (song_id, source_id, external_id, f"https://open.spotify.com/track/{external_id}"),
            )
        connection.commit()
    finally:
        connection.close()


def set_isrc(song_id: int, isrc: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE songs SET isrc = %s WHERE id = %s", (isrc, song_id))
        connection.commit()
    finally:
        connection.close()


def spotify_link(song_id: int) -> tuple[str, str] | None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ss.external_id, ss.url FROM song_sources ss "
                "JOIN sources src ON src.id = ss.source_id "
                "WHERE ss.song_id = %s AND src.name = 'spotify'",
                (song_id,),
            )
            row = cursor.fetchone()
    finally:
        connection.close()
    if row is None:
        return None
    return row["external_id"], row["url"]


def _catalog_user_id() -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", ("catalog",))
            return int(cursor.fetchone()["id"])
    finally:
        connection.close()
