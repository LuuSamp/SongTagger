"""Song and tag documents returned by the catalog API."""

from __future__ import annotations

from pydantic import BaseModel


class Source(BaseModel):
    name: str
    external_id: str
    url: str


class Tag(BaseModel):
    kind: str
    name: str
    token: str


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
    sources: list[Source]
    tags: list[UserTag]


class SongSearch(BaseModel):
    songs: list[Song]
    imported: bool


class SongList(BaseModel):
    songs: list[Song]


class UserSongList(BaseModel):
    songs: list[UserSong]


class TagWrite(BaseModel):
    kind: str
    token: str
