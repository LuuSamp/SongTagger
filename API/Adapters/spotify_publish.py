"""Create or replace a Spotify playlist and look up tracks. No local writes."""

from __future__ import annotations

from typing import Protocol
from urllib.parse import quote

import httpx

from API.Adapters.spotify_library import SpotifyItem, _parse_item

SEARCH_URL = "https://api.spotify.com/v1/search"
CREATE_URL = "https://api.spotify.com/v1/me/playlists"
PLAYLIST_URL = "https://api.spotify.com/v1/playlists/{playlist_id}"
TRACKS_URL = "https://api.spotify.com/v1/playlists/{playlist_id}/items"
_CHUNK = 100


class SpotifyPublishError(Exception):
    """Spotify did not accept a playlist write or track search."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class SpotifyPublisher(Protocol):
    def search_by_isrc(self, access_token: str, isrc: str) -> list[SpotifyItem]:
        """Tracks returned for an ISRC search."""

    def search_by_title_artist(self, access_token: str, title: str, artist: str) -> list[SpotifyItem]:
        """Tracks returned for a title and artist search."""

    def create_playlist(self, access_token: str, name: str) -> tuple[str, str]:
        """New private playlist id and public URL."""

    def add_tracks(self, access_token: str, playlist_id: str, track_ids: list[str]) -> None:
        """Append track ids in order, 100 at a time."""

    def rename_playlist(self, access_token: str, playlist_id: str, name: str) -> None:
        """Write the playlist name. Do not change its privacy."""

    def replace_tracks(self, access_token: str, playlist_id: str, track_ids: list[str]) -> None:
        """Replace the playlist items. The first request holds at most 100 tracks."""


class HttpxSpotifyPublisher:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self._client = client if client is not None else httpx.Client(timeout=30.0)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def search_by_isrc(self, access_token: str, isrc: str) -> list[SpotifyItem]:
        return self._search(access_token, f"isrc:{isrc}")

    def search_by_title_artist(self, access_token: str, title: str, artist: str) -> list[SpotifyItem]:
        return self._search(access_token, f"track:{_quote_term(title)} artist:{_quote_term(artist)}")

    def create_playlist(self, access_token: str, name: str) -> tuple[str, str]:
        payload = self._send(
            "POST",
            CREATE_URL,
            access_token,
            json={"name": name, "public": False},
        )
        playlist_id = payload.get("id")
        if not playlist_id:
            raise SpotifyPublishError("Spotify playlist response had no id")
        external = payload.get("external_urls")
        url = external.get("spotify") if isinstance(external, dict) else None
        if not isinstance(url, str) or not url:
            url = f"https://open.spotify.com/playlist/{playlist_id}"
        return str(playlist_id), url

    def add_tracks(self, access_token: str, playlist_id: str, track_ids: list[str]) -> None:
        url = TRACKS_URL.format(playlist_id=quote(playlist_id, safe=""))
        for start in range(0, len(track_ids), _CHUNK):
            chunk = track_ids[start : start + _CHUNK]
            self._send(
                "POST",
                url,
                access_token,
                json={"uris": [f"spotify:track:{track_id}" for track_id in chunk]},
            )

    def rename_playlist(self, access_token: str, playlist_id: str, name: str) -> None:
        url = PLAYLIST_URL.format(playlist_id=quote(playlist_id, safe=""))
        self._send("PUT", url, access_token, json={"name": name})

    def replace_tracks(self, access_token: str, playlist_id: str, track_ids: list[str]) -> None:
        url = TRACKS_URL.format(playlist_id=quote(playlist_id, safe=""))
        first = track_ids[:_CHUNK]
        self._send(
            "PUT",
            url,
            access_token,
            json={"uris": [f"spotify:track:{track_id}" for track_id in first]},
        )
        for start in range(_CHUNK, len(track_ids), _CHUNK):
            chunk = track_ids[start : start + _CHUNK]
            self._send(
                "POST",
                url,
                access_token,
                json={"uris": [f"spotify:track:{track_id}" for track_id in chunk]},
            )

    def _search(self, access_token: str, query: str) -> list[SpotifyItem]:
        payload = self._send("GET", SEARCH_URL, access_token, params={"q": query, "type": "track"})
        tracks = payload.get("tracks")
        items = tracks.get("items") if isinstance(tracks, dict) else None
        if not isinstance(items, list):
            return []
        return [_parse_track(item) for item in items]

    def _send(self, method: str, url: str, access_token: str, **kwargs: object) -> dict:
        try:
            response = self._client.request(
                method,
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
                **kwargs,
            )
        except httpx.HTTPError as exc:
            raise SpotifyPublishError(str(exc)) from exc
        if response.status_code not in {200, 201}:
            raise SpotifyPublishError(f"HTTP {response.status_code}", response.status_code)
        if not response.content:
            return {}
        try:
            payload = response.json()
        except ValueError as exc:
            raise SpotifyPublishError("Spotify response was not JSON") from exc
        if not isinstance(payload, dict):
            raise SpotifyPublishError("Spotify response was not an object")
        return payload


def _quote_term(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _parse_track(track: object) -> SpotifyItem:
    if not isinstance(track, dict):
        return SpotifyItem(None, "", (), None, None, False)
    return _parse_item({"track": track})
