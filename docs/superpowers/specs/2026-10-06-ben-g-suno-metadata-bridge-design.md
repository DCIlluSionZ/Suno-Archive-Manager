# Ben.G Suno Metadata Bridge — Design

Date: 2026-10-06
Repository: `DCIlluSionZ/Suno-Archive-Manager`
Branch: `design/ben-g-metadata-bridge`
Status: Design for review

## 1. Purpose

Adapt Ben's fork of Suno Archive Manager into a small, local-first metadata bridge for Ben.G music workflows.

The project must **not compete with Suno Explorer**. Suno Explorer remains the primary day-to-day library manager. This fork becomes a narrow bridge that captures structured metadata from Ben's own Suno session, stores it locally, and exports it in a stable format that future tools such as a Ben.G Music MCP can consume.

The project must also leave a clean future boundary for Ben + Chris songwriting collaboration without implementing collaboration in this phase.

## 2. Success criteria

Phase 1 is successful when the Chrome/Edge extension can:

1. Passively observe Ben's own Suno pages and collect song metadata without blocking, replacing, or modifying Suno network requests.
2. Persist captured metadata across extension/service-worker/browser restarts.
3. Deduplicate records reliably by Suno song ID.
4. Export a stable, documented metadata-only JSON file.
5. Preserve enough raw/unknown fields, where safely practical, that future schema expansion does not require rediscovering everything from scratch.
6. Build cleanly for Chromium browsers and be testable without downloading audio.
7. Contain no bulk-audio download path in the supported Ben.G workflow.

## 3. Non-goals

This phase will not:

- Replace or recreate Suno Explorer.
- Download Suno audio, stems, or other media in bulk.
- Circumvent Suno download limits or approved download channels.
- Build an MCP server yet.
- Build Ben + Chris collaboration yet.
- Add cloud accounts, a hosted backend, authentication, billing, or sync.
- Attempt to control Suno generation or automate paid Suno actions.
- Attempt to repair the upstream archive ZIP workflow.

## 4. Current baseline

The fork is identical to upstream at commit `76d98739daf7d5405dba3a78927d824a0208dce8`.

The current extension already separates three useful concerns:

- page-world interception and song normalization,
- browser-extension messaging/storage,
- ZIP/media fetching and export.

That separation makes it possible to retain the metadata flow while removing the media-download path.

The current Chromium implementation uses:

- a MAIN-world content script that patches `window.fetch`,
- an isolated-world bridge,
- an MV3 service worker,
- `chrome.storage.session`,
- a side-panel UI,
- an offscreen document for ZIP/media work.

The current MAIN-world interceptor also returns fake responses for selected analytics URLs. The Ben.G version will remove that behaviour. Observation must not intentionally alter Suno request/response behaviour.

## 5. Compliance and safety boundary

The supported Ben.G workflow is metadata-only.

The extension may observe metadata that Suno already delivers to Ben's authenticated browser session. It must not add a replacement mechanism for obtaining audio files outside Suno's provided download channels.

The existing offscreen ZIP/audio machinery will therefore be removed from the supported Chromium build or made unreachable and then removed as part of the same implementation phase if doing so is simpler and safer.

The manifest should lose permissions that are only required for media downloading, including `downloads` and `offscreen`, once no supported code path needs them.

## 6. Architecture

### 6.1 Capture layer

Retain a small MAIN-world observer because Suno's application data is easiest to observe where page `fetch` responses are visible.

Requirements:

- capture the original `window.fetch` exactly once,
- call the original fetch unmodified,
- clone eligible JSON responses after the real response returns,
- search response payloads for song-like records,
- never block analytics or other requests,
- never rewrite request arguments,
- never synthesize fake Suno responses,
- tolerate non-JSON responses and schema drift without breaking Suno.

The observer should send normalized metadata to the extension through the existing bridge.

### 6.2 Canonical metadata schema

Create a versioned schema with `schema_version` at the export level.

Each song record should support these canonical fields when available:

- `id`
- `title`
- `display_name`
- `created_at`
- `model_name` / model identifier
- `duration_seconds`
- `tags`
- `prompt`
- `lyrics`
- `is_instrumental`
- `suno_url` or derivable song URL
- `image_url`
- relationship identifiers such as parent/source/continuation/remix/cover IDs when available
- capture timestamps: `first_seen_at`, `last_seen_at`

Audio URLs may be observed as part of raw Suno payloads, but they are not required for the canonical Ben.G schema and must not be used to fetch audio.

Because Suno payloads can evolve, normalization should be defensive. Missing fields remain absent or `null` rather than causing capture failure.

Where practical, preserve a bounded `source_metadata` object containing useful non-sensitive fields not yet promoted into the canonical schema. Do not blindly persist entire response payloads, credentials, cookies, authorization headers, or unrelated user/account data.

### 6.3 Persistent local store

Replace `chrome.storage.session` as the authoritative store.

Preferred implementation for Phase 1: `chrome.storage.local`, because the first target is a modest, inspectable metadata index and the repository is currently a lightweight vanilla-JS extension.

Storage model:

- dictionary/map keyed by Suno song ID,
- upsert rather than append-only duplication,
- retain `first_seen_at`, update `last_seen_at`,
- update canonical fields when a newer observation provides better/non-empty values,
- maintain schema/storage version metadata.

If real-world library size demonstrates that `chrome.storage.local` is unsuitable, migration to IndexedDB becomes a separate, evidence-driven change rather than Phase 1 complexity.

### 6.4 Export layer

Replace `Download ZIP` with `Export Metadata`.

Export format:

```json
{
  "schema_version": 1,
  "exported_at": "ISO-8601 timestamp",
  "source": "ben-g-suno-metadata-bridge",
  "song_count": 123,
  "songs": []
}
```

The export is JSON only in Phase 1.

Future JSONL/CSV exports can be added later if an actual consumer needs them.

The export should use a normal browser-created JSON Blob and user-initiated save/download. It must not fetch song media.

### 6.5 Side-panel UI

Keep the interface deliberately small.

Target states:

- not on Suno,
- ready,
- scanning,
- scan complete / indexed,
- export success/error.

Primary actions:

- `Scan Library`
- `Pause` / `Resume`
- `Stop Scan`
- `Export Metadata`
- `Clear Local Index`

Show:

- indexed song count,
- scan progress signals where trustworthy,
- oldest/newest creation dates when available,
- last scan time,
- clear statement that the tool exports metadata only.

Do not add playlist management, rating, Keep/Maybe/Skip, mastering, or other Suno Explorer-like features.

## 7. Chromium-first scope

Phase 1 targets Chrome/Edge MV3 only because that is Ben's active desktop browser path and it keeps the first implementation narrow.

Firefox support remains in the repository but is not required to reach Phase 1 acceptance. The implementation should avoid gratuitously breaking shared code, but a Firefox parity pass is a later task.

## 8. Future MCP boundary

The extension is a producer of trusted structured data, not the MCP server itself.

A later local Ben.G Music service/MCP can consume exported or locally mirrored metadata and expose tools such as:

- search songs,
- search lyrics/prompts/tags,
- retrieve a song/version record,
- inspect relationship lineage,
- compare versions,
- link Suno records to local masters, Ableton projects, or approved downloads.

Keeping MCP outside the browser extension avoids mixing browser interception, local library indexing, AI tool schemas, and collaboration into one brittle component.

## 9. Future Ben + Chris collaboration boundary

Collaboration is explicitly out of scope for Phase 1, but the future system should treat collaboration as a separate module connected by stable song/project identifiers.

A future collaboration workspace may contain:

- song/project ID,
- collaborators,
- lyric drafts,
- voice memos and demo recordings,
- approved Suno links/IDs,
- stems or local files shared through an appropriate storage provider,
- comments and change notes,
- current/preferred version markers,
- simple ownership/status such as `Ben's turn` / `Chris's turn`.

Suno should be treated as one source of versions, not as the collaboration backend.

The Phase 1 metadata schema should therefore keep stable Suno IDs and relationship identifiers so a future project record can link to Suno creations without copying Suno Explorer's job.

## 10. Data flow

```text
Ben opens Suno library
        |
        v
MAIN-world passive fetch observer
        |
        v
isolated extension bridge
        |
        v
service worker validates + normalizes/upserts
        |
        v
chrome.storage.local
        |
        +--> side-panel counts/status
        |
        +--> user-initiated metadata JSON export

Future only:
metadata export/local mirror --> Ben.G Music service/MCP --> Tahlia / Antigravity / other agents
                                         |
                                         +--> collaboration workspace
```

## 11. Error handling

- A malformed/non-JSON Suno response must be ignored, not surfaced as a fatal error.
- Schema drift must not break normal Suno browsing.
- Storage failures should show a clear extension error and stop claiming data is safely indexed.
- Export failure must leave the local index intact.
- Scan completion must use conservative signals; it should be possible to stop manually and export partial metadata.
- The extension must never deliberately break Suno network calls to make scanning easier.

## 12. Testing and verification

Implementation must include automated tests for logic that can be isolated from browser APIs, especially:

1. recursive song discovery from representative nested response fixtures,
2. normalization of multiple payload shapes,
3. defensive handling of missing fields,
4. deduplication/upsert rules,
5. merge behaviour for richer/newer observations,
6. export schema/version/count,
7. proof that observer logic does not intentionally return fake responses for analytics URLs.

Browser verification should cover:

- extension builds for Chromium,
- manifest loads unpacked,
- Suno opens and behaves normally with the extension enabled,
- a scan indexes metadata from Ben's authenticated library,
- browser/service-worker restart preserves the index,
- metadata export contains expected records and no downloaded audio,
- removed permissions are actually absent from the Chromium manifest.

No acceptance claim should depend only on mocked fixtures; at least one current-Suno browser smoke test is required before calling Phase 1 complete.

## 13. Minimal implementation sequence

1. Clone Ben's fork locally under `/Users/dci/DCI-Code/Suno-Archive-Manager` after this design is approved.
2. Create an implementation branch/worktree according to the development workflow.
3. Add tests around normalization, merge/upsert, and export schema before production-code changes.
4. Refactor capture so it is passive and does not block analytics/network requests.
5. Expand the canonical metadata normalizer.
6. Replace session storage with versioned persistent local storage and deterministic upserts.
7. Replace ZIP/media export with metadata-only JSON export.
8. Remove Chromium media-download/offscreen code and permissions no longer needed.
9. Simplify the side-panel copy/actions to the metadata workflow.
10. Build and run automated verification.
11. Load the unpacked Chromium build and smoke-test against current Suno.
12. Update README with the new purpose, limitations, attribution, and metadata schema.

## 14. Upstream attribution and repository identity

Preserve attribution to Daniel Oxa / the upstream Suno Archive Manager project and retain applicable license notices.

The fork may be renamed later if Ben wants a distinct product identity, but Phase 1 should prioritize behaviour and data-contract stability over branding.

## 15. Acceptance boundary

Phase 1 is complete only when:

- Chromium build passes,
- automated tests pass,
- passive capture is verified,
- persistent local index is verified across restart,
- JSON metadata export is verified,
- no supported path fetches song audio,
- no Chromium download/offscreen permissions remain unless a documented metadata-only need is discovered,
- current Suno smoke test succeeds,
- README accurately documents the fork's purpose and limits.

Anything beyond that — MCP, collaboration, cloud sync, richer search UI, Firefox parity, Suno Explorer integration — requires a separate approved follow-on design/change.
