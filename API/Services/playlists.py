"""Owner playlists. Song order is a dense 1..n position list."""

from __future__ import annotations

from collections import Counter

from db.manager import CATALOG_USERNAME, open_database

from API.Services.errors import BadRequest, NotFound
from API.Services.songs import SongService
from API.Services.tag_rank import PLAYLIST_TAG_LIMIT, tags_across, tags_by_song

_POSITION_OFFSET = 1_000_000
_NAME_LIMIT = 255


class PlaylistService:
    def __init__(self, songs: SongService) -> None:
        self.songs = songs

    def create(self, user_id: int, name: str) -> dict:
        cleaned = _clean_name(name)
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO playlists (user_id, name) VALUES (%s, %s)",
                    (user_id, cleaned),
                )
                playlist_id = int(cursor.lastrowid)
            connection.commit()
            return self._document(connection, user_id, playlist_id)
        finally:
            connection.close()

    def list_playlists(self, user_id: int) -> dict:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id, name, created_at, spotify_playlist_id, image_url "
                    "FROM playlists WHERE user_id = %s ORDER BY id",
                    (user_id,),
                )
                rows = cursor.fetchall()
            return {"playlists": [_summary(row) for row in rows]}
        finally:
            connection.close()

    def get(self, user_id: int, playlist_id: int) -> dict:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            return self._document(connection, user_id, playlist_id)
        finally:
            connection.close()

    def rename(self, user_id: int, playlist_id: int, name: str) -> dict:
        cleaned = _clean_name(name)
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            self._require_playlist(connection, user_id, playlist_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE playlists SET name = %s WHERE id = %s AND user_id = %s",
                    (cleaned, playlist_id, user_id),
                )
            connection.commit()
            return self._document(connection, user_id, playlist_id)
        finally:
            connection.close()

    def delete(self, user_id: int, playlist_id: int) -> None:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            self._require_playlist(connection, user_id, playlist_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM playlist_songs WHERE playlist_id = %s",
                    (playlist_id,),
                )
                cursor.execute(
                    "DELETE FROM playlists WHERE id = %s AND user_id = %s",
                    (playlist_id, user_id),
                )
            connection.commit()
        finally:
            connection.close()

    def add_song(self, user_id: int, playlist_id: int, song_id: int, position: int | None) -> dict:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            self._require_playlist(connection, user_id, playlist_id)
            self.songs.require_song(connection, song_id)
            membership_ids = self._membership_ids(connection, playlist_id)
            index = len(membership_ids) + 1 if position is None else position
            if index < 1 or index > len(membership_ids) + 1:
                raise BadRequest("position is out of range")
            with connection.cursor() as cursor:
                _park_positions(cursor, playlist_id)
                cursor.execute(
                    "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (%s, %s, %s)",
                    (playlist_id, song_id, _POSITION_OFFSET + len(membership_ids) + 1),
                )
                membership_id = int(cursor.lastrowid)
                membership_ids.insert(index - 1, membership_id)
                _place_positions(cursor, playlist_id, membership_ids)
            connection.commit()
            return self._document(connection, user_id, playlist_id)
        finally:
            connection.close()

    def remove_song(self, user_id: int, playlist_id: int, membership_id: int) -> None:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            self._require_playlist(connection, user_id, playlist_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM playlist_songs WHERE id = %s AND playlist_id = %s",
                    (membership_id, playlist_id),
                )
                if cursor.fetchone() is None:
                    raise NotFound("unknown membership")
                cursor.execute(
                    "DELETE FROM playlist_songs WHERE id = %s AND playlist_id = %s",
                    (membership_id, playlist_id),
                )
            remaining = self._membership_ids(connection, playlist_id)
            with connection.cursor() as cursor:
                _park_positions(cursor, playlist_id)
                _place_positions(cursor, playlist_id, remaining)
            connection.commit()
        finally:
            connection.close()

    def reorder(self, user_id: int, playlist_id: int, membership_ids: list[int]) -> dict:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            self._require_playlist(connection, user_id, playlist_id)
            current = self._membership_ids(connection, playlist_id)
            if Counter(membership_ids) != Counter(current):
                raise BadRequest("membership_ids must list every song on the playlist once")
            with connection.cursor() as cursor:
                _park_positions(cursor, playlist_id)
                _place_positions(cursor, playlist_id, membership_ids)
            connection.commit()
            return self._document(connection, user_id, playlist_id)
        finally:
            connection.close()

    def _require_owner(self, connection, user_id: int) -> None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            row = cursor.fetchone()
        if row is None:
            raise NotFound("unknown user")
        if row["username"] == CATALOG_USERNAME:
            raise BadRequest("username catalog is not allowed")

    def _require_playlist(self, connection, user_id: int, playlist_id: int) -> dict:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, user_id, name, created_at, spotify_playlist_id, image_url "
                "FROM playlists WHERE id = %s AND user_id = %s",
                (playlist_id, user_id),
            )
            row = cursor.fetchone()
        if row is None:
            raise NotFound("unknown playlist")
        return row

    def _membership_ids(self, connection, playlist_id: int) -> list[int]:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM playlist_songs WHERE playlist_id = %s ORDER BY position, id",
                (playlist_id,),
            )
            return [int(row["id"]) for row in cursor.fetchall()]

    def _document(self, connection, user_id: int, playlist_id: int) -> dict:
        playlist = self._require_playlist(connection, user_id, playlist_id)
        with connection.cursor() as cursor:
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
        song_ids = [song["song_id"] for song in songs]
        by_song = tags_by_song(connection, song_ids)
        for song in songs:
            song["tags"] = by_song[song["song_id"]]
        document = _summary(playlist)
        document["songs"] = songs
        document["tags"] = tags_across(connection, song_ids, limit=PLAYLIST_TAG_LIMIT)
        return document


def _clean_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise BadRequest("name is required")
    if len(cleaned) > _NAME_LIMIT:
        raise BadRequest("name is too long")
    return cleaned


def _summary(row: dict) -> dict:
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "created_at": row["created_at"],
        "spotify_playlist_id": row["spotify_playlist_id"],
        "image_url": row["image_url"],
    }


def _park_positions(cursor, playlist_id: int) -> None:
    cursor.execute(
        "UPDATE playlist_songs SET position = position + %s WHERE playlist_id = %s",
        (_POSITION_OFFSET, playlist_id),
    )


def _place_positions(cursor, playlist_id: int, membership_ids: list[int]) -> None:
    for position, membership_id in enumerate(membership_ids, start=1):
        cursor.execute(
            "UPDATE playlist_songs SET position = %s WHERE id = %s AND playlist_id = %s",
            (position, membership_id, playlist_id),
        )
