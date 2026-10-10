"""Spotify PKCE start and callback. Tokens stay out of the response."""

from __future__ import annotations

import os
from urllib.parse import urlencode, urlsplit, urlunsplit

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from API.Services.errors import APIError
from API.Services.spotify_auth import SpotifyAuth


def build_router(auth: SpotifyAuth) -> APIRouter:
    router = APIRouter()

    @router.get("/user/{user_id}/spotify/start")
    def start(user_id: int) -> RedirectResponse:
        return RedirectResponse(auth.start(user_id), status_code=302)

    @router.get("/auth/spotify/callback", response_model=None)
    def callback(
        code: str | None = None,
        state: str | None = None,
        error: str | None = None,
    ) -> dict | RedirectResponse:
        ui_redirect = os.environ.get("SPOTIFY_UI_REDIRECT", "").strip()
        if not ui_redirect:
            return auth.callback(code=code, state=state, error=error)
        try:
            auth.callback(code=code, state=state, error=error)
        except APIError:
            return RedirectResponse(_with_status(ui_redirect, "error"), status_code=302)
        return RedirectResponse(_with_status(ui_redirect, "connected"), status_code=302)

    return router


def _with_status(url: str, status: str) -> str:
    parts = urlsplit(url)
    query = f"{parts.query}&" if parts.query else ""
    return urlunsplit(parts._replace(query=query + urlencode({"spotify": status})))
