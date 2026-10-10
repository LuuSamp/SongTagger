"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from API.Adapters.musicbrainz import MusicBrainzAdapter, RecordingSource
from API.Controllers.routes import build_router
from API.Services.errors import APIError
from API.Services.search import SearchService
from API.Services.songs import SongService
from API.Services.tags import TagService

_SKIPPED_LOC = {"body", "path", "query"}


def create_app(source: RecordingSource | None = None) -> FastAPI:
    recording_source = source if source is not None else MusicBrainzAdapter()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        closer = getattr(app.state.source, "close", None)
        if callable(closer):
            closer()

    app = FastAPI(lifespan=lifespan)
    app.state.source = recording_source
    songs = SongService()
    app.include_router(build_router(SearchService(recording_source, songs), songs, TagService(songs)))
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
