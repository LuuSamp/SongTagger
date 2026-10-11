"""Song x tag (A) and user x tag (B) profiles plus per-song popularity."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from API.Recommender.config import RecommenderConfig
from API.Recommender.data import Snapshot


@dataclass
class Matrices:
    song_ids: list[int]
    tag_ids: list[int]
    user_ids: list[int]
    A: np.ndarray
    B: np.ndarray
    popularity: np.ndarray
    known: dict[int, set[int]]


def build(snapshot: Snapshot, config: RecommenderConfig) -> Matrices:
    song_ids = list(snapshot.song_ids)
    tag_ids = sorted(snapshot.tags)
    user_ids = list(snapshot.users())
    songs = {song_id: index for index, song_id in enumerate(song_ids)}
    tags = {tag_id: index for index, tag_id in enumerate(tag_ids)}
    users = {user_id: index for index, user_id in enumerate(user_ids)}

    tagged = np.zeros((len(song_ids), len(tag_ids)))
    explicit = np.zeros((len(user_ids), len(tag_ids)))
    for row in snapshot.applications:
        if row.song_id not in songs or row.tag_id not in tags:
            continue
        tagged[songs[row.song_id], tags[row.tag_id]] = 1.0
        if not row.catalog and row.user_id in users:
            explicit[users[row.user_id], tags[row.tag_id]] += 1.0

    df = tagged.sum(axis=0)
    idf = np.log1p(len(song_ids) / np.maximum(df, 1.0))
    A = row_normalize(tagged * idf, "l2")

    weights = np.zeros((len(user_ids), len(song_ids)))
    known: dict[int, set[int]] = {user_id: set() for user_id in user_ids}
    for row in snapshot.interactions:
        if row.user_id not in users or row.song_id not in songs:
            continue
        decay = 1.0 if config.decay_days is None else math.exp(-row.age_days / config.decay_days)
        weight = config.action_weights.get(row.kind, 0.0) * decay
        user, song = users[row.user_id], songs[row.song_id]
        weights[user, song] = max(weights[user, song], weight)
        known[row.user_id].add(row.song_id)

    implicit = row_normalize(weights @ A, "max")
    declared = row_normalize(np.log1p(explicit), "max")
    B = config.explicit_share * declared + (1.0 - config.explicit_share) * implicit

    people = (weights > 0).sum(axis=0).astype(float)
    popularity = people / people.max() if people.max() > 0 else people
    return Matrices(song_ids, tag_ids, user_ids, A, B, popularity, known)


def row_normalize(matrix: np.ndarray, norm: str) -> np.ndarray:
    if norm == "l2":
        scale = np.linalg.norm(matrix, axis=1, keepdims=True)
    else:
        scale = matrix.max(axis=1, keepdims=True)
    return np.divide(matrix, scale, out=np.zeros_like(matrix), where=scale > 0)
