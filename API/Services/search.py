"""Public song search and MusicBrainz import."""

from __future__ import annotations

from collections.abc import Callable

from db.manager import open_database
from db.seed import choose_recording, fold, upsert_recording

from API.Adapters.musicbrainz import RecordingSource
from API.Services.errors import UpstreamError
from API.Services.songs import SongService


class SearchService:
    def __init__(self, source: RecordingSource, songs: SongService) -> None:
        self.source = source
        self.songs = songs

    def search(self, title: str, artist: str | None) -> dict:
        folded_title = fold(title)
        folded_artist = fold(artist) if artist else None
        connection = open_database()
        try:
            song_ids = self._local_ids(connection, folded_title, folded_artist)
            if song_ids:
                return {
                    "songs": self.songs.documents(connection, song_ids, username=None),
                    "imported": False,
                }
        finally:
            connection.close()
        if artist:
            return self._import(
                lambda: self.source.search(title, artist),
                artist,
                title,
                limit=1,
            )
        return self._import(
            lambda: self.source.search_title(title),
            "",
            title,
            limit=2,
        )

    def _local_ids(self, connection, folded_title: str, folded_artist: str | None) -> list[int]:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, title, artist_credit FROM songs ORDER BY id")
            rows = cursor.fetchall()
        song_ids: list[int] = []
        for row in rows:
            if fold(row["title"]) != folded_title:
                continue
            if folded_artist is not None and folded_artist not in fold(row["artist_credit"] or ""):
                continue
            song_ids.append(int(row["id"]))
        return song_ids

    def _import(self, fetch: Callable[[], list[dict]], artist: str, title: str, limit: int) -> dict:
        try:
            recordings = fetch()
        except Exception as exc:
            raise UpstreamError("MusicBrainz request failed") from exc
        chosen = self._choose(recordings, artist, title, limit)
        if not chosen:
            return {"songs": [], "imported": False}
        connection = open_database()
        try:
            song_ids: list[int] = []
            try:
                for hit in chosen:
                    recording = self.source.lookup(str(hit["id"]))
                    song_ids.append(upsert_recording(connection, recording))
                connection.commit()
            except Exception as exc:
                connection.rollback()
                raise UpstreamError("MusicBrainz request failed") from exc
            return {
                "songs": self.songs.documents(connection, song_ids, username=None),
                "imported": True,
            }
        finally:
            connection.close()

    def _choose(self, recordings: list[dict], artist: str, title: str, limit: int) -> list[dict]:
        pool = list(recordings)
        chosen: list[dict] = []
        while len(chosen) < limit and pool:
            hit = choose_recording(pool, artist, title)
            if hit is None:
                break
            hit_id = hit.get("id")
            pool = [
                item
                for item in pool
                if item is not hit and (not hit_id or item.get("id") != hit_id)
            ]
            if hit_id:
                chosen.append(hit)
            elif len(pool) == len(recordings):
                break
        return chosen
