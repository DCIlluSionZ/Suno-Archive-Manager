(function (root, factory) {
  let metadataApi = root.BenGSunoMetadata;
  if (typeof module !== 'undefined' && module.exports) {
    metadataApi = require('../shared/song-metadata.js');
  }
  const api = factory(metadataApi);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BenGSunoStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (metadataApi) {
  'use strict';

  const DB_NAME = 'ben-g-suno-metadata';
  const DB_VERSION = 1;
  const SONGS_STORE = 'songs';
  const META_STORE = 'app_meta';

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function openSongDatabase(indexedDBImpl = globalThis.indexedDB) {
    if (!indexedDBImpl) return Promise.reject(new Error('IndexedDB is unavailable'));
    return new Promise((resolve, reject) => {
      const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SONGS_STORE)) {
          db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open song database'));
    });
  }

  function countSongs(db) {
    const tx = db.transaction(SONGS_STORE, 'readonly');
    return requestToPromise(tx.objectStore(SONGS_STORE).count());
  }

  async function upsertSongs(db, songs) {
    const incoming = Array.isArray(songs) ? songs.filter((song) => song && song.id) : [];
    if (incoming.length === 0) {
      return { added: 0, updated: 0, total: await countSongs(db) };
    }

    let added = 0;
    let updated = 0;
    const tx = db.transaction(SONGS_STORE, 'readwrite');
    const store = tx.objectStore(SONGS_STORE);

    for (const song of incoming) {
      const request = store.get(song.id);
      request.onsuccess = () => {
        const existing = request.result || null;
        const merged = metadataApi.mergeSongRecord(existing, song);
        store.put(merged);
        if (existing) updated += 1;
        else added += 1;
      };
    }

    await transactionDone(tx);
    return { added, updated, total: await countSongs(db) };
  }

  function getAllSongs(db) {
    const tx = db.transaction(SONGS_STORE, 'readonly');
    return requestToPromise(tx.objectStore(SONGS_STORE).getAll());
  }

  async function getLibrarySummary(db) {
    const songs = await getAllSongs(db);
    const dates = songs
      .map((song) => song && song.created_at)
      .filter(Boolean)
      .map(String)
      .sort();
    const tx = db.transaction(META_STORE, 'readonly');
    const meta = await requestToPromise(tx.objectStore(META_STORE).get('last_scan_at'));
    return {
      count: songs.length,
      oldest_created_at: dates.length ? dates[0] : null,
      newest_created_at: dates.length ? dates[dates.length - 1] : null,
      last_scan_at: meta ? meta.value : null,
    };
  }

  async function clearSongs(db) {
    const tx = db.transaction([SONGS_STORE, META_STORE], 'readwrite');
    tx.objectStore(SONGS_STORE).clear();
    tx.objectStore(META_STORE).clear();
    await transactionDone(tx);
  }

  async function setLastScanAt(db, iso) {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key: 'last_scan_at', value: iso });
    await transactionDone(tx);
  }

  return {
    DB_NAME,
    DB_VERSION,
    openSongDatabase,
    upsertSongs,
    getLibrarySummary,
    getAllSongs,
    clearSongs,
    setLastScanAt,
  };
});
