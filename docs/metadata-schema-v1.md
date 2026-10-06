# Ben.G Suno Metadata Export Schema v1

This document defines the stable Phase 1 JSON contract exported by the Ben.G Suno Metadata Bridge.

## Export envelope

```json
{
  "schema_version": 1,
  "exported_at": "2026-10-07T00:00:00.000Z",
  "source": "ben-g-suno-metadata-bridge",
  "song_count": 1,
  "songs": []
}
```

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | integer | Export schema version. Phase 1 is `1`. |
| `exported_at` | ISO-8601 string | Time the export document was built. |
| `source` | string | Always `ben-g-suno-metadata-bridge` for schema v1. |
| `song_count` | integer | Number of song records in `songs`. |
| `songs` | array | Canonical song records sorted deterministically by `created_at`, then `id`. |

## Canonical song record

Fields remain present with `null` where the current payload did not provide a meaningful value, unless otherwise noted.

| Field | Type | Current mapping / meaning |
|---|---|---|
| `id` | string | Suno song/clip ID. Primary key in IndexedDB. |
| `title` | string | Song title. |
| `display_name` | string or null | Creator display name where available. |
| `created_at` | ISO-8601 string or null | Suno creation time. |
| `model_name` | string or null | Current internal Suno model identifier. Live V6 acceptance data used values such as `chirp-hawk`. |
| `major_model_version` | string or null | User-facing/model-family version. Live acceptance data used `v6`. Kept separately from `model_name`. |
| `duration_seconds` | number or null | Duration, currently observed in `metadata.duration` or equivalent aliases. |
| `tags` | string or null | Style/tags text. Current V6 payloads use `metadata.tags`. |
| `prompt` | string or null | Generation-description prompt when present, preferring `gpt_description_prompt`/description-style fields. This is not used for custom lyrics. |
| `lyrics` | string or null | Song lyrics. Current V6 custom-song payloads were verified to carry lyrics in `metadata.prompt`; explicit `lyrics`/`text` aliases are preferred when present. |
| `is_instrumental` | boolean or null | Instrumental flag, including current `metadata.make_instrumental`. |
| `suno_url` | string | Direct/observed Suno URL where available; otherwise derived as `https://suno.com/song/<id>`. |
| `image_url` | string or null | Suno image URL. This is metadata only; the extension does not fetch the image for archiving. |
| `parent_id` | string or null | Parent/parent-clip relationship when available. |
| `source_id` | string or null | Source relationship when available. |
| `continuation_id` | string or null | Continuation relationship when available. |
| `remix_id` | string or null | Remix relationship when available. |
| `cover_id` | string or null | Cover relationship when available. |
| `first_seen_at` | ISO-8601 string | First time this bridge indexed the Suno ID. Preserved across later observations. |
| `last_seen_at` | ISO-8601 string | Most recent observation time. Updated by rescans/upserts. |
| `source_metadata` | object | Bounded allow-list of useful non-sensitive source fields. |

## `source_metadata`

Schema v1 may preserve these fields when present:

- `major_model_version`
- `model_name`
- `type`
- `status`
- `display_name`
- `handle`
- `is_public`
- `is_liked`
- `upvote_count`
- `play_count`

The object is deliberately allow-listed. The extension does **not** blindly persist source response objects.

## Intentionally excluded

Canonical records intentionally exclude:

- `audio_url`
- cookies
- authorization headers or tokens
- signed request material
- complete raw Suno API payloads
- unrelated account/user data

An audio URL may exist in the page response observed by the content script, but it is not retained in the exported canonical song record and is never used by the Chromium bridge to download media.

## Song detection

A payload object is not considered a song merely because it has an `id` and `title`. Phase 1 requires additional song evidence such as creation/model/media metadata, duration, tags, lyrics/prompt metadata, or instrumental state. This rule was tightened after the current-Suno acceptance test exposed unrelated title-only feed entities.

## Merge/upsert rules

Records are keyed by `id`.

When the same ID is observed again:

1. `first_seen_at` stays at the original value.
2. `last_seen_at` advances to the newer observation.
3. New non-empty canonical values enrich/replace older values.
4. Empty/null incoming values do not erase useful existing values.
5. `source_metadata` is merged only within its bounded allow-list.

This allows repeated scans to refresh metadata without creating duplicate records.

## Verified current-Suno behaviour

Acceptance testing on 7 October 2026 used an isolated Chrome for Testing profile and a public Suno playlist. The corrected build indexed six real song IDs, including current V6 records, and verified:

- `model_name` and `major_model_version` are distinct fields;
- `major_model_version` was `v6` on the observed current records;
- current custom lyrics were read from `metadata.prompt`;
- rescanning kept the record count and unique-ID count equal;
- browser restart preserved the IndexedDB index;
- JSON export contained no `audio_url` field.

Suno is an external service and may change payload fields. Schema v1 therefore normalizes defensively and should be updated only from observed evidence plus regression tests.
