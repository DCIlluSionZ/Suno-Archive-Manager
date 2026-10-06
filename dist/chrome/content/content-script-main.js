// Ben.G Suno Metadata Bridge — passive MAIN-world observer for Chromium
(function () {
  'use strict';

  if (window.__benGSunoMetadataObserver) return;
  window.__benGSunoMetadataObserver = true;

  const trueFetch = window.fetch;
  const lastFingerprintById = new Map();
  let lastSongArrival = Date.now();
  let scrollInterval = null;

  function toExtension(message) {
    window.postMessage({ __am: true, ...message }, '*');
  }

  function fingerprint(song) {
    const copy = { ...song, first_seen_at: null, last_seen_at: null };
    return JSON.stringify(copy);
  }

  async function observedFetch(...args) {
    const response = await trueFetch.apply(this, args);

    try {
      response.clone().json().then((data) => {
        const rawSongs = BenGSunoMetadata.findSongCandidates(data);
        if (!rawSongs.length) return;

        const seenAt = new Date().toISOString();
        const changed = [];
        for (const raw of rawSongs) {
          const song = BenGSunoMetadata.normalizeSong(raw, seenAt);
          if (!song) continue;
          const nextFingerprint = fingerprint(song);
          if (lastFingerprintById.get(song.id) === nextFingerprint) continue;
          lastFingerprintById.set(song.id, nextFingerprint);
          changed.push(song);
        }

        if (changed.length) {
          lastSongArrival = Date.now();
          toExtension({ type: 'SONGS', songs: changed });
        }
      }).catch(() => {});
    } catch (_) {
      // Metadata inspection is best-effort only; never affect the real response.
    }

    return response;
  }

  window.fetch = observedFetch;

  const SCROLL_INTERVAL_MS = 400;
  const IDLE_DONE_MS = 5000;

  function stopScroll() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
  }

  function startScroll() {
    if (scrollInterval) return;
    lastSongArrival = Date.now();
    scrollInterval = setInterval(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const atBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 200;
      const idleSince = Date.now() - lastSongArrival;
      if (atBottom && idleSince >= IDLE_DONE_MS) {
        stopScroll();
        toExtension({ type: 'SCROLL_COMPLETE' });
      }
    }, SCROLL_INTERVAL_MS);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data?.__am) return;
    if (event.data.type === 'START_SCROLL') startScroll();
    else if (event.data.type === 'STOP_SCROLL') stopScroll();
  });
})();
