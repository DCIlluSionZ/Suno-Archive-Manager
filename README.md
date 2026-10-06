# Ben.G Suno Metadata Bridge

A local-first Chromium extension for passively indexing structured metadata that Suno already delivers to your browser session, then exporting that metadata as JSON.

This repository is Ben's fork of Daniel Oxa's **Suno Archive Manager (SAM)**. Phase 1 deliberately changes the Chromium workflow from bulk media archiving to **metadata only**.

## What this fork does

- Passively observes Suno JSON responses while you browse or scan supported Suno pages.
- Normalizes song metadata into a stable local schema.
- Stores records persistently in IndexedDB, keyed by Suno song ID.
- Upserts repeat observations instead of duplicating songs.
- Exports a versioned metadata-only JSON document.
- Keeps audio downloading outside this extension and inside Suno's approved download flow.

It does **not** replace Suno Explorer. Suno Explorer remains the day-to-day library manager; this project is a narrow structured-data bridge for Ben.G workflows and future local tooling.

## Phase 1 status

Chrome/Edge is the accepted Phase 1 target.

The implementation has automated coverage for metadata discovery/normalization, IndexedDB persistence, duplicate-safe upserts, passive network observation, UI/export contracts, Chromium permission safety, and a 25,001-record scale guard.

A live current-Suno smoke test on 7 October 2026 verified the Chromium build against a public V6 playlist using an isolated Chrome for Testing profile. The test confirmed current V6 metadata capture, persistence across browser restart, duplicate-free rescans, manual stop/export behaviour, visible error handling, and metadata-only JSON output.

## Current V6 mappings

Current Suno V6 payloads observed during the acceptance test included:

- `model_name` such as `chirp-hawk`
- `major_model_version` such as `v6`
- `metadata.duration` for duration
- `metadata.tags` for style/tags
- `metadata.prompt` for custom lyrics
- `metadata.gpt_description_prompt` for a generation-description prompt when present
- `metadata.make_instrumental` for instrumental state

These mappings are handled defensively because Suno can change its payload shape. See [`docs/metadata-schema-v1.md`](docs/metadata-schema-v1.md) for the complete export contract.

## Build

Requirements: Node.js and npm.

```bash
npm ci
npm test
npm run build:chrome
```

The unpacked Chromium extension is built at:

```text
dist/chrome/
```

### Load in Chrome or Edge

1. Run `npm run build:chrome`.
2. Open the browser's extensions page.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select `dist/chrome/`.

Phase 1 acceptance is Chromium-only. The repository still contains legacy Firefox/upstream source, but Firefox parity is not part of the Phase 1 completion claim.

## Usage

1. Open a supported Suno page such as your library or a playlist.
2. Open the extension side panel.
3. Click **Scan Library**.
4. The extension reloads/scrolls the Suno page so normal Suno responses can be observed.
5. Use **Pause**, **Resume**, or **Stop Scan** as needed.
6. Click **Export Metadata** to save `BenG_Suno_Metadata_YYYY-MM-DD.json`.

A rescan does not clear the existing index. It updates records by Suno song ID and preserves each record's original `first_seen_at` while advancing `last_seen_at` when a newer observation arrives.

**Clear Local Index** is the only destructive reset action and requires an explicit confirmation.

## Export format

The JSON export has this top-level contract:

```json
{
  "schema_version": 1,
  "exported_at": "2026-10-07T00:00:00.000Z",
  "source": "ben-g-suno-metadata-bridge",
  "song_count": 1,
  "songs": []
}
```

Audio URLs are intentionally excluded from canonical exported song records. The Chromium extension has no `downloads` or `offscreen` permission and does not package the old JSZip/ID3/offscreen media-downloader runtime.

## Storage

The authoritative local index is IndexedDB:

```text
Database: ben-g-suno-metadata
Version: 1
Object stores:
- songs     (keyPath: id)
- app_meta  (keyPath: key)
```

IndexedDB is used because a large song library containing lyrics and style metadata can exceed the normal extension key/value storage quota. The automated test suite exercises 25,001 records.

## Privacy and safety boundary

The Chromium extension:

- observes metadata already delivered to the active Suno page;
- does not block, rewrite, or synthesize Suno network responses;
- does not store cookies, authorization headers, signed request material, or entire response payloads;
- keeps only a bounded allow-list of useful source metadata;
- does not fetch song audio, stems, or cover files for archiving;
- does not automate paid Suno generation actions.

## Relationship to Suno Explorer

This project is not intended to recreate search, playlists, ratings, mastering, lineage UI, or other full library-management features that Suno Explorer already handles well.

The intended split is:

```text
Suno / Suno Explorer
        |
        v
Ben.G Suno Metadata Bridge
        |
        v
versioned local metadata
        |
        +--> future Ben.G Music MCP
        +--> local masters / Ableton links
        +--> future Ben + Chris collaboration workspace
```

The future collaboration layer can hold lyric drafts, voice memos, demos, comments, current-version markers, and Suno IDs/links without using Suno itself as the collaboration backend.

## Development

Run the complete verification suite with:

```bash
npm test
npm run build:chrome
```

The source of truth lives under `src/` and `manifests/`; `dist/chrome/` is generated by the build.

## Upstream attribution

This fork is based on **Suno Archive Manager** by Daniel Oxa (`danieloxa/Suno-Archive-Manager`). The original project provided the browser-extension architecture that this fork adapts for metadata-only use. Preserve upstream attribution and applicable license terms when redistributing or extending the project.

The package declares the ISC license in `package.json`.
