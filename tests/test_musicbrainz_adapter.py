"""MusicBrainzAdapter query shape. No network."""

from db.seed import phrase

from API.Adapters.musicbrainz import MusicBrainzAdapter


def test_search_title_uses_official_then_broader_without_artist() -> None:
    adapter = MusicBrainzAdapter()
    queries: list[str] = []

    def _get(_url: str, params: dict[str, str]) -> dict:
        queries.append(params["query"])
        if "status:official" in params["query"]:
            return {"recordings": []}
        return {"recordings": [{"id": "abc", "title": "Hey Jude"}]}

    adapter._get = _get
    try:
        found = adapter.search_title("Hey Jude")
        adapter.search("Hey Jude", "The Beatles")
    finally:
        adapter.close()

    assert found == [{"id": "abc", "title": "Hey Jude"}]
    assert queries[0] == f"recording:{phrase('Hey Jude')} AND status:official"
    assert "artist:" not in queries[0]
    assert queries[1] == f"recording:{phrase('Hey Jude')}"
    assert queries[2] == (
        f"recording:{phrase('Hey Jude')} AND artist:{phrase('The Beatles')} AND status:official"
    )
