"""Plain input rows for the recommender, independent of the database."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TagInfo:
    kind: str
    name: str
    token: str


@dataclass(frozen=True)
class TagApplication:
    song_id: int
    tag_id: int
    user_id: int
    catalog: bool


@dataclass(frozen=True)
class Interaction:
    user_id: int
    song_id: int
    kind: str
    age_days: float


@dataclass(frozen=True)
class Snapshot:
    song_ids: tuple[int, ...]
    artists: dict[int, str]
    tags: dict[int, TagInfo]
    applications: tuple[TagApplication, ...]
    interactions: tuple[Interaction, ...]
    user_ids: tuple[int, ...] = field(default=())

    def users(self) -> tuple[int, ...]:
        if self.user_ids:
            return self.user_ids
        seen = {row.user_id for row in self.interactions}
        seen.update(row.user_id for row in self.applications if not row.catalog)
        return tuple(sorted(seen))
