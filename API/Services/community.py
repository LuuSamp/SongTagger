"""Community feed: aggregate, anonymous signals across every listener."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime

from db.manager import CATALOG_USERNAME, open_database
from db.seed import fold

from API.Services.songs import KIND_ORDER, SongService, tag_token

SIGNAL_WEIGHTS = {"like": 3.0, "playlist": 2.0, "tag": 1.0}
DECAY_DAYS = 7.0
TRENDING_LOOKBACK_DAYS = 28
RISING_RECENT_DAYS = 7
RISING_BASELINE_DAYS = 21
MIN_PEOPLE = 2
MIN_TRENDING = 4
MIN_RISING = 3
TRENDING_LIMIT = 10
RISING_LIMIT = 8
PER_ARTIST = 2
CONSENSUS_LIMIT = 3


class CommunityService:
    def __init__(self, songs: SongService) -> None:
        self.songs = songs

    def feed(self, username: str) -> dict:
        connection = open_database()
        try:
            self.songs.require_user(connection, username)
            now = _now(connection)
            trending_window, ranked = self._trending(connection, now)
            tags_window, rising = self._rising_tags(connection)
            trending = self._trending_documents(connection, username, ranked)
            return {
                "trending_window": trending_window,
                "trending": trending,
                "tags_window": tags_window,
                "rising_tags": rising,
            }
        finally:
            connection.close()

    def _trending(self, connection, now: datetime) -> tuple[str, list[dict]]:
        weekly = _rank(_signals(connection, TRENDING_LOOKBACK_DAYS), now, decay=True)
        if len(weekly) >= MIN_TRENDING:
            return "week", weekly
        return "all_time", _rank(_signals(connection, None), now, decay=False)

    def _trending_documents(self, connection, username: str, ranked: list[dict]) -> list[dict]:
        candidates = ranked[: TRENDING_LIMIT * 3]
        if not candidates:
            return []
        ids = [entry["song_id"] for entry in candidates]
        documents = {
            document["id"]: document
            for document in self.songs.documents(connection, ids, username=username)
        }
        consensus = _consensus(connection, ids)
        per_artist: dict[str, int] = defaultdict(int)
        items: list[dict] = []
        for entry in candidates:
            document = documents.get(entry["song_id"])
            if document is None:
                continue
            artist = fold(document["artist_credit"])
            if per_artist[artist] >= PER_ARTIST:
                continue
            per_artist[artist] += 1
            items.append(
                {
                    "song": document,
                    "score": round(entry["score"], 3),
                    "people": entry["people"],
                    "playlist_adds": entry["playlist"],
                    "taggers": entry["tag"],
                    "likes": entry["like"],
                    "consensus": consensus.get(entry["song_id"], []),
                }
            )
            if len(items) >= TRENDING_LIMIT:
                break
        return items

    def _rising_tags(self, connection) -> tuple[str, list[dict]]:
        recent = _tag_people(connection, RISING_RECENT_DAYS, 0)
        baseline = _tag_people(
            connection, RISING_RECENT_DAYS + RISING_BASELINE_DAYS, RISING_RECENT_DAYS
        )
        weeks = RISING_BASELINE_DAYS / 7
        rising: list[dict] = []
        for tag_id, row in recent.items():
            if row["people"] < MIN_PEOPLE:
                continue
            base = baseline.get(tag_id, {}).get("people", 0) / weeks
            growth = (row["people"] + 1) / (base + 1)
            rising.append(_tag_entry(row, recent=row["people"], baseline=base, growth=growth))
        rising.sort(key=lambda entry: (-entry["growth"], -entry["recent"], entry["tag"]["token"]))
        if len(rising) >= MIN_RISING:
            return "week", rising[:RISING_LIMIT]

        overall = _tag_people(connection, None, 0)
        popular = [
            _tag_entry(row, recent=row["people"], baseline=0.0, growth=1.0)
            for row in overall.values()
            if row["people"] >= MIN_PEOPLE
        ]
        popular.sort(key=lambda entry: (-entry["people"], entry["tag"]["token"]))
        return "all_time", popular[:RISING_LIMIT]


def _now(connection) -> datetime:
    with connection.cursor() as cursor:
        cursor.execute("SELECT NOW() AS now")
        return cursor.fetchone()["now"]


def _since(days: int | None) -> tuple[str, tuple]:
    if days is None:
        return "", ()
    return " AND {column} >= NOW() - INTERVAL %s DAY", (days,)


def _signals(connection, days: int | None) -> list[dict]:
    window, params = _since(days)
    queries = {
        "tag": (
            "SELECT st.song_id, st.user_id, MAX(st.created_at) AS at FROM song_tags st "
            "JOIN users u ON u.id = st.user_id WHERE u.username <> %s"
            + window.format(column="st.created_at")
            + " GROUP BY st.song_id, st.user_id",
            (CATALOG_USERNAME, *params),
        ),
        "playlist": (
            "SELECT ps.song_id, p.user_id, MAX(ps.created_at) AS at FROM playlist_songs ps "
            "JOIN playlists p ON p.id = ps.playlist_id "
            "JOIN users u ON u.id = p.user_id WHERE u.username <> %s"
            + window.format(column="ps.created_at")
            + " GROUP BY ps.song_id, p.user_id",
            (CATALOG_USERNAME, *params),
        ),
        "like": (
            "SELECT us.song_id, us.user_id, MAX(us.created_at) AS at FROM user_songs us "
            "JOIN users u ON u.id = us.user_id WHERE us.action = 'like' AND u.username <> %s"
            + window.format(column="us.created_at")
            + " GROUP BY us.song_id, us.user_id",
            (CATALOG_USERNAME, *params),
        ),
    }
    signals: list[dict] = []
    with connection.cursor() as cursor:
        for kind, (sql, query_params) in queries.items():
            cursor.execute(sql, query_params)
            for row in cursor.fetchall():
                signals.append(
                    {
                        "kind": kind,
                        "song_id": int(row["song_id"]),
                        "user_id": int(row["user_id"]),
                        "at": row["at"],
                    }
                )
    return signals


def _rank(signals: list[dict], now: datetime, *, decay: bool) -> list[dict]:
    songs: dict[int, dict] = {}
    for signal in signals:
        entry = songs.setdefault(
            signal["song_id"],
            {"song_id": signal["song_id"], "score": 0.0, "users": set(), "tag": 0, "playlist": 0, "like": 0},
        )
        weight = SIGNAL_WEIGHTS[signal["kind"]]
        if decay:
            age_days = max(0.0, (now - signal["at"]).total_seconds() / 86400)
            weight *= math.exp(-age_days / DECAY_DAYS)
        entry["score"] += weight
        entry["users"].add(signal["user_id"])
        entry[signal["kind"]] += 1
    ranked = [
        {**entry, "people": len(entry["users"])}
        for entry in songs.values()
        if len(entry["users"]) >= MIN_PEOPLE
    ]
    for entry in ranked:
        del entry["users"]
    ranked.sort(key=lambda entry: (-entry["score"], -entry["people"], entry["song_id"]))
    return ranked


def _tag_people(connection, start_days: int | None, end_days: int) -> dict[int, dict]:
    clauses = ["u.username <> %s"]
    params: list = [CATALOG_USERNAME]
    if start_days is not None:
        clauses.append("st.created_at >= NOW() - INTERVAL %s DAY")
        params.append(start_days)
    if end_days > 0:
        clauses.append("st.created_at < NOW() - INTERVAL %s DAY")
        params.append(end_days)
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT t.id, t.kind, t.name, COUNT(DISTINCT st.user_id) AS people "
            "FROM song_tags st JOIN tags t ON t.id = st.tag_id JOIN users u ON u.id = st.user_id "
            f"WHERE {' AND '.join(clauses)} GROUP BY t.id, t.kind, t.name",
            tuple(params),
        )
        return {
            int(row["id"]): {"kind": row["kind"], "name": row["name"], "people": int(row["people"])}
            for row in cursor.fetchall()
        }


def _tag_entry(row: dict, *, recent: int, baseline: float, growth: float) -> dict:
    return {
        "tag": {"kind": row["kind"], "name": row["name"], "token": tag_token(row["name"])},
        "recent": recent,
        "baseline": round(baseline, 3),
        "growth": round(growth, 3),
        "people": row["people"],
    }


def _consensus(connection, song_ids: list[int]) -> dict[int, list[dict]]:
    placeholders = ", ".join(["%s"] * len(song_ids))
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT st.song_id, t.kind, t.name, COUNT(DISTINCT st.user_id) AS people "
            "FROM song_tags st JOIN tags t ON t.id = st.tag_id JOIN users u ON u.id = st.user_id "
            f"WHERE u.username <> %s AND t.kind <> 'artist' AND st.song_id IN ({placeholders}) "
            "GROUP BY st.song_id, t.id, t.kind, t.name",
            (CATALOG_USERNAME, *song_ids),
        )
        rows = cursor.fetchall()
    kind_order = {kind: index for index, kind in enumerate(KIND_ORDER)}
    grouped: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[int(row["song_id"])].append(
            {
                "kind": row["kind"],
                "name": row["name"],
                "token": tag_token(row["name"]),
                "people": int(row["people"]),
            }
        )
    return {
        song_id: sorted(
            tags, key=lambda tag: (-tag["people"], kind_order.get(tag["kind"], 9), tag["token"])
        )[:CONSENSUS_LIMIT]
        for song_id, tags in grouped.items()
    }
