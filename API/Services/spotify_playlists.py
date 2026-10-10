"""Read the Spotify playlists on a connected account. Nothing is written locally."""

from __future__ import annotations

from API.Adapters.spotify_library import SpotifyLibrary, SpotifyLibraryError
from API.Services.errors import UpstreamError
from API.Services.spotify_auth import SpotifyAuth


class SpotifyPlaylists:
    def __init__(self, auth: SpotifyAuth, library: SpotifyLibrary) -> None:
        self.auth = auth
        self.library = library

    def list_playlists(self, user_id: int) -> dict:
        access_token = self.auth.access_token(user_id)
        try:
            found = self.library.playlists(access_token)
        except SpotifyLibraryError as exc:
            raise UpstreamError("Spotify playlist list failed") from exc
        return {
            "playlists": [
                {
                    "spotify_playlist_id": playlist.spotify_playlist_id,
                    "name": playlist.name,
                    "images": [
                        {"url": image.url, "height": image.height, "width": image.width}
                        for image in playlist.images
                    ],
                }
                for playlist in found
            ]
        }
