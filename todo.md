# SongTagger UI: implementation record and remaining work

This document covers the React prototype in `UI/` as of 2026-10-10 (second iteration: in-app navigation, Discovery, Community placeholder and Library). It describes what exists, what is mocked, and what is left before the frontend can be considered production-ready.

Status legend used throughout:

- **Verified**: implemented and exercised (unit tests and/or a scripted browser run).
- **Implemented, not verified**: code exists but was not run end to end.
- **Partial**: works, with a known gap.
- **Not implemented**: intentionally left out.

## How to run

```bash
cd UI
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:5173.

Scripts: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run format`.

Environment variables (see `UI/.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `VITE_DATA_SOURCE` | `mock` | `mock` uses the in-memory catalog. `http` uses the FastAPI backend. |
| `VITE_SONGTAGGER_USERNAME` | `ada` | User sent in `/users/{username}/…` paths. It must exist in the `users` table when using `http`. |
| `SONGTAGGER_API_URL` | `http://127.0.0.1:8001` | Target of the Vite dev proxy (`/api/*` → API, prefix stripped). |

To use the real backend:
1. Start MariaDB and run `python -m db.manager` and `python -m db.seed`.
2. Insert a user: `INSERT INTO users (username) VALUES ('ada')`.
3. Run `python -m API`.
4. Start the UI with `VITE_DATA_SOURCE=http`.

---

## A. Architecture overview

Stack:
- Vite 5, React 18, TypeScript (strict, `noUncheckedIndexedAccess`), react-router-dom 6 (data router).
- CSS Modules plus global design tokens.
- ESLint 9 (typescript-eslint, react-hooks), Prettier, Vitest.
- No UI library and no CSS framework.

```
UI/src/
  main.tsx                 entry; loads theme/global.css
  app/                     App, router, RootLayout, AppProviders, LibraryProvider, contexts (useCatalog, useSession, useLibrary), routes helpers
  theme/                   tokens.css (design tokens), global.css (reset, base type, focus ring, reduced motion)
  domain/                  API-mirroring types and pure helpers (tags, songs), library.ts (library model + reducers), interests.ts (topInterests)
  services/http/           fetch wrapper (HttpClient) + ApiError built from FastAPI {detail}
  services/catalog/        CatalogService interface, httpCatalog (real API), mockCatalog (in-memory), index (selection)
  services/library/        LibraryService interface, localLibrary (localStorage), index (selection)
  mocks/                   catalogFixtures.ts: the only place with mock songs
  config/                  session.ts (env config), vibes.ts (curated vibe → tag-query configuration)
  hooks/                   useAsync, useSong, useSongSearch, useSimilarSongs, useShelves, useTagMutations
  components/ui/           Button/ButtonLink, TagChip, SearchField, SegmentedControl, StateMessage, Skeleton, DemoNotice
  components/layout/       PageShell, AppNavBar (in-app top bar), LandingHeader, BrandMark, OrganicBackdrop
  features/songs/          SongArtwork (+ artworkPalette), SongCard, SongGrid(+Skeleton), SourceLinks, SimilarSongs
  features/tags/           TagList, TagKindFilter, AddTagForm
  features/discovery/      VibeHero, VibeList, VibeArt, SearchPanel, SearchResults, SongShelf
  features/library/        FavoriteButton, AddToPlaylist (popover), PlaylistCard
  pages/                   LandingPage, DiscoverPage, CommunityPage, LibraryPage, SongPage, NotFoundPage
```

Dependency rules that keep the code pluggable:
- **Pages** compose features.
- **Features** read data only through hooks.
- **Hooks** read data only through `useCatalog()`. Library state comes only from `useLibrary()`.
- **Only `services/catalog/httpCatalog.ts`** knows endpoint URLs.
- **Only `services/catalog/mockCatalog.ts` and `mocks/`** know about fake data.
- **Selection** between the two happens once, in `services/catalog/index.ts`, based on `config/session.ts`.
- **Only `services/library/localLibrary.ts`** touches localStorage. `LibraryProvider` keeps the state in React and saves through the `LibraryService` on every change.

Routing (`app/router.tsx`):

| Path | Page | Notes |
|---|---|---|
| `/` | `LandingPage` | Landing only: vibe panels, pitch, "Let's begin" (→ `/discover`), "Explore by vibe". It uses `LandingHeader` (logo + "Open app"), not the app bar. Legacy `/?tags=` and `/?title=` links redirect to `/discover`. |
| `/discover` | `DiscoverPage` | Search state lives in the URL: `?tags=mpb+sunny` or `?title=Sampa&artist=…`. With no query it shows the "For you" shelves. |
| `/community` | `CommunityPage` | Placeholder ("Coming soon"). |
| `/library` | `LibraryPage` | `?tab=playlists` and `?playlist=<id>` keep the tab and the selected playlist in the URL. |
| `/songs/:songId` | `SongPage` | A non-numeric id or an API 404 renders the "not in the catalog" state. |
| `*` | `NotFoundPage` | |

`app/routes.ts` builds and parses these URLs (`APP_PATHS`, `discoverPath`, `libraryPath`, `songQueryFromParams`, `parseSongId`), so links never hand-build query strings.

Every page except the landing uses `PageShell` with `AppNavBar`: the round logo, a grey search pill (tag search → `/discover?tags=`), DISCOVERY / COMMUNITY / LIBRARY with an underline on the active section, and the avatar. On ≤860 px the search moves to a second row. The bell from the reference was left out because there are no notifications.

Main shared components:
- **`TagChip`** is used everywhere a tag appears: vibe panels, active filters, the song tag list. It has outline, mine, onDark and onLight tones, and an optional link, click or remove action.
- **`SongArtwork`** is used by song cards, the song hero and similar-song thumbnails.
- **`SongCard` / `SongGrid`** accept a `SongSummary` (id, title, artist, tags), so they render both catalog results and library snapshots. They are used by search results, Discovery shelves (`SongShelf`) and Library favorites.
- **`FavoriteButton` and `AddToPlaylist`** sit on the song page next to "Listen on".
- **`StateMessage` and `Skeleton`** provide every empty, error and loading state.
- **`PageShell`** wraps all pages: demo banner, header, optional decorative backdrop, footer.

Design system (`theme/tokens.css`):
- Warm cream/terracotta/sand/sage palette from reference 1.
- Type scale using Archivo for display and Inter for body.
- Spacing scale, radii, shadows, focus ring, motion timings.
- Vibe gradient palettes (reference 2) live in `config/vibes.ts`, because they belong to the content, not the base theme.

Reference mapping (agreed with the user):
- **Landing** follows image 2: three vibe panels, the pitch, "Let's begin" and "Explore by vibe". Search moved to Discovery in the second iteration.
- **The in-app top bar** follows the third reference (round logo, search pill, DISCOVERY / COMMUNITY / LIBRARY).
- **Song page** follows image 1: hero artwork with title overlay, uppercase title, "Listen on" links, wave divider, tags with "+ Add tags", "About this song" and "Similar songs" with "Why?".

## B. Data flow and integrations

Backend contracts mirrored in `domain/types.ts` (from `API/Models/schemas.py`): `Source`, `Tag`, `UserTag`, `Song`, `UserSong`, `SongSearch`, `UserSongList`, `TagWrite`. `TagKind` is narrowed to the four kinds enforced by `API/Services/tags.py`.

| UI use | CatalogService method | HTTP endpoint (`httpCatalog`) | Mock status | HTTP status |
|---|---|---|---|---|
| Discovery: tag search, "For you" shelves, vibe links, app-bar search | `searchByTags(tokens)` | `GET /users/{u}/songs?q=<tokens joined by space>` | Verified | Implemented, not verified (request URL verified; no DB available) |
| Discovery: "By title" search | `searchByTitle(title, artist?)` | `GET /songs?title=&artist=` | Verified | Implemented, not verified |
| Song page | `getSong(id)` | `GET /users/{u}/songs/{id}` | Verified | Implemented, not verified (request URL verified) |
| Song page: add tag | `addTag(id, {kind, token})` | `PUT /users/{u}/songs/{id}/tags` | Verified | Implemented, not verified |
| Song page: remove own tag | `removeTag(id, {kind, token})` | `DELETE /users/{u}/songs/{id}/tags` (JSON body) | Verified | Implemented, not verified |
| Song page: similar songs | `searchByTags([token])`, once per token | same as tag search | Verified | Implemented, not verified |

Flow:
1. A URL or user action becomes a query.
2. A hook (`useSongSearch`, `useSong`, `useSimilarSongs`, `useShelves`) calls `useAsync(load)`.
3. `load` calls the `CatalogService`.
4. The state (`idle | loading | success | error`) is rendered by the feature component. Stale responses are ignored by request id, and the previous data is kept while reloading.

Tag edits (`hooks/useTagMutations.ts`):
- **Add** is optimistic: the chip appears as "mine" right away. It is replaced by the server's `UserTag` on success. On failure the song is reloaded and the error is shown inline.
- **Remove** is not optimistic. The API only removes the caller's application, and the tag may remain because another user applied it. After a successful DELETE the song is reloaded so the UI reflects the server's truth.

Library (favorites and playlists) never touches the API:
- `LibraryProvider` (`app/LibraryProvider.tsx`) loads the library once from `LibraryService`, keeps it in React state, and saves it after every change.
- Changes go through the pure reducers in `domain/library.ts`: `toggleFavorite`, `createPlaylist`, `deletePlaylist`, `addToPlaylist`, `removeFromPlaylist`.
- Entries are `SongSummary` snapshots (id, title, artist, tags at save time), so the Library renders without refetching. A song's tags in the Library can be stale.

Discovery "For you":
- `topInterests(favorites, 6)` in `domain/interests.ts` puts tags shared by several favorites first. It then alternates between favorites, taking each one's best remaining tag (genre > feeling > instrument > artist).
- `useShelves` runs one real `searchByTags([token])` per interest and drops songs already in favorites.
- The page shows the first 3 non-empty shelves. With no favorites, it shows the three featured vibes instead.

Errors: `httpClient` turns FastAPI `{detail}` into `ApiError(status, detail)`. A network failure becomes `ApiError(0, 'Could not reach the SongTagger API.')`.

Database entities that matter to the frontend:
- `songs`, `sources` and `song_sources` provide song and links.
- `tags` (kind, name, normalized_name) and `song_tags` (one row per user per tag) provide tags and `applied_by_me`.
- `users` provides the username path segment.
- `user_songs` (listen/like/save) exists but has no API and is unused. The Library is meant to move onto it (`like` = favorite). There is no playlists table yet.

## C. Mocks, placeholders and assumptions

| What | Where | Why | Static / interactive | How to replace |
|---|---|---|---|---|
| Mock catalog: 20 songs with catalog artist/genre tags and "community" feeling/instrument tags | `UI/src/mocks/catalogFixtures.ts` | Lets the UI run without MariaDB. The real seed has no feeling or instrument tags. | Static data | Set `VITE_DATA_SOURCE=http`. The fixtures can then be deleted (also delete `mockCatalog.ts` and its test). |
| Mock catalog service: search, get, add and remove with the API's normalization and AND semantics, 350 ms latency | `UI/src/services/catalog/mockCatalog.ts` | Same reason. It keeps the interaction honest (404/400 errors, caller-only removal). | Interactive, in memory, lost on reload | Same as above. Nothing else imports it except `services/catalog/index.ts`. |
| Mock source URLs (Spotify, Apple Music and YouTube search URLs, MusicBrainz search URL) and fake MBIDs `00000000-0000-4000-8000-…` | `catalogFixtures.ts` (`song()` helper) | The fixtures need clickable links. Real data comes from `song_sources`. | Static | Disappears with the fixtures. |
| "Demo data" banner | `components/ui/DemoNotice.tsx`, shown by `PageShell` when `catalog.kind === 'mock'` | Persistence must never be faked silently. | Static | Disappears automatically in `http` mode. |
| Current user from an env variable (`ada` by default); the avatar shows its initial | `config/session.ts`, `app/AppProviders.tsx` (`SessionContext`), `AppNavBar` | There is no login API. | Static | Replace `SessionContext`'s value with the authenticated user once login exists. Callers already use `useSession()`. |
| Generated artwork (gradient + orb + waves, palette picked from the song's tags) | `features/songs/SongArtwork.tsx`, `artworkPalette.ts` | No cover art exists anywhere in the API or DB. | Static, deterministic per song | Add a `cover_url` (e.g. Cover Art Archive via a release MBID) to `Song`. Render it inside `SongArtwork`, keeping the generated art as the fallback when the URL is missing or fails. |
| Vibe collections (titles, descriptions, palettes, tag queries) | `config/vibes.ts` | Product/editorial configuration, not fake data. Each vibe runs a real tag search. | Static config | Keep, or move to a CMS/endpoint later. Check that the genre tokens (`dream-pop`, `jazz`, `electronic`, `mpb`, `soul`, `rock`) exist in the seeded DB, because MusicBrainz genre names vary. |
| Library: favorites and playlists | `services/library/localLibrary.ts` (storage key `songtagger:library:<username>`), `app/LibraryProvider.tsx`, `domain/library.ts` | The API has no favorites or playlists routes. The UI says "Saved on this device only" on the Library page. | Interactive; persists in this browser only, never synced | Add `httpLibrary` implementing `LibraryService` (favorites → `user_songs` `like` rows; playlists need new `playlists`/`playlist_songs` tables and routes). Select it in `services/library/index.ts`. `LibraryService.load/save` will likely become async per-operation calls, so `LibraryProvider` actions should then call the service and update state from responses. |
| Interests for Discovery | `domain/interests.ts`, `pages/DiscoverPage.tsx` (`ForYou`), `hooks/useShelves.ts` | No user-profile or recommendations endpoint. Interests come from tags of favorite songs only (not from tags the user applied, which the API cannot list). | Real tag queries, client-side ranking | Replace with a server-side interests or recommendations endpoint. `SongShelf` only needs a title and songs. |
| Community page | `pages/CommunityPage.tsx` | Asked to be a placeholder for now. | Static "Coming soon" | Implement community-wide trends (needs tag counts / recent activity endpoints). |
| "Similar songs" ranking | `hooks/useSimilarSongs.ts`, `domain/songs.ts` (`similarityTokens`) | There is no recommendations endpoint. It runs up to 4 single-tag searches (genres first, then feelings, else the artist) and ranks by shared tags. "Why?" lists the real shared tags. | Real queries, client-side ranking | Replace the hook body with a recommendations endpoint. `SimilarSongs` only needs `CatalogSong[]` and shared tags. |

Assumptions:
- `kind` values are limited to `artist | genre | feeling | instrument`, as enforced by the API.
- Tag search is exact on the normalized name. The UI turns typed text into tokens (`parseTokens`): it lowercases, removes accents, uses hyphens for spaces, and splits on whitespace or commas.
  - Because of that split, the search boxes cannot express a multi-word tag. `late night` becomes two tokens, `late` and `night`.
  - Users have to type `late-night`, or click a tag chip, which uses the stored token.
- In the "About this song" facts, the community tags shown are the first four non-artist tags in API order. They are not ranked by popularity, because counts are unavailable.

## D. Remaining implementation work and known issues

Missing API/DB capabilities (they block features shown in the references):
1. **Tag popularity/counts** (reference 1's "Brazilian 92%" bars). `song_tags` can produce `COUNT(user_id)`, but no endpoint exposes it. **Not implemented**, by decision.
2. **Browse/list songs**, trending or featured. There is no endpoint, so Discovery relies on tag queries. **Partial.**
3. **Tag autocomplete/listing.** There is no `GET /tags`, and search is exact-match, so users must know a tag's exact name. **Not implemented.**
4. **Auth/login and user creation.** **Not implemented.**
5. **Cover art.** **Not implemented** (generated artwork instead).
6. **Favorites and playlists in the backend.** The UI works with a local mock (see C), but nothing is stored server-side or shared across devices. **Partial.**
7. **Playback and recommendations.** The reference's play and "…" buttons and the notifications bell were left out to avoid dead controls. "Listen on" uses real `sources` links. **Not implemented.**
8. **Community.** Placeholder page only. **Not implemented.**
9. **CORS.** Not configured in the API. The dev proxy hides this, but a production deployment needs either a reverse proxy or `CORSMiddleware`.

Frontend gaps and known issues:
- **Not verified against the real backend.** MariaDB was not running in this environment. `http` mode was checked only for request URLs (`/api/users/ada/songs?q=mpb`, `/api/users/ada/songs/1`) and for its error states with the API down.
- When the API is down, the Vite proxy returns a 500 with no `detail`, so the error message is the generic "Internal Server Error". A friendlier mapping for 5xx/0 statuses could be added in `httpClient`.
- In development, React StrictMode runs each fetch twice. This is expected; production builds fetch once. Title search can trigger a MusicBrainz import, so a duplicate dev request may import twice. The API upserts, but it is slow.
- Title search is exact-match (API behaviour). The UI explains this under the field.
- `useSimilarSongs` makes up to 4 requests per song page.
- There is no request cancellation (`AbortController`). Stale responses are ignored, but not aborted.
- The tag-kind filter (`TagKindFilter`) scrolls horizontally on narrow screens. It works, but its last option can be partly hidden at 390 px.
- On the song page, the title appears both in the artwork overlay and the heading. This matches reference 1 but is redundant for screen readers. The overlay text could be marked `aria-hidden`.
- Fonts load from Google Fonts at runtime. Self-host them for privacy and offline use if needed.
- Accessibility:
  - Keyboard focus rings, labels, `aria-current`, `aria-expanded`, `role=status/alert` and reduced-motion handling are in place.
  - No automated a11y audit (axe/Lighthouse) has been run, and colour contrast of the vibe panels' small text has not been measured.
- The Library is per browser and per `VITE_SONGTAGGER_USERNAME`. Clearing site data erases it. Songs saved in mock mode keep their ids, which will not match real database ids after switching to `http`.
- Library entries are snapshots, so a song's tags shown in the Library or used for interests do not update when tags change on the server.
- The playlist popover on the song page does not trap focus. It closes on Escape (focus returns to the trigger) or on an outside click.
- No component or E2E test suite is committed. Unit tests cover tag normalization, the mock catalog, the library reducers, interests and the local storage adapter (14 tests). The browser walkthroughs were throwaway scripts.

## E. Integration roadmap (priority order)

1. **Run against the real API.** Seed the DB, create a user, run with `VITE_DATA_SOURCE=http`, and walk through the flows below. Fix any contract drift in `domain/types.ts`.
2. **Confirm vibe tokens** in `config/vibes.ts` against `SELECT DISTINCT normalized_name FROM tags WHERE kind='genre'`. Adjust queries that return nothing.
3. **Add CORS or a production proxy**, and make `apiBaseUrl` in `config/session.ts` configurable for deployed environments.
4. **Tag counts endpoint.** Extend `Tag`/`UserTag` with `count`, or add `GET /songs/{id}/tags`. Then render popularity in `TagList` (reference 1's Synthesis panel). The mock would need counts too.
5. **Tag listing/autocomplete endpoint.** Add suggestions to `SearchPanel` and `AddTagForm`, and allow multi-word tags in search input.
6. **Auth.** Replace the env username in `SessionContext`, add login/logout to the avatar in `AppNavBar`, and handle 401/403 in `httpClient`.
7. **Cover art.** Add the field to `Song`, render the image in `SongArtwork`, and keep the generated fallback.
8. **Browse/featured endpoint** to replace the vibe fallback shelves on Discovery.
9. **Recommendations endpoint** to replace `useSimilarSongs`' client-side ranking.
10. **Favorites/playlists API** (`user_songs` + new playlist tables) and an `httpLibrary` adapter to replace `localLibrary`. Then derive interests on the server as well.
11. **Community page**, once tag counts and activity endpoints exist.
12. **Testing.** Add React Testing Library tests for `AddTagForm`, `SearchPanel` and `SongPage` states, and Playwright E2E for the flows below against both data sources. Run an axe audit.
13. **Robustness.** Add `AbortController` support to `useAsync`, friendlier 5xx messages, and self-hosted fonts.

Flows verified in scripted headless-Chrome runs (mock mode, 1440 px and 390 px):
- The landing has no app bar. "Let's begin" opens `/discover`, which shows "Make Discovery yours" and the vibe shelves, with DISCOVERY marked active.
- On a song page: favoriting works, the "Noite" playlist can be created from the popover with the song added, and the Escape key closes it.
- In `/library`, 2 favorites show. Selecting "Noite" lists Sampa, and removing it leaves the playlist empty. The playlist survives a reload.
- Discovery then shows "Because you like MPB / Jazz / Tropicália".
- The app-bar search goes to `/discover?tags=jazz`. `/community` shows the placeholder.
- (First iteration, still on the same components:)
- Clicking a vibe panel shows "4 songs for jazz".
- Narrowing with a typed tag gives `jazz + late night`.
- Opening a song works.
- Adding the feeling tag "Smoky" works, and so does removing it.
- "Why?" shows the shared tags.
- `/songs/9999` shows the not-found state.
- `?title=sampa` finds 1 song.
- There is no horizontal overflow at 390 px and no console errors.
