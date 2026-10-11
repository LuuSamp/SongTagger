from __future__ import annotations

from dataclasses import replace

import numpy as np

from API.Recommender.config import RecommenderConfig
from API.Recommender.data import Interaction, Snapshot, TagApplication, TagInfo
from API.Recommender.evaluate import evaluate, holdout, synthetic
from API.Recommender.matrices import build
from API.Recommender.model import Recommender

CATALOG = 1
ADA = 2
BIA = 3
JAZZ, ROCK, RARE, SMOKY = 10, 11, 12, 13


def snapshot(applications: list[TagApplication], interactions: list[Interaction]) -> Snapshot:
    songs = (1, 2, 3, 4, 5, 6)
    return Snapshot(
        song_ids=songs,
        artists={song: f"artist {song}" for song in songs},
        tags={
            JAZZ: TagInfo("genre", "jazz", "jazz"),
            ROCK: TagInfo("genre", "rock", "rock"),
            RARE: TagInfo("genre", "bossa", "bossa"),
            SMOKY: TagInfo("feeling", "smoky", "smoky"),
        },
        applications=tuple(applications),
        interactions=tuple(interactions),
    )


def catalog_tags() -> list[TagApplication]:
    rows = [TagApplication(song, JAZZ, CATALOG, True) for song in (1, 2, 3)]
    rows += [TagApplication(song, ROCK, CATALOG, True) for song in (4, 5, 6)]
    rows.append(TagApplication(1, RARE, CATALOG, True))
    return rows


def test_song_profiles_are_unit_rows_that_favor_rare_tags() -> None:
    matrices = build(snapshot(catalog_tags(), []), RecommenderConfig())

    norms = np.linalg.norm(matrices.A, axis=1)
    assert np.allclose(norms, 1.0)
    song = matrices.song_ids.index(1)
    assert matrices.A[song, matrices.tag_ids.index(RARE)] > matrices.A[song, matrices.tag_ids.index(JAZZ)]


def test_user_profile_mixes_declared_tags_and_songs_they_kept() -> None:
    applications = catalog_tags() + [TagApplication(4, SMOKY, ADA, False)]
    interactions = [
        Interaction(ADA, 4, "tag", 0.0),
        Interaction(ADA, 1, "playlist", 0.0),
    ]
    matrices = build(snapshot(applications, interactions), RecommenderConfig())

    profile = matrices.B[matrices.user_ids.index(ADA)]
    assert profile[matrices.tag_ids.index(SMOKY)] > 0
    assert profile[matrices.tag_ids.index(JAZZ)] > 0
    assert matrices.known[ADA] == {1, 4}


def test_recommends_unknown_songs_with_reasons_and_skips_users_without_signal() -> None:
    interactions = [Interaction(ADA, 1, "playlist", 0.0), Interaction(BIA, 2, "like", 0.0)]
    model = Recommender(snapshot(catalog_tags(), interactions), RecommenderConfig())

    picks = model.recommend(ADA, 2)

    assert [pick.song_id for pick in picks] == [2, 3]
    assert picks[0].score > picks[1].score
    assert picks[0].reasons == (JAZZ,)
    assert model.recommend(999, 5) == []


def test_artist_cap_limits_repeats() -> None:
    base = snapshot(catalog_tags(), [Interaction(ADA, 4, "playlist", 0.0)])
    same_artist = replace(base, artists={song: "one artist" for song in base.song_ids})

    capped = Recommender(same_artist, RecommenderConfig(per_artist=1)).recommend(ADA, 5)
    uncapped = Recommender(base, RecommenderConfig(per_artist=1)).recommend(ADA, 5)

    assert len(capped) == 1
    assert len(uncapped) == 2


def test_holdout_removes_every_signal_for_the_hidden_song() -> None:
    applications = catalog_tags() + [TagApplication(2, SMOKY, ADA, False)]
    interactions = [Interaction(ADA, 1, "playlist", 0.0), Interaction(ADA, 2, "tag", 0.0)]
    train, hidden = holdout(snapshot(applications, interactions), np.random.default_rng(0))

    song = hidden[ADA]
    assert all(row.song_id != song for row in train.interactions)
    assert all(row.catalog or row.song_id != song for row in train.applications)


def test_chosen_blend_beats_content_only_and_popularity_only_offline() -> None:
    songs = tuple(range(1, 61))
    genres = {100 + g: TagInfo("genre", f"genre {g}", f"genre-{g}") for g in range(6)}
    applications = [
        TagApplication(song, 100 + (song % 6), CATALOG, True) for song in songs
    ] + [TagApplication(song, 100 + ((song + 1) % 6), CATALOG, True) for song in songs[::3]]
    base = Snapshot(
        song_ids=songs,
        artists={song: f"artist {song}" for song in songs},
        tags=genres,
        applications=tuple(applications),
        interactions=(),
    )
    world = synthetic(base, seed=7, users=40)
    config = RecommenderConfig()

    chosen = evaluate(world, config, rounds=3, seed=1).ndcg
    content = evaluate(world, replace(config, popularity_blend=0.0), rounds=3, seed=1).ndcg
    popular = evaluate(world, replace(config, popularity_blend=1.0), rounds=3, seed=1).ndcg

    assert chosen >= content
    assert chosen > popular
