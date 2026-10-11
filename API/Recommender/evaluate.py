"""Offline evaluation: leave-one-out ranking metrics on real or synthetic snapshots."""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

import numpy as np

from API.Recommender.config import RecommenderConfig
from API.Recommender.data import Interaction, Snapshot, TagApplication, TagInfo
from API.Recommender.model import Recommender

CUTOFF = 10
SYNTHETIC_FEELINGS = 12
SYNTHETIC_TAG_BASE = 10_000_000
SYNTHETIC_USER_BASE = 20_000_000


@dataclass(frozen=True)
class Metrics:
    hit: float
    ndcg: float
    mrr: float
    coverage: float
    diversity: float
    cases: int


def positives(snapshot: Snapshot) -> dict[int, set[int]]:
    found: dict[int, set[int]] = {}
    for row in snapshot.interactions:
        found.setdefault(row.user_id, set()).add(row.song_id)
    return found


def holdout(snapshot: Snapshot, rng: np.random.Generator) -> tuple[Snapshot, dict[int, int]]:
    hidden: dict[int, int] = {}
    for user_id, songs in sorted(positives(snapshot).items()):
        if len(songs) >= 2:
            hidden[user_id] = int(rng.choice(sorted(songs)))
    interactions = tuple(
        row for row in snapshot.interactions if hidden.get(row.user_id) != row.song_id
    )
    applications = tuple(
        row
        for row in snapshot.applications
        if row.catalog or hidden.get(row.user_id) != row.song_id
    )
    return replace(snapshot, interactions=interactions, applications=applications), hidden


def evaluate(snapshot: Snapshot, config: RecommenderConfig, rounds: int, seed: int = 0) -> Metrics:
    hits: list[float] = []
    gains: list[float] = []
    reciprocal: list[float] = []
    lists: list[list[int]] = []
    for round_index in range(rounds):
        rng = np.random.default_rng(seed * 7919 + round_index)
        train, hidden = holdout(snapshot, rng)
        model = Recommender(train, config)
        for user_id, song_id in hidden.items():
            ranked = [item.song_id for item in model.recommend(user_id, CUTOFF)]
            lists.append([model.songs[item] for item in ranked])
            rank = ranked.index(song_id) + 1 if song_id in ranked else None
            hits.append(1.0 if rank else 0.0)
            gains.append(1.0 / math.log2(rank + 1) if rank else 0.0)
            reciprocal.append(1.0 / rank if rank else 0.0)
    return Metrics(
        hit=float(np.mean(hits)) if hits else 0.0,
        ndcg=float(np.mean(gains)) if gains else 0.0,
        mrr=float(np.mean(reciprocal)) if reciprocal else 0.0,
        coverage=_coverage(lists, len(snapshot.song_ids)),
        diversity=_diversity(lists, snapshot),
        cases=len(hits),
    )


def _coverage(lists: list[list[int]], total: int) -> float:
    seen = {song for items in lists for song in items}
    return len(seen) / total if total else 0.0


def _diversity(lists: list[list[int]], snapshot: Snapshot) -> float:
    tags = sorted(snapshot.tags)
    columns = {tag_id: index for index, tag_id in enumerate(tags)}
    songs = {song_id: index for index, song_id in enumerate(snapshot.song_ids)}
    presence = np.zeros((len(songs), len(tags)))
    for row in snapshot.applications:
        if row.song_id in songs and row.tag_id in columns:
            presence[songs[row.song_id], columns[row.tag_id]] = 1.0
    norms = np.linalg.norm(presence, axis=1, keepdims=True)
    unit = np.divide(presence, norms, out=np.zeros_like(presence), where=norms > 0)
    values: list[float] = []
    for items in lists:
        if len(items) < 2:
            continue
        similarity = unit[items] @ unit[items].T
        upper = similarity[np.triu_indices(len(items), 1)]
        values.append(1.0 - float(upper.mean()))
    return float(np.mean(values)) if values else 0.0


def synthetic(base: Snapshot, seed: int, users: int = 60) -> Snapshot:
    rng = np.random.default_rng(seed)
    catalog = [row for row in base.applications if row.catalog]
    genres = sorted({row.tag_id for row in catalog if base.tags[row.tag_id].kind == "genre"})
    songs = list(base.song_ids)
    song_index = {song_id: index for index, song_id in enumerate(songs)}
    genre_index = {tag_id: index for index, tag_id in enumerate(genres)}
    presence = np.zeros((len(songs), len(genres)))
    for row in catalog:
        if row.tag_id in genre_index and row.song_id in song_index:
            presence[song_index[row.song_id], genre_index[row.tag_id]] = 1.0
    df = presence.sum(axis=0)
    co = presence.T @ presence
    neighbourhood = co / np.maximum(co.diagonal()[:, None], 1.0)
    anchors = np.flatnonzero(df >= 3)
    feeling_of = rng.integers(0, SYNTHETIC_FEELINGS, size=len(genres))
    tags = dict(base.tags)
    for feeling in range(SYNTHETIC_FEELINGS):
        tags[SYNTHETIC_TAG_BASE + feeling] = TagInfo("feeling", f"mood {feeling}", f"mood-{feeling}")

    applications = list(catalog)
    interactions: list[Interaction] = []
    for offset in range(users):
        user_id = SYNTHETIC_USER_BASE + offset
        chosen = rng.choice(anchors, size=min(2, len(anchors)), replace=False, p=df[anchors] / df[anchors].sum())
        preference = neighbourhood[chosen].sum(axis=0)
        sizes = np.maximum(presence.sum(axis=1), 1.0)
        affinity = presence @ preference / np.sqrt(sizes) + rng.gumbel(0.0, 0.35, len(songs))
        count = 3 if offset % 5 == 0 else int(rng.integers(6, 15))
        picked = np.argsort(-affinity)[:count]
        liked_feelings = {int(feeling_of[g]) for g in chosen}
        for position, song in enumerate(picked):
            song_id = songs[int(song)]
            age = float(rng.uniform(0.0, 180.0))
            roll = rng.random()
            kind = "like" if roll < 0.25 else "playlist"
            interactions.append(Interaction(user_id, song_id, kind, age))
            if rng.random() < 0.5 or position == 0:
                song_genres = np.flatnonzero(presence[song])
                options = [int(feeling_of[g]) for g in song_genres] or sorted(liked_feelings)
                feeling = int(rng.choice(options))
                applications.append(TagApplication(song_id, SYNTHETIC_TAG_BASE + feeling, user_id, False))
                interactions.append(Interaction(user_id, song_id, "tag", age))
    return Snapshot(
        song_ids=base.song_ids,
        artists=base.artists,
        tags=tags,
        applications=tuple(applications),
        interactions=tuple(interactions),
    )
