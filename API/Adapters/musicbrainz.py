"""MusicBrainz recording search. The only provider in this slice."""

from __future__ import annotations

from typing import Protocol

from db.seed import SEARCH_URL, MusicBrainzClient, phrase


class RecordingSource(Protocol):
    def search(self, title: str, artist: str) -> list[dict]:
        """Recordings for a title and artist, in provider order."""

    def search_title(self, title: str) -> list[dict]:
        """Recordings for a title, with no artist clause."""

    def lookup(self, recording_id: str) -> dict:
        """Full recording payload accepted by ``upsert_recording``."""


class MusicBrainzAdapter(MusicBrainzClient):
    """``MusicBrainzClient`` with the ``RecordingSource`` argument order.

    ``search_title`` cannot call ``MusicBrainzClient.search`` because that
    method always adds an artist clause.
    """

    def search(self, title: str, artist: str) -> list[dict]:
        return super().search(artist, title)

    def search_title(self, title: str) -> list[dict]:
        official = f"recording:{phrase(title)} AND status:official"
        payload = self._get(SEARCH_URL, {"query": official, "fmt": "json", "limit": "100"})
        recordings = payload.get("recordings") or []
        if recordings:
            return recordings
        broader = f"recording:{phrase(title)}"
        payload = self._get(SEARCH_URL, {"query": broader, "fmt": "json", "limit": "100"})
        return payload.get("recordings") or []

    def lookup(self, recording_id: str) -> dict:
        return super().lookup(recording_id)
