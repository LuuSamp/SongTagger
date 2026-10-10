"""List the Spotify playlists on a connected account."""

from __future__ import annotations

from fastapi import APIRouter

from API.Models.spotify_playlists import SpotifyPlaylistList
from API.Services.spotify_playlists import SpotifyPlaylists


def build_router(reader: SpotifyPlaylists) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/user/{user_id}/spotify/playlists",
        response_model=SpotifyPlaylistList,
    )
    def list_playlists(user_id: int) -> dict:
        return reader.list_playlists(user_id)

    return router
