"""Update a playlist that is already linked to Spotify."""

from __future__ import annotations

from fastapi import APIRouter

from API.Models.spotify_export import SpotifyExportResult
from API.Models.spotify_import import SpotifyImportResult
from API.Models.spotify_sync import SpotifySyncRequest
from API.Services.spotify_sync import SpotifySync


def build_router(syncer: SpotifySync) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/user/{user_id}/playlist/{playlist_id}/sync",
        status_code=200,
        response_model=SpotifyImportResult | SpotifyExportResult,
    )
    def sync_playlist(user_id: int, playlist_id: int, body: SpotifySyncRequest) -> dict:
        return syncer.run(user_id, playlist_id, body.direction)

    return router
