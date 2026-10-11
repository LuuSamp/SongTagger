"""Song, tag, playlist, favorite, community, recommendation, and showcase routes. HTTP only; catalog rules live in services."""

from __future__ import annotations

from fastapi import APIRouter, Query, Response

from db.manager import CATALOG_USERNAME

from API.Models import (
    CommunityFeed,
    FavoriteList,
    FavoriteSong,
    Playlist,
    PlaylistList,
    PlaylistOrder,
    PlaylistSongWrite,
    PlaylistWrite,
    Recommendations,
    Showcase,
    SongSearch,
    TagWrite,
    User,
    UserSong,
    UserSongList,
    UserTag,
)
from API.Services.community import CommunityService
from API.Services.errors import BadRequest
from API.Services.favorites import FavoriteService
from API.Services.playlists import PlaylistService
from API.Services.recommendations import DEFAULT_LIMIT, MAX_LIMIT, RecommendationService
from API.Services.search import SearchService
from API.Services.showcase import DEFAULT_LIMIT as SHOWCASE_LIMIT
from API.Services.showcase import MAX_LIMIT as SHOWCASE_MAX
from API.Services.showcase import ShowcaseService
from API.Services.songs import SongService
from API.Services.tags import TagService


def build_router(
    search: SearchService,
    songs: SongService,
    tags: TagService,
    playlists: PlaylistService,
    community: CommunityService,
    favorites: FavoriteService,
    recommendations: RecommendationService,
    showcase: ShowcaseService,
) -> APIRouter:
    router = APIRouter()

    @router.get("/songs", response_model=SongSearch)
    def list_songs(title: str | None = None, artist: str | None = None) -> dict:
        if title is None or not title.strip():
            raise BadRequest("title is required")
        cleaned_artist = artist.strip() if artist and artist.strip() else None
        return search.search(title.strip(), cleaned_artist)

    @router.get("/showcase", response_model=Showcase)
    def landing_showcase(limit: int = Query(SHOWCASE_LIMIT, ge=1, le=SHOWCASE_MAX)) -> dict:
        return showcase.pick(limit)

    @router.get("/users/{username}", response_model=User)
    def lookup_user(username: str) -> dict:
        _reject_catalog(username)
        return songs.lookup(username)

    @router.get("/users/{username}/community", response_model=CommunityFeed)
    def community_feed(username: str) -> dict:
        _reject_catalog(username)
        return community.feed(username)

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

    @router.post("/user/{user_id}/playlist", status_code=201, response_model=Playlist)
    def create_playlist(user_id: int, body: PlaylistWrite) -> dict:
        return playlists.create(user_id, body.name)

    @router.get("/user/{user_id}/playlist", response_model=PlaylistList)
    def list_playlists(user_id: int) -> dict:
        return playlists.list_playlists(user_id)

    @router.get("/user/{user_id}/playlist/{playlist_id}", response_model=Playlist)
    def get_playlist(user_id: int, playlist_id: int) -> dict:
        return playlists.get(user_id, playlist_id)

    @router.patch("/user/{user_id}/playlist/{playlist_id}", response_model=Playlist)
    def rename_playlist(user_id: int, playlist_id: int, body: PlaylistWrite) -> dict:
        return playlists.rename(user_id, playlist_id, body.name)

    @router.delete("/user/{user_id}/playlist/{playlist_id}", status_code=204, response_model=None)
    def delete_playlist(user_id: int, playlist_id: int) -> Response:
        playlists.delete(user_id, playlist_id)
        return Response(status_code=204)

    @router.post("/user/{user_id}/playlist/{playlist_id}/song", response_model=Playlist)
    def add_playlist_song(user_id: int, playlist_id: int, body: PlaylistSongWrite) -> dict:
        return playlists.add_song(user_id, playlist_id, body.song_id, body.position)

    @router.delete(
        "/user/{user_id}/playlist/{playlist_id}/song/{membership_id}",
        status_code=204,
        response_model=None,
    )
    def remove_playlist_song(user_id: int, playlist_id: int, membership_id: int) -> Response:
        playlists.remove_song(user_id, playlist_id, membership_id)
        return Response(status_code=204)

    @router.put("/user/{user_id}/playlist/{playlist_id}/order", response_model=Playlist)
    def reorder_playlist(user_id: int, playlist_id: int, body: PlaylistOrder) -> dict:
        return playlists.reorder(user_id, playlist_id, body.membership_ids)

    @router.get("/user/{user_id}/favorite", response_model=FavoriteList)
    def list_favorites(user_id: int) -> dict:
        return favorites.list_favorites(user_id)

    @router.put("/user/{user_id}/favorite/{song_id}", response_model=FavoriteSong)
    def add_favorite(user_id: int, song_id: int) -> dict:
        return favorites.add(user_id, song_id)

    @router.delete("/user/{user_id}/favorite/{song_id}", status_code=204, response_model=None)
    def remove_favorite(user_id: int, song_id: int) -> Response:
        favorites.remove(user_id, song_id)
        return Response(status_code=204)

    @router.get("/user/{user_id}/recommendations", response_model=Recommendations)
    def recommend(user_id: int, limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)) -> dict:
        return recommendations.recommend(user_id, limit)

    return router


def _reject_catalog(username: str) -> None:
    if username == CATALOG_USERNAME:
        raise BadRequest("username catalog is not allowed")
