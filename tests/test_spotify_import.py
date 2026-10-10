"""Spotify playlist import. No network."""

from __future__ import annotations

from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from db.manager import open_database

from API.Adapters.spotify_library import HttpxSpotifyLibrary, SpotifyItem, SpotifyLibraryError
from API.app import create_app
from tests.conftest import FakeSource, count_rows, insert_song, insert_user


class FakeLibrary:
    def __init__(self) -> None:
        self.name = "Night Drive"
        self.items: list[SpotifyItem] = []
        self.error: Exception | None = None
        self.calls: list[tuple[str, str]] = []

    def playlist(self, access_token: str, playlist_id: str) -> tuple[str, list[SpotifyItem]]:
        self.calls.append((access_token, playlist_id))
        if self.error is not None:
            raise self.error
        return self.name, list(self.items)


@pytest.fixture
def library() -> FakeLibrary:
    return FakeLibrary()


@pytest.fixture
def client(database: str, source: FakeSource, library: FakeLibrary):
    with TestClient(create_app(source, library=library)) as test_client:
        yield test_client


def test_reuses_a_song_that_already_has_the_spotify_id(client, library: FakeLibrary, source: FakeSource) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("Yesterday", "The Beatles")
    attach_spotify(song_id, "track-1")
    library.items = [item("track-1", "Different Title", ("Someone Else",))]

    imported = _import(client, user_id, "spotify-pl")
    again = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    body = imported.json()
    assert body["skipped"] == []
    assert body["playlist"]["name"] == "Night Drive"
    assert [(song["song_id"], song["position"], song["title"]) for song in body["playlist"]["songs"]] == [
        (song_id, 1, "Yesterday")
    ]
    assert again.status_code == 200
    assert again.json()["playlist"]["id"] == body["playlist"]["id"]
    assert again.json()["playlist"]["spotify_playlist_id"] == "spotify-pl"
    assert count_rows("songs") == 1
    assert count_rows("playlists") == 1
    assert source.calls == []
    assert library.calls == [("access-token", "spotify-pl"), ("access-token", "spotify-pl")]


def test_isrc_match_reuses_the_song_and_stores_the_spotify_id(client, library: FakeLibrary, source: FakeSource) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    song_id = insert_song("Yesterday", "The Beatles")
    set_isrc(song_id, "USRC17607839")
    library.items = [item("track-9", "Yesterday", ("The Beatles",), isrc="  USRC17607839  ")]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    songs = imported.json()["playlist"]["songs"]
    assert [(song["song_id"], song["position"]) for song in songs] == [(song_id, 1)]
    assert spotify_link(song_id) == ("track-9", "https://open.spotify.com/track/track-9")
    assert count_rows("songs") == 1
    assert source.calls == []


def test_musicbrainz_import_stores_the_playlist_spotify_id(client, library: FakeLibrary, source: FakeSource) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    mbid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    hit = recording(mbid, "Yesterday", "The Beatles")
    hit["relations"] = [
        {
            "target-type": "url",
            "url": {"resource": "https://open.spotify.com/track/from-musicbrainz"},
        }
    ]
    source.artist_hits = [hit]
    library.items = [item("from-playlist", "Yesterday", ("The Beatles",))]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    song = imported.json()["playlist"]["songs"][0]
    assert song["title"] == "Yesterday"
    assert song["artist_credit"] == "The Beatles"
    assert song["position"] == 1
    assert song_row(song["song_id"])["mbid"] == mbid
    assert spotify_link(song["song_id"]) == (
        "from-playlist",
        "https://open.spotify.com/track/from-playlist",
    )
    assert source.calls[0] == ("search", "Yesterday", "The Beatles")
    assert ("lookup", mbid) in source.calls


def test_spotify_only_insert_when_musicbrainz_returns_nothing(client, library: FakeLibrary, source: FakeSource) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [
        item("only-1", "Only Here", ("Ada", "Grace"), isrc="USAAA1234567", duration_ms=2222),
        item("only-2", "Short Code", ("Ada",), isrc="NOPE", duration_ms=None),
    ]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    songs = imported.json()["playlist"]["songs"]
    assert [song["position"] for song in songs] == [1, 2]
    assert [(song["title"], song["artist_credit"]) for song in songs] == [
        ("Only Here", "Ada, Grace"),
        ("Short Code", "Ada"),
    ]
    first = song_row(songs[0]["song_id"])
    second = song_row(songs[1]["song_id"])
    assert first["mbid"] is None
    assert first["isrc"] == "USAAA1234567"
    assert first["duration_ms"] == 2222
    assert second["mbid"] is None
    assert second["isrc"] is None
    assert spotify_link(songs[0]["song_id"])[0] == "only-1"
    assert [call[0] for call in source.calls] == ["search", "search"]
    assert source.calls[0] == ("search", "Only Here", "Ada, Grace")


def test_musicbrainz_exception_still_inserts_from_spotify(client, library: FakeLibrary, source: FakeSource) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [item("only-1", "Only Here", ("Ada",))]

    def explode(title: str, artist: str) -> list[dict]:
        source.calls.append(("search", title, artist))
        raise RuntimeError("musicbrainz down")

    source.search = explode

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    song = imported.json()["playlist"]["songs"][0]
    assert song["title"] == "Only Here"
    assert song_row(song["song_id"])["mbid"] is None
    assert spotify_link(song["song_id"])[0] == "only-1"


def test_skipped_track_is_named_and_positions_are_packed(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [
        item("t1", "One", ("A",)),
        SpotifyItem(None, "Ghost", ("B", "C"), None, None, False),
        item("t2", "Two", ("D",)),
    ]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    body = imported.json()
    assert [(song["title"], song["position"]) for song in body["playlist"]["songs"]] == [
        ("One", 1),
        ("Two", 2),
    ]
    assert body["skipped"] == [
        {"spotify_id": None, "title": "Ghost", "artist_credit": "B, C"}
    ]
    assert count_rows("playlists") == 1
    assert count_rows("playlist_songs") == 2


def test_repeated_track_appears_twice(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [
        item("t1", "One", ("A",)),
        item("t1", "One", ("A",)),
    ]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    songs = imported.json()["playlist"]["songs"]
    assert [song["position"] for song in songs] == [1, 2]
    assert songs[0]["song_id"] == songs[1]["song_id"]
    assert songs[0]["membership_id"] != songs[1]["membership_id"]
    assert count_rows("songs") == 1


def test_order_follows_the_spotify_playlist(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.items = [
        item("c", "C", ("Z",)),
        item("a", "A", ("Z",)),
        item("b", "B", ("Z",)),
    ]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    assert [song["title"] for song in imported.json()["playlist"]["songs"]] == ["C", "A", "B"]
    assert [song["position"] for song in imported.json()["playlist"]["songs"]] == [1, 2, 3]


def test_catalog_user_is_rejected(client, library: FakeLibrary) -> None:
    library.items = [item("t1", "One", ("A",))]

    imported = _import(client, _catalog_user_id(), "spotify-pl")

    assert imported.status_code == 400
    assert imported.json()["detail"] == "username catalog is not allowed"
    assert library.calls == []
    assert count_rows("playlists") == 0


def test_missing_spotify_connection_creates_nothing(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    library.items = [item("t1", "One", ("A",))]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 400
    assert imported.json()["detail"] == "Spotify is not connected"
    assert library.calls == []
    assert count_rows("playlists") == 0


def test_long_name_is_cut_and_empty_name_is_rejected(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.name = "  " + ("n" * 300)
    library.items = [item("t1", "One", ("A",))]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 201
    assert imported.json()["playlist"]["name"] == "n" * 255

    library.name = "   "
    rejected = _import(client, user_id, "spotify-pl")
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "name is required"
    assert count_rows("playlists") == 1


def test_spotify_read_failure_creates_nothing(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.error = SpotifyLibraryError("down")
    library.items = [item("t1", "One", ("A",))]

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 502
    assert imported.json()["detail"] == "Spotify playlist read failed"
    assert count_rows("playlists") == 0
    assert count_rows("songs") == 0


def test_withheld_playlist_songs_are_reported(client, library: FakeLibrary) -> None:
    user_id = insert_user("ada")
    connect_spotify(user_id)
    library.error = SpotifyLibraryError("Spotify did not return this playlist's songs")

    imported = _import(client, user_id, "spotify-pl")

    assert imported.status_code == 502
    assert imported.json()["detail"] == "Spotify did not return this playlist's songs"
    assert count_rows("playlists") == 0


def test_http_library_reads_every_track_page() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        assert request.headers["Authorization"] == "Bearer token-1"
        if str(request.url) == "https://api.spotify.com/v1/playlists/pl-1":
            return httpx.Response(
                200,
                json={
                    "name": "  Night Drive  ",
                    "tracks": {
                        "items": [
                            {
                                "track": {
                                    "id": "t1",
                                    "name": "First",
                                    "artists": [{"name": "A"}, {"name": "B"}],
                                    "duration_ms": 1000,
                                    "external_ids": {"isrc": "USRC17607839"},
                                    "is_local": False,
                                }
                            },
                            {"track": None},
                        ],
                        "next": "https://api.spotify.com/v1/playlists/pl-1/tracks?offset=100&limit=100",
                    },
                },
            )
        if str(request.url) == "https://api.spotify.com/v1/playlists/pl-1/tracks?offset=100&limit=100":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "track": {
                                "id": "t2",
                                "name": "Second",
                                "artists": [{"name": "C"}],
                                "duration_ms": 2000,
                            }
                        },
                        {"track": {"id": "local-1", "name": "Demo", "is_local": True, "artists": [{"name": "Me"}]}},
                        {"track": {"name": "No Id", "artists": [{"name": "D"}]}},
                        {"track": {"id": "blank", "name": "   ", "artists": []}},
                    ],
                    "next": None,
                },
            )
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        name, items = HttpxSpotifyLibrary(http).playlist("token-1", "pl-1")

    assert seen == [
        "https://api.spotify.com/v1/playlists/pl-1",
        "https://api.spotify.com/v1/playlists/pl-1/tracks?offset=100&limit=100",
    ]
    assert name == "  Night Drive  "
    assert items == [
        SpotifyItem("t1", "First", ("A", "B"), "USRC17607839", 1000, True),
        SpotifyItem(None, "", (), None, None, False),
        SpotifyItem("t2", "Second", ("C",), None, 2000, True),
        SpotifyItem("local-1", "Demo", ("Me",), None, None, False),
        SpotifyItem(None, "No Id", ("D",), None, None, False),
        SpotifyItem("blank", "   ", (), None, None, False),
    ]


def test_http_library_reads_the_current_items_shape() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://api.spotify.com/v1/playlists/pl-1":
            return httpx.Response(
                200,
                json={
                    "name": "Night Drive",
                    "items": {
                        "items": [
                            {
                                "is_local": False,
                                "item": {
                                    "type": "track",
                                    "id": "t1",
                                    "name": "First",
                                    "artists": [{"name": "A"}],
                                    "duration_ms": 1000,
                                    "external_ids": {"isrc": "USRC17607839"},
                                },
                            },
                            {
                                "is_local": True,
                                "item": {"type": "track", "id": "local-1", "name": "Demo", "artists": [{"name": "Me"}]},
                            },
                            {
                                "item": {"type": "episode", "id": "ep-1", "name": "Talk"},
                            },
                        ],
                        "next": "https://api.spotify.com/v1/playlists/pl-1/items?offset=100",
                    },
                },
            )
        if str(request.url) == "https://api.spotify.com/v1/playlists/pl-1/items?offset=100":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "item": {
                                "type": "track",
                                "id": "t2",
                                "name": "Second",
                                "artists": [{"name": "C"}],
                                "duration_ms": 2000,
                            }
                        }
                    ],
                    "next": None,
                },
            )
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        name, items = HttpxSpotifyLibrary(http).playlist("token-1", "pl-1")

    assert name == "Night Drive"
    assert items == [
        SpotifyItem("t1", "First", ("A",), "USRC17607839", 1000, True),
        SpotifyItem("local-1", "Demo", ("Me",), None, None, False),
        SpotifyItem("ep-1", "Talk", (), None, None, False),
        SpotifyItem("t2", "Second", ("C",), None, 2000, True),
    ]


def test_http_library_rejects_a_playlist_without_songs() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"name": "Night Drive", "id": "pl-1"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(SpotifyLibraryError, match="did not return this playlist's songs"):
            HttpxSpotifyLibrary(http).playlist("token-1", "pl-1")


def test_http_library_raises_when_a_page_fails() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url).endswith("/pl-1"):
            return httpx.Response(
                200,
                json={"name": "Night", "tracks": {"items": [], "next": "https://api.spotify.com/v1/playlists/pl-1/tracks?offset=100"}},
            )
        return httpx.Response(502)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(SpotifyLibraryError):
            HttpxSpotifyLibrary(http).playlist("token-1", "pl-1")


def recording(mbid: str, title: str, artist: str) -> dict:
    return {
        "id": mbid,
        "title": title,
        "score": 100,
        "disambiguation": "",
        "length": 180000,
        "artist-credit": [{"name": artist, "joinphrase": ""}],
        "releases": [
            {
                "status": "Official",
                "date": "2001-01-01",
                "release-group": {"primary-type": "Album", "secondary-types": []},
            }
        ],
        "genres": [{"name": "Rock"}],
    }


def item(
    spotify_id: str,
    title: str,
    artists: tuple[str, ...],
    *,
    isrc: str | None = None,
    duration_ms: int | None = 1000,
) -> SpotifyItem:
    return SpotifyItem(spotify_id, title, artists, isrc, duration_ms, True)


def _import(client: TestClient, user_id: int, playlist_id: str):
    return client.post(
        f"/user/{user_id}/playlist/spotify",
        json={"spotify_playlist_id": playlist_id},
    )


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


def song_row(song_id: int) -> dict:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT title, artist_credit, duration_ms, mbid, isrc FROM songs WHERE id = %s",
                (song_id,),
            )
            return cursor.fetchone()
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
