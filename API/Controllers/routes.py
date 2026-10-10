"""Song and tag routes. HTTP only; catalog rules live in services."""

from __future__ import annotations

from fastapi import APIRouter, Response

from db.manager import CATALOG_USERNAME

from API.Models import SongSearch, TagWrite, UserSong, UserSongList, UserTag
from API.Services.errors import BadRequest
from API.Services.search import SearchService
from API.Services.songs import SongService
from API.Services.tags import TagService


def build_router(search: SearchService, songs: SongService, tags: TagService) -> APIRouter:
    router = APIRouter()

    @router.get("/songs", response_model=SongSearch)
    def list_songs(title: str | None = None, artist: str | None = None) -> dict:
        if title is None or not title.strip():
            raise BadRequest("title is required")
        cleaned_artist = artist.strip() if artist and artist.strip() else None
        return search.search(title.strip(), cleaned_artist)

    @router.get("/users/{username}/songs", response_model=UserSongList)
    def search_tags(username: str, q: str | None = None) -> dict:
        _reject_catalog(username)
        if q is None or not q.strip():
            raise BadRequest("q is required")
        return tags.search(username, q)

    @router.get("/users/{username}/songs/{song_id}", response_model=UserSong)
    def get_song(username: str, song_id: int) -> dict:
        _reject_catalog(username)
        return songs.get(username, song_id)

    @router.put("/users/{username}/songs/{song_id}/tags", response_model=UserTag)
    def attach_tag(username: str, song_id: int, body: TagWrite) -> dict:
        _reject_catalog(username)
        return tags.attach(username, song_id, body.kind, body.token)

    @router.delete("/users/{username}/songs/{song_id}/tags", status_code=204, response_model=None)
    def remove_tag(username: str, song_id: int, body: TagWrite) -> Response:
        _reject_catalog(username)
        tags.remove(username, song_id, body.kind, body.token)
        return Response(status_code=204)

    return router


def _reject_catalog(username: str) -> None:
    if username == CATALOG_USERNAME:
        raise BadRequest("username catalog is not allowed")
