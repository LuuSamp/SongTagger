"""Personal recommendations from user and song tag profiles, served from a cached model."""

from __future__ import annotations

import threading
import time

from db.manager import CATALOG_USERNAME, open_database
from db.seed import fold

from API.Recommender.config import RecommenderConfig
from API.Recommender.data import Interaction, Snapshot, TagApplication, TagInfo
from API.Recommender.model import Recommender
from API.Services.errors import BadRequest, NotFound
from API.Services.songs import SongService, tag_token

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def load_snapshot(connection) -> Snapshot:
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, artist_credit FROM songs ORDER BY id")
        songs = cursor.fetchall()
        cursor.execute("SELECT id, kind, name FROM tags")
        tags = cursor.fetchall()
        cursor.execute(
            "SELECT st.song_id, st.tag_id, st.user_id, u.username = %s AS catalog, "
            "TIMESTAMPDIFF(SECOND, st.created_at, NOW()) / 86400 AS age "
            "FROM song_tags st JOIN users u ON u.id = st.user_id",
            (CATALOG_USERNAME,),
        )
        applications = cursor.fetchall()
        cursor.execute(
            "SELECT us.user_id, us.song_id, us.action AS kind, "
            "TIMESTAMPDIFF(SECOND, MAX(us.created_at), NOW()) / 86400 AS age "
            "FROM user_songs us JOIN users u ON u.id = us.user_id "
            "WHERE u.username <> %s GROUP BY us.user_id, us.song_id, us.action",
            (CATALOG_USERNAME,),
        )
        actions = cursor.fetchall()
        cursor.execute(
            "SELECT p.user_id, ps.song_id, "
            "TIMESTAMPDIFF(SECOND, MAX(ps.created_at), NOW()) / 86400 AS age "
            "FROM playlist_songs ps JOIN playlists p ON p.id = ps.playlist_id "
            "JOIN users u ON u.id = p.user_id "
            "WHERE u.username <> %s GROUP BY p.user_id, ps.song_id",
            (CATALOG_USERNAME,),
        )
        playlist_rows = cursor.fetchall()

    interactions = [
        Interaction(int(row["user_id"]), int(row["song_id"]), row["kind"], float(row["age"] or 0))
        for row in actions
    ]
    interactions += [
        Interaction(int(row["user_id"]), int(row["song_id"]), "playlist", float(row["age"] or 0))
        for row in playlist_rows
    ]
    interactions += [
        Interaction(int(row["user_id"]), int(row["song_id"]), "tag", float(row["age"] or 0))
        for row in applications
        if not row["catalog"]
    ]
    return Snapshot(
        song_ids=tuple(int(row["id"]) for row in songs),
        artists={int(row["id"]): fold(row["artist_credit"]) for row in songs},
        tags={
            int(row["id"]): TagInfo(row["kind"], row["name"], tag_token(row["name"]))
            for row in tags
        },
        applications=tuple(
            TagApplication(
                int(row["song_id"]), int(row["tag_id"]), int(row["user_id"]), bool(row["catalog"])
            )
            for row in applications
        ),
        interactions=tuple(interactions),
    )


class RecommendationService:
    def __init__(
        self,
        songs: SongService,
        config: RecommenderConfig | None = None,
        max_age_seconds: float = 3600.0,
    ) -> None:
        self.songs = songs
        self.config = config if config is not None else RecommenderConfig()
        self.max_age_seconds = max_age_seconds
        self._lock = threading.Lock()
        self._model: Recommender | None = None
        self._snapshot: Snapshot | None = None
        self._fingerprint: tuple | None = None
        self._trained_at = 0.0
        self.trainings = 0

    def recommend(self, user_id: int, limit: int = DEFAULT_LIMIT) -> dict:
        connection = open_database()
        try:
            username = self._require_owner(connection, user_id)
            model, snapshot = self._current(connection)
            picks = model.recommend(user_id, min(max(limit, 1), MAX_LIMIT))
            documents = {
                document["id"]: document
                for document in self.songs.documents(
                    connection, [pick.song_id for pick in picks], username=username
                )
            }
        finally:
            connection.close()
        items = []
        for pick in picks:
            document = documents.get(pick.song_id)
            if document is None:
                continue
            items.append(
                {
                    "song": document,
                    "score": round(pick.score, 4),
                    "because": [_tag(snapshot.tags[tag_id]) for tag_id in pick.reasons],
                }
            )
        return {"songs": items}

    def _current(self, connection) -> tuple[Recommender, Snapshot]:
        fingerprint = _fingerprint(connection)
        with self._lock:
            fresh = time.monotonic() - self._trained_at < self.max_age_seconds
            if self._model is None or self._fingerprint != fingerprint or not fresh:
                snapshot = load_snapshot(connection)
                self._model = Recommender(snapshot, self.config)
                self._snapshot = snapshot
                self._fingerprint = fingerprint
                self._trained_at = time.monotonic()
                self.trainings += 1
            assert self._snapshot is not None
            return self._model, self._snapshot

    def _require_owner(self, connection, user_id: int) -> str:
        with connection.cursor() as cursor:
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            row = cursor.fetchone()
        if row is None:
            raise NotFound("unknown user")
        if row["username"] == CATALOG_USERNAME:
            raise BadRequest("username catalog is not allowed")
        return row["username"]


def _fingerprint(connection) -> tuple:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT "
            "(SELECT COUNT(*) FROM songs) AS songs, "
            "(SELECT COUNT(*) FROM tags) AS tags, "
            "(SELECT COUNT(*) FROM song_tags) AS applications, "
            "(SELECT COALESCE(SUM(song_id * 7919 + tag_id * 31 + user_id), 0) FROM song_tags) AS tagged, "
            "(SELECT MAX(created_at) FROM song_tags) AS applied, "
            "(SELECT COALESCE(SUM(id), 0) FROM user_songs) AS actions, "
            "(SELECT MAX(created_at) FROM user_songs) AS acted, "
            "(SELECT COALESCE(SUM(id), 0) FROM playlist_songs) AS memberships, "
            "(SELECT MAX(created_at) FROM playlist_songs) AS added"
        )
        row = cursor.fetchone()
    return tuple(row.values())


def _tag(info: TagInfo) -> dict:
    return {"kind": info.kind, "name": info.name, "token": info.token}
