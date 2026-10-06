'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let metadata = null;
try {
  metadata = require('../src/shared/song-metadata.js');
} catch (_) {
  // RED: module does not exist yet.
}

function requireMetadata() {
  assert.ok(metadata, 'BenGSunoMetadata module should exist');
  return metadata;
}

test('discovery finds nested song metadata without requiring audio_url', () => {
  const { findSongCandidates } = requireMetadata();
  const payload = {
    page: {
      clips: [
        { id: 'song-1', title: 'River Road', metadata: { tags: 'country, soul', prompt: 'Warm dusk song' } },
      ],
    },
  };
  assert.deepEqual(findSongCandidates(payload).map((s) => s.id), ['song-1']);
});

test('discovery ignores unrelated ids and malformed values', () => {
  const { findSongCandidates } = requireMetadata();
  assert.deepEqual(findSongCandidates(null), []);
  assert.deepEqual(findSongCandidates('nope'), []);
  assert.deepEqual(findSongCandidates({ id: 'user-1', email: 'x@example.com' }), []);
  assert.deepEqual(findSongCandidates({ nested: [{ id: 'thing-1', status: 'ok' }] }), []);
});

test('normalize maps canonical fields and bounded source metadata', () => {
  const { normalizeSong } = requireMetadata();
  const seen = '2026-10-07T00:00:00.000Z';
  const raw = {
    id: 'abc123',
    title: 'Hesitate',
    display_name: 'Ben.G',
    created_at: '2026-10-01T10:00:00.000Z',
    model_name: 'chirp-v6',
    duration: 214.5,
    image_large_url: 'https://img.example/cover.jpg',
    parent_clip_id: 'parent-1',
    source_clip_id: 'source-1',
    audio_url: 'https://cdn.example/audio.mp3',
    metadata: {
      tags: 'synthwave, art pop',
      prompt: 'Driving 80s alternative pop',
      lyrics: 'hello world',
      is_instrumental: false,
      major_model_version: 'v6',
      private_secret: 'do-not-copy',
    },
  };
  const out = normalizeSong(raw, seen);
  assert.equal(out.id, 'abc123');
  assert.equal(out.title, 'Hesitate');
  assert.equal(out.display_name, 'Ben.G');
  assert.equal(out.created_at, '2026-10-01T10:00:00.000Z');
  assert.equal(out.model_name, 'chirp-v6');
  assert.equal(out.duration_seconds, 214.5);
  assert.equal(out.tags, 'synthwave, art pop');
  assert.equal(out.prompt, 'Driving 80s alternative pop');
  assert.equal(out.lyrics, 'hello world');
  assert.equal(out.is_instrumental, false);
  assert.equal(out.suno_url, 'https://suno.com/song/abc123');
  assert.equal(out.image_url, 'https://img.example/cover.jpg');
  assert.equal(out.parent_id, 'parent-1');
  assert.equal(out.source_id, 'source-1');
  assert.equal(out.first_seen_at, seen);
  assert.equal(out.last_seen_at, seen);
  assert.equal(out.source_metadata.major_model_version, 'v6');
  assert.equal('private_secret' in out.source_metadata, false);
  assert.equal('audio_url' in out, false);
  assert.equal('audio_url' in out.source_metadata, false);
});

test('normalize tolerates missing optional fields', () => {
  const { normalizeSong } = requireMetadata();
  const out = normalizeSong({ id: 'minimal', title: 'Minimal Song' }, '2026-10-07T00:00:00.000Z');
  assert.equal(out.id, 'minimal');
  assert.equal(out.model_name, null);
  assert.equal(out.duration_seconds, null);
  assert.equal(out.lyrics, null);
  assert.equal(out.is_instrumental, null);
});

test('merge preserves first seen and enriches without erasing values', () => {
  const { mergeSongRecord } = requireMetadata();
  const existing = {
    id: 'song-1', title: 'Old Title', prompt: 'good prompt', tags: 'country',
    first_seen_at: '2026-10-01T00:00:00.000Z', last_seen_at: '2026-10-01T00:00:00.000Z',
    source_metadata: { major_model_version: 'v5' },
  };
  const incoming = {
    id: 'song-1', title: 'Better Title', prompt: '', tags: null, lyrics: 'new lyrics',
    first_seen_at: '2026-10-07T00:00:00.000Z', last_seen_at: '2026-10-07T00:00:00.000Z',
    source_metadata: { major_model_version: 'v6' },
  };
  const out = mergeSongRecord(existing, incoming);
  assert.equal(out.first_seen_at, '2026-10-01T00:00:00.000Z');
  assert.equal(out.last_seen_at, '2026-10-07T00:00:00.000Z');
  assert.equal(out.title, 'Better Title');
  assert.equal(out.prompt, 'good prompt');
  assert.equal(out.tags, 'country');
  assert.equal(out.lyrics, 'new lyrics');
  assert.equal(out.source_metadata.major_model_version, 'v6');
});

test('export document is versioned and deterministically sorted', () => {
  const { buildExportDocument } = requireMetadata();
  const doc = buildExportDocument([
    { id: 'b', created_at: '2026-10-02T00:00:00.000Z' },
    { id: 'z', created_at: null },
    { id: 'a', created_at: '2026-10-01T00:00:00.000Z' },
  ], '2026-10-07T01:00:00.000Z');
  assert.deepEqual(Object.keys(doc), ['schema_version', 'exported_at', 'source', 'song_count', 'songs']);
  assert.equal(doc.schema_version, 1);
  assert.equal(doc.exported_at, '2026-10-07T01:00:00.000Z');
  assert.equal(doc.source, 'ben-g-suno-metadata-bridge');
  assert.equal(doc.song_count, 3);
  assert.deepEqual(doc.songs.map((s) => s.id), ['a', 'b', 'z']);
});
