"""Song and tag documents returned by the catalog API."""

from __future__ import annotations

from datetime import datetime

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


class PlaylistSummary(BaseModel):
    id: int
    name: str
    created_at: datetime
    spotify_playlist_id: str | None
    image_url: str | None


class Playlist(PlaylistSummary):
    songs: list[PlaylistSong]


class PlaylistList(BaseModel):
    playlists: list[PlaylistSummary]


class PlaylistWrite(BaseModel):
    name: str


class PlaylistSongWrite(BaseModel):
    song_id: int
    position: int | None = None


class PlaylistOrder(BaseModel):
    membership_ids: list[int]


class FavoriteSong(BaseModel):
    song_id: int
    title: str
    artist_credit: str
    favorited_at: datetime


class FavoriteList(BaseModel):
    songs: list[FavoriteSong]
