"""Tag search, attach, and caller-only remove. No MusicBrainz."""

from __future__ import annotations

from db.manager import open_database
from db.seed import display_tag, normalize_tag

from API.Services.errors import BadRequest
from API.Services.songs import KIND_ORDER, SongService, tag_token

_KINDS = set(KIND_ORDER)


class TagService:
    def __init__(self, songs: SongService) -> None:
        self.songs = songs

    def search(self, username: str, q: str) -> dict:
        keys = self.keys(q)
        connection = open_database()
        try:
            self.songs.require_user(connection, username)
            song_ids = self._song_ids(connection, keys)
            return {"songs": self.songs.documents(connection, song_ids, username=username)}
        finally:
            connection.close()

    def attach(self, username: str, song_id: int, kind: str, token: str) -> dict:
        kind, shown, key = self._parsed_tag(kind, token)
        connection = open_database()
        try:
            user_id = self.songs.require_user(connection, username)
            self.songs.require_song(connection, song_id)
            tag = self._get_or_create_tag(connection, kind, shown, key)
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO song_tags (song_id, tag_id, user_id) VALUES (%s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE song_id = song_id",
                    (song_id, tag["id"], user_id),
                )
            connection.commit()
            return self._tag_document(tag["name"], kind)
        finally:
            connection.close()

    def remove(self, username: str, song_id: int, kind: str, token: str) -> None:
        kind, _shown, key = self._parsed_tag(kind, token)
        connection = open_database()
        try:
            user_id = self.songs.require_user(connection, username)
            self.songs.require_song(connection, song_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM tags WHERE kind = %s AND normalized_name = %s ORDER BY id LIMIT 1",
                    (kind, key),
                )
                tag = cursor.fetchone()
                if tag:
                    cursor.execute(
                        "DELETE FROM song_tags WHERE song_id = %s AND tag_id = %s AND user_id = %s",
                        (song_id, int(tag["id"]), user_id),
                    )
            connection.commit()
        finally:
            connection.close()

    def keys(self, q: str) -> list[str]:
        keys: list[str] = []
        seen: set[str] = set()
        for token in q.split():
            key = normalize_tag(token.replace("-", " "))
            if not key:
                raise BadRequest("token is empty")
            if key not in seen:
                seen.add(key)
                keys.append(key)
        if not keys:
            raise BadRequest("q is required")
        return keys

    def _parsed_tag(self, kind: str, token: str) -> tuple[str, str, str]:
        if kind not in _KINDS:
            raise BadRequest("kind must be artist, genre, feeling, or instrument")
        text = token.replace("-", " ")
        shown = display_tag(text)[:255]
        key = normalize_tag(text)[:255]
        if not key:
            raise BadRequest("token is empty")
        return kind, shown, key

    def _get_or_create_tag(self, connection, kind: str, shown: str, key: str) -> dict:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, name FROM tags WHERE kind = %s AND normalized_name = %s "
                "ORDER BY id LIMIT 1",
                (kind, key),
            )
            row = cursor.fetchone()
            if row:
                return {"id": int(row["id"]), "name": row["name"]}
            cursor.execute(
                "INSERT INTO tags (name, normalized_name, kind) VALUES (%s, %s, %s)",
                (shown, key, kind),
            )
            return {"id": int(cursor.lastrowid), "name": shown}

    def _tag_document(self, name: str, kind: str) -> dict:
        return {
            "kind": kind,
            "name": name,
            "token": tag_token(name),
            "applied_by_me": True,
        }

    def _song_ids(self, connection, keys: list[str]) -> list[int]:
        placeholders = ", ".join(["%s"] * len(keys))
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT s.id FROM songs s "
                "WHERE ("
                "SELECT COUNT(DISTINCT t.normalized_name) "
                "FROM song_tags st "
                "JOIN tags t ON t.id = st.tag_id "
                "WHERE st.song_id = s.id "
                f"AND t.normalized_name IN ({placeholders})"
                ") = %s "
                "ORDER BY s.id",
                (*keys, len(keys)),
            )
            return [int(row["id"]) for row in cursor.fetchall()]
