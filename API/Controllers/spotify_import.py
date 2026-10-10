"""Import a Spotify playlist into a new local playlist, or replace the linked one."""

from __future__ import annotations

from fastapi import APIRouter, Response

from API.Models.spotify_import import SpotifyImportRequest, SpotifyImportResult
from API.Services.spotify_import import SpotifyImport


def build_router(importer: SpotifyImport) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/user/{user_id}/playlist/spotify",
        status_code=201,
        response_model=SpotifyImportResult,
    )
    def import_playlist(user_id: int, body: SpotifyImportRequest, response: Response) -> dict:
        result, status_code = importer.import_playlist(user_id, body.spotify_playlist_id)
        response.status_code = status_code
        return result

    return router
