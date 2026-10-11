from __future__ import annotations

from API.Services.recommendations import RecommendationService
from API.Services.songs import SongService

from tests.conftest import add_tag, insert_song, insert_user
from tests.test_community import playlist_with


def catalog(genre: str, count: int) -> list[int]:
    songs = []
    for index in range(count):
        song_id = insert_song(f"{genre.title()} {index}", f"{genre} artist {index}")
        add_tag(song_id, "catalog", "genre", genre)
        songs.append(song_id)
    return songs


def titles(body: dict) -> list[str]:
    return [item["song"]["title"] for item in body["songs"]]


def test_recommendations_reject_unknown_and_catalog_users(client) -> None:
    assert client.get("/user/999/recommendations").status_code == 404
    assert client.get("/user/1/recommendations").status_code == 400
    ada = insert_user("ada")
    assert client.get(f"/user/{ada}/recommendations?limit=0").status_code == 422


def test_user_without_signal_gets_nothing(client) -> None:
    catalog("jazz", 3)
    ada = insert_user("ada")

    assert client.get(f"/user/{ada}/recommendations").json() == {"songs": []}


def test_recommends_unknown_songs_from_the_users_side_of_the_catalog(client) -> None:
    jazz = catalog("jazz", 5)
    catalog("rock", 5)
    ada = insert_user("ada")
    bia = insert_user("bia")
    for song_id in jazz:
        add_tag(song_id, "bia", "feeling", "smoky")
    playlist_with(client, bia, jazz[:2])
    playlist_with(client, ada, jazz[:2])
    add_tag(jazz[0], "ada", "feeling", "smoky")

    body = client.get(f"/user/{ada}/recommendations?limit=3").json()

    assert set(titles(body)) == {"Jazz 2", "Jazz 3", "Jazz 4"}
    assert all(item["song"]["id"] not in jazz[:2] for item in body["songs"])
    reasons = {tag["token"] for item in body["songs"] for tag in item["because"]}
    assert reasons & {"jazz", "smoky"}
    assert all(item["score"] > 0 for item in body["songs"])


def test_model_is_reused_until_the_data_changes(database) -> None:
    jazz = catalog("jazz", 4)
    ada = insert_user("ada")
    add_tag(jazz[0], "ada", "feeling", "smoky")
    service = RecommendationService(SongService())

    service.recommend(ada)
    service.recommend(ada)
    assert service.trainings == 1

    add_tag(jazz[1], "ada", "feeling", "smoky")
    service.recommend(ada)
    assert service.trainings == 2
