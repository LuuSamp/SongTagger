# Song Tagging project

## The Idea

Page with a music database in which each user can add tags to songs. Tags can refer to: artist, genre, feeling, instrument. 

[TO-DO: Apply 5W2H]

### How the application works

- User logs in;
- User can search songs by tags;
- User can attribute tags to songs;
- Songs that have been attributed similar tag multiple times should appear when this tag is searched for;
- Songs that user has attributed certain tag to needs to have that tag coined for this user’s search;
- User can create playlist;
- User can favorite songs;
- User will have songs recommended to them;
- User will have songs recommended to their playlists.

### Plus-es

- User can import a playlist from Spotify (Spotify API);
- User can export a playlist to Spotify (Spotify API);
- User can have recommended design for their page based on their preferences (design choice, low priority).

## References

- Steam store page. Games are cataloged similarly.

## Tools

### Designing

- Figma

### Developing

- SQL database (sqlite, mongoDB… choose)
- Python API;
- React UI;
- Polars for processing?

### Presentation

- OBS for video recording
- Canva for presentation slides
- [Video editing software TBD]

# API

Status: implemented. This document is the contract for the first API slice.

The package is `SongTagger/API`, with `Controllers`, `Models`, `Services`, and `Adapters`. `SearchService` calls a `RecordingSource`, and only `MusicBrainzAdapter` is implemented. Start it with `python -m API` from the SongTagger root. It binds `127.0.0.1:8001`.

## Boundary

A new local FastAPI application, separate from `tester`. It does not mount `tester` routes, and `tester` stays as it is.

The app reads and writes the existing MariaDB catalog through `db.manager.open_database` and the seed helpers in `db/seed.py`: `fold`, `display_tag`, `normalize_tag`, `phrase`, `choose_recording`, `upsert_recording`, and `MusicBrainzClient`. It adds no tables and no columns. It does not read or write `db/seed_cache.json`.

Callers on user routes must already have a `users` row. This API does not insert users. The username `catalog` is seed data and is rejected on every user route.

This slice is song lookup, tag search, reading one song, attaching a tag, and removing a tag. Login, `user_songs`, playlists, and recommendations stay out of this slice. There is no pagination: a successful list returns every match.

A tag is visible on a song when any user has a `song_tags` row for that song and tag, including the catalog user. One tag appears once on a song. Attach and remove change only the caller’s `song_tags` rows, and only for kind `artist`, `genre`, `feeling`, or `instrument`. They leave the catalog user’s rows unchanged. Import may still write catalog artist and genre tags through `upsert_recording`.

## Tag rules

`q` is whitespace-separated names, AND only. Hyphen-minus and whitespace are the same separator, so `the-beatles` matches a tag stored as `The Beatles`. A name matches in any kind. The match is the exact tag key, not a substring. The tag key is `normalize_tag` after hyphen-minus characters become spaces. Repeated keys count once. A token whose key is empty is `400`.

A song’s token is `fold(name)` with spaces rewritten as hyphens. A new tag is stored as words with spaces, using `display_tag` and `normalize_tag` after hyphens become spaces, cut at 255 characters. If that kind and tag key already exist, keep the existing display name (the row with the smallest `tags.id` when several share the key).

## Endpoints

Song fields: `id`, `title`, `artist_credit`, `duration_ms`, `mbid`, `isrc`, `disambiguation`, `sources` (`name`, `external_id`, `url`), and `tags` (`kind`, `name`, `token`). User routes add `applied_by_me` on each tag. Public songs omit it. Songs are ordered by `id`. Tags are ordered by kind (`artist`, `genre`, `feeling`, `instrument`), then token, then tag id. Sources are ordered by name.

- `GET /songs` with `title` (required) and `artist` (optional). The response is `songs` plus `imported`. Tags are the public list. Local hits never call MusicBrainz, and `imported` is false. Title only lists every catalog song with that folded title. Title and artist require the folded artist to be a literal substring of the folded `artist_credit`. Title only and nothing local: rank MusicBrainz hits with `choose_recording`’s ordering, omitting the artist step, take the first two, look up and upsert both in one transaction, and set `imported` true. Title plus artist and nothing local: import the one recording `choose_recording` selects. MusicBrainz has nothing eligible: `200`, empty `songs`, `imported` false. A MusicBrainz failure rolls back and returns `502`.
- `GET /users/{username}/songs` with `q` required and at least one token. The response is `songs` with full tags and `applied_by_me`. This route does not call MusicBrainz.
- `GET /users/{username}/songs/{song_id}` returns one song, the same shape as a search hit.
- `PUT /users/{username}/songs/{song_id}/tags` with `kind` and `token` creates the tag when needed, adds the caller’s row, and returns that tag with `applied_by_me` true. Repeating the call returns the same tag. `200`.
- `DELETE /users/{username}/songs/{song_id}/tags` with the same body deletes the caller’s row only. `204` when the user and song exist, including when that row was already absent.

## Errors

Error bodies are a JSON object with one string field, `detail`.

- `400`: missing title, empty `q`, empty token, bad kind, or username `catalog`
- `404`: unknown username or song id
- `422`: a `song_id` that is not an integer
- `502`: MusicBrainz failure during an import, with nothing left written

## Tests

Tests use a catalog database and a fake MusicBrainz client. They make no network calls.

- Local hits do not call MusicBrainz.
- A title-only miss imports two recordings, and a failure on the second writes nothing.
- An artist-and-title miss imports one.
- `the-beatles rock-and-roll` matches both names, including a catalog tag and a tag this caller just attached.
- Attach does not change the catalog user’s row.
- Remove deletes only the caller’s row.
- `catalog`, an unknown user, and an empty `q` return the codes above.

## Out of this slice

Login, creating users, `user_songs`, playlists, recommendations, and pagination.

---

## Post-completion log

### What was done

Built the local catalog API in `SongTagger/API`: public song search with MusicBrainz import, user tag search, reading one song, attaching a tag, and removing only the caller's tag row.

### Outcome / delivery

- Package `SongTagger/API` with `Controllers`, `Models`, `Services`, and `Adapters`. `UI/.gitkeep` marks the folder split. `requirements.txt` lists fastapi, uvicorn, pymysql, httpx, and pytest.
- `python -m API` from the SongTagger root binds `127.0.0.1:8001`.
- `SearchService` calls a `RecordingSource`. Only `MusicBrainzAdapter` is implemented. `db/seed.py` is unchanged.
- Pytest covers the contract on a throwaway MariaDB database and a fake source, with no network. 8 passed.
- Local `GET /songs?title=Yesterday` against the catalog returned 200, `imported` false, and the existing Yesterday row.

### Issues found

None

### Links

- API