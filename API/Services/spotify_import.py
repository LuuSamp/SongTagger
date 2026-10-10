"""Copy a Spotify playlist into a local playlist, or replace the linked one."""

from __future__ import annotations

from db.covers import fill_song_image, widest_image_url
from db.manager import open_database
from db.seed import choose_recording, upsert_recording

from API.Adapters.musicbrainz import RecordingSource
from API.Adapters.spotify_library import SpotifyImage, SpotifyItem, SpotifyLibrary, SpotifyLibraryError
from API.Services.errors import BadRequest, UpstreamError
from API.Services.spotify_auth import SpotifyAuth

_NAME_LIMIT = 255


class SpotifyImport:
    def __init__(
        self,
        auth: SpotifyAuth,
        library: SpotifyLibrary,
        source: RecordingSource,
    ) -> None:
        self.auth = auth
        self.library = library
        self.source = source

    def import_playlist(self, user_id: int, spotify_playlist_id: str) -> tuple[dict, int]:
        access_token = self.auth.access_token(user_id)
        try:
            name, items, image_url = self.library.playlist(access_token, spotify_playlist_id)
        except SpotifyLibraryError as exc:
            if str(exc) == "Spotify did not return this playlist's songs":
                raise UpstreamError(str(exc)) from exc
            raise UpstreamError("Spotify playlist read failed") from exc
        cleaned = name.strip()
        if not cleaned:
            raise BadRequest("name is required")
        cleaned = cleaned[:_NAME_LIMIT]
        connection = open_database()
        try:
            song_ids: list[int] = []
            skipped: list[dict] = []
            for playlist_item in items:
                if not _kept(playlist_item):
                    skipped.append(_skipped(playlist_item))
                    continue
                song_ids.append(self._resolve(connection, playlist_item))
            with connection.cursor() as cursor:
                existing_id = _playlist_id_for_spotify(cursor, user_id, spotify_playlist_id)
            playlist = _write_playlist(
                connection,
                user_id,
                existing_id,
                cleaned,
                song_ids,
                spotify_playlist_id,
                image_url,
            )
            connection.commit()
        finally:
            connection.close()
        status_code = 201 if existing_id is None else 200
        return {"playlist": playlist, "skipped": skipped}, status_code

    def _resolve(self, connection, playlist_item: SpotifyItem) -> int:
        spotify_id = str(playlist_item.spotify_id)
        with connection.cursor() as cursor:
            existing = _song_by_spotify(cursor, spotify_id)
            if existing is not None:
                song_id = existing
            else:
                song_id = None
                isrc = _usable_isrc(playlist_item.isrc)
                if isrc is not None:
                    matched = _song_by_isrc(cursor, isrc)
                    if matched is not None:
                        _store_spotify(cursor, matched, spotify_id)
                        song_id = matched
        if song_id is None:
            imported = self._from_musicbrainz(connection, playlist_item)
            if imported is not None:
                with connection.cursor() as cursor:
                    _store_spotify(cursor, imported, spotify_id)
                song_id = imported
            else:
                song_id = _insert_spotify_only(connection, playlist_item, spotify_id)
        with connection.cursor() as cursor:
            _apply_album_image(cursor, song_id, playlist_item)
        return song_id

    def _from_musicbrainz(self, connection, playlist_item: SpotifyItem) -> int | None:
        title = playlist_item.title.strip()
        artist = ", ".join(playlist_item.artists)
        try:
            recordings = self.source.search(title, artist)
            chosen = choose_recording(recordings, artist, title)
            if not chosen or not chosen.get("id"):
                return None
            recording = self.source.lookup(str(chosen["id"]))
            return int(upsert_recording(connection, recording, fetch_track=False))
        except Exception:
            return None


def _kept(playlist_item: SpotifyItem) -> bool:
    return bool(playlist_item.usable and playlist_item.spotify_id and playlist_item.title.strip())


def _skipped(playlist_item: SpotifyItem) -> dict:
    return {
        "spotify_id": playlist_item.spotify_id,
        "title": playlist_item.title,
        "artist_credit": ", ".join(playlist_item.artists),
    }


def _usable_isrc(value: str | None) -> str | None:
    if value is None:
        return None
    code = value.strip()
    if len(code) != 12:
        return None
    return code


def _song_by_spotify(cursor, spotify_id: str) -> int | None:
    cursor.execute(
        "SELECT ss.song_id FROM song_sources ss "
        "JOIN sources src ON src.id = ss.source_id "
        "WHERE src.name = 'spotify' AND ss.external_id = %s",
        (spotify_id,),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return int(row["song_id"])


def _song_by_isrc(cursor, isrc: str) -> int | None:
    cursor.execute("SELECT id FROM songs WHERE isrc = %s", (isrc,))
    row = cursor.fetchone()
    if row is None:
        return None
    return int(row["id"])


def _store_spotify(cursor, song_id: int, spotify_id: str) -> None:
    source_id = _spotify_source_id(cursor)
    url = f"https://open.spotify.com/track/{spotify_id}"
    cursor.execute(
        "SELECT external_id FROM song_sources WHERE song_id = %s AND source_id = %s",
        (song_id, source_id),
    )
    row = cursor.fetchone()
    if row is not None:
        if row["external_id"] != spotify_id:
            cursor.execute(
                "UPDATE song_sources SET external_id = %s, url = %s "
                "WHERE song_id = %s AND source_id = %s",
                (spotify_id, url, song_id, source_id),
            )
        return
    cursor.execute(
        "INSERT INTO song_sources (song_id, source_id, external_id, url) "
        "VALUES (%s, %s, %s, %s)",
        (song_id, source_id, spotify_id, url),
    )


def _insert_spotify_only(connection, playlist_item: SpotifyItem, spotify_id: str) -> int:
    title = playlist_item.title.strip()
    credit = ", ".join(playlist_item.artists)
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO songs (title, artist_credit, duration_ms, mbid, isrc) "
            "VALUES (%s, %s, %s, NULL, %s)",
            (title, credit, playlist_item.duration_ms, _usable_isrc(playlist_item.isrc)),
        )
        song_id = int(cursor.lastrowid)
        _store_spotify(cursor, song_id, spotify_id)
    return song_id


def _spotify_source_id(cursor) -> int:
    cursor.execute("SELECT id FROM sources WHERE name = %s", ("spotify",))
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError("spotify source is missing")
    return int(row["id"])


def _playlist_id_for_spotify(cursor, user_id: int, spotify_playlist_id: str) -> int | None:
    cursor.execute(
        "SELECT id FROM playlists WHERE user_id = %s AND spotify_playlist_id = %s",
        (user_id, spotify_playlist_id),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return int(row["id"])


def _apply_album_image(cursor, song_id: int, playlist_item: SpotifyItem) -> None:
    fill_song_image(
        cursor,
        song_id,
        None,
        spotify_image_url=_album_image_url(playlist_item.album_images),
        fetch_track=False,
    )


def _album_image_url(images: tuple[SpotifyImage, ...]) -> str | None:
    return widest_image_url(
        [
            {"url": image.url, "width": image.width, "height": image.height}
            for image in images
        ]
    )


def _write_playlist(
    connection,
    user_id: int,
    playlist_id: int | None,
    name: str,
    song_ids: list[int],
    spotify_playlist_id: str,
    image_url: str | None,
) -> dict:
    image_source = "spotify" if image_url else None
    with connection.cursor() as cursor:
        if playlist_id is None:
            cursor.execute(
                "INSERT INTO playlists "
                "(user_id, name, spotify_playlist_id, image_url, image_source) "
                "VALUES (%s, %s, %s, %s, %s)",
                (user_id, name, spotify_playlist_id, image_url, image_source),
            )
            playlist_id = int(cursor.lastrowid)
        else:
            cursor.execute(
                "UPDATE playlists SET name = %s, image_url = %s, image_source = %s "
                "WHERE id = %s AND user_id = %s",
                (name, image_url, image_source, playlist_id, user_id),
            )
            cursor.execute(
                "DELETE FROM playlist_songs WHERE playlist_id = %s",
                (playlist_id,),
            )
        for position, song_id in enumerate(song_ids, start=1):
            cursor.execute(
                "INSERT INTO playlist_songs (playlist_id, song_id, position) "
                "VALUES (%s, %s, %s)",
                (playlist_id, song_id, position),
            )
        cursor.execute(
            "SELECT id, name, created_at, spotify_playlist_id, image_url "
            "FROM playlists WHERE id = %s",
            (playlist_id,),
        )
        playlist = cursor.fetchone()
        cursor.execute(
            "SELECT ps.id AS membership_id, ps.position, ps.song_id, s.title, "
            "s.artist_credit, s.image_url "
            "FROM playlist_songs ps "
            "JOIN songs s ON s.id = ps.song_id "
            "WHERE ps.playlist_id = %s "
            "ORDER BY ps.position, ps.id",
            (playlist_id,),
        )
        songs = [
            {
                "membership_id": int(row["membership_id"]),
                "position": int(row["position"]),
                "song_id": int(row["song_id"]),
                "title": row["title"],
                "artist_credit": row["artist_credit"],
                "image_url": row["image_url"],
            }
            for row in cursor.fetchall()
        ]
    return {
        "id": int(playlist["id"]),
        "name": playlist["name"],
        "created_at": playlist["created_at"],
        "spotify_playlist_id": playlist["spotify_playlist_id"],
        "image_url": playlist["image_url"],
        "songs": songs,
    }
