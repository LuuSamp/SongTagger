# SongTagger UI: implementation record and remaining work

This document covers the React frontend in `UI/` as of 2026-10-10, third iteration. The Library is now backed by the real playlist API and the favorites API, and demo data lives in MariaDB. It describes what exists, what is still mocked, and what is left before production.

Status legend used throughout:

- **Verified**: implemented and exercised (unit tests and/or a scripted browser run against the stated data source).
- **Implemented, not verified**: code exists but was not run end to end.
- **Partial**: works, with a known gap.
- **Not implemented**: intentionally left out.

## How to run

### 1. Database (MariaDB)

On this development machine, MariaDB 13 is installed through winget. The terminal had no admin rights, so it is **not** a Windows service. Its data directory is `%LOCALAPPDATA%\SongTagger\mariadb`, and a local dev account `songtagger` / `songtagger` was created with full privileges, because the backend tests create temporary databases.

Start the server whenever the machine reboots:

```powershell
& "C:\Program Files\MariaDB 13.0\bin\mariadbd.exe" "--defaults-file=$env:LOCALAPPDATA\SongTagger\mariadb\my.ini" --console
```

Then, from the repo root, with `SONGTAGGING_DB_USER=songtagger` and `SONGTAGGING_DB_PASSWORD=songtagger` set:

```bash
python -m db.manager    # schema (safe to re-run; adds new tables)
python -m db.seed       # ~102 songs from MusicBrainz, about 2 minutes
python -m db.seed_demo  # demo users, tags and playlists (idempotent)
python -m API           # FastAPI on 127.0.0.1:8001
python -m pytest tests  # backend suite (16 tests passed here)
```

What `db/seed_demo.py` creates (also documented in `db/README.md`):

- **Users:** `ada` and `bia`. The API has no user creation endpoint, so the script uses `INSERT IGNORE`.
- **Tags:** feeling and instrument tags from each user on well-known seeded songs. Examples: Sampa gets warm, nostalgic and acoustic guitar; So What gets late night, contemplative and trumpet.
- **Playlists:** ada has "Noite" (5 songs) and "Brasil" (6); bia has "Guitarras" (4) and "Pista" (4). A playlist is skipped when that user already has one with the same name.

### 2. Frontend

```bash
cd UI
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. Scripts: `npm run typecheck`, `lint`, `test`, `build`, `format`, `format:check`.

| Variable | Default (`.env.example`) | Meaning |
|---|---|---|
| `VITE_DATA_SOURCE` | `http` | `http` uses the FastAPI backend for everything. `mock` uses the in-memory catalog; in that mode the Library shows "needs the SongTagger API". |
| `VITE_SONGTAGGER_USERNAME` | `ada` | The acting user. It must exist in `users` (the demo seed creates `ada` and `bia`). |
| `SONGTAGGER_API_URL` | `http://127.0.0.1:8001` | Target of the Vite dev proxy (`/api/*` → API, prefix stripped). The API has no CORS. |

---

## A. Architecture overview

Stack:
- Vite 5, React 18, TypeScript (strict, `noUncheckedIndexedAccess`), react-router-dom 6 (data router).
- CSS Modules plus global design tokens.
- ESLint 9, Prettier, Vitest.
- No UI library.

```
UI/src/
  main.tsx                 entry; loads theme/global.css
  app/                     App, router, RootLayout, AppProviders, LibraryProvider, contexts (useCatalog, useSession, useLibrary), routes
  theme/                   tokens.css (design tokens), global.css
  domain/                  API-mirroring types (types.ts, library.ts), pure helpers (tags, songs, playlist helpers), interests.ts
  services/http/           fetch wrapper (get/post/put/patch/delete) + ApiError from FastAPI {detail}
  services/catalog/        CatalogService, httpCatalog (real API), mockCatalog (in-memory), index (selection)
  services/library/        LibraryService, httpLibrary (real playlist API), unavailableLibrary (mock mode), index (selection)
  mocks/                   catalogFixtures.ts: the only place with mock songs
  config/                  session.ts (env config), vibes.ts (curated vibe → tag-query configuration)
  hooks/                   useAsync, useSong, useSongSearch, useSimilarSongs, useShelves, usePlaylistSongs, useTagMutations
  components/ui/           Button/ButtonLink, TagChip, SearchField, SegmentedControl, StateMessage, Skeleton, DemoNotice
  components/layout/       PageShell, AppNavBar, LandingHeader, BrandMark, OrganicBackdrop
  features/songs/          SongArtwork, SongCard, SongGrid, SourceLinks, SimilarSongs
  features/tags/           TagList, TagKindFilter, AddTagForm
  features/discovery/      VibeHero, VibeList, VibeArt, SearchPanel, SearchResults, SongShelf
  features/library/        AddToPlaylist (popover), PlaylistCard
  pages/                   LandingPage, DiscoverPage, CommunityPage, LibraryPage, SongPage, NotFoundPage
```

Dependency rules:
- Pages compose features, and features read data through hooks or `useLibrary()`.
- Only `services/catalog/httpCatalog.ts` and `services/library/httpLibrary.ts` know endpoint URLs.
- Only `services/catalog/mockCatalog.ts` and `mocks/` know about fake data.
- Implementation selection happens once per service (`services/*/index.ts`), based on `config/session.ts`.
- Nothing uses localStorage any more.

Routing (`app/router.tsx`, URLs built by `app/routes.ts`):

| Path | Page | Notes |
|---|---|---|
| `/` | `LandingPage` | "Hanging tags" hero (`features/discovery/HangingTags.tsx`): three showcase songs as luggage tags on a string, each with its cover, title and real community tags. Behind them, a canvas (`WindLayer.tsx`, physics in `windField.ts`) draws a faint wind and up to 5 music notes (3 on mobile). The wind gusts on the same 7s period as the tag sway, and the notes drift on it with drag, lift and flutter. The notes stay in the cards' middle band (36%–66% of the height), behind the tags, so they mostly show in the gaps and at the edges. Each note has its own wind gain, wind phase and eddy noise (an Ornstein–Uhlenbeck process), so notes never move in lockstep. It pauses off-screen or in a hidden tab, and is not rendered under reduced motion. Pitch, "Let's begin" and "Explore by vibe" sit on the right. `LandingHeader` shows only the logo. Legacy `/?tags=` and `/?title=` links redirect to `/discover`. |
| `/discover` | `DiscoverPage` | Search with `?tags=` or `?title=&artist=`. With no query it shows the "For you" shelves. The search is a tag composer (`features/discovery/SearchPanel.tsx`): "Tags · Title" underline tabs, then one large boxed field. The box has an accent border and ring on focus. A magnifier glyph inside it does a small "look around" motion every ~7s, pauses and turns accent while focused, and stays still under reduced motion. Clicking empty space in the box focuses the input. In Tags mode the active tags are removable chips inside the field; Enter or a comma adds tags, and Backspace on an empty input removes the last one. A "Try" / "Narrow it down" row suggests real vibe tokens. Title mode uses the same field with a "by artist" input. |
| `/community` | `CommunityPage` | Aggregate, anonymous community feed from `GET /users/{u}/community` (see "Community" below). It has "Trending this week" shelves with a reason line per song, "Rising tags" chips with people counts, and "In their words": the top tags for the leading songs, with the number of people behind each. |
| `/library` | `LibraryPage` | The default tab is Playlists. `?tab=favorites` shows the pending-feature notice, and `?playlist=<id>` selects a playlist. |
| `/songs/:songId` | `SongPage` | A non-numeric id or an API 404 shows "not in the catalog". |
| `*` | `NotFoundPage` | |

In-app pages use `AppNavBar`: the round logo, a search pill (tag search → `/discover?tags=`), DISCOVERY / COMMUNITY / LIBRARY with an active underline, and the avatar. The reference's bell is left out because there are no notifications.

Reference mapping:
- **Landing** keeps image 2's split layout, but the three gradient vibe panels were replaced with hanging luggage tags that echo the logo, because the user found the panels generic.
- **The app bar** follows the third reference.
- **The song page** follows image 1. The favorite and add-to-playlist actions sit in the top-right corner of the cover artwork as glass icon buttons (tokens `--glass-*` in `theme/tokens.css`). The heart works once the favorites API exists and shows a "coming soon" note until then. The playlist button carries a count badge and opens its panel right-aligned under the cover. The play button is not shown because playback is not implemented. The tags section (`features/tags/SongTagsPanel.tsx`) shows every category at once, grouped as Artist / Genre / Feeling / Instrument with a colour dot and a count:
  - The header has the title, a count and a round + button that opens the add form.
  - The chips are compact.
  - Each category shows up to 5 tags and a "+N" toggle for the rest. The user's own tags always stay visible (`visibleTags` in `domain/tags.ts`).

## B. Data flow and integrations

Mirrored contracts:
- `domain/types.ts` mirrors `Source`, `Tag`, `UserTag`, `Song`, `UserSong`, `SongSearch`, `UserSongList` and `TagWrite`.
- `domain/library.ts` mirrors `User` (as `LibraryUser`), `PlaylistSummary`, `Playlist`, `PlaylistSong` and `PlaylistList` from `API/Models/schemas.py`.

### Catalog

| UI use | Method | Endpoint | Mock | HTTP |
|---|---|---|---|---|
| Discovery tag search, shelves, vibe links, app-bar search | `searchByTags` | `GET /users/{u}/songs?q=` | Verified | Verified ("9 songs for jazz", "late-night" returns the seeded songs) |
| Discovery title search | `searchByTitle` | `GET /songs?title=&artist=` | Verified | Verified (`Yesterday` → 1 song) |
| Song page | `getSong` | `GET /users/{u}/songs/{id}` | Verified | Verified (plus a 404 for an unknown id) |
| Add tag | `addTag` | `PUT /users/{u}/songs/{id}/tags` | Verified | Verified (the "Garoa Fina" tag is stored with its capitalization) |
| Remove own tag | `removeTag` | `DELETE /users/{u}/songs/{id}/tags` | Verified | Verified |
| Similar songs | `searchByTags`, once per token | same | Verified | Verified |

Tag edits (`hooks/useTagMutations.ts`):
- **Add** is optimistic. The request sends the typed text with spaces turned into hyphens and the original capitalization kept (e.g. `Late-Night`), so the API stores the display name the user typed. Before this iteration the token was lowercased first, which stored names like "paulistano"; the mock had hidden that.
- **Remove** reloads the song after DELETE, because another user's application may keep the tag visible.

### Library (playlists, real API)

| UI use | Method (`LibraryService`) | Endpoint | Status |
|---|---|---|---|
| Resolve the acting user's numeric id (cached, retried after a failure) | `resolveUser` | `GET /users/{username}` | Verified |
| Load the Library | `listPlaylists` + `getPlaylist` for each | `GET /user/{id}/playlist`, `GET /user/{id}/playlist/{pid}` | Verified |
| Create (Library page or song-page popover) | `createPlaylist` | `POST /user/{id}/playlist` | Verified |
| Rename | `renamePlaylist` | `PATCH /user/{id}/playlist/{pid}` | Verified |
| Delete (with inline confirmation) | `deletePlaylist` | `DELETE /user/{id}/playlist/{pid}` | Verified |
| Add a song (popover checkbox; "Create" also adds) | `addSong` | `POST /user/{id}/playlist/{pid}/song` | Verified |
| Remove a song (detail row, or popover uncheck = first membership) | `removeSong` | `DELETE /user/{id}/playlist/{pid}/song/{membership_id}`, then `GET` the playlist again | Verified |
| Reorder: drag a song by its grip handle (mouse, pen or touch), or focus the handle and press Arrow Up/Down | `reorder` | `PUT /user/{id}/playlist/{pid}/order` with the full membership list | Verified (mouse drag and keyboard; touch not exercised) |

Reordering (`features/library/PlaylistTrackList.tsx`) works like this:
- **Drag:** `hooks/useSortableDrag.ts` (pointer events, no library) moves the dragged row with the pointer and slides the rows in between out of the way. It needs 4px of movement before a drag starts, cancels on Escape, auto-scrolls near the viewport edges, and is disabled while a library request is pending.
- **Animation:** `hooks/useFlipList.ts` animates every order change with FLIP: drops, keyboard moves, and a rollback after a failed save. The global reduced-motion rule shortens it.
- **Saving:** `reorderSongs` in the provider is optimistic. It applies the new order at once and restores the previous one if the API call fails.
- **Accessibility:** a polite live region announces "Moved X to position N".

`app/LibraryProvider.tsx` holds `status` (`loading | ready | unavailable | error`), the loaded `Playlist[]`, a shared `pending` flag and `actionError`. Every mutation updates state from the server response, or from a refetch after a 204. Popover checkboxes flip immediately while the request runs and settle on the server state afterwards.

### Discovery "For you"

1. `usePlaylistSongs` fetches full songs (with tags) for up to 12 distinct songs across the user's playlists. It needs `GET /users/{u}/songs/{id}` per song, because `PlaylistSong` has no tags.
2. `topInterests` ranks those songs' tags: tags shared by several songs come first, then it alternates between songs (genre > feeling > instrument > artist).
3. `useShelves` runs one tag search per interest and excludes songs already in playlists. The page shows the first 3 non-empty shelves.
4. When there are no playlist songs, it shows the three featured vibes.

Verified with ada's seeded playlists: "Because you like Jazz / Latin / Pop".

## C. Mocks, placeholders and assumptions

| What | Where | Why | Behaviour | How to replace |
|---|---|---|---|---|
| Mock catalog (20 songs) and mock catalog service | `UI/src/mocks/catalogFixtures.ts`, `services/catalog/mockCatalog.ts` | Lets the UI run without MariaDB | Interactive, in memory, reset on reload. Selected only with `VITE_DATA_SOURCE=mock`. | Already optional. Delete both files and their test if the mock mode is no longer wanted. |
| Library in mock mode | `services/library/unavailableLibrary.ts` | Playlists exist only in the API, and no fake persistence is allowed | Every call rejects with `LibraryUnavailableError`. The Library page and the "+ Playlist" popover show "needs the SongTagger API". | Nothing to replace. It is an explicit state, not a mock. |
| "Demo data" banner | `components/ui/DemoNotice.tsx` | Makes mock mode obvious | Shown only in mock mode | n/a |
| Acting user from env (`ada`) | `config/session.ts`, `SessionContext` | No login | Static | Replace with authenticated user (see D). |
| Brand icons for sources | `features/songs/SourceIcon.tsx`, `features/songs/sourceBrands.ts` | Recognisable links | Brand SVG paths and colours from `simple-icons` (CC0, pinned `16.32.0`; only five icons are bundled). Discogs' near-black brand colour is drawn with the ink token for contrast. Unknown sources use a generic link glyph. The icons only link to each service. | Add a mapping in `sourceBrands.ts` for any new source. |
| Generated artwork | `features/songs/SongArtwork.tsx` | No cover art in the API/DB | Deterministic per song. Playlist songs have no tags, so their artwork uses a hashed palette. | Add cover URLs; keep generated art as fallback. |
| Landing showcase songs | `config/showcase.ts` | Editorial config for the landing hero | Static. Every title and tag was checked against the seeded database: each link returns at least 1 song. | Keep, or feed from a featured-songs endpoint later. |
| Vibe collections | `config/vibes.ts` | Editorial config; each vibe is a real tag query | Static | Checked against the seeded DB: every main query (dream-pop, jazz, electronic, mpb, soul, rock) and chip has songs. The chips `modal-jazz`, `hard-bop`, `tropicalia`, `groovy` and `synth-pop` were replaced because they returned nothing or cannot be searched (see D). |
| Similar songs and Discovery interests | `hooks/useSimilarSongs.ts`, `domain/interests.ts`, `hooks/usePlaylistSongs.ts` | No recommendations endpoint | Real queries, client-side ranking | Replace with a recommendations endpoint. |
| Demo database content | `db/seed_demo.py` | The user asked for test data | Idempotent script | Keep for local development. Never run it against production. |
| Community page | `pages/CommunityPage.tsx` | Placeholder requested | Static "Coming soon" | Implement once activity/counts endpoints exist. |

## D. Remaining implementation work and known issues

### Favorites
The song-page heart and the Library Favorites tab use this contract. Likes are `user_songs` rows with `action = 'like'`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/user/{user_id}/favorite` | none | `{ "songs": FavoriteSong[] }`, newest first |
| PUT | `/user/{user_id}/favorite/{song_id}` | none (the UI sends `{}`) | 200 `FavoriteSong`; must be idempotent |
| DELETE | `/user/{user_id}/favorite/{song_id}` | none | 204; must be idempotent |

- **`FavoriteSong`:** `{ song_id: int, title: str, artist_credit: str, favorited_at: datetime }`. Mirrored in `UI/src/domain/library.ts`.
- **Errors:** `{detail}`, with 404 `"unknown user"` / `"unknown song"` and 400 for `catalog`, as in the playlist routes.

**How the UI detects a missing route** (`services/library/httpLibrary.ts`): a favorites call that answers with FastAPI's route-missing 404 (`{"detail": "Not Found"}`) raises `FavoritesUnsupportedError` and the favorites status becomes `unsupported`. Any other error is shown as a real error. With the routes in place, that 404 no longer happens on page load.

**What the site does:**
- The heart is an `aria-pressed` toggle. It updates on screen immediately, with a short pop animation, and rolls back with an inline error if the API fails (`app/useFavoritesState.ts`).
- The Library Favorites tab lists favorites with `SongGrid`, with an empty state when there are none.
- Discovery's "For you" samples favorites first, then playlist songs, and excludes them from the shelves.

**Status:**
- Frontend: implemented. No frontend change was required for the routes.
- Backend: implemented. `FavoriteService` reads and writes only `action = 'like'` on the existing `user_songs` table.
- Verified: `python -m pytest tests` from the SongTagger root passed (102 tests). Against the local API with `VITE_DATA_SOURCE=http` and acting user `user`, the heart on Bohemian Rhapsody toggled on, Library → Favorites listed that song, and unfavoriting returned the empty state.

### API gaps and inconsistencies found while integrating
1. **Mixed user addressing.** Catalog routes use `/users/{username}`, while playlist routes use `/user/{user_id}` (singular, numeric). The frontend has to call `GET /users/{username}` first and cache the id. Unifying the routes would remove that round trip.
2. **Playlist summaries have no song count.** The Library therefore calls `GET` for every playlist on load (N+1 requests). Adding `song_count` (and maybe the first 4 song ids for the mosaic) to `PlaylistSummary` would fix it.
3. **`PlaylistSong` has no tags, sources or duration.** As a result:
   - Playlist artwork uses a fallback palette.
   - Discovery fetches up to 12 songs one by one to learn the user's tastes.
   - Embedding the tags, or offering a batch song endpoint, would help.
4. **Hyphenated tag names cannot be searched.** Search turns `-` into a space, so a stored genre named `synth-pop` (normalized `synth-pop`) is never matched by the query `synth-pop` (which becomes `synth pop`). It affects every MusicBrainz genre containing a hyphen (synth-pop, hip-hop variants, etc.). The fix belongs in `API/Services/tags.py` and `db/seed.py`: normalize hyphens the same way at write and search time.
5. **First display name wins.** A tag keeps the display name it was created with. Once someone creates `paulistano` in lowercase, later "Paulistano" requests keep the lowercase name.
6. **No user creation or auth.** Users exist only through SQL or the demo seed. `VITE_SONGTAGGER_USERNAME` decides who is acting.
7. **No CORS.** The UI depends on the Vite proxy. Production needs a reverse proxy or `CORSMiddleware`.
8. **No tag counts, listing or autocomplete.** This blocks the popularity bars and tag suggestions.
9. **Playback and recommendations** are not implemented. Community is a placeholder.

### Frontend known issues
- **Playlist duplicates.** The API allows duplicate songs in a playlist. The detail view shows each row, but unchecking a song in the popover removes only its first membership, so the song stays checked while another copy remains.
- **No focus trap.** The playlist popover closes on Escape or an outside click.
- **Drag-and-drop limits.** One song at a time (no multi-select). Auto-scroll happens only near the top and bottom of the window. Touch dragging uses the same pointer code but was not tested on a real device.
- **Shared pending state.** Library mutations share one `pending` flag, so one slow request briefly disables the other library controls.
- **StrictMode double fetches.** In development, StrictMode fetches twice (harmless). There is no `AbortController` cancellation.
- **Local MariaDB is not a Windows service.** It must be started manually after a reboot (command above). Run the MSI installer as administrator if a service is wanted.
- **Accessibility.** Basics are in place (labels, focus rings, `aria-*`, reduced motion). No axe or Lighthouse audit has been run.
- **Tests.** There are 16 Vitest unit tests: tag normalization, the mock catalog, playlist helpers, interests, and the `httpLibrary` request mapping. Browser checks were throwaway Playwright scripts, not a committed E2E suite.

## E. Integration roadmap (priority order)

1. **Favorites API** (`user_songs` like) is done. The heart and Library Favorites tab already call it. Next is the rest of this list.
2. **Fix hyphenated tag search** in the API and seed normalization.
3. **Unify user addressing** and add `song_count` (and preview song ids) to playlist summaries.
4. **Include tags in `PlaylistSong`** or add a batch song endpoint, then simplify `usePlaylistSongs`.
5. **Auth and user creation**, replacing the env username in `SessionContext` and wiring the avatar in `AppNavBar`.
6. **CORS or a production reverse proxy**, plus a configurable `apiBaseUrl`.
7. **Tag counts and autocomplete**, for the popularity bars from reference 1 and tag suggestions.
8. **Community page**, built on community-wide activity and counts.
9. **Recommendations endpoint** to replace client-side similar-songs and interests ranking.
10. **Committed E2E tests** (Playwright) for the flows below against a seeded test database, plus an axe audit.
11. **Robustness:** request cancellation, per-action pending state, and friendlier 5xx messages.

### Flows verified against the real API (MariaDB + `python -m API` + `VITE_DATA_SOURCE=http`, 1440 px and 390 px)
- **Library list:** shows ada's seeded playlists. The Favorites tab shows the pending-feature notice.
- **Drag and drop:** dragging Giant Steps from 5th to the top gives `Giant Steps, So What, …` in the DOM and in `GET /user/3/playlist/1`. A short drag moves a song past two rows, a click without movement changes nothing, and Arrow Up on a focused handle moves the song and keeps the focus. A mid-drag screenshot shows the lifted row and the shifted rows. The order was restored afterwards.
- **Playlist detail:** moving Summertime up reorders the playlist, renaming to "Noite Adentro" works, and both survive a reload. Both were reverted afterwards.
- **Song page popover:**
  - On Sampa, "+ Playlist" shows "Brasil" checked.
  - Creating "Teste E2E" adds Sampa.
  - Unchecking and re-checking works.
  - In the Library the song was then removed and the playlist deleted.
- **Discovery:** shows "Because you like Jazz / Latin / Pop" from the playlist songs. `?tags=jazz` → 9 songs, and the title search for "Yesterday" → 1 song.
- **Tagging:** adding "Garoa Fina" to Sampa stores it with that capitalization, and removing it deletes the row.
- **Unknown song:** `/songs/999999` shows the not-found state.
- **Health checks:** no console errors other than the expected 404, and no horizontal overflow on mobile.
- **Favorites, real API:**
  - On Bohemian Rhapsody, the heart toggles from "Add … to favorites" to pressed "Remove … from favorites".
  - Library → Favorites lists Bohemian Rhapsody / Queen.
  - Unfavoriting releases the heart, and the Favorites tab shows "No favorites yet".
- **Favorites, simulated contract** (Playwright `page.route`, test-only):
  - Favoriting Teardrop presses the heart, and the song appears in Library → Favorites.
  - Unfavoriting releases it.
  - A forced 500 on PUT rolls the heart back and shows "database is down".
- **Discovery search:**
  - Typing `jazz` + Enter gives `?tags=jazz` (9 songs, chip inside the field). Adding `late-night` narrows to 1 song, and Backspace removes the last chip.
  - The "Narrow it down" suggestion adds `dream-pop`, and Clear returns to the "For you" shelves.
  - In Title mode, reached with the Arrow-key tab switch, "Yesterday" finds 1 song.
  - There is no overflow at 390 px.
- **Song tags panel:** on "The Girl From Ipanema", all four categories are visible at once.
  - Genre (7) shows 5 tags plus "+2". Expanding shows all 7, and collapsing returns to 5.
  - Adding "Bossa" puts it under Feeling, and removing it deletes the row in the API.
  - There is no overflow at 390 px.
- **Source links:** Teardrop shows the Spotify, Apple Music, YouTube and MusicBrainz brand icons. There is no overflow at 390 px.
- **Mock mode:** the Library and the popover show the "needs the SongTagger API" state, and Discovery falls back to vibes.


## Community (implemented)

**Backend:** `API/Services/community.py`, served at `GET /users/{username}/community` (models `CommunityFeed`, `TrendingSong`, `RisingTag` and `ConsensusTag` in `API/Models/schemas.py`).

**Signals:**
- tags applied by listeners (`song_tags`);
- playlist adds (`playlist_songs`, which now has `created_at`, added by an idempotent `ALTER` in `db/schema.sql`);
- favorites (`user_songs` with `action = 'like'`). Favorites are ready but still empty until the favorites API exists.

The `catalog` user is always excluded, and each person counts once per song and signal kind.

**Trending:**
- `score = Σ weight × exp(−age/7 days)`, with like = 3, playlist = 2 and tag = 1, over the last 28 days.
- A song needs at least 2 distinct people.
- At most 2 songs per artist, and 10 songs in total.
- With fewer than 4 qualifying songs, it falls back to all-time totals, and `trending_window` says which window was used.

**Rising tags:**
- Distinct people in the last 7 days against the weekly average of the 21 days before. `growth = (recent + 1) / (baseline + 1)`.
- A tag needs at least 2 people, and the top 8 are kept.
- With fewer than 3 tags, it falls back to the most-used tags of all time (`tags_window`).

**Consensus:** for each trending song, its top 3 non-artist tags by distinct people.

**Privacy:** only aggregate counts are returned, never usernames, and the 2-person minimum avoids exposing one person's taste.

**Tests:** `tests/test_community.py` (7 tests). The full backend suite passes (102 tests).

**Demo data:** `db/seed_demo.py` now also creates `caio`, whose tags and "Domingo" playlist overlap ada and bia, so the demo database has songs with 2–3 people.

**Frontend:**
- `CatalogService.community()` is implemented in both data sources. The mock version uses the fixtures and always answers as `all_time`.
- `hooks/useCommunity.ts` loads the feed and `pages/CommunityPage.tsx` renders it.
- `SongShelf` gained an optional `notes` map, and `SongCard` an optional `note` line.

**Known limits:**
- "Listening" is approximated by tags, playlist adds and favorites. Real listens need a source such as Spotify recently-played written to `user_songs` (`listen`), which would then be added to `SIGNAL_WEIGHTS`.
- Scores are computed per request in Python. Fine at this size; precompute in a periodic job if traffic grows.
- Existing playlist memberships got the migration time as their `created_at`.
- After pulling this change, run `python -m db.manager` once and restart the API process.


## Song player (embeds, on demand)

`features/songs/CoverPlayer.tsx` wraps the hero cover on the song page.

**What it does:**
- When a song has an embeddable source, a glass play button sits in the middle of the cover.
- Clicking it replaces the cover **in place** with the provider's official embed. The iframe is created only on that click, so nothing loads before; closing it removes the iframe, which stops playback.
- Providers come from the stored `song_sources` ids (`domain/embeds.ts`, strictly validated):
  - **Spotify:** `open.spotify.com/embed/track/{id}`, the default.
  - **YouTube:** `youtube-nocookie.com/embed/{id}`.
  - **Apple Music:** `embed.music.apple.com/{storefront}/song/{id}`.
- Glass chips switch provider and a glass × closes; Escape also closes. The favorite and playlist buttons stay usable.
- Spotify and Apple have fixed-height players, and YouTube is shown at 16:9. Each is centred over a blurred copy of the cover, so the square stays full and the top band stays free for the controls.
- Songs without an embeddable source show no play button.

**Limits:**
- What plays depends on each provider. Spotify plays a 30s preview unless the visitor is logged in to Spotify in the browser. Apple Music plays a preview unless signed in. YouTube plays the full video.
- No API call is involved, and listens are not recorded. A `listen` signal for Community would need the provider's playback events, which the embeds do not expose to the page.
