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

**Picked for you** is the first shelf. It calls `GET /user/{id}/recommendations?limit=10` through `services/recommendations/` and `hooks/useRecommendations.ts`, and shows each card's reason ("Because dreamy · electronic") with those tags highlighted. It refetches when favorites or playlist contents change. It is hidden in mock mode, on errors, or when the user has no signal yet, so the shelves below still work. See "Recommendations" at the end of this file.

The tag shelves below it are built in the browser:

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
| Similar songs and "Because you like" shelves | `hooks/useSimilarSongs.ts`, `domain/interests.ts`, `hooks/usePlaylistSongs.ts` | Built before the recommendations endpoint existed | Real queries, client-side ranking | "Picked for you" already uses the real endpoint. Move similar songs to a server-side song-to-song version of the same tag profiles. |
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
9. **Listening history is not recorded.** `user_songs.action = 'listen'` exists, and the recommender already weighs it (1.0), but nothing writes it.

### Frontend known issues
- **Playlist duplicates.** The API allows duplicate songs in a playlist. The detail view shows each row, but unchecking a song in the popover removes only its first membership, so the song stays checked while another copy remains.
- **No focus trap.** The playlist popover closes on Escape or an outside click.
- **Drag-and-drop limits.** One song at a time (no multi-select). Auto-scroll happens only near the top and bottom of the window. Touch dragging uses the same pointer code but was not tested on a real device.
- **Shared pending state.** Library mutations share one `pending` flag, so one slow request briefly disables the other library controls.
- **StrictMode double fetches.** In development, StrictMode fetches twice (harmless). There is no `AbortController` cancellation.
- **Local MariaDB is not a Windows service.** It must be started manually after a reboot (command above). Run the MSI installer as administrator if a service is wanted.
- **Accessibility.** Basics are in place (labels, focus rings, `aria-*`, reduced motion). No axe or Lighthouse audit has been run.
- **Tests.** There are 45 Vitest unit tests, covering tag normalization, the mock catalog, playlist helpers, interests, playback parsing, wave paths, and the `httpLibrary` and `httpRecommendations` request mapping. Browser checks were throwaway Playwright scripts, not a committed E2E suite.

## E. Integration roadmap (priority order)

1. **Favorites API** (`user_songs` like) is done. The heart and Library Favorites tab already call it. Next is the rest of this list.
2. **Fix hyphenated tag search** in the API and seed normalization.
3. **Unify user addressing** and add `song_count` (and preview song ids) to playlist summaries.
4. **Include tags in `PlaylistSong`** or add a batch song endpoint, then simplify `usePlaylistSongs`.
5. **Auth and user creation**, replacing the env username in `SessionContext` and wiring the avatar in `AppNavBar`.
6. **CORS or a production reverse proxy**, plus a configurable `apiBaseUrl`.
7. **Tag counts and autocomplete**, for the popularity bars from reference 1 and tag suggestions.
8. **Community page**, built on community-wide activity and counts.
9. **Recommendations, next steps:** record listens and skips (from the embed player or Spotify recently-played), add a "not for me" negative signal, and move similar songs to the server. Then re-run the evaluation in `API/Recommender/RESULTS.md` once there are dozens of active listeners.
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


## "Now playing" animation (song page)

While a song is actually playing in the cover player, the scene reacts in both shape and light.

- **Sun** (`components/layout/OrganicBackdrop.tsx`):
  - **Rays:** they stretch and shrink along their own direction like equaliser bars (1–1.7×, three interleaved rhythms) and light up one after another.
  - **Core:** it beats at about 100 BPM and gains a warm halo.
  - **Rotation:** the whole sun slowly turns, one revolution in 40s. When playback stops, the rotation pauses where it is instead of snapping back.
- **Divider waves** (`features/songs/PlaybackWave.tsx`, shapes from `features/songs/wavePath.ts`): the two lines morph between generated waveforms with SVG `<animate attributeName="d">`, crossing each other. The accent line keeps its glow.
- **Organic side shapes:** they breathe by morphing between their outline and a swollen variant (5–7s) while slightly warming up.

**When nothing is playing:** no `data-playing` attribute and no `<animate>` elements, so the scene is exactly as before.

**Reduced motion** (`hooks/useReducedMotion.ts`, now shared with `WindLayer`): no shape animation at all, only a steady lit state.

**How "playing" is detected** (`features/songs/embedPlayers.tsx`, parsers in `domain/playback.ts`):
- **Spotify:** the official iFrame API (`open.spotify.com/embed/iframe-api/v1`), loaded on demand the first time a Spotify player opens. `playback_update` drives the state. If the script fails, it falls back to the plain embed without the light.
- **YouTube:** the embed URL gets `enablejsapi=1&origin=…`, and the page sends the `listening` handshake. `infoDelivery` / `onStateChange` messages are accepted only from `youtube-nocookie.com` and from that exact iframe.
- **Apple Music:** no public playback events exist, so focusing or clicking into the Apple player is treated as "playing" until it is closed or switched. **This is a heuristic.** Pausing inside the Apple player does not turn the light off.

Closing the player, switching provider or leaving the page always turns the light off.

## Recommendations (implemented)

**What it is:** `GET /user/{user_id}/recommendations?limit=1..50` (default 20) returns `{ songs: [{ song: UserSong, score, because: Tag[] }] }`.
- `404` for an unknown user, `400` for `catalog`, `422` for an invalid `limit`.
- A user with no likes, playlists or own tags gets `{ songs: [] }`.

**Where it lives:**
- `API/Recommender/`: pure numpy, no database. `data.py` holds the input rows, `matrices.py` builds A and B, `model.py` scores, ranks and explains, and `evaluate.py` holds the offline protocol and the synthetic listeners.
- `API/Services/recommendations.py`: loads a snapshot from MariaDB and caches the model.
- The route is in `API/Controllers/routes.py` and the schemas `RecommendedSong` / `Recommendations` are in `API/Models/schemas.py`.
- `numpy==2.2.6` was added to `requirements.txt`.

**How it scores:** the cosine between the user's tag profile and each song's tag profile, blended 80/20 with popularity among listeners.
- Song profile: tags × IDF, so rare tags count more.
- User profile: 60% the tags they applied, 40% the tags of songs they liked, saved or tagged, weighted 3 / 2 / 1.5 and decayed over 90 days.
- Ranking rules: known songs are excluded, there are at most 2 songs per artist, and `because` lists the two tags that contributed most.

**How it was chosen:** `API/Recommender/RESULTS.md` has the full tables and intervals. Tag scoring, user-profile mixes, decay, normalizations, tag diffusion, dot product versus cosine, MMR diversity and popularity blends were compared with leave-one-out NDCG@10 on the 3 real listeners and on simulated listeners.

**Caching:** the model is rebuilt when a fingerprint of `songs`, `tags`, `song_tags`, `user_songs` and `playlist_songs` changes, or after one hour.
- Building it takes under 1 ms.
- Most of a request's time goes to the database queries that load the songs.
- The model is per API process: several workers would each keep their own copy.

**Tests:**
- `tests/test_recommender.py` (pure, 6 tests): A and B scoring, ranking, the artist cap, holdout leakage, and an offline regression test. The shipped blend must beat both content-only and popularity-only on a fixed synthetic world.
- `tests/test_recommendations.py` (MariaDB, 4 tests): the error and empty cases, the expected neighborhood, known-song exclusion, and model reuse versus rebuild.
- `UI/src/services/recommendations/httpRecommendations.test.ts`.

**Verified on the real seeded database (API on :8001):**
- ada, bia and caio each got 20 songs, none of them already known to that user.
- Example reasons: bia → Teardrop "dreamy · late night", caio → Aquele abraço "sunny · bossa nova".
- `/discover` shows "Picked for you" first at 1440 px and 390 px, with one request per page, no overflow and no console errors.

**Limits:**
- Only 3 real listeners, so the choice leans on synthetic data. The synthetic tastes are genre-based, which favors content methods.
- Songs without catalog genre tags (36 of 105) can only be matched through artist tags or listener tags.
- Listens are not recorded yet.

## Genre scenes (song page)

The song page picks one of seven "scenes" from the song's real tags. Only the moving decoration and the accent colour change: the celestial body, the side shapes, the divider waves and the accent. The cover, tags, text, layout, nav bar and other pages stay as they were.

| Scene | Genres (examples) | Body | While playing |
|---|---|---|---|
| Daylight (default) | pop, pop rock, soft rock, folk, country, ballad | The original sun | Equaliser rays, beat, slow turn |
| Night | rock, alternative rock, punk, post-punk, metal, grunge | Crescent moon on a night disc with 4-point stars | The moon sways and the stars twinkle |
| Neon | electronic, house, techno, disco, dance, synth-pop, new wave | Neon ring on a dark disc with magenta/cyan bars | The bars jump fast and the ring pulses |
| Lounge | jazz, soul, r&b, blues, funk, trip hop, downtempo | Low amber moon with smoke rings | The smoke rings rise and fade |
| Tropical | latin, bossa nova, mpb, samba, salsa, reggae, flamenco | Sun with 16 wavy rays | The rays sway and the sun bounces |
| Haze | dream pop, shoegaze, ambient, chillout, classical | Pale orb with halo rings and orbiting dots | The halo breathes and the dots orbit |
| Street | hip hop, rap, trap, grime, boom bap | Vinyl record with beat ticks | The record spins at 33 rpm and the ticks chase |

**Rules** (`UI/src/domain/scenes.ts`, tested in `scenes.test.ts`):
- `sceneForGenre` checks exact overrides first ("pop rock" → Daylight, "jazz rap" → Street, "trip hop" → Lounge…), then keyword lists.
- `sceneForSong` counts the song's genre tags per scene, ignoring Daylight genres because they are neutral. The scene with the most tags wins; ties go to tag order. The reason is the first tag of the winning scene.
- Without a distinctive genre, it uses feeling tags: late night/intimate → Lounge, dreamy/ethereal/contemplative → Haze, sunny/carefree → Tropical, euphoric → Neon. Otherwise the scene is Daylight.

**Coverage** of the 156 genres in the seeded database:
- Daylight 37 (pop, folk and country family), Night 32, Lounge 26, Neon 24, Tropical 13, Haze 13, Street 11.
- Songs: Daylight 46 (45 songs have no genre tag), Night 25, Neon 15, Lounge 13, Tropical 9, Street 5, Haze 3.
- Some results follow MusicBrainz data rather than intuition (Jolene is tagged "alternative rock"). The scene follows the tags, so community edits change it.

**Live changes:** the scene is recomputed from the current tags, so adding or removing a genre or feeling tag switches the scene immediately.

**Label:** `features/songs/SceneLabel.tsx` shows "Night scene · from alternative rock" above the waves. The reason links to `/discover?tags=…`.

**Theming:** `UI/src/theme/scenes.css` defines `[data-scene]` tokens.
- Scene tokens: `--scene-sky/body/detail/glow`, `--scene-blob-a/b/c`, `--scene-wave-lead/follow`.
- Accent overrides: `--color-accent`, `-strong`, `-soft` and `--focus-ring`.
- The song page wraps its content in `<div data-scene style="display: contents">`, so buttons, links, the tag form and focus rings inside it take the scene accent without component changes.
- The backdrop carries its own `data-scene`.
- Every new accent has at least 5:1 contrast on the canvas. The Daylight accent is the existing terracotta (3.3:1), which was left unchanged.

**Code:**
- `components/layout/Celestial.tsx` and `.module.css` hold the seven bodies, all in a 120×120 viewBox.
- `OrganicBackdrop` takes a `scene` prop.
- `PlaybackWave` takes a `scene` prop with a per-scene motion profile. The resting path is unchanged.

**Motion:**
- Nothing moves when idle.
- Turning bodies use `animation-play-state`, so they hold their angle when playback stops.
- Reduced motion shows a steady lit state.
- Below 960 px the body stays hidden, as before; the shapes, waves and label still carry the scene.

**Verified in Chrome (1440 px and 390 px) against the real API:**
- All 7 scenes checked on real songs. In every one, nothing animates when idle and everything animates when playing.
- Real YouTube playback was checked for Neon (Teardrop) and Lounge (Glory Box). Bohemian Rhapsody's YouTube embed did not start in headless Chrome. The other scenes were checked by setting the playing attribute from the test.
- Reduced motion: nothing animates.
- The nav bar keeps the default accent.
- Adding the genre "jazz" to Purple Rain switched it to Lounge, and removing it switched back.
- No overflow and no console errors.

**Not done:** dark mode does not exist in the app yet, so scenes were designed for the light canvas only.
