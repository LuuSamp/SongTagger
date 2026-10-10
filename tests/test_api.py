"""Catalog API contract. No network."""

from __future__ import annotations

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
