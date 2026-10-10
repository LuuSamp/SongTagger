"""Cover images for songs and playlists.

Cover Art Archive is tried from the earliest official release, then that
release's release-group. Spotify album art is stored only when a track id is
already known, or when the caller already has the album image. A failure leaves
any stored URL in place. Both columns on a row stay null together, or both set.
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from urllib.parse import quote

import httpx

CAA_RELEASE = "https://coverartarchive.org/release/{mbid}"
CAA_GROUP = "https://coverartarchive.org/release-group/{mbid}"
TRACK_URL = "https://api.spotify.com/v1/tracks/{track_id}"
PLAYLIST_IMAGES_URL = "https://api.spotify.com/v1/playlists/{playlist_id}?fields=images"
USER_AGENT = "SongtaggingSeed/0.1 (local catalog seed)"
_CAA_INTERVAL = 1.0
_next_caa_at = 0.0
_tokens = None


def http_get(url: str, headers: dict | None = None) -> httpx.Response:
    global _next_caa_at
    request_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    if "coverartarchive.org" in url:
        delay = _next_caa_at - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        _next_caa_at = time.monotonic() + _CAA_INTERVAL
    try:
        return httpx.get(url, headers=request_headers, timeout=30.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise RuntimeError(str(exc)) from exc


def fill_song_image(
    cursor,
    song_id: int,
    recording: dict | None,
    *,
    spotify_image_url: str | None = None,
    fetch_track: bool = True,
) -> None:
    """Store one image. Cover Art Archive replaces a Spotify URL. Spotify does not replace the archive."""
    archive_url = None
    if recording is not None:
        try:
            archive_url = archive_front_url(recording)
        except Exception:
            archive_url = None
    if archive_url:
        store_song_image(cursor, song_id, archive_url, "cover_art_archive")
        return
    if spotify_image_url:
        store_song_image(cursor, song_id, spotify_image_url, "spotify")
        return
    if not fetch_track:
        return
    track_id = spotify_track_id(cursor, song_id)
    if not track_id:
        return
    try:
        album_url = fetch_track_image(track_id)
    except Exception:
        return
    if album_url:
        store_song_image(cursor, song_id, album_url, "spotify")


def archive_front_url(recording: dict) -> str | None:
    """Front image of the earliest official release, then that release-group."""
    from db.seed import _good_releases

    releases = _good_releases(recording)
    if not releases:
        return None
    release = min(releases, key=lambda item: str(item.get("date") or "9999"))
    candidates: list[str] = []
    release_id = release.get("id")
    if isinstance(release_id, str) and release_id:
        candidates.append(CAA_RELEASE.format(mbid=release_id))
    group = release.get("release-group") or {}
    group_id = group.get("id") if isinstance(group, dict) else None
    if isinstance(group_id, str) and group_id:
        candidates.append(CAA_GROUP.format(mbid=group_id))
    for url in candidates:
        try:
            found = _front_from_response(http_get(url))
        except Exception:
            continue
        if found:
            return found
    return None


def _front_from_response(response: httpx.Response) -> str | None:
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise RuntimeError(f"HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError("Cover Art Archive response was not JSON") from exc
    if not isinstance(payload, dict):
        return None
    images = payload.get("images")
    if not isinstance(images, list):
        return None
    for image in images:
        if not isinstance(image, dict) or not image.get("front"):
            continue
        thumbnails = image.get("thumbnails")
        if isinstance(thumbnails, dict):
            large = thumbnails.get("large")
            if isinstance(large, str) and large:
                return large
        full = image.get("image")
        if isinstance(full, str) and full:
            return full
    return None


def store_song_image(cursor, song_id: int, url: str, source: str) -> None:
    cursor.execute("SELECT image_source FROM songs WHERE id = %s", (song_id,))
    row = cursor.fetchone()
    if row is None:
        return
    if source == "spotify" and row["image_source"] == "cover_art_archive":
        return
    cursor.execute(
        "UPDATE songs SET image_url = %s, image_source = %s WHERE id = %s",
        (url, source, song_id),
    )


def spotify_track_id(cursor, song_id: int) -> str | None:
    cursor.execute(
        "SELECT ss.external_id FROM song_sources ss "
        "JOIN sources src ON src.id = ss.source_id "
        "WHERE ss.song_id = %s AND src.name = 'spotify'",
        (song_id,),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return str(row["external_id"])


def fetch_track_image(track_id: str) -> str | None:
    token = app_access_token()
    if token is None:
        return None
    response = http_get(
        TRACK_URL.format(track_id=quote(track_id, safe="")),
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code != 200:
        return None
    try:
        payload = response.json()
    except ValueError:
        return None
    album = payload.get("album") if isinstance(payload, dict) else None
    images = album.get("images") if isinstance(album, dict) else None
    return widest_image_url(images)


def widest_image_url(images: object) -> str | None:
    if not isinstance(images, list):
        return None
    best_url: str | None = None
    best_width = -1
    for item in images:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not isinstance(url, str) or not url:
            continue
        width = _size(item.get("width"))
        if width is None:
            width = _size(item.get("height")) or 0
        if width > best_width:
            best_url = url
            best_width = width
    return best_url


def _size(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def app_access_token() -> str | None:
    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "").strip()
    secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()
    if not client_id or not secret:
        return None
    from API.Adapters.spotify_tokens import SpotifyTokenError

    try:
        return _shared_tokens().app_access_token(client_id=client_id, client_secret=secret)
    except SpotifyTokenError:
        return None


def _shared_tokens():
    global _tokens
    if _tokens is None:
        from API.Adapters.spotify_tokens import HttpxSpotifyTokenClient

        _tokens = HttpxSpotifyTokenClient()
    return _tokens


def lookup_recording(mbid: str) -> dict | None:
    from db.seed import MusicBrainzClient

    client = MusicBrainzClient()
    try:
        return client.lookup(mbid)
    finally:
        client.close()


def user_access_token(connection, user_id: int) -> str | None:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT access_token FROM user_spotify WHERE user_id = %s AND expires_at > %s",
            (user_id, datetime.now()),
        )
        row = cursor.fetchone()
    if row is None:
        return None
    return str(row["access_token"])


def playlist_image_url(access_token: str, playlist_id: str) -> str | None:
    response = http_get(
        PLAYLIST_IMAGES_URL.format(playlist_id=quote(playlist_id, safe="")),
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if response.status_code != 200:
        return None
    try:
        payload = response.json()
    except ValueError:
        return None
    images = payload.get("images") if isinstance(payload, dict) else None
    return widest_image_url(images)


def fill_missing_images(connection) -> tuple[int, int]:
    """Fill songs with a null image, then Spotify playlists when a user token is still valid."""
    songs_filled = 0
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, mbid FROM songs WHERE image_url IS NULL ORDER BY id"
        )
        songs = list(cursor.fetchall())
    for song in songs:
        recording = None
        if song["mbid"]:
            try:
                recording = lookup_recording(str(song["mbid"]))
            except Exception:
                recording = None
        with connection.cursor() as cursor:
            fill_song_image(cursor, int(song["id"]), recording, fetch_track=True)
        connection.commit()
        if _song_image_url(connection, int(song["id"])):
            songs_filled += 1

    playlists_filled = 0
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, user_id, spotify_playlist_id FROM playlists "
            "WHERE image_url IS NULL AND spotify_playlist_id IS NOT NULL "
            "ORDER BY id"
        )
        playlists = list(cursor.fetchall())
    for playlist in playlists:
        token = user_access_token(connection, int(playlist["user_id"]))
        if not token:
            continue
        try:
            image_url = playlist_image_url(token, str(playlist["spotify_playlist_id"]))
        except Exception:
            continue
        if not image_url:
            continue
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE playlists SET image_url = %s, image_source = 'spotify' "
                "WHERE id = %s AND image_url IS NULL",
                (image_url, int(playlist["id"])),
            )
        connection.commit()
        playlists_filled += 1
    return songs_filled, playlists_filled


def _song_image_url(connection, song_id: int) -> str | None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT image_url FROM songs WHERE id = %s", (song_id,))
        row = cursor.fetchone()
    if row is None:
        return None
    return row["image_url"]


def main() -> None:
    from db.manager import load_project_env, open_database

    load_project_env()
    connection = open_database()
    try:
        songs, playlists = fill_missing_images(connection)
    finally:
        connection.close()
    print(f"Filled {songs} songs and {playlists} playlists.")


if __name__ == "__main__":
    main()
