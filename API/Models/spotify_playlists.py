"""Spotify playlist list response. The image object can be reused by a later endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class SpotifyImage(BaseModel):
    url: str
    height: int | None
    width: int | None


class SpotifyPlaylistItem(BaseModel):
    spotify_playlist_id: str
    name: str
    images: list[SpotifyImage]


class SpotifyPlaylistList(BaseModel):
    playlists: list[SpotifyPlaylistItem]
