"""Update one side of a playlist that is already linked to Spotify."""

from __future__ import annotations

from API.Services.errors import BadRequest
from API.Services.playlists import PlaylistService
from API.Services.spotify_export import SpotifyExport
from API.Services.spotify_import import SpotifyImport

_DIRECTIONS = {"import", "export"}


class SpotifySync:
    def __init__(
        self,
        importer: SpotifyImport,
        exporter: SpotifyExport,
        playlists: PlaylistService,
    ) -> None:
        self.importer = importer
        self.exporter = exporter
        self.playlists = playlists

    def run(self, user_id: int, playlist_id: int, direction: str) -> dict:
        document = self.playlists.get(user_id, playlist_id)
        if direction not in _DIRECTIONS:
            raise BadRequest("direction must be import or export")
        linked = document["spotify_playlist_id"]
        if not linked:
            raise BadRequest("playlist is not linked to Spotify")
        if direction == "import":
            result, _status = self.importer.import_playlist(user_id, str(linked))
            return result
        result, _status = self.exporter.export_playlist(user_id, playlist_id)
        return result
