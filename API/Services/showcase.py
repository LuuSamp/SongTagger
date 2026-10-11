"""Landing showcase: a few varied catalog songs, each with its most representative tags."""

from __future__ import annotations

import math
import random
from collections import defaultdict

from db.manager import open_database
from db.seed import fold

from API.Services.songs import KIND_ORDER, SongService, tag_token

DEFAULT_LIMIT = 3
MAX_LIMIT = 6
POOL = 24
MIN_TAGS = 2
TAGS_PER_SONG = 3
COUNT_WEIGHT = 0.25


class ShowcaseService:
    def __init__(self, songs: SongService, rng: random.Random | None = None) -> None:
        self.songs = songs
        self.rng = rng if rng is not None else random.Random()

    def pick(self, limit: int = DEFAULT_LIMIT) -> dict:
        connection = open_database()
        try:
            candidates = _candidates(connection)
            if not candidates:
                return {"songs": []}
            ids = [entry["song_id"] for entry in candidates]
            documents = {
                document["id"]: document
                for document in self.songs.documents(connection, ids, username=None)
            }
        finally:
            connection.close()
        for entry in candidates:
            document = documents.get(entry["song_id"])
            entry["artist"] = fold(document["artist_credit"]) if document else ""
        chosen = _choose(_shuffle(candidates, self.rng), limit)
        songs: list[dict] = []
        for entry in chosen:
            document = documents.get(entry["song_id"])
            if document is None:
                continue
            songs.append(
                {
                    "id": document["id"],
                    "title": document["title"],
                    "artist_credit": document["artist_credit"],
                    "image_url": document["image_url"],
                    "tags": entry["tags"],
                }
            )
        return {"songs": songs}


def _candidates(connection) -> list[dict]:
    """Best-tagged songs, each with its display tags. Catalog tags count, so a seed-only DB works."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT st.song_id, t.id, t.kind, t.name, COUNT(DISTINCT st.user_id) AS people "
            "FROM song_tags st JOIN tags t ON t.id = st.tag_id "
            "WHERE t.kind <> 'artist' GROUP BY st.song_id, t.id, t.kind, t.name"
        )
        rows = cursor.fetchall()
        cursor.execute(
            "SELECT st.song_id, COUNT(DISTINCT st.user_id) AS taggers "
            "FROM song_tags st JOIN tags t ON t.id = st.tag_id "
            "WHERE t.kind <> 'artist' GROUP BY st.song_id"
        )
        taggers = {int(row["song_id"]): int(row["taggers"]) for row in cursor.fetchall()}

    songs_with: dict[int, set[int]] = defaultdict(set)
    grouped: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        songs_with[int(row["id"])].add(int(row["song_id"]))
        grouped[int(row["song_id"])].append(
            {"id": int(row["id"]), "kind": row["kind"], "name": row["name"], "people": int(row["people"])}
        )

    kind_order = {kind: index for index, kind in enumerate(KIND_ORDER)}
    candidates: list[dict] = []
    for song_id, tags in grouped.items():
        if len(tags) < MIN_TAGS:
            continue
        cohesion = {tag["id"]: _cohesion(tag["id"], tags, song_id, songs_with) for tag in tags}
        ranked = sorted(
            tags,
            key=lambda tag: (
                -tag["people"],
                -cohesion[tag["id"]],
                -len(songs_with[tag["id"]]),
                kind_order.get(tag["kind"], len(KIND_ORDER)),
                tag_token(tag["name"]),
            ),
        )
        candidates.append(
            {
                "song_id": song_id,
                "score": taggers.get(song_id, 0) + COUNT_WEIGHT * len(tags),
                "tags": _display_tags(ranked, kind_order),
            }
        )
    candidates.sort(key=lambda entry: (-entry["score"], entry["song_id"]))
    return candidates[:POOL]


def _cohesion(tag_id: int, tags: list[dict], song_id: int, songs_with: dict[int, set[int]]) -> float:
    """How strongly this tag goes with the song's other tags elsewhere (cosine, so broad tags don't always win)."""
    elsewhere = songs_with[tag_id] - {song_id}
    total = 0.0
    for other in tags:
        if other["id"] == tag_id:
            continue
        others = songs_with[other["id"]] - {song_id}
        if elsewhere and others:
            total += len(elsewhere & others) / math.sqrt(len(elsewhere) * len(others))
    return total


def _display_tags(ranked: list[dict], kind_order: dict[str, int]) -> list[dict]:
    """Best tag of each kind first, then the next best overall, skipping near-duplicates like rock / pop rock."""
    picked: list[dict] = []
    seen_kinds: set[str] = set()
    for tag in ranked:
        if tag["kind"] not in seen_kinds:
            seen_kinds.add(tag["kind"])
            picked.append(tag)
    picked = picked[:TAGS_PER_SONG]
    for allow_overlap in (False, True):
        for tag in ranked:
            if len(picked) >= TAGS_PER_SONG or (allow_overlap and len(picked) >= MIN_TAGS):
                break
            if tag in picked or (not allow_overlap and _shares_word(tag, picked)):
                continue
            picked.append(tag)
    picked.sort(key=lambda tag: (kind_order.get(tag["kind"], len(KIND_ORDER)), ranked.index(tag)))
    return [
        {"kind": tag["kind"], "name": tag["name"], "token": tag_token(tag["name"])} for tag in picked
    ]


def _shares_word(tag: dict, picked: list[dict]) -> bool:
    words = set(tag_token(tag["name"]).split("-"))
    return any(words & set(tag_token(other["name"]).split("-")) for other in picked)


def _shuffle(candidates: list[dict], rng: random.Random) -> list[dict]:
    """Weighted random order: better-tagged songs tend to come first, but any can."""
    keyed = [(rng.random() ** (1.0 / max(entry["score"], 0.01)), entry) for entry in candidates]
    keyed.sort(key=lambda pair: -pair[0])
    return [entry for _, entry in keyed]


def _choose(ordered: list[dict], limit: int) -> list[dict]:
    """Greedy pick for variety; relax tag overlap, then artist, if the catalog is too small."""
    chosen: list[dict] = []
    for distinct_tags, distinct_artist in ((True, True), (False, True), (False, False)):
        for entry in ordered:
            if len(chosen) >= limit:
                return chosen
            if entry in chosen:
                continue
            if distinct_artist and any(entry["artist"] == other["artist"] for other in chosen):
                continue
            if distinct_tags and _overlaps(entry, chosen):
                continue
            chosen.append(entry)
    return chosen


def _overlaps(entry: dict, chosen: list[dict]) -> bool:
    tokens = {tag["token"] for tag in entry["tags"]}
    lead = _lead(entry)
    return any(lead == _lead(other) or tokens & {tag["token"] for tag in other["tags"]} for other in chosen)


def _lead(entry: dict) -> str:
    genres = [tag["token"] for tag in entry["tags"] if tag["kind"] == "genre"]
    return genres[0] if genres else entry["tags"][0]["token"]
