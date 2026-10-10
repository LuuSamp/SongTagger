"""Read Spotify playlists. Pages are collected before the caller inserts anything."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from urllib.parse import quote

import httpx

PLAYLIST_URL = "https://api.spotify.com/v1/playlists/{playlist_id}"
ME_PLAYLISTS_URL = "https://api.spotify.com/v1/me/playlists"


class SpotifyLibraryError(Exception):
    """Spotify did not return a usable playlist page."""


@dataclass(frozen=True)
class SpotifyImage:
    url: str
    height: int | None
    width: int | None


@dataclass(frozen=True)
class SpotifyPlaylist:
    spotify_playlist_id: str
    name: str
    images: tuple[SpotifyImage, ...]


@dataclass(frozen=True)
class SpotifyItem:
    spotify_id: str | None
    title: str
    artists: tuple[str, ...]
    isrc: str | None
    duration_ms: int | None
    usable: bool
    album_images: tuple[SpotifyImage, ...] = ()


class SpotifyLibrary(Protocol):
    def playlist(self, access_token: str, playlist_id: str) -> tuple[str, list[SpotifyItem], str | None]:
        """Playlist name, every track item in Spotify order, and the widest cover."""

    def playlists(self, access_token: str) -> list[SpotifyPlaylist]:
        """Every playlist on the account, in Spotify order."""


class HttpxSpotifyLibrary:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self._client = client if client is not None else httpx.Client(timeout=30.0)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def playlist(self, access_token: str, playlist_id: str) -> tuple[str, list[SpotifyItem], str | None]:
        payload = self._get(PLAYLIST_URL.format(playlist_id=quote(playlist_id, safe="")), access_token)
        name = payload.get("name") if isinstance(payload.get("name"), str) else ""
        image_url = widest_image_url(_parse_images(payload.get("images")))
        page = _track_page(payload)
        if page is None:
            raise SpotifyLibraryError("Spotify did not return this playlist's songs")
        raw_items = list(page.get("items") or [])
        next_url = page.get("next")
        while isinstance(next_url, str) and next_url:
            page = self._get(next_url, access_token)
            raw_items.extend(page.get("items") or [])
            next_url = page.get("next")
        return name, [_parse_item(raw) for raw in raw_items], image_url

    def playlists(self, access_token: str) -> list[SpotifyPlaylist]:
        payload = self._get(ME_PLAYLISTS_URL, access_token)
        raw_items = list(_page_items(payload))
        next_url = payload.get("next")
        while isinstance(next_url, str) and next_url:
            payload = self._get(next_url, access_token)
            raw_items.extend(_page_items(payload))
            next_url = payload.get("next")
        parsed: list[SpotifyPlaylist] = []
        for raw in raw_items:
            playlist = _parse_playlist(raw)
            if playlist is not None:
                parsed.append(playlist)
        return parsed

    def _get(self, url: str, access_token: str) -> dict:
        try:
            response = self._client.get(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
        except httpx.HTTPError as exc:
            raise SpotifyLibraryError(str(exc)) from exc
        if response.status_code != 200:
            raise SpotifyLibraryError(f"HTTP {response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise SpotifyLibraryError("Spotify playlist response was not JSON") from exc
        if not isinstance(payload, dict):
            raise SpotifyLibraryError("Spotify playlist response was not an object")
        return payload


def _page_items(payload: dict) -> list:
    items = payload.get("items")
    if items is None:
        return []
    if not isinstance(items, list):
        raise SpotifyLibraryError("Spotify playlist list was not paged")
    return items


def _parse_playlist(raw: object) -> SpotifyPlaylist | None:
    if not isinstance(raw, dict):
        return None
    raw_id = raw.get("id")
    if not isinstance(raw_id, str) or not raw_id:
        return None
    name = raw.get("name") if isinstance(raw.get("name"), str) else ""
    return SpotifyPlaylist(raw_id, name, _parse_images(raw.get("images")))


def _parse_images(raw: object) -> tuple[SpotifyImage, ...]:
    if not isinstance(raw, list):
        return ()
    images: list[SpotifyImage] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not isinstance(url, str):
            continue
        images.append(SpotifyImage(url, _image_size(item.get("height")), _image_size(item.get("width"))))
    return tuple(images)


def widest_image_url(images: tuple[SpotifyImage, ...]) -> str | None:
    best_url: str | None = None
    best_width = -1
    for image in images:
        width = image.width if image.width is not None else image.height
        if width is None:
            width = 0
        if width > best_width and image.url:
            best_url = image.url
            best_width = width
    return best_url


def _image_size(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _track_page(payload: dict) -> dict | None:
    current = payload.get("items")
    if isinstance(current, dict):
        return current
    legacy = payload.get("tracks")
    if isinstance(legacy, dict):
        return legacy
    return None


def _parse_item(raw: object) -> SpotifyItem:
    track = None
    wrapper_local = False
    if isinstance(raw, dict):
        wrapper_local = bool(raw.get("is_local"))
        if isinstance(raw.get("item"), dict):
            track = raw["item"]
        elif isinstance(raw.get("track"), dict):
            track = raw["track"]
    if not isinstance(track, dict):
        return SpotifyItem(None, "", (), None, None, False)
    raw_id = track.get("id")
    spotify_id = str(raw_id) if raw_id else None
    title = track.get("name") if isinstance(track.get("name"), str) else ""
    artists = tuple(
        name
        for artist in (track.get("artists") or [])
        if isinstance(artist, dict)
        for name in [artist.get("name")]
        if isinstance(name, str) and name
    )
    external = track.get("external_ids")
    raw_isrc = external.get("isrc") if isinstance(external, dict) else None
    isrc = str(raw_isrc) if raw_isrc else None
    duration = track.get("duration_ms")
    duration_ms = duration if isinstance(duration, int) and not isinstance(duration, bool) else None
    album = track.get("album")
    album_images = _parse_images(album.get("images")) if isinstance(album, dict) else ()
    kind = track.get("type")
    wrong_kind = isinstance(kind, str) and kind != "track"
    usable = (
        not wrapper_local
        and not bool(track.get("is_local"))
        and not wrong_kind
        and bool(spotify_id)
        and bool(title.strip())
    )
    return SpotifyItem(spotify_id, title, artists, isrc, duration_ms, usable, album_images)
