"""Export a local playlist to a new Spotify playlist, or replace the linked one."""

from __future__ import annotations

from fastapi import APIRouter, Response

from API.Models.spotify_export import SpotifyExportResult
from API.Services.spotify_export import SpotifyExport


def build_router(exporter: SpotifyExport) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/user/{user_id}/playlist/{playlist_id}/spotify",
        status_code=201,
        response_model=SpotifyExportResult,
    )
    def export_playlist(user_id: int, playlist_id: int, response: Response) -> dict:
        result, status_code = exporter.export_playlist(user_id, playlist_id)
        response.status_code = status_code
        return result

    return router
