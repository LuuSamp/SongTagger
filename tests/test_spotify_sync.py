"""Link a local playlist to Spotify and update that link. No network."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from db.manager import open_database

from API.Adapters.spotify_library import SpotifyItem, SpotifyLibraryError
from API.Adapters.spotify_publish import HttpxSpotifyPublisher, SpotifyPublishError
from API.app import create_app
from tests.conftest import FakeSource, count_rows, insert_song, insert_user


class FakeLibrary:
    def __init__(self) -> None:
        self.name = "Night Drive"
        self.items: list[SpotifyItem] = []
        self.image_url: str | None = None
        self.error: Exception | None = None
        self.calls: list[tuple[str, str]] = []

    def playlist(self, access_token: str, playlist_id: str) -> tuple[str, list[SpotifyItem], str | None]:
        self.calls.append((access_token, playlist_id))
        if self.error is not None:
            raise self.error
        return self.name, list(self.items), self.image_url


class FakePublisher:
    def __init__(self) -> None:
        self.isrc_hits: dict[str, list[SpotifyItem]] = {}
        self.title_hits: dict[tuple[str, str], list[SpotifyItem]] = {}
        self.created: list[tuple[str, str]] = []
        self.added: list[tuple[str, str, list[str]]] = []
        self.renamed: list[tuple[str, str, str]] = []
        self.replaced: list[tuple[str, str, list[str]]] = []
        self.gone = False
        self.playlist_id = "sp-playlist"
        self.url = "https://open.spotify.com/playlist/sp-playlist"

    def search_by_isrc(self, access_token: str, isrc: str) -> list[SpotifyItem]:
        return list(self.isrc_hits.get(isrc, []))

    def search_by_title_artist(self, access_token: str, title: str, artist: str) -> list[SpotifyItem]:
        return list(self.title_hits.get((title, artist), []))

    def create_playlist(self, access_token: str, name: str) -> tuple[str, str]:
        self.created.append((access_token, name))
        return self.playlist_id, self.url

    def add_tracks(self, access_token: str, playlist_id: str, track_ids: list[str]) -> None:
        self.added.append((access_token, playlist_id, list(track_ids)))

    def rename_playlist(self, access_token: str, playlist_id: str, name: str) -> None:
        self.renamed.append((access_token, playlist_id, name))
        if self.gone:
            raise SpotifyPublishError("HTTP 404", 404)

    def replace_tracks(self, access_token: str, playlist_id: str, track_ids: list[str]) -> None:
        self.replaced.append((access_token, playlist_id, list(track_ids)))
        if self.gone:
            raise SpotifyPublishError("HTTP 404", 404)


@pytest.fixture
def library() -> FakeLibrary:
    return FakeLibrary()


@pytest.fixture
def publisher() -> FakePublisher:
    return FakePublisher()


@pytest.fixture
def client(database: str, source: FakeSource, library: FakeLibrary, publisher: FakePublisher):
    with TestClient(create_app(source, library=library, publisher=publisher)) as test_client:
        yield test_client


def test_plain_playlist_returns_null_spotify_id(client) -> None:
    user_id = insert_user("ada")
    created = client.post(f"/user/{user_id}/playlist", json={"name": "Night Drive"})
    assert created.status_code == 201
    body = created.json()
    playlist_id = body["id"]

    listed = client.get(f"/user/{user_id}/playlist")
    fetched = client.get(f"/user/{user_id}/playlist/{playlist_id}")

    assert "spotify_playlist_id" in body
    assert body["spotify_playlist_id"] is None
    assert listed.status_code == 200
    assert listed.json()["playlists"][0]["spotify_playlist_id"] is None
    assert fetched.status_code == 200
    assert fetched.json()["spotify_playlist_id"] is None


def test_first_import_stores_the_spotify_playlist_id(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [item("t1", "One", ("A",))]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    playlist = imported.json()["playlist"]
    assert playlist["spotify_playlist_id"] == "spotify-pl"
    assert playlist["name"] == "Night Drive"
    fetched = client.get(f"/user/{user_id}/playlist/{playlist['id']}")
    assert fetched.json()["spotify_playlist_id"] == "spotify-pl"
    assert count_rows("playlists") == 1


def test_second_import_replaces_the_linked_playlist(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [item("t1", "One", ("A",)), item("t2", "Two", ("B",))]
    first = _import(client, user_id, "spotify-pl")
    library.name = "  Later Drive  "
    library.items = [item("t3", "Three", ("C",))]

    again = _import(client, user_id, "spotify-pl")

    assert first.status_code == 201
    assert again.status_code == 200
    playlist = again.json()["playlist"]
    assert playlist["id"] == first.json()["playlist"]["id"]
    assert playlist["spotify_playlist_id"] == "spotify-pl"
    assert playlist["name"] == "Later Drive"
    assert [(song["title"], song["position"]) for song in playlist["songs"]] == [("Three", 1)]
    assert count_rows("playlists") == 1
    assert library.calls == [("access-token", "spotify-pl"), ("access-token", "spotify-pl")]


def test_second_import_leaves_another_users_playlist(client, library: FakeLibrary) -> None:
    ada = insert_user("ada")
    grace = insert_user("grace")
    connect_spotify(ada)
    connect_spotify(grace)
    library.items = [item("t1", "One", ("A",))]
    ada_import = _import(client, ada, "shared")
    library.items = [item("t2", "Two", ("B",))]

    grace_import = _import(client, grace, "shared")

    assert ada_import.status_code == 201
    assert grace_import.status_code == 201
    assert grace_import.json()["playlist"]["id"] != ada_import.json()["playlist"]["id"]
    assert [song["title"] for song in grace_import.json()["playlist"]["songs"]] == ["Two"]
    ada_songs = client.get(f"/user/{ada}/playlist/{ada_import.json()['playlist']['id']}")
    assert [song["title"] for song in ada_songs.json()["songs"]] == ["One"]
    assert count_rows("playlists") == 2


def test_failed_spotify_read_leaves_the_linked_playlist(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [item("t1", "One", ("A",))]
    first = _import(client, user_id, "spotify-pl")
    library.error = SpotifyLibraryError("down")
    library.name = "Broken"
    library.items = [item("t2", "Two", ("B",))]

    failed = _import(client, user_id, "spotify-pl")

    assert failed.status_code == 502
    assert failed.json()["detail"] == "Spotify playlist read failed"
    fetched = client.get(f"/user/{user_id}/playlist/{first.json()['playlist']['id']}")
    assert fetched.json()["name"] == "Night Drive"
    assert [song["title"] for song in fetched.json()["songs"]] == ["One"]
    assert count_rows("playlists") == 1


def test_first_export_stores_the_spotify_playlist_id(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("One", "A")
    attach_spotify(song_id, "t1")
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])

    exported = _export(client, user_id, playlist_id)

    assert exported.status_code == 201
    assert exported.json()["spotify_playlist_id"] == "sp-playlist"
    assert publisher.created == [("access-token", "Night Drive")]
    assert publisher.replaced == []
    assert publisher.renamed == []
    fetched = client.get(f"/user/{user_id}/playlist/{playlist_id}")
    assert fetched.json()["spotify_playlist_id"] == "sp-playlist"
    assert _local_songs(client, user_id, playlist_id) == [(song_id, "One", 1)]


def test_second_export_replaces_tracks_and_does_not_create(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    first = insert_song("One", "A")
    second = insert_song("Two", "B")
    attach_spotify(first, "t1")
    attach_spotify(second, "t2")
    playlist_id = _playlist(client, user_id, "Night Drive", [first])
    created = _export(client, user_id, playlist_id)
    assert client.patch(
        f"/user/{user_id}/playlist/{playlist_id}",
        json={"name": "Later"},
    ).status_code == 200
    assert client.post(
        f"/user/{user_id}/playlist/{playlist_id}/song",
        json={"song_id": second},
    ).status_code == 200

    again = _export(client, user_id, playlist_id)

    assert created.status_code == 201
    assert again.status_code == 200
    assert again.json()["spotify_playlist_id"] == "sp-playlist"
    assert again.json()["url"] == "https://open.spotify.com/playlist/sp-playlist"
    assert publisher.created == [("access-token", "Night Drive")]
    assert publisher.renamed == [("access-token", "sp-playlist", "Later")]
    assert publisher.replaced == [("access-token", "sp-playlist", ["t1", "t2"])]
    assert publisher.added == [("access-token", "sp-playlist", ["t1"])]
    assert _local_songs(client, user_id, playlist_id) == [(first, "One", 1), (second, "Two", 2)]


def test_second_export_reports_a_missing_spotify_playlist(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("One", "A")
    attach_spotify(song_id, "t1")
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])
    assert _export(client, user_id, playlist_id).status_code == 201
    publisher.gone = True

    missing = _export(client, user_id, playlist_id)

    assert missing.status_code == 404
    assert missing.json()["detail"] == "Spotify playlist is gone"
    assert len(publisher.created) == 1
    fetched = client.get(f"/user/{user_id}/playlist/{playlist_id}")
    assert fetched.json()["spotify_playlist_id"] == "sp-playlist"
    assert _local_songs(client, user_id, playlist_id) == [(song_id, "One", 1)]


def test_sync_import_replaces_the_linked_local_playlist(client, library: FakeLibrary, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [item("t1", "One", ("A",))]
    imported = _import(client, user_id, "spotify-pl")
    playlist_id = imported.json()["playlist"]["id"]
    library.name = "Pulled"
    library.items = [item("t2", "Two", ("B",))]

    synced = _sync(client, user_id, playlist_id, "import")

    assert synced.status_code == 200
    assert synced.json()["playlist"]["id"] == playlist_id
    assert synced.json()["playlist"]["name"] == "Pulled"
    assert [song["title"] for song in synced.json()["playlist"]["songs"]] == ["Two"]
    assert count_rows("playlists") == 1
    assert publisher.created == []


def test_sync_export_replaces_the_linked_spotify_playlist(client, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    first = insert_song("One", "A")
    second = insert_song("Two", "B")
    attach_spotify(first, "t1")
    attach_spotify(second, "t2")
    playlist_id = _playlist(client, user_id, "Night Drive", [first])
    assert _export(client, user_id, playlist_id).status_code == 201
    assert client.post(
        f"/user/{user_id}/playlist/{playlist_id}/song",
        json={"song_id": second},
    ).status_code == 200

    synced = _sync(client, user_id, playlist_id, "export")

    assert synced.status_code == 200
    assert synced.json()["spotify_playlist_id"] == "sp-playlist"
    assert publisher.created == [("access-token", "Night Drive")]
    assert publisher.replaced == [("access-token", "sp-playlist", ["t1", "t2"])]
    assert _local_songs(client, user_id, playlist_id) == [(first, "One", 1), (second, "Two", 2)]


def test_sync_on_an_unlinked_playlist_creates_nothing(client, library: FakeLibrary, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("One", "A")
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])
    library.items = [item("t1", "One", ("A",))]

    imported = _sync(client, user_id, playlist_id, "import")
    exported = _sync(client, user_id, playlist_id, "export")

    assert imported.status_code == 400
    assert imported.json()["detail"] == "playlist is not linked to Spotify"
    assert exported.status_code == 400
    assert exported.json()["detail"] == "playlist is not linked to Spotify"
    assert library.calls == []
    assert publisher.created == []
    assert publisher.replaced == []
    assert count_rows("playlists") == 1
    fetched = client.get(f"/user/{user_id}/playlist/{playlist_id}")
    assert fetched.json()["spotify_playlist_id"] is None
    assert _local_songs(client, user_id, playlist_id) == [(song_id, "One", 1)]


def test_sync_rejects_any_other_direction(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [item("t1", "One", ("A",))]
    imported = _import(client, user_id, "spotify-pl")
    playlist_id = imported.json()["playlist"]["id"]

    rejected = _sync(client, user_id, playlist_id, "sideways")

    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "direction must be import or export"
    fetched = client.get(f"/user/{user_id}/playlist/{playlist_id}")
    assert [song["title"] for song in fetched.json()["songs"]] == ["One"]


def test_sync_unknown_playlist_and_catalog_user(client, library: FakeLibrary, publisher: FakePublisher) -> None:
    user_id = insert_user("ada")
    grace = insert_user("grace")
    connect_spotify(user_id)
    song_id = insert_song("One", "A")
    attach_spotify(song_id, "t1")
    playlist_id = _playlist(client, user_id, "Night Drive", [song_id])
    assert _export(client, user_id, playlist_id).status_code == 201

    missing = _sync(client, user_id, 999999, "export")
    other = _sync(client, grace, playlist_id, "export")
    catalog = _sync(client, _catalog_user_id(), playlist_id, "import")

    assert missing.status_code == 404
    assert missing.json()["detail"] == "unknown playlist"
    assert other.status_code == 404
    assert other.json()["detail"] == "unknown playlist"
    assert catalog.status_code == 400
    assert catalog.json()["detail"] == "username catalog is not allowed"
    assert len(publisher.created) == 1
    assert publisher.replaced == []
    assert library.calls == []


def test_http_publisher_renames_without_privacy_and_replaces_in_chunks() -> None:
    seen: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, str(request.url), body))
        assert request.headers["Authorization"] == "Bearer token-1"
        if request.method == "PUT" and request.url.path == "/v1/playlists/pl-1":
            return httpx.Response(200, json={"id": "pl-1"})
        if request.method in {"PUT", "POST"} and request.url.path == "/v1/playlists/pl-1/items":
            return httpx.Response(200, json={"snapshot_id": "snap"})
        return httpx.Response(404, json={"error": "missing"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        publisher = HttpxSpotifyPublisher(http)
        publisher.rename_playlist("token-1", "pl-1", "Later")
        publisher.replace_tracks("token-1", "pl-1", [f"t{index}" for index in range(101)])
        publisher.replace_tracks("token-1", "pl-1", [])

    assert seen[0] == ("PUT", "https://api.spotify.com/v1/playlists/pl-1", {"name": "Later"})
    assert "public" not in seen[0][2]
    assert seen[1][0:2] == ("PUT", "https://api.spotify.com/v1/playlists/pl-1/items")
    assert seen[1][2]["uris"] == [f"spotify:track:t{index}" for index in range(100)]
    assert seen[2] == (
        "POST",
        "https://api.spotify.com/v1/playlists/pl-1/items",
        {"uris": ["spotify:track:t100"]},
    )
    assert seen[3] == ("PUT", "https://api.spotify.com/v1/playlists/pl-1/items", {"uris": []})


def test_http_publisher_reports_a_missing_playlist() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "missing"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        publisher = HttpxSpotifyPublisher(http)
        with pytest.raises(SpotifyPublishError) as caught:
            publisher.rename_playlist("token-1", "gone", "Later")

    assert caught.value.status_code == 404


def item(
    spotify_id: str,
    title: str,
    artists: tuple[str, ...],
) -> SpotifyItem:
    return SpotifyItem(spotify_id, title, artists, None, 1000, True)


def _import(client: TestClient, user_id: int, playlist_id: str):
    return client.post(
        f"/user/{user_id}/playlist/spotify",
        json={"spotify_playlist_id": playlist_id},
    )


def _export(client: TestClient, user_id: int, playlist_id: int):
    return client.post(f"/user/{user_id}/playlist/{playlist_id}/spotify")


def _sync(client: TestClient, user_id: int, playlist_id: int, direction: str):
    return client.post(
        f"/user/{user_id}/playlist/{playlist_id}/sync",
        json={"direction": direction},
    )


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


def _catalog_user_id() -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", ("catalog",))
            return int(cursor.fetchone()["id"])
    finally:
        connection.close()
