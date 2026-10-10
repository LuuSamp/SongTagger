"""Load song documents from the catalog."""

from __future__ import annotations

from db.manager import open_database
from db.seed import fold

from API.Services.errors import NotFound

KIND_ORDER = ("artist", "genre", "feeling", "instrument")


def tag_token(name: str) -> str:
    """Public token: folded name, spaces rewritten as hyphens."""
    return fold(name).replace(" ", "-")


class SongService:
    def lookup(self, username: str) -> dict:
        connection = open_database()
        try:
            user_id = self.require_user(connection, username)
        finally:
            connection.close()
        return {"id": user_id, "username": username}

    def get(self, username: str, song_id: int) -> dict:
        connection = open_database()
        try:
            self.require_user(connection, username)
            self.require_song(connection, song_id)
            songs = self.documents(connection, [song_id], username=username)
        finally:
            connection.close()
        return songs[0]

    def require_user(self, connection, username: str) -> int:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            row = cursor.fetchone()
        if not row:
            raise NotFound("unknown user")
        return int(row["id"])

    def require_song(self, connection, song_id: int) -> None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM songs WHERE id = %s", (song_id,))
            row = cursor.fetchone()
        if not row:
            raise NotFound("unknown song")

    def documents(self, connection, song_ids: list[int], *, username: str | None) -> list[dict]:
        if not song_ids:
            return []
        user_id = self.require_user(connection, username) if username is not None else None
        songs = self._songs(connection, song_ids)
        sources = self._sources(connection, song_ids)
        tags = self._tags(connection, song_ids, user_id)
        documents: list[dict] = []
        for song in songs:
            song_id = int(song["id"])
            documents.append(
                {
                    "id": song_id,
                    "title": song["title"],
                    "artist_credit": song["artist_credit"],
                    "duration_ms": song["duration_ms"],
                    "mbid": song["mbid"],
                    "isrc": song["isrc"],
                    "disambiguation": song["disambiguation"],
                    "sources": sources.get(song_id, []),
                    "tags": tags.get(song_id, []),
                }
            )
        return documents

    def _songs(self, connection, song_ids: list[int]) -> list[dict]:
        placeholders = ", ".join(["%s"] * len(song_ids))
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, title, artist_credit, duration_ms, mbid, isrc, disambiguation "
                f"FROM songs WHERE id IN ({placeholders}) ORDER BY id",
                tuple(song_ids),
            )
            return list(cursor.fetchall())

    def _sources(self, connection, song_ids: list[int]) -> dict[int, list[dict]]:
        placeholders = ", ".join(["%s"] * len(song_ids))
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ss.song_id, src.name, ss.external_id, ss.url "
                "FROM song_sources ss "
                "JOIN sources src ON src.id = ss.source_id "
                f"WHERE ss.song_id IN ({placeholders}) "
                "ORDER BY src.name",
                tuple(song_ids),
            )
            rows = cursor.fetchall()
        grouped: dict[int, list[dict]] = {}
        for row in rows:
            grouped.setdefault(int(row["song_id"]), []).append(
                {
                    "name": row["name"],
                    "external_id": row["external_id"],
                    "url": row["url"],
                }
            )
        return grouped

    def _tags(self, connection, song_ids: list[int], user_id: int | None) -> dict[int, list[dict]]:
        placeholders = ", ".join(["%s"] * len(song_ids))
        params: list[int] = []
        applied = "0 AS applied_by_me"
        if user_id is not None:
            applied = "MAX(CASE WHEN st.user_id = %s THEN 1 ELSE 0 END) AS applied_by_me"
            params.append(user_id)
        params.extend(song_ids)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT st.song_id, t.id, t.kind, t.name, "
                f"{applied} "
                "FROM song_tags st "
                "JOIN tags t ON t.id = st.tag_id "
                f"WHERE st.song_id IN ({placeholders}) "
                "GROUP BY st.song_id, t.id, t.kind, t.name",
                tuple(params),
            )
            rows = cursor.fetchall()
        kind_order = {kind: index for index, kind in enumerate(KIND_ORDER)}
        grouped: dict[int, list[dict]] = {}
        for row in rows:
            tag = {
                "kind": row["kind"],
                "name": row["name"],
                "token": tag_token(row["name"]),
                "_id": int(row["id"]),
            }
            if user_id is not None:
                tag["applied_by_me"] = bool(row["applied_by_me"])
            grouped.setdefault(int(row["song_id"]), []).append(tag)
        for tags in grouped.values():
            tags.sort(
                key=lambda item: (
                    kind_order.get(item["kind"], len(KIND_ORDER)),
                    item["token"],
                    item["_id"],
                )
            )
            for tag in tags:
                del tag["_id"]
        return grouped
