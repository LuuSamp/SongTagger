"""Song and tag documents returned by the catalog API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class Source(BaseModel):
    name: str
    external_id: str
    url: str


class Tag(BaseModel):
    kind: str
    name: str
    token: str


class CountedTag(Tag):
    count: int


class UserTag(Tag):
    applied_by_me: bool


class Song(BaseModel):
    id: int
    title: str
    artist_credit: str
    duration_ms: int | None
    mbid: str | None
    isrc: str | None
    disambiguation: str | None
    image_url: str | None
    sources: list[Source]
    tags: list[Tag]


class UserSong(BaseModel):
    id: int
    title: str
    artist_credit: str
    duration_ms: int | None
    mbid: str | None
    isrc: str | None
    disambiguation: str | None
    image_url: str | None
    sources: list[Source]
    tags: list[UserTag]


class SongSearch(BaseModel):
    songs: list[Song]
    imported: bool


class SongList(BaseModel):
    songs: list[Song]


class UserSongList(BaseModel):
    songs: list[UserSong]


class User(BaseModel):
    id: int
    username: str


class TagWrite(BaseModel):
    kind: str
    token: str


class PlaylistSong(BaseModel):
    membership_id: int
    position: int
    song_id: int
    title: str
    artist_credit: str
    image_url: str | None
    tags: list[CountedTag]


class PlaylistSummary(BaseModel):
    id: int
    name: str
    created_at: datetime
    spotify_playlist_id: str | None
    image_url: str | None


class Playlist(PlaylistSummary):
    songs: list[PlaylistSong]
    tags: list[CountedTag]


class PlaylistList(BaseModel):
    playlists: list[PlaylistSummary]


class PlaylistWrite(BaseModel):
    name: str


class PlaylistSongWrite(BaseModel):
    song_id: int
    position: int | None = None


class PlaylistOrder(BaseModel):
    membership_ids: list[int]


class ConsensusTag(Tag):
    people: int


class TrendingSong(BaseModel):
    song: UserSong
    score: float
    people: int
    playlist_adds: int
    taggers: int
    likes: int
    consensus: list[ConsensusTag]


class RisingTag(BaseModel):
    tag: Tag
    recent: int
    baseline: float
    growth: float
    people: int


class CommunityFeed(BaseModel):
    trending_window: Literal["week", "all_time"]
    trending: list[TrendingSong]
    tags_window: Literal["week", "all_time"]
    rising_tags: list[RisingTag]


class ShowcaseSong(BaseModel):
    id: int
    title: str
    artist_credit: str
    image_url: str | None
    tags: list[Tag]


class Showcase(BaseModel):
    songs: list[ShowcaseSong]


class FavoriteSong(BaseModel):
    song_id: int
    title: str
    artist_credit: str
    favorited_at: datetime


class FavoriteList(BaseModel):
    songs: list[FavoriteSong]


class RecommendedSong(BaseModel):
    song: UserSong
    score: float
    because: list[Tag]


class Recommendations(BaseModel):
    songs: list[RecommendedSong]
