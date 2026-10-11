from __future__ import annotations

import random

from API.Services.showcase import ShowcaseService
from API.Services.songs import SongService

from tests.conftest import add_tag, insert_song, insert_user


def pick(limit: int = 3, seed: int = 0) -> list[dict]:
    return ShowcaseService(SongService(), random.Random(seed)).pick(limit)["songs"]


def tagged(title: str, artist: str, tags: list[tuple[str, str]], user: str = "catalog") -> int:
    song_id = insert_song(title, artist)
    for kind, name in tags:
        add_tag(song_id, user, kind, name)
    return song_id


def test_empty_catalog_returns_no_songs(client) -> None:
    assert client.get("/showcase").json() == {"songs": []}


def test_limit_is_validated(client) -> None:
    assert client.get("/showcase?limit=0").status_code == 422
    assert client.get("/showcase?limit=7").status_code == 422


def test_songs_need_two_non_artist_tags_and_artist_tags_are_hidden(client) -> None:
    tagged("Thin", "Solo", [("artist", "solo"), ("genre", "jazz")])
    tagged("Rich", "Band", [("artist", "band"), ("genre", "rock"), ("feeling", "warm")])

    body = client.get("/showcase").json()

    assert [song["title"] for song in body["songs"]] == ["Rich"]
    assert body["songs"][0]["tags"] == [
        {"kind": "genre", "name": "rock", "token": "rock"},
        {"kind": "feeling", "name": "warm", "token": "warm"},
    ]
    assert set(body["songs"][0]) == {"id", "title", "artist_credit", "image_url", "tags"}


def test_three_tags_with_one_of_each_kind_first(client) -> None:
    insert_user("ada")
    song = tagged(
        "Wide",
        "Band",
        [("genre", "rock"), ("genre", "pop"), ("genre", "indie"), ("feeling", "warm"), ("instrument", "piano")],
    )
    add_tag(song, "ada", "genre", "pop")

    [chosen] = pick()

    assert [tag["token"] for tag in chosen["tags"]] == ["pop", "warm", "piano"]


def test_top_tags_beat_obscure_ones(client) -> None:
    for index in range(3):
        tagged(f"Filler {index}", f"Artist {index}", [("genre", "rock"), ("feeling", "warm")])
    tagged("Mixed", "Other", [("genre", "rock"), ("genre", "zeuhl"), ("genre", "math rock"), ("genre", "noise")])

    [chosen] = [song for song in pick(limit=4) if song["title"] == "Mixed"]

    assert chosen["tags"][0]["token"] == "rock"


def test_picks_distinct_artists_and_lead_genres(client) -> None:
    tagged("A1", "Alpha", [("genre", "rock"), ("feeling", "warm")])
    tagged("A2", "Alpha", [("genre", "jazz"), ("feeling", "calm")])
    tagged("B1", "Beta", [("genre", "rock"), ("feeling", "dark")])
    tagged("C1", "Gamma", [("genre", "soul"), ("feeling", "sad")])
    tagged("D1", "Delta", [("genre", "house"), ("feeling", "groovy")])

    for seed in range(10):
        songs = pick(seed=seed)
        assert len(songs) == 3
        assert len({song["artist_credit"] for song in songs}) == 3
        leads = [song["tags"][0]["token"] for song in songs]
        assert len(set(leads)) == 3


def test_relaxes_variety_when_the_catalog_is_small(client) -> None:
    for index in range(3):
        tagged(f"Song {index}", "Only Artist", [("genre", "rock"), ("feeling", "warm")])

    songs = pick()

    assert sorted(song["title"] for song in songs) == ["Song 0", "Song 1", "Song 2"]


def test_random_order_varies_between_seeds(client) -> None:
    for index in range(8):
        tagged(f"Song {index}", f"Artist {index}", [("genre", f"genre {index}"), ("feeling", f"mood {index}")])

    picks = {tuple(song["title"] for song in pick(seed=seed)) for seed in range(10)}

    assert len(picks) > 1


def test_skips_near_duplicate_tags(client) -> None:
    tagged("Overlap", "Band", [("genre", "pop"), ("genre", "pop rock"), ("genre", "rock")])

    [chosen] = pick()

    assert [tag["token"] for tag in chosen["tags"]] == ["pop", "rock"]


def test_prefers_the_tag_that_fits_the_song(client) -> None:
    for index in range(3):
        tagged(f"Club {index}", f"DJ {index}", [("genre", "electronic"), ("genre", "house")])
    for index in range(5):
        tagged(f"Guitar {index}", f"Band {index}", [("genre", "rock"), ("feeling", f"mood {index}")])
    tagged("Robot", "Duo", [("genre", "rock"), ("genre", "electronic"), ("genre", "house"), ("feeling", "euphoric")])

    [chosen] = [song for song in pick(limit=6) if song["title"] == "Robot"]

    assert chosen["tags"][0]["token"] == "electronic"
