"""Resolve seed queries to MusicBrainz recordings and upsert them.

A later search miss can import ``upsert_recording`` and pass a MusicBrainz
recording lookup payload. Lookup order is mbid, then ISRC, then insert.
"""

from __future__ import annotations

import json
import time
import unicodedata
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pymysql

from db.manager import CATALOG_USERNAME, load_project_env, open_database

ROOT = Path(__file__).resolve().parent
QUERIES_PATH = ROOT / "seed_queries.txt"
CACHE_PATH = ROOT / "seed_cache.json"

USER_AGENT = "SongtaggingSeed/0.1 (local catalog seed)"
REQUEST_INTERVAL = 1.0
SEARCH_URL = "https://musicbrainz.org/ws/2/recording"
LOOKUP_INCLUDES = "artist-credits+isrcs+genres+url-rels+releases"

EXCLUDED_DISAMBIGUATION = (
    "live",
    "remix",
    "demo",
    "karaoke",
    "mix",
    "radio",
    "cast",
    "acoustic",
    "instrumental",
    "rehearsal",
    "broadcast",
    "take",
    "outtake",
    "alternate",
    "edit",
    "remaster",
)
EXCLUDED_SECONDARY_TYPES = {"Live", "Remix", "Demo", "DJ-mix", "Audio drama", "Interview"}
RELEASE_PRIMARY_TYPES = {"Album", "Single", "EP"}


def fold(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(without_marks.casefold().split())


def normalize_tag(name: str) -> str:
    return fold(name)[:255]


def display_tag(name: str) -> str:
    return " ".join(name.strip().split())[:255]


def artist_credit_string(recording: dict) -> str:
    parts: list[str] = []
    for credit in recording.get("artist-credit") or []:
        if isinstance(credit, dict):
            parts.append(credit.get("name") or "")
            parts.append(credit.get("joinphrase") or "")
        else:
            parts.append(str(credit))
    return "".join(parts).strip()


def artist_names(recording: dict) -> list[str]:
    names: list[str] = []
    for credit in recording.get("artist-credit") or []:
        if isinstance(credit, dict):
            name = display_tag(credit.get("name") or "")
        else:
            name = display_tag(str(credit))
        if name:
            names.append(name)
    return names


def primary_isrc(recording: dict) -> str | None:
    for raw in recording.get("isrcs") or []:
        code = str(raw).strip().upper()
        if len(code) == 12 and code.isalnum():
            return code
    return None


def phrase(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


class MusicBrainzClient:
    def __init__(self) -> None:
        self._client = httpx.Client(
            timeout=30,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        self._next_request_at = 0.0

    def close(self) -> None:
        self._client.close()

    def _get(self, url: str, params: dict[str, str]) -> dict:
        for attempt in range(5):
            delay = self._next_request_at - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self._next_request_at = time.monotonic() + REQUEST_INTERVAL
            response = self._client.get(url, params=params)
            if response.status_code in {429, 503} and attempt < 4:
                time.sleep(REQUEST_INTERVAL * (attempt + 1))
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError(f"MusicBrainz request failed: {url}")

    def search(self, artist: str, title: str) -> list[dict]:
        query = f"recording:{phrase(title)} AND artist:{phrase(artist)} AND status:official"
        payload = self._get(SEARCH_URL, {"query": query, "fmt": "json", "limit": "100"})
        recordings = payload.get("recordings") or []
        if recordings:
            return recordings
        broader = f"recording:{phrase(title)} AND artist:{phrase(artist)}"
        payload = self._get(SEARCH_URL, {"query": broader, "fmt": "json", "limit": "100"})
        return payload.get("recordings") or []

    def lookup(self, mbid: str) -> dict:
        return self._get(
            f"{SEARCH_URL}/{mbid}",
            {"fmt": "json", "inc": LOOKUP_INCLUDES},
        )


def _good_releases(recording: dict) -> list[dict]:
    releases: list[dict] = []
    for release in recording.get("releases") or []:
        if release.get("status") not in (None, "Official"):
            continue
        group = release.get("release-group") or {}
        secondary = set(group.get("secondary-types") or [])
        if secondary & EXCLUDED_SECONDARY_TYPES:
            continue
        primary = group.get("primary-type")
        if primary not in RELEASE_PRIMARY_TYPES and primary is not None:
            continue
        releases.append(release)
    return releases


def _disambiguation_allowed(recording: dict, query_text: str) -> bool:
    disambiguation = fold(recording.get("disambiguation") or "")
    if not disambiguation:
        return True
    query_fold = fold(query_text)
    return not any(
        word in disambiguation and word not in query_fold for word in EXCLUDED_DISAMBIGUATION
    )


def choose_recording(recordings: list[dict], artist: str, title: str) -> dict | None:
    if not recordings:
        return None
    folded_title = fold(title)
    folded_artist = fold(artist)
    query_text = f"{artist} {title}"

    def title_rank(recording: dict) -> int:
        got = fold(recording.get("title") or "")
        if got == folded_title:
            return 0
        if got.startswith(folded_title):
            return 1
        return 2

    def artist_rank(recording: dict) -> int:
        return 0 if folded_artist in fold(artist_credit_string(recording)) else 1

    pool = list(recordings)
    exact_or_prefix = [recording for recording in pool if title_rank(recording) < 2]
    if exact_or_prefix:
        pool = exact_or_prefix
    with_artist = [recording for recording in pool if artist_rank(recording) == 0]
    if with_artist:
        pool = with_artist
    allowed = [recording for recording in pool if _disambiguation_allowed(recording, query_text)]
    if allowed:
        pool = allowed
    with_releases = [recording for recording in pool if _good_releases(recording)]
    if with_releases:
        pool = with_releases

    def sort_key(recording: dict) -> tuple:
        releases = _good_releases(recording)
        dates = [release.get("date") or "9999" for release in releases]
        first_date = min(dates) if dates else "9999"
        disambiguation = recording.get("disambiguation") or ""
        if not disambiguation:
            disambiguation_rank = 0
        elif "album version" in fold(disambiguation):
            disambiguation_rank = 1
        else:
            disambiguation_rank = 2
        return (
            title_rank(recording),
            artist_rank(recording),
            disambiguation_rank,
            1 if recording.get("video") else 0,
            -len(releases),
            first_date,
            -int(recording.get("score") or 0),
        )

    return min(pool, key=sort_key)


def source_link(url: str) -> tuple[str, str] | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower().removeprefix("www.")
    path = [part for part in parsed.path.split("/") if part]
    if host == "open.spotify.com" and len(path) >= 2 and path[0] == "track":
        return "spotify", path[1]
    if host in {"music.apple.com", "geo.music.apple.com"} or host.endswith(".apple.com"):
        if "music.apple.com" in host or host.startswith("geo.music.apple.com"):
            query = parse_qs(parsed.query)
            if query.get("i"):
                return "apple_music", query["i"][0]
            if path and path[-1].isdigit():
                return "apple_music", path[-1]
    if host in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        query = parse_qs(parsed.query)
        if query.get("v"):
            return "youtube", query["v"][0]
        if len(path) >= 2 and path[0] in {"embed", "shorts", "v"}:
            return "youtube", path[1]
    if host == "youtu.be" and path:
        return "youtube", path[0]
    if host.endswith("discogs.com") and len(path) >= 2 and path[0] in {"release", "master"}:
        identifier = path[1].split("-", 1)[0]
        if identifier.isdigit():
            return "discogs", f"{path[0]}:{identifier}"
    return None


def links_for_recording(recording: dict) -> dict[str, tuple[str, str]]:
    """One external id and URL per source name. MusicBrainz is always included."""
    mbid = recording.get("id")
    links: dict[str, tuple[str, str]] = {}
    if mbid:
        links["musicbrainz"] = (str(mbid), f"https://musicbrainz.org/recording/{mbid}")
    for relation in recording.get("relations") or []:
        if relation.get("target-type") not in (None, "url"):
            continue
        resource = ((relation.get("url") or {}).get("resource")) or ""
        parsed = source_link(resource)
        if parsed is None or parsed[0] in links:
            continue
        links[parsed[0]] = (parsed[1], resource)
    return links


def load_queries(path: Path) -> list[str]:
    lines: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def load_cache(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"Ignoring unreadable cache at {path}")
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def save_cache(path: Path, cache: dict) -> None:
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def resolve_query(client: MusicBrainzClient, cache: dict, line: str) -> dict | None:
    cached = cache.get(line)
    if isinstance(cached, dict) and cached.get("id"):
        return cached
    if " - " not in line:
        print(f"Skip (expected 'Artist - Title'): {line}")
        return None
    artist, title = line.split(" - ", 1)
    artist = artist.strip()
    title = title.strip()
    recordings = client.search(artist, title)
    chosen = choose_recording(recordings, artist, title)
    if chosen is None or not chosen.get("id"):
        print(f"No MusicBrainz recording: {line}")
        return None
    recording = client.lookup(str(chosen["id"]))
    cache[line] = recording
    save_cache(CACHE_PATH, cache)
    return recording


def _song_values(recording: dict) -> tuple:
    title = display_tag(recording.get("title") or "")
    credit = artist_credit_string(recording) or title
    length = recording.get("length")
    duration_ms = length if isinstance(length, int) else None
    mbid = recording.get("id") or None
    disambiguation = display_tag(recording.get("disambiguation") or "") or None
    return (title, credit, duration_ms, mbid, primary_isrc(recording), disambiguation)


def upsert_recording(
    connection,
    recording: dict,
    *,
    spotify_image_url: str | None = None,
    fetch_track: bool = True,
) -> int:
    """Insert or update one recording, its source links, and catalog tags.

    Match an existing row on ``mbid``, then on ``isrc``. A payload with both
    empty inserts a new row. Cover lookup is best-effort and never rolls the
    song back.
    """
    title, credit, duration_ms, mbid, isrc, disambiguation = _song_values(recording)
    if not title or not credit:
        raise ValueError("recording needs a title and artist credit")
    with connection.cursor() as cursor:
        song_id = _upsert_song(
            cursor,
            title=title,
            credit=credit,
            duration_ms=duration_ms,
            mbid=mbid,
            isrc=isrc,
            disambiguation=disambiguation,
        )
        source_ids = _source_ids(cursor)
        catalog_user_id = _catalog_user_id(cursor)
        for source_name, (external_id, url) in links_for_recording(recording).items():
            source_id = source_ids.get(source_name)
            if source_id is None:
                continue
            _upsert_source_link(cursor, song_id, source_id, external_id, url)
        for kind, name in _catalog_tags(recording):
            tag_id = _upsert_tag(cursor, name, kind)
            cursor.execute(
                "INSERT INTO song_tags (song_id, tag_id, user_id) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE song_id = song_id",
                (song_id, tag_id, catalog_user_id),
            )
        from db.covers import fill_song_image

        fill_song_image(
            cursor,
            song_id,
            recording,
            spotify_image_url=spotify_image_url,
            fetch_track=fetch_track,
        )
    return song_id


def _upsert_song(cursor, *, title, credit, duration_ms, mbid, isrc, disambiguation) -> int:
    statement = (
        "INSERT INTO songs (title, artist_credit, duration_ms, mbid, isrc, disambiguation) "
        "VALUES (%s, %s, %s, %s, %s, %s) "
        "ON DUPLICATE KEY UPDATE "
        "title = VALUES(title), "
        "artist_credit = VALUES(artist_credit), "
        "duration_ms = VALUES(duration_ms), "
        "disambiguation = VALUES(disambiguation), "
        "mbid = COALESCE(VALUES(mbid), mbid), "
        "isrc = COALESCE(VALUES(isrc), isrc), "
        "id = LAST_INSERT_ID(id)"
    )
    values = (title, credit, duration_ms, mbid, isrc, disambiguation)
    try:
        cursor.execute(statement, values)
    except pymysql.err.IntegrityError:
        cursor.execute(statement, (title, credit, duration_ms, mbid, None, disambiguation))
    song_id = cursor.lastrowid
    if song_id:
        return int(song_id)
    if mbid:
        cursor.execute("SELECT id FROM songs WHERE mbid = %s", (mbid,))
    elif isrc:
        cursor.execute("SELECT id FROM songs WHERE isrc = %s", (isrc,))
    else:
        raise RuntimeError(f"insert did not return an id for {title}")
    row = cursor.fetchone()
    if not row:
        raise RuntimeError(f"could not find song row for {title}")
    return int(row["id"])


def _upsert_source_link(cursor, song_id: int, source_id: int, external_id: str, url: str) -> None:
    cursor.execute(
        "INSERT INTO song_sources (song_id, source_id, external_id, url) "
        "VALUES (%s, %s, %s, %s) "
        "ON DUPLICATE KEY UPDATE "
        "external_id = VALUES(external_id), "
        "url = VALUES(url), "
        "song_id = VALUES(song_id)",
        (song_id, source_id, external_id, url),
    )


def _upsert_tag(cursor, name: str, kind: str) -> int:
    normalized = normalize_tag(name)
    shown = display_tag(name)
    cursor.execute(
        "INSERT INTO tags (name, normalized_name, kind) VALUES (%s, %s, %s) "
        "ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
        (shown, normalized, kind),
    )
    tag_id = cursor.lastrowid
    if tag_id:
        return int(tag_id)
    cursor.execute(
        "SELECT id FROM tags WHERE kind = %s AND normalized_name = %s",
        (kind, normalized),
    )
    row = cursor.fetchone()
    if not row:
        raise RuntimeError(f"could not store tag {kind}:{shown}")
    return int(row["id"])


def _catalog_tags(recording: dict) -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    tags: list[tuple[str, str]] = []
    for name in artist_names(recording):
        key = ("artist", normalize_tag(name))
        if key[1] and key not in seen:
            seen.add(key)
            tags.append(("artist", name))
    for genre in recording.get("genres") or []:
        name = display_tag((genre or {}).get("name") or "")
        key = ("genre", normalize_tag(name))
        if key[1] and key not in seen:
            seen.add(key)
            tags.append(("genre", name))
    return tags


def _source_ids(cursor) -> dict[str, int]:
    cursor.execute("SELECT id, name FROM sources")
    return {row["name"]: int(row["id"]) for row in cursor.fetchall()}


def _catalog_user_id(cursor) -> int:
    cursor.execute("SELECT id FROM users WHERE username = %s", (CATALOG_USERNAME,))
    row = cursor.fetchone()
    if not row:
        raise SystemExit("catalog user is missing; run python -m db.manager first")
    return int(row["id"])


def seed(connection) -> tuple[int, list[str]]:
    queries = load_queries(QUERIES_PATH)
    cache = load_cache(CACHE_PATH)
    client = MusicBrainzClient()
    misses: list[str] = []
    try:
        for index, line in enumerate(queries, start=1):
            print(f"{index}/{len(queries)} {line}", flush=True)
            try:
                recording = resolve_query(client, cache, line)
            except httpx.HTTPError as exc:
                print(f"Request failed for {line}: {exc}")
                misses.append(line)
                continue
            if recording is None:
                misses.append(line)
                continue
            upsert_recording(connection, recording)
            connection.commit()
    finally:
        client.close()
        save_cache(CACHE_PATH, cache)
    return len(queries) - len(misses), misses


def main() -> None:
    load_project_env()
    connection = open_database()
    try:
        stored, misses = seed(connection)
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS song_count FROM songs")
            song_count = int(cursor.fetchone()["song_count"])
    finally:
        connection.close()
    print(f"Upserted {stored} recordings. Songs in database: {song_count}.")
    if misses:
        print("Missed:")
        for line in misses:
            print(f"  {line}")
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except pymysql.MySQLError as exc:
        raise SystemExit(f"MySQL error: {exc}") from exc
