"""Catalog API contract. No network."""

from __future__ import annotations

from db.manager import open_database

from tests.conftest import FakeSource, add_tag, count_rows, insert_song, insert_user, tag_rows


def recording(mbid: str, title: str, artist: str, score: int) -> dict:
    return {
        "id": mbid,
        "title": title,
        "score": score,
        "disambiguation": "",
        "length": 180000,
        "artist-credit": [{"name": artist, "joinphrase": ""}],
        "releases": [
            {
                "status": "Official",
                "date": "2001-01-01",
                "release-group": {"primary-type": "Album", "secondary-types": []},
            }
        ],
        "genres": [{"name": "Rock"}],
    }


def test_local_hits_do_not_call_the_adapter(client, source: FakeSource) -> None:
    first = insert_song("Yesterday", "The Beatles")
    second = insert_song("YESTERDAY", "Paul McCartney")

    title_only = client.get("/songs", params={"title": "  yesterday "})
    assert title_only.status_code == 200
    body = title_only.json()
    assert body["imported"] is False
    assert [song["id"] for song in body["songs"]] == [first, second]
    assert "applied_by_me" not in title_only.text
    assert source.calls == []

    with_artist = client.get("/songs", params={"title": "Yesterday", "artist": "beatles"})
    assert with_artist.status_code == 200
    assert with_artist.json()["imported"] is False
    assert [song["id"] for song in with_artist.json()["songs"]] == [first]
    assert source.calls == []


def test_title_only_miss_imports_two_recordings(client, source: FakeSource) -> None:
    low = "11111111-1111-1111-1111-111111111111"
    mid = "22222222-2222-2222-2222-222222222222"
    high = "33333333-3333-3333-3333-333333333333"
    source.title_hits = [
        recording(low, "Quiet Title", "Low Artist", 10),
        recording(high, "Quiet Title", "High Artist", 100),
        recording(mid, "Quiet Title", "Mid Artist", 50),
    ]

    response = client.get("/songs", params={"title": "Quiet Title"})
    assert response.status_code == 200
    body = response.json()
    assert body["imported"] is True
    assert [song["mbid"] for song in body["songs"]] == [high, mid]
    assert [song["title"] for song in body["songs"]] == ["Quiet Title", "Quiet Title"]
    assert body["songs"][0]["sources"][0]["name"] == "musicbrainz"
    assert "applied_by_me" not in response.text
    assert [call[0] for call in source.calls] == ["search_title", "lookup", "lookup"]
    assert count_rows("songs") == 2


def test_title_only_failure_on_second_lookup_writes_nothing(client, source: FakeSource) -> None:
    first = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    second = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    source.title_hits = [
        recording(first, "Quiet Title", "High Artist", 100),
        recording(second, "Quiet Title", "Low Artist", 10),
    ]
    source.fail_lookup_ids.add(second)

    response = client.get("/songs", params={"title": "Quiet Title"})
    assert response.status_code == 502
    assert isinstance(response.json()["detail"], str)
    assert count_rows("songs") == 0
    assert count_rows("song_tags") == 0
    assert count_rows("song_sources") == 0


def test_artist_and_title_miss_imports_one(client, source: FakeSource) -> None:
    other = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    match = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    source.artist_hits = [
        recording(other, "Quiet Title", "Other Person", 100),
        recording(match, "Quiet Title", "Some Artist", 10),
    ]

    response = client.get("/songs", params={"title": "Quiet Title", "artist": "Some Artist"})
    assert response.status_code == 200
    body = response.json()
    assert body["imported"] is True
    assert [song["mbid"] for song in body["songs"]] == [match]
    assert source.calls[0] == ("search", "Quiet Title", "Some Artist")
    assert [call[0] for call in source.calls].count("search_title") == 0
    assert [call[0] for call in source.calls].count("lookup") == 1
    assert count_rows("songs") == 1


def test_tag_query_matches_catalog_tag_and_attached_tag(client, source: FakeSource) -> None:
    insert_user("ada")
    both = insert_song("Hey Jude", "The Beatles")
    catalog_only = insert_song("Let It Be", "The Beatles")
    add_tag(both, "catalog", "artist", "The Beatles")
    add_tag(catalog_only, "catalog", "artist", "The Beatles")
    before = tag_rows("catalog")

    attached = client.put(
        f"/users/ada/songs/{both}/tags",
        json={"kind": "feeling", "token": "rock-and-roll"},
    )
    assert attached.status_code == 200
    assert attached.json() == {
        "kind": "feeling",
        "name": "rock and roll",
        "token": "rock-and-roll",
        "applied_by_me": True,
    }
    assert tag_rows("catalog") == before
    again = client.put(
        f"/users/ada/songs/{both}/tags",
        json={"kind": "feeling", "token": "rock-and-roll"},
    )
    assert again.status_code == 200
    assert again.json() == attached.json()

    found = client.get("/users/ada/songs", params={"q": "the-beatles rock-and-roll"})
    assert found.status_code == 200
    songs = found.json()["songs"]
    assert [song["id"] for song in songs] == [both]
    assert songs[0]["tags"] == [
        {"kind": "artist", "name": "The Beatles", "token": "the-beatles", "applied_by_me": False},
        {"kind": "feeling", "name": "rock and roll", "token": "rock-and-roll", "applied_by_me": True},
    ]
    one = client.get(f"/users/ada/songs/{both}")
    assert one.status_code == 200
    assert one.json() == songs[0]
    repeated = client.get("/users/ada/songs", params={"q": "the-beatles the-beatles rock-and-roll"})
    assert [song["id"] for song in repeated.json()["songs"]] == [both]
    assert source.calls == []


def test_remove_deletes_only_the_caller_row(client) -> None:
    insert_user("ada")
    song_id = insert_song("Hey Jude", "The Beatles")
    add_tag(song_id, "catalog", "feeling", "Rock and Roll")
    attached = client.put(
        f"/users/ada/songs/{song_id}/tags",
        json={"kind": "feeling", "token": "rock-and-roll"},
    )
    assert attached.status_code == 200
    assert attached.json()["name"] == "Rock and Roll"
    catalog_before = tag_rows("catalog")

    removed = client.request(
        "DELETE",
        f"/users/ada/songs/{song_id}/tags",
        json={"kind": "feeling", "token": "rock-and-roll"},
    )
    assert removed.status_code == 204
    assert removed.content == b""
    assert tag_rows("catalog") == catalog_before
    assert tag_rows("ada") == []
    again = client.request(
        "DELETE",
        f"/users/ada/songs/{song_id}/tags",
        json={"kind": "feeling", "token": "rock-and-roll"},
    )
    assert again.status_code == 204
    assert tag_rows("catalog") == catalog_before


def test_catalog_unknown_user_and_empty_query(client) -> None:
    insert_user("ada")
    song_id = insert_song("Hey Jude", "The Beatles")
    body = {"kind": "feeling", "token": "rock-and-roll"}

    catalog_list = client.get("/users/catalog/songs", params={"q": "rock"})
    catalog_one = client.get(f"/users/catalog/songs/{song_id}")
    catalog_put = client.put(f"/users/catalog/songs/{song_id}/tags", json=body)
    catalog_delete = client.request("DELETE", f"/users/catalog/songs/{song_id}/tags", json=body)
    assert catalog_list.status_code == 400
    assert catalog_one.status_code == 400
    assert catalog_put.status_code == 400
    assert catalog_delete.status_code == 400
    for response in (catalog_list, catalog_one, catalog_put, catalog_delete):
        assert isinstance(response.json()["detail"], str)

    missing = client.get("/users/nobody/songs", params={"q": "rock"})
    assert missing.status_code == 404
    assert isinstance(missing.json()["detail"], str)
    unknown_song = client.get("/users/ada/songs/999999")
    assert unknown_song.status_code == 404

    empty = client.get("/users/ada/songs", params={"q": "   "})
    assert empty.status_code == 400
    assert isinstance(empty.json()["detail"], str)
    missing_title = client.get("/songs")
    assert missing_title.status_code == 400
    assert isinstance(missing_title.json()["detail"], str)

    not_integer = client.get("/users/ada/songs/nope")
    assert not_integer.status_code == 422
    detail = not_integer.json()["detail"]
    assert isinstance(detail, str)


def test_lookup_user_returns_id(client) -> None:
    user_id = insert_user("ada")
    found = client.get("/users/ada")
    assert found.status_code == 200
    assert found.json() == {"id": user_id, "username": "ada"}

    catalog = client.get("/users/catalog")
    assert catalog.status_code == 400
    assert isinstance(catalog.json()["detail"], str)

    missing = client.get("/users/nobody")
    assert missing.status_code == 404
    assert isinstance(missing.json()["detail"], str)


def test_create_playlist_returns_empty(client) -> None:
    user_id = insert_user("ada")
    created = client.post(f"/user/{user_id}/playlist", json={"name": "  Night Drive  "})
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Night Drive"
    assert body["songs"] == []
    assert isinstance(body["id"], int)
    assert isinstance(body["created_at"], str)


def test_list_playlists_is_only_that_user(client) -> None:
    ada = insert_user("ada")
    grace = insert_user("grace")
    first = client.post(f"/user/{ada}/playlist", json={"name": "Early"})
    second = client.post(f"/user/{ada}/playlist", json={"name": "Late"})
    client.post(f"/user/{grace}/playlist", json={"name": "Grace"})

    listed = client.get(f"/user/{ada}/playlist")
    assert listed.status_code == 200
    playlists = listed.json()["playlists"]
    assert [item["name"] for item in playlists] == ["Early", "Late"]
    assert [item["id"] for item in playlists] == [first.json()["id"], second.json()["id"]]
    assert "songs" not in playlists[0]
    assert isinstance(playlists[0]["created_at"], str)


def test_playlist_insert_append_duplicate_and_gap(client) -> None:
    user_id = insert_user("ada")
    first = insert_song("Yesterday", "The Beatles")
    second = insert_song("Hey Jude", "The Beatles")
    playlist_id = client.post(f"/user/{user_id}/playlist", json={"name": "Set"}).json()["id"]
    base = f"/user/{user_id}/playlist/{playlist_id}"

    appended = client.post(f"{base}/song", json={"song_id": first})
    assert appended.status_code == 200
    assert appended.json()["songs"][0]["position"] == 1
    assert appended.json()["songs"][0]["song_id"] == first
    assert appended.json()["songs"][0]["title"] == "Yesterday"
    assert appended.json()["songs"][0]["artist_credit"] == "The Beatles"
    again = client.post(f"{base}/song", json={"song_id": first})
    inserted = client.post(f"{base}/song", json={"song_id": second, "position": 1})
    songs = inserted.json()["songs"]
    assert [song["song_id"] for song in songs] == [second, first, first]
    assert [song["position"] for song in songs] == [1, 2, 3]
    assert len({song["membership_id"] for song in songs}) == 3
    assert again.json()["songs"][1]["membership_id"] != appended.json()["songs"][0]["membership_id"]

    removed = client.delete(f"{base}/song/{songs[1]['membership_id']}")
    assert removed.status_code == 204
    assert removed.content == b""
    left = client.get(base)
    assert left.status_code == 200
    assert [(song["song_id"], song["position"]) for song in left.json()["songs"]] == [
        (second, 1),
        (first, 2),
    ]


def test_reorder_rewrites_positions_and_rename_keeps_them(client) -> None:
    user_id = insert_user("ada")
    first = insert_song("Yesterday", "The Beatles")
    second = insert_song("Hey Jude", "The Beatles")
    playlist_id = client.post(f"/user/{user_id}/playlist", json={"name": "Set"}).json()["id"]
    base = f"/user/{user_id}/playlist/{playlist_id}"
    client.post(f"{base}/song", json={"song_id": first})
    client.post(f"{base}/song", json={"song_id": second})
    before = client.get(base).json()["songs"]
    ids = [song["membership_id"] for song in before]

    reordered = client.put(f"{base}/order", json={"membership_ids": [ids[1], ids[0]]})
    assert reordered.status_code == 200
    assert [(song["membership_id"], song["position"]) for song in reordered.json()["songs"]] == [
        (ids[1], 1),
        (ids[0], 2),
    ]

    renamed = client.patch(base, json={"name": "  Later  "})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Later"
    assert [(song["membership_id"], song["position"]) for song in renamed.json()["songs"]] == [
        (ids[1], 1),
        (ids[0], 2),
    ]


def test_delete_playlist_removes_memberships_and_keeps_the_song(client) -> None:
    user_id = insert_user("ada")
    song_id = insert_song("Yesterday", "The Beatles")
    songs_before = count_rows("songs")
    playlist_id = client.post(f"/user/{user_id}/playlist", json={"name": "Set"}).json()["id"]
    base = f"/user/{user_id}/playlist/{playlist_id}"
    client.post(f"{base}/song", json={"song_id": song_id})

    deleted = client.delete(base)
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert client.get(base).status_code == 404
    assert count_rows("songs") == songs_before
    assert count_rows("playlists") == 0
    assert count_rows("playlist_songs") == 0


def test_playlist_bad_requests(client) -> None:
    user_id = insert_user("ada")
    song_id = insert_song("Yesterday", "The Beatles")
    catalog_id = _catalog_user_id()
    playlist_id = client.post(f"/user/{user_id}/playlist", json={"name": "Set"}).json()["id"]
    base = f"/user/{user_id}/playlist/{playlist_id}"
    added = client.post(f"{base}/song", json={"song_id": song_id})
    membership_id = added.json()["songs"][0]["membership_id"]

    empty = client.post(f"/user/{user_id}/playlist", json={"name": "   "})
    too_long = client.post(f"/user/{user_id}/playlist", json={"name": "a" * 256})
    catalog = client.post(f"/user/{catalog_id}/playlist", json={"name": "Catalog"})
    low = client.post(f"{base}/song", json={"song_id": song_id, "position": 0})
    high = client.post(f"{base}/song", json={"song_id": song_id, "position": 3})
    duplicate = client.put(f"{base}/order", json={"membership_ids": [membership_id, membership_id]})
    extra = client.put(f"{base}/order", json={"membership_ids": [membership_id, membership_id + 1]})
    for response in (empty, too_long, catalog, low, high, duplicate, extra):
        assert response.status_code == 400
        assert isinstance(response.json()["detail"], str)

    accepted = client.post(f"/user/{user_id}/playlist", json={"name": "a" * 255})
    assert accepted.status_code == 201
    assert accepted.json()["name"] == "a" * 255


def test_playlist_not_found(client) -> None:
    ada = insert_user("ada")
    grace = insert_user("grace")
    song_id = insert_song("Yesterday", "The Beatles")
    ada_id = client.post(f"/user/{ada}/playlist", json={"name": "Ada"}).json()["id"]
    grace_id = client.post(f"/user/{grace}/playlist", json={"name": "Grace"}).json()["id"]
    added = client.post(f"/user/{ada}/playlist/{ada_id}/song", json={"song_id": song_id})
    membership_id = added.json()["songs"][0]["membership_id"]

    missing_user = client.get("/user/999999/playlist")
    other = client.get(f"/user/{grace}/playlist/{ada_id}")
    unknown_song = client.post(
        f"/user/{ada}/playlist/{ada_id}/song",
        json={"song_id": 999999},
    )
    other_membership = client.delete(f"/user/{grace}/playlist/{grace_id}/song/{membership_id}")
    for response in (missing_user, other, unknown_song, other_membership):
        assert response.status_code == 404
        assert isinstance(response.json()["detail"], str)

    still_there = client.get(f"/user/{ada}/playlist/{ada_id}")
    assert [song["membership_id"] for song in still_there.json()["songs"]] == [membership_id]


def _catalog_user_id() -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", ("catalog",))
            return int(cursor.fetchone()["id"])
    finally:
        connection.close()
