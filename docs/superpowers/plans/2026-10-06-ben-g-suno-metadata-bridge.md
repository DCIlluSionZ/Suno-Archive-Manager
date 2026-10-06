# Ben.G Suno Metadata Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Chromium build of Suno Archive Manager into a passive, persistent, metadata-only Ben.G Suno bridge that safely indexes a very large Suno library and exports a stable JSON contract for future local MCP/collaboration tooling.

**Architecture:** Keep the existing MAIN-world fetch observation + isolated bridge pattern, move reusable discovery/normalization into a small shared module, store canonical records in IndexedDB from the MV3 service worker, and expose only summary/export controls to the side panel. The supported Chromium build must not fetch song media. Suno Explorer remains Ben's primary library manager.

**Tech Stack:** Vanilla JavaScript, Chrome/Edge Manifest V3, IndexedDB, Node.js built-in `node:test`, `fake-indexeddb` as a dev-only dependency, existing build script.

**Spec:** `docs/superpowers/specs/2026-10-06-ben-g-suno-metadata-bridge-design.md`

## Global Constraints

- Chromium/Chrome/Edge is the only Phase 1 acceptance target.
- Passive observation only: never block, replace, rewrite, or synthesize Suno network requests/responses.
- No supported Chromium path may fetch or bulk-download song audio, stems, covers, or other media.
- No cloud backend, account system, MCP server, collaboration backend, or Suno-generation automation in Phase 1.
- Persistent storage uses IndexedDB, not extension key/value storage; Ben's library can exceed 25,000 songs.
- Suno song ID is the stable primary key; rescans upsert/refresh and never clear the library automatically.
- Current Suno field meanings must be verified from sanitized current payload fixtures before canonical mappings are locked in.
- Preserve upstream attribution and the existing ISC license information.

## Review Focus

1. **Metadata-only records without `audio_url`:** discovery must not depend on downloadable audio. Task 1.
2. **Schema drift / malformed nested responses:** ignore unrelated or malformed values without breaking Suno. Task 1.
3. **25,000+ records:** IndexedDB upsert/count/export must work without browser extension storage quotas. Task 2.
4. **Repeated scans with partial/richer data:** preserve `first_seen_at`, advance `last_seen_at`, and merge richer non-empty values deterministically. Tasks 1–2.
5. **Normal Suno requests including analytics:** every request uses the captured original fetch and returns the real response. Task 3 + browser smoke test.

---

### Task 1: Capture current schema fixtures and build canonical metadata logic

**Files:**
- Create: `tests/fixtures/suno-current-v6-song.json`
- Create: `tests/fixtures/suno-current-v6-instrumental.json` when available
- Create: `src/shared/song-metadata.js`
- Create: `tests/song-metadata.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces global/CommonJS-compatible `BenGSunoMetadata`:
  - `findSongCandidates(value) -> Array<object>`
  - `normalizeSong(raw, seenAtIso) -> object|null`
  - `mergeSongRecord(existing, incoming) -> object`
  - `buildExportDocument(songs, exportedAtIso) -> object`

- [ ] **Step 1: Record sanitized current Suno fixtures before mapping fields**

From Ben's authenticated current Suno library, capture at least one ordinary V6 song payload and, when readily available, one instrumental/derived variant. Keep only the song object needed for tests. Remove signed media query strings, account/auth data, cookies/headers, unrelated profile/account objects, and any data not necessary to establish field meaning.

- [ ] **Step 2: Add the test runner and dev-only IndexedDB test dependency**

Add `"test": "node --test tests/*.test.js"` and `fake-indexeddb` under `devDependencies`.

- [ ] **Step 3: Write failing discovery/normalization tests against the sanitized fixtures**

Assert:
- valid song records are found even when `audio_url` is missing/empty;
- unrelated objects with IDs are rejected;
- malformed/null/non-object inputs do not throw;
- current verified fields map into canonical `id`, `title`, `display_name`, `created_at`, model/version identifier(s), `duration_seconds`, tags/style, generation prompt/description, lyrics, instrumental flag, `suno_url`, `image_url`, and verified relationship IDs;
- `first_seen_at` and `last_seen_at` are populated from the supplied observation time;
- `source_metadata` copies only an explicit non-sensitive allow-list.

- [ ] **Step 4: Run tests and verify failure**

Run: `node --test tests/song-metadata.test.js`
Expected: FAIL because `src/shared/song-metadata.js` does not exist.

- [ ] **Step 5: Implement discovery and normalization from the verified fixtures**

Do not invent mappings for fields absent from current fixtures. Derive `https://suno.com/song/<id>` only when a direct song URL is absent.

- [ ] **Step 6: Add merge/export tests, then implement them**

Assert `mergeSongRecord` preserves original `first_seen_at`, advances `last_seen_at`, retains existing useful values when newer observations are empty, adopts richer non-empty values, and deterministically merges bounded `source_metadata`. Assert `buildExportDocument` returns exactly `schema_version: 1`, `exported_at`, `source: "ben-g-suno-metadata-bridge"`, `song_count`, and deterministic song ordering.

- [ ] **Step 7: Verify and commit**

Run: `node --test tests/song-metadata.test.js`
Expected: PASS.

```bash
git add package.json package-lock.json src/shared/song-metadata.js tests/song-metadata.test.js tests/fixtures/
git commit -m "feat: add verified Suno metadata schema"
```

### Task 2: IndexedDB-backed persistent song store

**Files:**
- Create: `src/background/song-store.js`
- Create: `tests/song-store.test.js`
- Modify: `src/background/service-worker.js`

**Interfaces:**
- Consumes `BenGSunoMetadata.mergeSongRecord` and `buildExportDocument`.
- Produces `BenGSunoStore`:
  - `openSongDatabase(indexedDBImpl = globalThis.indexedDB) -> Promise<IDBDatabase>`
  - `upsertSongs(db, songs) -> Promise<{added:number, updated:number, total:number}>`
  - `getLibrarySummary(db) -> Promise<{count:number, oldest_created_at:string|null, newest_created_at:string|null, last_scan_at:string|null}>`
  - `getAllSongs(db) -> Promise<Array<object>>`
  - `clearSongs(db) -> Promise<void>`
  - `setLastScanAt(db, iso) -> Promise<void>`

- [ ] **Step 1: Write failing persistence/upsert tests using `fake-indexeddb`**

Assert database `ben-g-suno-metadata`, version `1`, object store `songs` keyPath `id`, metadata store `app_meta`, insert/update/clear/count/date summary, and last-scan behavior. Include an injected IndexedDB-open failure test proving errors reject rather than pretending persistence succeeded.

- [ ] **Step 2: Add the 25,001-record scale test**

Batch-upsert 25,001 compact canonical records, assert total `25001`, read them back, and verify first/last IDs and export count.

- [ ] **Step 3: Run tests and verify failure**

Run: `node --test tests/song-store.test.js`
Expected: FAIL because `song-store.js` does not exist.

- [ ] **Step 4: Implement the store and service-worker message contract**

Use IndexedDB transactions and ID-keyed upserts. Service worker supports `ADD_SONGS`, `GET_LIBRARY_SUMMARY`, `GET_EXPORT_DOCUMENT`, `CLEAR_SONGS`, `SET_SCAN_COMPLETE`, and `SCROLL_COMPLETE`. Every failed storage/export operation returns a structured `{error:{code,message}}`; it must never report success after persistence failure.

- [ ] **Step 5: Verify and commit**

Run: `npm test`
Expected: PASS including the 25,001-record test.

```bash
git add src/background/service-worker.js src/background/song-store.js tests/song-store.test.js
git commit -m "feat: persist Suno metadata in IndexedDB"
```

### Task 3: Make Chromium capture strictly passive

**Files:**
- Modify: `manifests/manifest.chrome.json`
- Modify: `src/content/content-script-main.js`
- Modify: `src/content/content-bridge.js` only if message shape changes
- Modify: `build.js`
- Create: `tests/passive-capture.test.js`

**Interfaces:**
- Consumes Task 1 discovery/normalization.
- Produces canonical `SONGS` messages; no media fetch or request rewriting.

- [ ] **Step 1: Write failing passive-capture/static guard tests**

Assert there is no analytics URL blocklist that returns `new Response(...)`, the shared metadata script loads before `content-script-main.js` in MAIN world, and observer exceptions cannot replace the page's real fetch response.

- [ ] **Step 2: Verify the test fails against current code**

Run: `node --test tests/passive-capture.test.js`
Expected: FAIL because the current interceptor synthesizes fake analytics responses.

- [ ] **Step 3: Refactor MAIN-world capture**

Capture original `window.fetch` once; always call it with unchanged args; clone returned responses for best-effort JSON inspection; normalize bounded candidates; return the real response regardless of observer success/failure.

- [ ] **Step 4: Update manifest/build inputs and verify**

Load `shared/song-metadata.js` before the MAIN observer and copy `src/shared/` to the Chromium build.

Run: `npm test && npm run build:chrome`
Expected: PASS and successful Chromium build.

- [ ] **Step 5: Commit**

```bash
git add manifests/manifest.chrome.json build.js src/content/ tests/passive-capture.test.js
git commit -m "refactor: make Suno capture passive"
```

### Task 4: Replace ZIP workflow with persistent metadata UI/export

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup.css`
- Create: `tests/popup-contract.test.js`

**Interfaces:**
- Consumes Task 2 service-worker messages.
- Produces user-initiated `BenG_Suno_Metadata_YYYY-MM-DD.json` via Blob + temporary download anchor.

- [ ] **Step 1: Write failing UI contract tests**

Assert visible/actions contract includes `Scan Library`, `Pause`, `Resume`, `Stop Scan`, `Export Metadata`, `Clear Local Index`, and `metadata only`; excludes `Download ZIP`, `Fetching files`, and ZIP controls. Assert error-state copy exists for storage/export failures.

- [ ] **Step 2: Verify failure against current ZIP UI**

Run: `node --test tests/popup-contract.test.js`
Expected: FAIL.

- [ ] **Step 3: Refactor scan lifecycle**

`startScan()` must not clear IndexedDB. Poll `GET_LIBRARY_SUMMARY`, not the full library. Only `Clear Local Index` is destructive and it requires an explicit click.

- [ ] **Step 4: Implement metadata export and error handling**

Request `GET_EXPORT_DOCUMENT`; if it contains `error`, display the error and leave the local index intact. Otherwise create an `application/json` Blob, download `BenG_Suno_Metadata_YYYY-MM-DD.json`, revoke the URL, and keep IndexedDB unchanged.

- [ ] **Step 5: Add scan completion summary and verify**

On automatic/manual stop call `SET_SCAN_COMPLETE`. Display count, oldest/newest creation dates, last scan time, and metadata-only wording.

Run: `npm test && npm run build:chrome`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/popup/ tests/popup-contract.test.js
git commit -m "feat: export Suno metadata only"
```

### Task 5: Remove supported Chromium media-download capability

**Files:**
- Modify: `manifests/manifest.chrome.json`
- Modify: `build.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/chromium-safety.test.js`

**Interfaces:**
- Produces a Chromium package with no `downloads`/`offscreen` permissions, no media-only CDN host permissions, and no built ZIP/ID3/offscreen runtime.

- [ ] **Step 1: Write failing Chromium safety tests**

Build Chromium and assert the generated manifest lacks `downloads`, `offscreen`, `cdn1.suno.ai`, and `cdn2.suno.ai`; assert `dist/chrome/offscreen/`, `dist/chrome/lib/jszip.min.js`, and `dist/chrome/lib/id3writer.js` do not exist.

- [ ] **Step 2: Verify failure against current build**

Run: `node --test tests/chromium-safety.test.js`
Expected: FAIL.

- [ ] **Step 3: Remove media paths from the supported Chromium build**

Stop copying `src/offscreen` and media libraries into Chromium; remove media-only manifest permissions/hosts. Keep any legacy Firefox source clearly marked unsupported rather than silently claiming Firefox parity.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build:chrome`
Expected: PASS; generated Chromium manifest has only permissions required for capture/storage/side-panel behavior.

```bash
git add manifests/manifest.chrome.json build.js package.json package-lock.json tests/chromium-safety.test.js
git commit -m "chore: remove Chromium media download path"
```

### Task 6: Documentation and acceptance verification

**Files:**
- Modify: `README.md`
- Create: `docs/metadata-schema-v1.md`
- Modify approved design only if implementation evidence requires a correction

- [ ] **Step 1: Document the finished Phase 1 contract**

README covers metadata-only purpose, Suno Explorer non-compete boundary, Chrome/Edge install/build, IndexedDB persistence, upsert semantics, JSON export, explicit non-goals, upstream attribution, and future MCP/Ben+Chris collaboration boundaries. `docs/metadata-schema-v1.md` documents all verified schema fields and `schema_version: 1`.

- [ ] **Step 2: Run clean automated verification**

```bash
npm ci
npm test
npm run build:chrome
```

Expected: all tests PASS and Chromium build succeeds.

- [ ] **Step 3: Inspect generated Chromium package**

Confirm expected background/content/shared/popup/icons assets only, no supported offscreen/media-downloader runtime, and minimal manifest permissions.

- [ ] **Step 4: Load unpacked build and smoke-test current Suno**

Verify normal Suno behavior remains intact; scan count rises; at least one current V6 record exports verified metadata; restart preserves count; rescan does not duplicate IDs; manual stop exports partial data; export contains metadata only; forced storage/export errors are surfaced without clearing the index; Clear Local Index acts only after explicit user action.

- [ ] **Step 5: Re-run the scale guard after browser fixes**

Run: `node --test --test-name-pattern="25,001" tests/song-store.test.js`
Expected: PASS.

- [ ] **Step 6: Commit documentation and perform final verification**

```bash
git add README.md docs/metadata-schema-v1.md docs/superpowers/specs/2026-10-06-ben-g-suno-metadata-bridge-design.md
git commit -m "docs: document Ben.G metadata bridge"
git status --short
npm test
npm run build:chrome
```

Expected: clean/intentional working tree, all tests PASS, build succeeds. Do not claim browser-only behavior that was not actually smoke-tested.
