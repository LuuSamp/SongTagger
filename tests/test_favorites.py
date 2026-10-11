"""Favorites contract. Likes are user_songs rows with action = 'like'."""

from __future__ import annotations

from db.manager import open_database

from tests.conftest import insert_song, insert_user


def test_list_favorites_is_newest_first_then_song_id(client) -> None:
    user_id = insert_user("ada")
    empty = client.get(f"/user/{user_id}/favorite")
    assert empty.status_code == 200
    assert empty.json() == {"songs": []}

    older = insert_song("Yesterday", "The Beatles")
    newer = insert_song("Hey Jude", "The Beatles")
    tied_low = insert_song("Low", "Tied Artist")
    tied_high = insert_song("High", "Tied Artist")
    for song_id in (older, newer, tied_low, tied_high):
        liked = client.put(f"/user/{user_id}/favorite/{song_id}", json={})
        assert liked.status_code == 200
        assert liked.json()["song_id"] == song_id
        assert isinstance(liked.json()["favorited_at"], str)

    _set_favorited_at(user_id, older, "2020-01-01 00:00:00")
    _set_favorited_at(user_id, newer, "2020-01-02 00:00:00")
    _set_favorited_at(user_id, tied_low, "2020-01-03 00:00:00")
    _set_favorited_at(user_id, tied_high, "2020-01-03 00:00:00")

    listed = client.get(f"/user/{user_id}/favorite")
    assert listed.status_code == 200
    songs = listed.json()["songs"]
    assert [song["song_id"] for song in songs] == [tied_high, tied_low, newer, older]
    assert songs[0]["title"] == "High"
    assert songs[0]["artist_credit"] == "Tied Artist"
    assert songs[0]["favorited_at"].startswith("2020-01-03")


def test_second_put_keeps_one_like_and_the_original_time(client) -> None:
    user_id = insert_user("ada")
    song_id = insert_song("Yesterday", "The Beatles")
    first = client.put(f"/user/{user_id}/favorite/{song_id}", json={})
    second = client.put(f"/user/{user_id}/favorite/{song_id}", json={})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()
    assert first.json()["title"] == "Yesterday"
    assert first.json()["artist_credit"] == "The Beatles"
    assert _actions(user_id, song_id) == ["like"]


def test_delete_removes_only_likes_and_a_second_delete_is_empty(client) -> None:
    user_id = insert_user("ada")
    song_id = insert_song("Yesterday", "The Beatles")
    kept = insert_song("Hey Jude", "The Beatles")
    client.put(f"/user/{user_id}/favorite/{song_id}", json={})
    client.put(f"/user/{user_id}/favorite/{kept}", json={})
    _insert_action(user_id, song_id, "listen")
    _insert_action(user_id, song_id, "save")

    deleted = client.delete(f"/user/{user_id}/favorite/{song_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert _actions(user_id, song_id) == ["listen", "save"]

    listed = client.get(f"/user/{user_id}/favorite")
    assert [song["song_id"] for song in listed.json()["songs"]] == [kept]

    again = client.delete(f"/user/{user_id}/favorite/{song_id}")
    assert again.status_code == 204
    assert again.content == b""
    assert _actions(user_id, song_id) == ["listen", "save"]


def test_listen_and_save_stay_off_the_list_and_other_users_are_absent(client) -> None:
    ada = insert_user("ada")
    grace = insert_user("grace")
    song_id = insert_song("Yesterday", "The Beatles")
    _insert_action(ada, song_id, "listen")
    _insert_action(ada, song_id, "save")
    grace_like = client.put(f"/user/{grace}/favorite/{song_id}", json={})
    assert grace_like.status_code == 200

    listed = client.get(f"/user/{ada}/favorite")
    assert listed.status_code == 200
    assert listed.json() == {"songs": []}
    assert _actions(ada, song_id) == ["listen", "save"]
    assert _actions(grace, song_id) == ["like"]


def test_catalog_user_is_rejected_on_every_favorite_route(client) -> None:
    catalog_id = _catalog_user_id()
    song_id = insert_song("Yesterday", "The Beatles")
    listed = client.get(f"/user/{catalog_id}/favorite")
    liked = client.put(f"/user/{catalog_id}/favorite/{song_id}", json={})
    deleted = client.delete(f"/user/{catalog_id}/favorite/{song_id}")
    for response in (listed, liked, deleted):
        assert response.status_code == 400
        assert response.json()["detail"] == "username catalog is not allowed"
    assert _actions(catalog_id, song_id) == []


def test_unknown_user_and_song_are_not_the_missing_route(client) -> None:
    user_id = insert_user("ada")
    song_id = insert_song("Yesterday", "The Beatles")

    missing_user = client.get("/user/999999/favorite")
    missing_user_put = client.put(f"/user/999999/favorite/{song_id}", json={})
    missing_user_delete = client.delete(f"/user/999999/favorite/{song_id}")
    for response in (missing_user, missing_user_put, missing_user_delete):
        assert response.status_code == 404
        assert response.json()["detail"] == "unknown user"

    missing_song = client.put(f"/user/{user_id}/favorite/999999", json={})
    missing_song_delete = client.delete(f"/user/{user_id}/favorite/999999")
    for response in (missing_song, missing_song_delete):
        assert response.status_code == 404
        assert response.json()["detail"] == "unknown song"


def test_non_integer_path_ids_are_unprocessable(client) -> None:
    user_id = insert_user("ada")
    song_id = insert_song("Yesterday", "The Beatles")
    responses = (
        client.get("/user/nope/favorite"),
        client.put(f"/user/nope/favorite/{song_id}", json={}),
        client.put(f"/user/{user_id}/favorite/nope", json={}),
        client.delete(f"/user/nope/favorite/{song_id}"),
        client.delete(f"/user/{user_id}/favorite/nope"),
    )
    for response in responses:
        assert response.status_code == 422
        assert isinstance(response.json()["detail"], str)


def _set_favorited_at(user_id: int, song_id: int, created_at: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE user_songs SET created_at = %s "
                "WHERE user_id = %s AND song_id = %s AND action = 'like'",
                (created_at, user_id, song_id),
            )
        connection.commit()
    finally:
        connection.close()


def _insert_action(user_id: int, song_id: int, action: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO user_songs (user_id, song_id, action) VALUES (%s, %s, %s)",
                (user_id, song_id, action),
            )
        connection.commit()
    finally:
        connection.close()


def _actions(user_id: int, song_id: int) -> list[str]:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT action FROM user_songs WHERE user_id = %s AND song_id = %s ORDER BY id",
                (user_id, song_id),
            )
            return [row["action"] for row in cursor.fetchall()]
    finally:
        connection.close()


def _catalog_user_id() -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", ("catalog",))
            return int(cursor.fetchone()["id"])
    finally:
        connection.close()
