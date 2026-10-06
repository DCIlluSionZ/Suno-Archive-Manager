// Ben.G Suno Metadata Bridge — Chrome MV3 service worker
'use strict';

importScripts('../shared/song-metadata.js', 'song-store.js');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const dbPromise = BenGSunoStore.openSongDatabase();

function notifyPanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      const db = await dbPromise;

      if (msg.type === 'ADD_SONGS') {
        const result = await BenGSunoStore.upsertSongs(db, msg.songs || []);
        notifyPanel({ type: 'SONGS_UPDATED', ...result });
        sendResponse({ ok: true, ...result });

      } else if (msg.type === 'GET_LIBRARY_SUMMARY') {
        sendResponse({ ok: true, summary: await BenGSunoStore.getLibrarySummary(db) });

      } else if (msg.type === 'GET_EXPORT_DOCUMENT') {
        const songs = await BenGSunoStore.getAllSongs(db);
        const document = BenGSunoMetadata.buildExportDocument(songs, new Date().toISOString());
        sendResponse({ ok: true, document });

      } else if (msg.type === 'CLEAR_SONGS') {
        await BenGSunoStore.clearSongs(db);
        sendResponse({ ok: true });

      } else if (msg.type === 'SET_SCAN_COMPLETE') {
        const completedAt = msg.completed_at || new Date().toISOString();
        await BenGSunoStore.setLastScanAt(db, completedAt);
        sendResponse({ ok: true, completed_at: completedAt });

      } else if (msg.type === 'SCROLL_COMPLETE') {
        notifyPanel({ type: 'SCROLL_COMPLETE' });
        sendResponse({ ok: true });

      } else {
        sendResponse({ ok: false, error: `Unknown message type: ${msg.type || 'missing'}` });
      }
    } catch (error) {
      console.error('[Ben.G Metadata Bridge]', error);
      sendResponse({ ok: false, error: String(error && error.message || error) });
    }
  })();
  return true;
});
