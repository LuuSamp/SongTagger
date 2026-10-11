"""Rank tags on a batch of songs by how many times they were applied."""

from __future__ import annotations

from API.Services.songs import KIND_ORDER, tag_token

PLAYLIST_TAG_LIMIT = 5

_KIND_ORDER = {kind: index for index, kind in enumerate(KIND_ORDER)}


def tags_by_song(connection, song_ids: list[int]) -> dict[int, list[dict]]:
    """Every tag on each song, ordered by count, kind, then token."""
    unique = _unique_ids(song_ids)
    grouped: dict[int, list[dict]] = {song_id: [] for song_id in unique}
    for row in _rows(connection, unique):
        grouped[int(row["song_id"])].append(_counted(row))
    for tags in grouped.values():
        tags.sort(key=_sort_key)
    return grouped


def tags_across(connection, song_ids: list[int], limit: int = PLAYLIST_TAG_LIMIT) -> list[dict]:
    """One ranked list for the batch. Each song contributes its tags once."""
    totals: dict[int, dict] = {}
    for row in _rows(connection, _unique_ids(song_ids)):
        tag_id = int(row["id"])
        current = totals.get(tag_id)
        if current is None:
            totals[tag_id] = _counted(row)
        else:
            current["count"] += int(row["count"])
    ranked = sorted(totals.values(), key=_sort_key)
    return ranked[:limit]


def _unique_ids(song_ids: list[int]) -> list[int]:
    return list(dict.fromkeys(int(song_id) for song_id in song_ids))


def _rows(connection, song_ids: list[int]) -> list[dict]:
    if not song_ids:
        return []
    placeholders = ", ".join(["%s"] * len(song_ids))
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT st.song_id, t.id, t.kind, t.name, COUNT(*) AS count "
            "FROM song_tags st "
            "JOIN tags t ON t.id = st.tag_id "
            f"WHERE st.song_id IN ({placeholders}) "
            "GROUP BY st.song_id, t.id, t.kind, t.name",
            tuple(song_ids),
        )
        return list(cursor.fetchall())


def _counted(row: dict) -> dict:
    return {
        "kind": row["kind"],
        "name": row["name"],
        "token": tag_token(row["name"]),
        "count": int(row["count"]),
    }


def _sort_key(item: dict) -> tuple:
    return (
        -item["count"],
        _KIND_ORDER.get(item["kind"], len(KIND_ORDER)),
        item["token"],
    )
