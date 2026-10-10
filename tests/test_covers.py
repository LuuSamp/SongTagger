"""Cover Art Archive, Spotify album art, and the one-shot fill. No network."""

from __future__ import annotations

from datetime import datetime, timedelta
from urllib.parse import parse_qs

import httpx
from fastapi.testclient import TestClient

from db.covers import fill_missing_images
from db.manager import open_database
from db.seed import upsert_recording

from API.Adapters.spotify_tokens import HttpxSpotifyTokenClient
from API.app import create_app
from tests.conftest import FakeSource, count_rows, insert_song, insert_user

RELEASE_ID = "11111111-1111-1111-1111-111111111111"
GROUP_ID = "22222222-2222-2222-2222-222222222222"
MBID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
FRONT = "https://coverartarchive.org/release/front-large.jpg"
FULL = "https://coverartarchive.org/release/front-full.jpg"
ALBUM = "https://i.scdn.co/image/album"
GROUP_FRONT = "https://coverartarchive.org/release-group/front-large.jpg"


def test_front_image_is_stored_as_cover_art_archive(database, monkeypatch) -> None:
    monkeypatch.setattr("db.covers.http_get", _archive_front(FRONT))

    song_id = _upsert(_recording())

    assert _image(song_id) == (FRONT, "cover_art_archive")
    assert count_rows("songs") == 1


def test_release_group_is_used_when_the_release_has_no_front_image(database, monkeypatch) -> None:
    calls: list[str] = []

    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        calls.append(url)
        if "/release-group/" in url:
            return _front_response(GROUP_FRONT)
        return httpx.Response(404)

    monkeypatch.setattr("db.covers.http_get", http_get)

    song_id = _upsert(_recording())

    assert calls == [
        f"https://coverartarchive.org/release/{RELEASE_ID}",
        f"https://coverartarchive.org/release-group/{GROUP_ID}",
    ]
    assert _image(song_id) == (GROUP_FRONT, "cover_art_archive")


def test_full_image_is_used_when_the_large_thumbnail_is_missing(database, monkeypatch) -> None:
    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        return httpx.Response(
            200,
            json={"images": [{"front": True, "image": FULL, "thumbnails": {"small": "https://small"}}]},
        )

    monkeypatch.setattr("db.covers.http_get", http_get)

    assert _image(_upsert(_recording())) == (FULL, "cover_art_archive")


def test_archive_miss_with_spotify_id_stores_the_album_image(database, monkeypatch) -> None:
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "client")
    monkeypatch.setenv("SPOTIFY_CLIENT_SECRET", "secret")
    monkeypatch.setattr("db.covers.app_access_token", lambda: "app-token")
    seen: list[tuple[str, str | None]] = []

    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        auth = None if headers is None else headers.get("Authorization")
        seen.append((url, auth))
        if "coverartarchive.org" in url:
            return httpx.Response(404)
        assert url == "https://api.spotify.com/v1/tracks/track-1"
        assert auth == "Bearer app-token"
        return httpx.Response(
            200,
            json={
                "album": {
                    "images": [
                        {"url": "https://i.scdn.co/image/small", "width": 64, "height": 64},
                        {"url": ALBUM, "width": 640, "height": 640},
                    ]
                }
            },
        )

    monkeypatch.setattr("db.covers.http_get", http_get)

    song_id = _upsert(_recording(spotify_id="track-1"))

    assert _image(song_id) == (ALBUM, "spotify")
    assert [url for url, _auth in seen if "coverartarchive.org" in url]


def test_archive_miss_without_spotify_id_leaves_the_image_null(database, monkeypatch) -> None:
    monkeypatch.setattr("db.covers.http_get", lambda url, headers=None: httpx.Response(404))

    song_id = _upsert(_recording())

    assert _image(song_id) == (None, None)


def test_missing_client_secret_skips_the_spotify_image(database, monkeypatch) -> None:
    monkeypatch.delenv("SPOTIFY_CLIENT_SECRET", raising=False)
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "client")

    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        assert "api.spotify.com" not in url
        return httpx.Response(404)

    monkeypatch.setattr("db.covers.http_get", http_get)

    song_id = _upsert(_recording(spotify_id="track-1"))

    assert _image(song_id) == (None, None)


def test_archive_error_still_commits_the_song(database, source: FakeSource, monkeypatch) -> None:
    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        raise RuntimeError("caa down")

    monkeypatch.setattr("db.covers.http_get", http_get)
    source.artist_hits = [_recording()]
    with TestClient(create_app(source)) as client:
        response = client.get("/songs", params={"title": "Yesterday", "artist": "The Beatles"})

    assert response.status_code == 200
    assert response.json()["imported"] is True
    assert response.json()["songs"][0]["image_url"] is None
    assert count_rows("songs") == 1


def test_spotify_error_still_commits_the_song(database, source: FakeSource, monkeypatch) -> None:
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "client")
    monkeypatch.setenv("SPOTIFY_CLIENT_SECRET", "secret")
    monkeypatch.setattr("db.covers.app_access_token", lambda: "app-token")

    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        if "coverartarchive.org" in url:
            return httpx.Response(404)
        raise RuntimeError("spotify down")

    monkeypatch.setattr("db.covers.http_get", http_get)
    source.artist_hits = [_recording(spotify_id="track-1")]
    with TestClient(create_app(source)) as client:
        response = client.get("/songs", params={"title": "Yesterday", "artist": "The Beatles"})

    assert response.status_code == 200
    song = response.json()["songs"][0]
    assert song["image_url"] is None
    assert _image(song["id"]) == (None, None)
    assert count_rows("songs") == 1


def test_spotify_does_not_replace_a_cover_art_archive_url(database, monkeypatch) -> None:
    monkeypatch.setattr("db.covers.http_get", _archive_front(FRONT))
    song_id = _upsert(_recording(spotify_id="track-1"))
    assert _image(song_id) == (FRONT, "cover_art_archive")

    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "client")
    monkeypatch.setenv("SPOTIFY_CLIENT_SECRET", "secret")
    monkeypatch.setattr("db.covers.app_access_token", lambda: "app-token")

    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        if "coverartarchive.org" in url:
            return httpx.Response(404)
        return httpx.Response(200, json={"album": {"images": [{"url": ALBUM, "width": 640}]}})

    monkeypatch.setattr("db.covers.http_get", http_get)

    again = _upsert(_recording(spotify_id="track-1"))

    assert again == song_id
    assert _image(song_id) == (FRONT, "cover_art_archive")


def test_app_token_is_cached_until_it_expires() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.content.decode())
        return httpx.Response(200, json={"access_token": "app-1", "expires_in": 3600})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = HttpxSpotifyTokenClient(http)
        assert client.app_access_token(client_id="id", client_secret="secret") == "app-1"
        assert client.app_access_token(client_id="id", client_secret="secret") == "app-1"

    assert len(calls) == 1
    assert parse_qs(calls[0]) == {
        "grant_type": ["client_credentials"],
        "client_id": ["id"],
        "client_secret": ["secret"],
    }


def test_backfill_fills_null_song_images_and_linked_playlists_with_a_token(database, monkeypatch) -> None:
    archive_song = insert_song("Yesterday", "The Beatles")
    spotify_song = insert_song("Hey Jude", "The Beatles")
    untouched = insert_song("Let It Be", "The Beatles")
    _set_mbid(archive_song, MBID)
    _attach_spotify(spotify_song, "track-9")
    _set_image(untouched, FRONT, "cover_art_archive")
    owner = insert_user("ada")
    other = insert_user("grace")
    _connect(owner)
    linked = _playlist(owner, "Night", "spotify-pl")
    unlinked_token = _playlist(other, "Quiet", "other-pl")
    local = _playlist(owner, "Mine", None)

    def lookup(mbid: str) -> dict:
        assert mbid == MBID
        return _recording()

    def http_get(url: str, headers: dict | None = None) -> httpx.Response:
        if "coverartarchive.org" in url:
            return _front_response(FRONT)
        if url.startswith("https://api.spotify.com/v1/tracks/"):
            assert headers is not None
            assert headers["Authorization"] == "Bearer app-token"
            return httpx.Response(200, json={"album": {"images": [{"url": ALBUM, "width": 300}]}})
        assert url.startswith("https://api.spotify.com/v1/playlists/spotify-pl")
        assert headers is not None
        assert headers["Authorization"] == "Bearer access-token"
        return httpx.Response(
            200,
            json={"images": [{"url": "https://i.scdn.co/image/list", "width": 640}]},
        )

    monkeypatch.setattr("db.covers.lookup_recording", lookup)
    monkeypatch.setattr("db.covers.app_access_token", lambda: "app-token")
    monkeypatch.setattr("db.covers.http_get", http_get)

    connection = open_database()
    try:
        songs, playlists = fill_missing_images(connection)
    finally:
        connection.close()

    assert (songs, playlists) == (2, 1)
    assert _image(archive_song) == (FRONT, "cover_art_archive")
    assert _image(spotify_song) == (ALBUM, "spotify")
    assert _image(untouched) == (FRONT, "cover_art_archive")
    assert _playlist_image(linked) == ("https://i.scdn.co/image/list", "spotify")
    assert _playlist_image(unlinked_token) == (None, None)
    assert _playlist_image(local) == (None, None)


def _archive_front(url: str):
    def http_get(requested: str, headers: dict | None = None) -> httpx.Response:
        assert requested == f"https://coverartarchive.org/release/{RELEASE_ID}"
        return _front_response(url)

    return http_get


def _front_response(url: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "images": [
                {"front": False, "image": "https://coverartarchive.org/release/back.jpg"},
                {
                    "front": True,
                    "image": FULL,
                    "thumbnails": {"small": "https://coverartarchive.org/release/small.jpg", "large": url},
                },
            ]
        },
    )


def _recording(spotify_id: str | None = None) -> dict:
    recording = {
        "id": MBID,
        "title": "Yesterday",
        "score": 100,
        "disambiguation": "",
        "length": 180000,
        "artist-credit": [{"name": "The Beatles", "joinphrase": ""}],
        "releases": [
            {
                "id": "99999999-9999-9999-9999-999999999999",
                "status": "Official",
                "date": "2001-01-01",
                "release-group": {
                    "id": "88888888-8888-8888-8888-888888888888",
                    "primary-type": "Album",
                    "secondary-types": [],
                },
            },
            {
                "id": RELEASE_ID,
                "status": "Official",
                "date": "1965-08-06",
                "release-group": {
                    "id": GROUP_ID,
                    "primary-type": "Album",
                    "secondary-types": [],
                },
            },
        ],
    }
    if spotify_id:
        recording["relations"] = [
            {
                "target-type": "url",
                "url": {"resource": f"https://open.spotify.com/track/{spotify_id}"},
            }
        ]
    return recording


def _upsert(recording: dict) -> int:
    connection = open_database()
    try:
        song_id = upsert_recording(connection, recording)
        connection.commit()
        return int(song_id)
    finally:
        connection.close()


def _image(song_id: int) -> tuple[str | None, str | None]:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT image_url, image_source FROM songs WHERE id = %s",
                (song_id,),
            )
            row = cursor.fetchone()
    finally:
        connection.close()
    return row["image_url"], row["image_source"]


def _set_mbid(song_id: int, mbid: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE songs SET mbid = %s WHERE id = %s", (mbid, song_id))
        connection.commit()
    finally:
        connection.close()


def _set_image(song_id: int, url: str, source: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE songs SET image_url = %s, image_source = %s WHERE id = %s",
                (url, source, song_id),
            )
        connection.commit()
    finally:
        connection.close()


def _attach_spotify(song_id: int, external_id: str) -> None:
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


def _connect(user_id: int) -> None:
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


def _playlist(user_id: int, name: str, spotify_playlist_id: str | None) -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO playlists (user_id, name, spotify_playlist_id) VALUES (%s, %s, %s)",
                (user_id, name, spotify_playlist_id),
            )
            playlist_id = int(cursor.lastrowid)
        connection.commit()
        return playlist_id
    finally:
        connection.close()


def _playlist_image(playlist_id: int) -> tuple[str | None, str | None]:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT image_url, image_source FROM playlists WHERE id = %s",
                (playlist_id,),
            )
            row = cursor.fetchone()
    finally:
        connection.close()
    return row["image_url"], row["image_source"]
