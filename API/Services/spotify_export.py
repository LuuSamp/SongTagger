"""Copy a local playlist to Spotify, or replace the linked Spotify playlist."""

from __future__ import annotations

from db.manager import open_database

from API.Adapters.spotify_publish import SpotifyPublishError, SpotifyPublisher
from API.Services.errors import NotFound, UpstreamError
from API.Services.playlists import PlaylistService
from API.Services.songs import SongService
from API.Services.spotify_auth import SpotifyAuth


class SpotifyExport:
    def __init__(
        self,
        auth: SpotifyAuth,
        publisher: SpotifyPublisher,
        playlists: PlaylistService | None = None,
    ) -> None:
        self.auth = auth
        self.publisher = publisher
        self.playlists = playlists if playlists is not None else PlaylistService(SongService())

    def export_playlist(self, user_id: int, playlist_id: int) -> tuple[dict, int]:
        document = self.playlists.get(user_id, playlist_id)
        access_token = self.auth.access_token(user_id)
        connection = open_database()
        try:
            try:
                resolved, skipped = self._collect(connection, access_token, document)
            except SpotifyPublishError as exc:
                connection.rollback()
                raise UpstreamError("Spotify playlist export failed") from exc
            connection.commit()
        finally:
            connection.close()
        linked = document["spotify_playlist_id"]
        try:
            if linked:
                self.publisher.rename_playlist(access_token, str(linked), document["name"])
                self.publisher.replace_tracks(access_token, str(linked), resolved)
                spotify_playlist_id = str(linked)
                url = f"https://open.spotify.com/playlist/{spotify_playlist_id}"
                status_code = 200
            else:
                spotify_playlist_id, url = self.publisher.create_playlist(access_token, document["name"])
                if resolved:
                    self.publisher.add_tracks(access_token, spotify_playlist_id, resolved)
                _store_playlist_link(user_id, playlist_id, spotify_playlist_id)
                status_code = 201
        except SpotifyPublishError as exc:
            if linked and exc.status_code == 404:
                raise NotFound("Spotify playlist is gone") from exc
            raise UpstreamError("Spotify playlist export failed") from exc
        return {
            "spotify_playlist_id": spotify_playlist_id,
            "url": url,
            "skipped": skipped,
        }, status_code

    def _collect(self, connection, access_token: str, document: dict) -> tuple[list[str], list[dict]]:
        details = _song_details(connection, [int(song["song_id"]) for song in document["songs"]])
        resolved: list[str] = []
        skipped: list[dict] = []
        for song in document["songs"]:
            info = details[int(song["song_id"])]
            spotify_id = self._resolve(connection, access_token, info)
            if spotify_id is None:
                skipped.append(
                    {
                        "song_id": int(song["song_id"]),
                        "title": song["title"],
                        "artist_credit": song["artist_credit"],
                    }
                )
            else:
                resolved.append(spotify_id)
        return resolved, skipped

    def _resolve(self, connection, access_token: str, info: dict) -> str | None:
        existing = info.get("external_id")
        if existing:
            return str(existing)
        isrc = info.get("isrc")
        if isrc:
            for candidate in self.publisher.search_by_isrc(access_token, str(isrc)):
                if candidate.spotify_id and candidate.isrc == isrc:
                    _remember(connection, info, candidate.spotify_id)
                    return candidate.spotify_id
        title = str(info["title"]).strip()
        artist = str(info["artist_credit"]).strip()
        for candidate in self.publisher.search_by_title_artist(
            access_token,
            str(info["title"]),
            str(info["artist_credit"]),
        ):
            if not candidate.spotify_id:
                continue
            if candidate.title.strip() == title and ", ".join(candidate.artists) == artist:
                _remember(connection, info, candidate.spotify_id)
                return candidate.spotify_id
        return None


def _store_playlist_link(user_id: int, playlist_id: int, spotify_playlist_id: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE playlists SET spotify_playlist_id = %s WHERE id = %s AND user_id = %s",
                (spotify_playlist_id, playlist_id, user_id),
            )
        connection.commit()
    finally:
        connection.close()


def _remember(connection, info: dict, spotify_id: str) -> None:
    with connection.cursor() as cursor:
        _store_spotify(cursor, int(info["id"]), spotify_id)
    info["external_id"] = spotify_id


def _song_details(connection, song_ids: list[int]) -> dict[int, dict]:
    if not song_ids:
        return {}
    unique_ids = list(dict.fromkeys(song_ids))
    placeholders = ", ".join(["%s"] * len(unique_ids))
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT s.id, s.title, s.artist_credit, s.isrc, ss.external_id "
            "FROM songs s "
            "LEFT JOIN sources src ON src.name = 'spotify' "
            "LEFT JOIN song_sources ss ON ss.song_id = s.id AND ss.source_id = src.id "
            f"WHERE s.id IN ({placeholders})",
            unique_ids,
        )
        rows = cursor.fetchall()
    return {
        int(row["id"]): {
            "id": int(row["id"]),
            "title": row["title"],
            "artist_credit": row["artist_credit"],
            "isrc": row["isrc"],
            "external_id": row["external_id"],
        }
        for row in rows
    }


def _store_spotify(cursor, song_id: int, spotify_id: str) -> None:
    cursor.execute("SELECT id FROM sources WHERE name = %s", ("spotify",))
    source = cursor.fetchone()
    if source is None:
        raise RuntimeError("spotify source is missing")
    source_id = int(source["id"])
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
