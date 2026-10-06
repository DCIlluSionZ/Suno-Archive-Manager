# Ben.G Suno Metadata Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Chromium build of Suno Archive Manager into a passive, persistent, metadata-only Ben.G Suno bridge that can safely index a very large Suno library and export a stable JSON contract for future local MCP/collaboration tooling.

**Architecture:** Keep the existing MAIN-world fetch observation + isolated bridge pattern, but move reusable metadata logic into a small shared module. Store canonical records in IndexedDB from the MV3 service worker, expose count/summary/export messages to the side panel, and remove the supported Chromium audio/ZIP path and its permissions. Suno Explorer remains the primary library manager; this fork remains a narrow metadata producer.

**Tech Stack:** Vanilla JavaScript, Chrome/Edge Manifest V3, IndexedDB, Node.js built-in `node:test`, `fake-indexeddb` as a dev-only test dependency, existing build script.

**Spec:** `docs/superpowers/specs/2026-10-06-ben-g-suno-metadata-bridge-design.md`

## Global Constraints

- Chromium/Chrome/Edge is the only Phase 1 acceptance target.
- Passive observation only: never block, replace, rewrite, or synthesize Suno network requests/responses.
- No supported Chromium path may fetch or bulk-download song audio, stems, or media.
- No cloud backend, account system, MCP server, collaboration backend, or Suno generation automation in Phase 1.
- Persistent storage must use IndexedDB, not `chrome.storage.local`, because Ben's library can exceed 25,000 songs.
- Suno song ID is the stable primary key; rescans upsert/refresh existing records rather than clearing the library automatically.
- Preserve upstream attribution and the existing ISC license information.
- Missing or changed Suno fields must degrade to `null`/absence rather than breaking Suno browsing or the scan.

## Review Focus

1. **Metadata-only Suno records without `audio_url`:** discovery must still recognize a valid song record and not depend on downloadable audio being present. Covered by Task 1 tests.
2. **Schema drift / malformed nested responses:** discovery and normalization must ignore unrelated or malformed objects without throwing. Covered by Task 1 tests.
3. **Very large libraries (25,000+ records):** IndexedDB batch upsert/count/export must complete without relying on extension storage quotas or loading records into browser session storage. Covered by Task 2 tests.
4. **Repeated scans with partial/richer data:** existing `first_seen_at` must remain stable while non-empty newer fields and `last_seen_at` update deterministically. Covered by Tasks 1–2 tests.
5. **Normal Suno requests including analytics:** observer must always call the captured original fetch and return the real response; no URL class may receive a fake response. Covered by Task 3 tests/static assertions and final browser smoke test.

---

### Task 1: Canonical metadata/discovery module

**Files:**
- Create: `src/shared/song-metadata.js`
- Create: `tests/song-metadata.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces global/CommonJS-compatible `BenGSunoMetadata` with:
  - `findSongCandidates(value) -> Array<object>`
  - `normalizeSong(raw, seenAtIso) -> object|null`
  - `mergeSongRecord(existing, incoming) -> object`
  - `buildExportDocument(songs, exportedAtIso) -> object`
- Later tasks consume these exact names from the browser global or `require()` in Node tests.

- [ ] **Step 1: Add the test runner and dev-only IndexedDB test dependency**

Set `package.json` scripts to include `"test": "node --test tests/*.test.js"` and add `fake-indexeddb` under `devDependencies`. Keep runtime dependencies unchanged in this task.

- [ ] **Step 2: Write failing discovery/normalization tests**

Add tests asserting that:
- a nested valid song with `id`, `title`, prompt/tags metadata and **no `audio_url`** is discovered;
- unrelated objects with IDs are not treated as songs;
- malformed/null/non-object inputs return no candidates and do not throw;
- normalization maps canonical fields: `id`, `title`, `display_name`, `created_at`, `model_name`, `duration_seconds`, `tags`, `prompt`, `lyrics`, `is_instrumental`, `suno_url`, `image_url`, relationship IDs when available, `first_seen_at`, `last_seen_at`;
- missing optional fields are `null`/empty by the schema decision, never fatal;
- `source_metadata` contains only the documented bounded allow-list and never blindly copies the source object.

- [ ] **Step 3: Run the targeted test and verify failure**

Run: `npm test -- --test-name-pattern="discovery|normalize"`
Expected: FAIL because `src/shared/song-metadata.js` does not yet exist.

- [ ] **Step 4: Implement `findSongCandidates` and `normalizeSong`**

Use a defensive song-like predicate that does not require an audio URL. `suno_url` should be derived as `https://suno.com/song/<id>` when a direct URL is not present. Keep `source_metadata` to a small explicit allow-list of useful, non-sensitive metadata fields; never retain cookies, headers, auth material, or full response payloads.

- [ ] **Step 5: Write failing merge/export tests**

Assert that `mergeSongRecord` preserves the original `first_seen_at`, advances `last_seen_at`, keeps existing useful values when the new value is empty, adopts richer/new non-empty canonical values, and merges bounded `source_metadata` deterministically. Assert that `buildExportDocument` returns exactly top-level `schema_version: 1`, `exported_at`, `source: "ben-g-suno-metadata-bridge"`, `song_count`, and `songs` sorted deterministically by `created_at` then `id`.

- [ ] **Step 6: Implement merge/export helpers and run the full Task 1 test file**

Run: `node --test tests/song-metadata.test.js`
Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add package.json package-lock.json src/shared/song-metadata.js tests/song-metadata.test.js
git commit -m "feat: add canonical Suno metadata schema"
```

### Task 2: IndexedDB-backed persistent song store

**Files:**
- Create: `src/background/song-store.js`
- Create: `tests/song-store.test.js`
- Modify: `src/background/service-worker.js`

**Interfaces:**
- Consumes: `BenGSunoMetadata.mergeSongRecord` from Task 1.
- Produces global/CommonJS-compatible `BenGSunoStore` with:
  - `openSongDatabase(indexedDBImpl = globalThis.indexedDB) -> Promise<IDBDatabase>`
  - `upsertSongs(db, songs) -> Promise<{added:number, updated:number, total:number}>`
  - `getLibrarySummary(db) -> Promise<{count:number, oldest_created_at:string|null, newest_created_at:string|null, last_scan_at:string|null}>`
  - `getAllSongs(db) -> Promise<Array<object>>`
  - `clearSongs(db) -> Promise<void>`
  - `setLastScanAt(db, iso) -> Promise<void>`

- [ ] **Step 1: Write failing IndexedDB persistence/upsert tests**

Using `fake-indexeddb`, assert database name `ben-g-suno-metadata`, schema version `1`, object store `songs` with key path `id`, and metadata store `app_meta`. Assert insert, update, clear, count, summary date range, and `last_scan_at` behavior.

- [ ] **Step 2: Add a 25,001-song synthetic store test**

Generate 25,001 compact canonical records, batch-upsert them, assert total `25001`, then read/export the full collection and verify first/last IDs are intact. This test is specifically the guard against accidentally reverting to quota-limited extension key/value storage.

- [ ] **Step 3: Run store tests and verify failure**

Run: `node --test tests/song-store.test.js`
Expected: FAIL because `song-store.js` does not exist.

- [ ] **Step 4: Implement the IndexedDB store**

Use one readwrite transaction per upsert batch and merge existing records by ID using Task 1 logic. Keep the DB API isolated from `chrome.*` so it remains unit-testable.

- [ ] **Step 5: Replace service-worker session storage messages with IndexedDB messages**

At service-worker startup import the shared schema and store scripts. Replace `GET_SONGS` polling with `GET_LIBRARY_SUMMARY`; support `ADD_SONGS`, `GET_LIBRARY_SUMMARY`, `GET_EXPORT_DOCUMENT`, `CLEAR_SONGS`, `SET_SCAN_COMPLETE`, and `SCROLL_COMPLETE`. `GET_EXPORT_DOCUMENT` reads all songs and calls `buildExportDocument` but does not download anything itself.

- [ ] **Step 6: Run Task 1 + Task 2 tests**

Run: `npm test`
Expected: PASS including the 25,001-song synthetic test.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/background/service-worker.js src/background/song-store.js tests/song-store.test.js
git commit -m "feat: persist Suno metadata in IndexedDB"
```

### Task 3: Make Chromium capture strictly passive

**Files:**
- Modify: `manifests/manifest.chrome.json`
- Modify: `src/content/content-script-main.js`
- Modify: `src/content/content-bridge.js` only if message shape needs adjustment
- Modify: `build.js`
- Create: `tests/passive-capture.test.js`

**Interfaces:**
- Consumes: `BenGSunoMetadata.findSongCandidates` and `normalizeSong` from Task 1.
- Produces: canonical `SONGS` messages from MAIN world to the existing isolated bridge; no media fetching or request rewriting.

- [ ] **Step 1: Write a failing passive-capture test/static guard**

Test the source text/isolated observer helper so that there is no branch returning `new Response(...)` for analytics URLs and no URL blocklist that bypasses the original fetch. Assert shared metadata script is loaded before `content-script-main.js` in the MAIN world.

- [ ] **Step 2: Run the passive-capture test and verify failure against the current analytics-blocking code**

Run: `node --test tests/passive-capture.test.js`
Expected: FAIL because the current interceptor synthesizes `{}` responses for analytics/noise URLs.

- [ ] **Step 3: Refactor MAIN-world capture**

Capture `window.fetch` once; for every request call the true original with unchanged arguments; clone successful responses for best-effort JSON inspection; use Task 1 discovery/normalization; send only canonical bounded records through `window.postMessage`; return the real response unchanged in all cases.

- [ ] **Step 4: Update Chromium manifest/build inputs**

Load `shared/song-metadata.js` before the MAIN-world observer. Ensure `src/shared/` is copied into `dist/chrome/shared/`. Do not add any new host permissions.

- [ ] **Step 5: Run tests and Chromium build**

Run: `npm test && npm run build:chrome`
Expected: all tests PASS and build prints `✓ Chrome build → dist/chrome/`.

- [ ] **Step 6: Commit Task 3**

```bash
git add manifests/manifest.chrome.json build.js src/content/content-script-main.js src/content/content-bridge.js tests/passive-capture.test.js
git commit -m "refactor: make Suno capture passive"
```

### Task 4: Replace ZIP workflow with metadata-only side-panel export

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup.css`
- Create: `tests/popup-contract.test.js`

**Interfaces:**
- Consumes service-worker messages from Task 2.
- Produces user-initiated JSON file `BenG_Suno_Metadata_YYYY-MM-DD.json` from `GET_EXPORT_DOCUMENT` using a Blob + temporary anchor in the side-panel document.

- [ ] **Step 1: Write failing UI contract tests**

Assert the side panel exposes `Scan Library`, `Pause`, `Resume`, `Stop Scan`, `Export Metadata`, and `Clear Local Index`, contains the phrase `metadata only`, and contains no `Download ZIP`, `Fetching files`, or ZIP progress controls.

- [ ] **Step 2: Run UI contract test and verify failure**

Run: `node --test tests/popup-contract.test.js`
Expected: FAIL against the current ZIP UI.

- [ ] **Step 3: Refactor scan lifecycle to persistent upsert semantics**

`startScan()` must not call `CLEAR_SONGS`. Poll `GET_LIBRARY_SUMMARY` for counts instead of requesting all song records. `Clear Local Index` remains the only destructive reset and must require an explicit click.

- [ ] **Step 4: Implement metadata JSON export in the side panel**

Request `GET_EXPORT_DOCUMENT`, create `application/json` Blob, trigger a same-document anchor download named `BenG_Suno_Metadata_YYYY-MM-DD.json`, revoke the Blob URL, and leave IndexedDB untouched on success or failure.

- [ ] **Step 5: Update status copy and final scan metadata**

On completed/manual stop send `SET_SCAN_COMPLETE` with current ISO time. Display count, oldest/newest dates, and last scan time when present. Remove media/ZIP progress language.

- [ ] **Step 6: Run tests and build**

Run: `npm test && npm run build:chrome`
Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/popup/popup.html src/popup/popup.js src/popup/popup.css tests/popup-contract.test.js
git commit -m "feat: export Suno metadata only"
```

### Task 5: Remove supported Chromium media-download capability and permissions

**Files:**
- Modify: `manifests/manifest.chrome.json`
- Modify: `build.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/chromium-safety.test.js`

**Interfaces:**
- Produces a Chromium package with no `downloads` permission, no `offscreen` permission, no Suno CDN host permissions needed only for media fetches, no built `offscreen/` directory, and no built JSZip/ID3 runtime libraries.

- [ ] **Step 1: Write failing Chromium safety tests**

Build Chromium during the test setup and assert `dist/chrome/manifest.json` lacks `downloads` and `offscreen`, lacks `cdn1.suno.ai`/`cdn2.suno.ai` media-only host permissions, and that `dist/chrome/offscreen/`, `dist/chrome/lib/jszip.min.js`, and `dist/chrome/lib/id3writer.js` do not exist.

- [ ] **Step 2: Run safety test and verify failure**

Run: `node --test tests/chromium-safety.test.js`
Expected: FAIL against the current build.

- [ ] **Step 3: Remove Chromium media build paths and runtime dependencies**

Stop copying `src/offscreen` and `src/lib` into the Chromium build; remove now-unused Chromium manifest permissions/hosts. If `browser-id3-writer` and `jszip` remain necessary only for the unsupported legacy Firefox source, move them out of the supported Chromium path and document that status rather than silently breaking Firefox source files.

- [ ] **Step 4: Run all tests and inspect built manifest**

Run: `npm test && npm run build:chrome && node -e "const m=require('./dist/chrome/manifest.json'); console.log(m.permissions,m.host_permissions)"`
Expected: tests PASS; printed permissions contain no `downloads`/`offscreen`; host permissions are limited to Suno pages needed for capture.

- [ ] **Step 5: Commit Task 5**

```bash
git add manifests/manifest.chrome.json build.js package.json package-lock.json tests/chromium-safety.test.js
git commit -m "chore: remove Chromium media download path"
```

### Task 6: Documentation, scale verification, and current-Suno smoke test

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-06-ben-g-suno-metadata-bridge-design.md` only if implementation reality requires a documented correction
- Create: `docs/metadata-schema-v1.md`

**Interfaces:**
- Produces the documented Phase 1 contract and acceptance evidence; no new runtime interface.

- [ ] **Step 1: Update README and schema documentation**

Document the fork's metadata-only purpose, Suno Explorer non-compete boundary, Chrome/Edge install/build steps, IndexedDB persistence, scan/upsert behavior, export format, explicit non-goals, upstream attribution, and future MCP/collaboration boundaries. Document every canonical schema field and `schema_version: 1` in `docs/metadata-schema-v1.md`.

- [ ] **Step 2: Run clean automated verification**

Run from a clean dependency install:

```bash
npm ci
npm test
npm run build:chrome
```

Expected: all tests PASS and Chromium build succeeds.

- [ ] **Step 3: Perform static build acceptance checks**

Verify generated Chromium package contains only the expected background/content/shared/popup/icons assets, no offscreen/media-downloader runtime, and manifest permissions match Task 5.

- [ ] **Step 4: Load unpacked Chromium build and smoke-test against current Suno**

Load `dist/chrome/` in Edge/Chrome, open Ben's authenticated Suno library, and verify:
- normal Suno browsing/network behavior remains intact;
- scan count increases;
- at least one current V6 song exports expected metadata;
- a browser/service-worker restart preserves the indexed count;
- rescanning does not duplicate song IDs;
- manual stop can export a partial index;
- exported JSON contains no downloaded audio payloads/files;
- Clear Local Index removes the local catalogue only after explicit user action.

- [ ] **Step 5: Re-run the 25,001-record scale test after browser smoke fixes**

Run: `node --test tests/song-store.test.js --test-name-pattern="25,001"`
Expected: PASS.

- [ ] **Step 6: Commit documentation/acceptance updates**

```bash
git add README.md docs/metadata-schema-v1.md docs/superpowers/specs/2026-10-06-ben-g-suno-metadata-bridge-design.md
git commit -m "docs: document Ben.G metadata bridge"
```

- [ ] **Step 7: Final branch verification before completion claim**

Run: `git status --short && npm test && npm run build:chrome`
Expected: clean/intentional working tree, all tests PASS, build succeeds. Record any browser-only limitations explicitly rather than claiming unverified behavior.
