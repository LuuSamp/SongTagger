"""Recommender settings chosen by the offline evaluation in RESULTS.md."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RecommenderConfig:
    explicit_share: float = 0.6
    action_weights: dict[str, float] = field(
        default_factory=lambda: {"like": 3.0, "playlist": 2.0, "tag": 1.5, "listen": 1.0}
    )
    decay_days: float | None = 90.0
    popularity_blend: float = 0.2
    per_artist: int = 2
