'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');

let storeApi = null;
try {
  storeApi = require('../src/background/song-store.js');
} catch (_) {}

function requireStore() {
  assert.ok(storeApi, 'BenGSunoStore module should exist');
  return storeApi;
}

async function freshDb() {
  const api = requireStore();
  return api.openSongDatabase(new IDBFactory());
}

test('IndexedDB schema persists songs and app metadata', async () => {
  const api = requireStore();
  const db = await freshDb();
  assert.equal(db.name, 'ben-g-suno-metadata');
  assert.equal(db.version, 1);
  assert.equal(db.objectStoreNames.contains('songs'), true);
  assert.equal(db.objectStoreNames.contains('app_meta'), true);

  const result = await api.upsertSongs(db, [{
    id: 'one', title: 'One', created_at: '2026-10-01T00:00:00.000Z',
    first_seen_at: '2026-10-01T01:00:00.000Z', last_seen_at: '2026-10-01T01:00:00.000Z',
  }]);
  assert.deepEqual(result, { added: 1, updated: 0, total: 1 });
  assert.equal((await api.getAllSongs(db))[0].title, 'One');
  db.close();
});

test('upsert merges richer observations and summary tracks dates and last scan', async () => {
  const api = requireStore();
  const db = await freshDb();
  await api.upsertSongs(db, [
    { id: 'a', title: 'A', prompt: 'keep me', created_at: '2026-09-01T00:00:00.000Z', first_seen_at: '2026-09-02T00:00:00.000Z', last_seen_at: '2026-09-02T00:00:00.000Z' },
    { id: 'b', title: 'B', created_at: '2026-10-01T00:00:00.000Z', first_seen_at: '2026-10-02T00:00:00.000Z', last_seen_at: '2026-10-02T00:00:00.000Z' },
  ]);
  const update = await api.upsertSongs(db, [
    { id: 'a', title: 'A2', prompt: '', lyrics: 'new', first_seen_at: '2026-10-07T00:00:00.000Z', last_seen_at: '2026-10-07T00:00:00.000Z' },
  ]);
  assert.deepEqual(update, { added: 0, updated: 1, total: 2 });
  const a = (await api.getAllSongs(db)).find((s) => s.id === 'a');
  assert.equal(a.title, 'A2');
  assert.equal(a.prompt, 'keep me');
  assert.equal(a.lyrics, 'new');
  assert.equal(a.first_seen_at, '2026-09-02T00:00:00.000Z');
  await api.setLastScanAt(db, '2026-10-07T02:00:00.000Z');
  assert.deepEqual(await api.getLibrarySummary(db), {
    count: 2,
    oldest_created_at: '2026-09-01T00:00:00.000Z',
    newest_created_at: '2026-10-01T00:00:00.000Z',
    last_scan_at: '2026-10-07T02:00:00.000Z',
  });
  await api.clearSongs(db);
  assert.equal((await api.getLibrarySummary(db)).count, 0);
  db.close();
});

test('store handles 25,001 songs and returns the complete collection', async () => {
  const api = requireStore();
  const db = await freshDb();
  const seen = '2026-10-07T00:00:00.000Z';
  const songs = Array.from({ length: 25001 }, (_, i) => ({
    id: `song-${String(i).padStart(5, '0')}`,
    title: `Song ${i}`,
    created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    first_seen_at: seen,
    last_seen_at: seen,
  }));
  const result = await api.upsertSongs(db, songs);
  assert.equal(result.total, 25001);
  assert.equal(result.added, 25001);
  const all = await api.getAllSongs(db);
  assert.equal(all.length, 25001);
  assert.equal(all[0].id, 'song-00000');
  assert.equal(all.at(-1).id, 'song-25000');
  db.close();
});
