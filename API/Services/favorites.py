"""User likes stored as user_songs rows with action = 'like'."""

from __future__ import annotations

from db.manager import CATALOG_USERNAME, open_database

from API.Services.errors import BadRequest, NotFound
from API.Services.songs import SongService


class FavoriteService:
    def __init__(self, songs: SongService) -> None:
        self.songs = songs

    def list_favorites(self, user_id: int) -> dict:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT us.song_id, s.title, s.artist_credit, us.created_at AS favorited_at "
                    "FROM user_songs us "
                    "JOIN songs s ON s.id = us.song_id "
                    "WHERE us.user_id = %s AND us.action = 'like' "
                    "ORDER BY us.created_at DESC, us.song_id DESC",
                    (user_id,),
                )
                rows = cursor.fetchall()
            return {"songs": [_favorite(row) for row in rows]}
        finally:
            connection.close()

    def add(self, user_id: int, song_id: int) -> dict:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            self.songs.require_song(connection, song_id)
            existing = self._like(connection, user_id, song_id)
            if existing is not None:
                return existing
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO user_songs (user_id, song_id, action) VALUES (%s, %s, 'like')",
                    (user_id, song_id),
                )
            connection.commit()
            liked = self._like(connection, user_id, song_id)
            assert liked is not None
            return liked
        finally:
            connection.close()

    def remove(self, user_id: int, song_id: int) -> None:
        connection = open_database()
        try:
            self._require_owner(connection, user_id)
            self.songs.require_song(connection, song_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM user_songs "
                    "WHERE user_id = %s AND song_id = %s AND action = 'like'",
                    (user_id, song_id),
                )
            connection.commit()
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

    def _like(self, connection, user_id: int, song_id: int) -> dict | None:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT us.song_id, s.title, s.artist_credit, us.created_at AS favorited_at "
                "FROM user_songs us "
                "JOIN songs s ON s.id = us.song_id "
                "WHERE us.user_id = %s AND us.song_id = %s AND us.action = 'like' "
                "ORDER BY us.created_at, us.id "
                "LIMIT 1",
                (user_id, song_id),
            )
            row = cursor.fetchone()
        if row is None:
            return None
        return _favorite(row)


def _favorite(row: dict) -> dict:
    return {
        "song_id": int(row["song_id"]),
        "title": row["title"],
        "artist_credit": row["artist_credit"],
        "favorited_at": row["favorited_at"],
    }
