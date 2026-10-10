"""Spotify playlist export response."""

from __future__ import annotations

from pydantic import BaseModel


class SpotifySkippedSong(BaseModel):
    song_id: int
    title: str
    artist_credit: str


class SpotifyExportResult(BaseModel):
    spotify_playlist_id: str
    url: str
    skipped: list[SpotifySkippedSong]
