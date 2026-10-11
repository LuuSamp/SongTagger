"""Content recommender: cosine between user and song tag profiles, blended with popularity."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from API.Recommender.config import RecommenderConfig
from API.Recommender.data import Snapshot
from API.Recommender.matrices import Matrices, build, row_normalize

REASONS = 2


@dataclass(frozen=True)
class Recommendation:
    song_id: int
    score: float
    reasons: tuple[int, ...]


class Recommender:
    def __init__(self, snapshot: Snapshot, config: RecommenderConfig | None = None) -> None:
        self.config = config if config is not None else RecommenderConfig()
        self.artists = snapshot.artists
        self.matrices: Matrices = build(snapshot, self.config)
        self.songs = {song_id: index for index, song_id in enumerate(self.matrices.song_ids)}
        self.users = {user_id: index for index, user_id in enumerate(self.matrices.user_ids)}
        self.profiles = row_normalize(self.matrices.B, "l2")

    def scores(self, user_id: int) -> np.ndarray | None:
        index = self.users.get(user_id)
        if index is None or not self.profiles[index].any():
            return None
        content = self.matrices.A @ self.profiles[index]
        top = content.max()
        if top > 0:
            content = content / top
        blend = self.config.popularity_blend
        return (1 - blend) * content + blend * self.matrices.popularity

    def recommend(
        self, user_id: int, limit: int, exclude: set[int] | None = None
    ) -> list[Recommendation]:
        scores = self.scores(user_id)
        if scores is None:
            return []
        known = self.matrices.known.get(user_id, set()) if exclude is None else exclude
        profile = self.profiles[self.users[user_id]]
        per_artist: dict[str, int] = {}
        picks: list[Recommendation] = []
        for index in np.argsort(-scores, kind="stable"):
            song_id = self.matrices.song_ids[int(index)]
            if song_id in known or scores[index] <= 0:
                continue
            artist = self.artists.get(song_id, "")
            if artist and per_artist.get(artist, 0) >= self.config.per_artist:
                continue
            per_artist[artist] = per_artist.get(artist, 0) + 1
            picks.append(Recommendation(song_id, float(scores[index]), self._reasons(int(index), profile)))
            if len(picks) >= limit:
                break
        return picks

    def _reasons(self, song: int, profile: np.ndarray) -> tuple[int, ...]:
        contribution = self.matrices.A[song] * profile
        order = np.argsort(-contribution, kind="stable")[:REASONS]
        return tuple(self.matrices.tag_ids[int(i)] for i in order if contribution[i] > 0)
