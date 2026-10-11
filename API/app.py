"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from API.Adapters.musicbrainz import MusicBrainzAdapter, RecordingSource
from API.Adapters.spotify_library import HttpxSpotifyLibrary, SpotifyLibrary
from API.Adapters.spotify_publish import HttpxSpotifyPublisher, SpotifyPublisher
from API.Adapters.spotify_tokens import HttpxSpotifyTokenClient, SpotifyTokenClient
from API.Controllers.routes import build_router
from API.Controllers.spotify_auth import build_router as build_spotify_router
from API.Controllers.spotify_export import build_router as build_spotify_export_router
from API.Controllers.spotify_import import build_router as build_spotify_import_router
from API.Controllers.spotify_playlists import build_router as build_spotify_playlists_router
from API.Controllers.spotify_sync import build_router as build_spotify_sync_router
from API.Services.errors import APIError
from API.Services.favorites import FavoriteService
from API.Services.playlists import PlaylistService
from API.Services.search import SearchService
from API.Services.songs import SongService
from API.Services.spotify_auth import SpotifyAuth
from API.Services.spotify_export import SpotifyExport
from API.Services.spotify_import import SpotifyImport
from API.Services.spotify_playlists import SpotifyPlaylists
from API.Services.spotify_sync import SpotifySync
from API.Services.tags import TagService

_SKIPPED_LOC = {"body", "path", "query"}


def create_app(
    source: RecordingSource | None = None,
    token_client: SpotifyTokenClient | None = None,
    library: SpotifyLibrary | None = None,
    publisher: SpotifyPublisher | None = None,
) -> FastAPI:
    recording_source = source if source is not None else MusicBrainzAdapter()
    tokens = token_client if token_client is not None else HttpxSpotifyTokenClient()
    spotify_auth = SpotifyAuth(tokens)
    spotify_library = library if library is not None else HttpxSpotifyLibrary()
    spotify_publisher = publisher if publisher is not None else HttpxSpotifyPublisher()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        closer = getattr(app.state.source, "close", None)
        if callable(closer):
            closer()
        token_closer = getattr(app.state.spotify_auth.token_client, "close", None)
        if callable(token_closer):
            token_closer()
        library_closer = getattr(app.state.spotify_library, "close", None)
        if callable(library_closer):
            library_closer()
        publisher_closer = getattr(app.state.spotify_publisher, "close", None)
        if callable(publisher_closer):
            publisher_closer()

    app = FastAPI(lifespan=lifespan)
    app.state.source = recording_source
    app.state.spotify_auth = spotify_auth
    app.state.spotify_library = spotify_library
    app.state.spotify_publisher = spotify_publisher
    songs = SongService()
    playlists = PlaylistService(songs)
    app.include_router(
        build_router(
            SearchService(recording_source, songs),
            songs,
            TagService(songs),
            playlists,
            FavoriteService(songs),
        )
    )
    app.include_router(build_spotify_router(spotify_auth))
    spotify_import = SpotifyImport(spotify_auth, spotify_library, recording_source)
    spotify_export = SpotifyExport(spotify_auth, spotify_publisher, playlists)
    app.include_router(build_spotify_import_router(spotify_import))
    app.include_router(build_spotify_playlists_router(SpotifyPlaylists(spotify_auth, spotify_library)))
    app.include_router(build_spotify_export_router(spotify_export))
    app.include_router(build_spotify_sync_router(SpotifySync(spotify_import, spotify_export, playlists)))
    app.add_exception_handler(APIError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    return app


async def _api_error(_request: Request, exc: Exception) -> JSONResponse:
    error = exc if isinstance(exc, APIError) else APIError(500, "request failed")
    return JSONResponse(status_code=error.status_code, content={"detail": error.detail})


async def _validation_error(_request: Request, exc: Exception) -> JSONResponse:
    parts: list[str] = []
    errors = exc.errors() if isinstance(exc, RequestValidationError) else []
    for error in errors:
        location = [str(item) for item in error.get("loc", ()) if str(item) not in _SKIPPED_LOC]
        message = str(error.get("msg", "Invalid request"))
        parts.append(f"{'.'.join(location)}: {message}" if location else message)
    detail = "; ".join(parts) or "Invalid request"
    return JSONResponse(status_code=422, content={"detail": detail})
