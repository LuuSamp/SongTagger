"""Spotify playlist import request and response."""

from __future__ import annotations

from pydantic import BaseModel

from API.Models.schemas import Playlist


class SpotifyImportRequest(BaseModel):
    spotify_playlist_id: str


class SpotifySkippedTrack(BaseModel):
    spotify_id: str | None
    title: str
    artist_credit: str


class SpotifyImportResult(BaseModel):
    playlist: Playlist
    skipped: list[SpotifySkippedTrack]
