"""Spotify PKCE start and callback. Tokens stay out of the response."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from API.Services.spotify_auth import SpotifyAuth


def build_router(auth: SpotifyAuth) -> APIRouter:
    router = APIRouter()

    @router.get("/user/{user_id}/spotify/start")
    def start(user_id: int) -> RedirectResponse:
        return RedirectResponse(auth.start(user_id), status_code=302)

    @router.get("/auth/spotify/callback")
    def callback(
        code: str | None = None,
        state: str | None = None,
        error: str | None = None,
    ) -> dict:
        return auth.callback(code=code, state=state, error=error)

    return router
