from __future__ import annotations

from db.manager import open_database

from tests.conftest import add_tag, insert_song, insert_user


def age_everything(table: str, days: int) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE {table} SET created_at = NOW() - INTERVAL %s DAY",
                (days,),
            )
        connection.commit()
    finally:
        connection.close()


def age_song_tags(song_id: int, days: int) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE song_tags SET created_at = NOW() - INTERVAL %s DAY WHERE song_id = %s",
                (days, song_id),
            )
        connection.commit()
    finally:
        connection.close()


def playlist_with(client, user_id: int, song_ids: list[int]) -> int:
    playlist = client.post(f"/user/{user_id}/playlist", json={"name": "Mix"}).json()
    for song_id in song_ids:
        client.post(f"/user/{user_id}/playlist/{playlist['id']}/song", json={"song_id": song_id})
    return playlist["id"]


def trending_titles(body: dict) -> list[str]:
    return [item["song"]["title"] for item in body["trending"]]


def test_community_rejects_catalog_and_unknown_users(client) -> None:
    assert client.get("/users/catalog/community").status_code == 400
    assert client.get("/users/nobody/community").status_code == 404


def test_catalog_tags_and_single_people_do_not_trend(client) -> None:
    insert_user("ada")
    insert_user("bia")
    lonely = insert_song("Lonely", "Solo Artist")
    shared = insert_song("Shared", "Duo Artist")
    add_tag(lonely, "catalog", "genre", "jazz")
    add_tag(lonely, "ada", "feeling", "warm")
    add_tag(shared, "ada", "feeling", "warm")
    add_tag(shared, "bia", "feeling", "warm")

    body = client.get("/users/ada/community").json()

    assert trending_titles(body) == ["Shared"]
    item = body["trending"][0]
    assert item["people"] == 2
    assert item["taggers"] == 2
    assert item["consensus"] == [
        {"kind": "feeling", "name": "warm", "token": "warm", "people": 2}
    ]
    assert body["trending_window"] == "all_time"


def test_repeated_actions_from_one_person_count_once(client) -> None:
    ada = insert_user("ada")
    insert_user("bia")
    song = insert_song("Repeat", "Loop")
    add_tag(song, "ada", "feeling", "warm")
    add_tag(song, "ada", "feeling", "sunny")
    add_tag(song, "bia", "feeling", "warm")
    playlist = client.post(f"/user/{ada}/playlist", json={"name": "Again"}).json()
    for _ in range(3):
        client.post(f"/user/{ada}/playlist/{playlist['id']}/song", json={"song_id": song})

    item = client.get("/users/ada/community").json()["trending"][0]

    assert item["people"] == 2
    assert item["taggers"] == 2
    assert item["playlist_adds"] == 1


def test_recent_activity_outranks_old_activity_in_the_weekly_window(client) -> None:
    ada = insert_user("ada")
    bia = insert_user("bia")
    songs = [insert_song(f"Song {index}", f"Artist {index}") for index in range(5)]
    for song in songs:
        add_tag(song, "ada", "feeling", "warm")
        add_tag(song, "bia", "feeling", "warm")
    playlist_with(client, ada, [songs[0]])
    playlist_with(client, bia, [songs[0]])
    age_everything("playlist_songs", 20)
    age_song_tags(songs[0], 20)

    body = client.get("/users/ada/community").json()

    assert body["trending_window"] == "week"
    titles = trending_titles(body)
    assert titles[-1] == "Song 0"
    assert set(titles) == {f"Song {index}" for index in range(5)}


def test_at_most_two_songs_per_artist(client) -> None:
    insert_user("ada")
    insert_user("bia")
    for index in range(4):
        song = insert_song(f"Hit {index}", "Same Band")
        add_tag(song, "ada", "genre", "rock")
        add_tag(song, "bia", "genre", "rock")

    titles = trending_titles(client.get("/users/ada/community").json())

    assert len(titles) == 2


def test_rising_tags_prefer_growth_over_size(client) -> None:
    for name in ("ada", "bia", "caio"):
        insert_user(name)
    steady = [insert_song(f"Steady {index}", f"Steady Artist {index}") for index in range(3)]
    fresh = insert_song("Fresh", "New Artist")
    for song in steady:
        for name in ("ada", "bia", "caio"):
            add_tag(song, name, "genre", "rock")
    age_everything("song_tags", 14)
    for song in steady:
        for name in ("ada", "bia", "caio"):
            add_tag(song, name, "feeling", "steady")
    for name in ("ada", "bia", "caio"):
        add_tag(fresh, name, "feeling", "dreamy")
        add_tag(fresh, name, "instrument", "cello")

    body = client.get("/users/ada/community").json()

    assert body["tags_window"] == "week"
    tokens = [entry["tag"]["token"] for entry in body["rising_tags"]]
    assert "rock" not in tokens
    assert set(tokens) == {"steady", "dreamy", "cello"}
    assert all(entry["recent"] == 3 for entry in body["rising_tags"])


def test_rising_tags_fall_back_to_all_time_popularity(client) -> None:
    insert_user("ada")
    insert_user("bia")
    song = insert_song("Only", "Lone")
    add_tag(song, "ada", "feeling", "warm")
    add_tag(song, "bia", "feeling", "warm")

    body = client.get("/users/ada/community").json()

    assert body["tags_window"] == "all_time"
    assert body["rising_tags"][0]["tag"]["token"] == "warm"
    assert body["rising_tags"][0]["people"] == 2
