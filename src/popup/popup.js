// Ben.G Suno Metadata Bridge — side panel
'use strict';

let state = 'offsite';
let activeTabId = null;
let isPaused = false;
let pollInterval = null;
let scrollCompleteTimer = null;
let waitingForLibraryLoad = false;

function isAllowedScanPage(url) {
  return /suno\.com\/(me|library|playlist\/)/i.test(url || '');
}

function isPlaylistPage(url) {
  return /suno\.com\/playlist\//i.test(url || '');
}

function isLibraryPage(url) {
  return /suno\.com\/(me|library)/i.test(url || '');
}

const views = {
  offsite: document.getElementById('view-offsite'),
  ready: document.getElementById('view-ready'),
  scanning: document.getElementById('view-scanning'),
  done: document.getElementById('view-done'),
};

const el = {
  btnOpenSuno: document.getElementById('btn-open-suno'),
  btnStartScan: document.getElementById('btn-start-scan'),
  readySummary: document.getElementById('ready-summary'),
  readyCount: document.getElementById('ready-count'),
  readyDates: document.getElementById('ready-dates'),
  readyLastScan: document.getElementById('ready-last-scan'),
  btnExportReady: document.getElementById('btn-export-ready'),
  btnClearIndex: document.getElementById('btn-clear-index'),
  scanLabel: document.getElementById('scan-label'),
  scanCount: document.getElementById('scan-count'),
  scanLog: document.getElementById('scan-log'),
  btnPause: document.getElementById('btn-pause'),
  btnStopScan: document.getElementById('btn-stop-scan'),
  doneCount: document.getElementById('done-count'),
  doneDateRange: document.getElementById('done-date-range'),
  doneLastScan: document.getElementById('done-last-scan'),
  exportStatus: document.getElementById('export-status'),
  btnExportMetadata: document.getElementById('btn-export-metadata'),
  btnScanAgain: document.getElementById('btn-scan-again'),
};

function showView(name) {
  state = name;
  Object.entries(views).forEach(([key, view]) => view.classList.toggle('hidden', key !== name));
}

function appendLog(message, type = 'info') {
  const row = document.createElement('div');
  row.className = 'log-entry' + (type === 'info' ? '' : ` ${type}`);
  row.textContent = `> ${message}`;
  el.scanLog.prepend(row);
  while (el.scanLog.children.length > 60) el.scanLog.removeChild(el.scanLog.lastChild);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function formatDateRange(summary) {
  const oldest = formatDate(summary?.oldest_created_at);
  const newest = formatDate(summary?.newest_created_at);
  if (!oldest && !newest) return '';
  if (oldest === newest) return oldest;
  return `${oldest || 'unknown'} – ${newest || 'unknown'}`;
}

function renderSummary(summary, target) {
  const count = summary?.count || 0;
  if (target === 'ready') {
    el.readyCount.textContent = count;
    el.readyDates.textContent = formatDateRange(summary);
    el.readyLastScan.textContent = summary?.last_scan_at ? `Last scan: ${formatDate(summary.last_scan_at)}` : '';
    el.readySummary.classList.toggle('hidden', count === 0);
  } else {
    el.doneCount.textContent = count;
    el.doneDateRange.textContent = formatDateRange(summary);
    el.doneLastScan.textContent = summary?.last_scan_at ? `Last scan: ${formatDate(summary.last_scan_at)}` : '';
  }
}

async function msgContent(message) {
  if (!activeTabId) return undefined;
  return chrome.tabs.sendMessage(activeTabId, message).catch(() => undefined);
}

async function msgBg(message) {
  return chrome.runtime.sendMessage(message).catch((error) => ({ ok: false, error: String(error) }));
}

async function getSummary() {
  const response = await msgBg({ type: 'GET_LIBRARY_SUMMARY' });
  if (!response?.ok) throw new Error(response?.error || 'Unable to read local index');
  return response.summary;
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      const summary = await getSummary();
      const current = Number.parseInt(el.scanCount.textContent, 10) || 0;
      if (summary.count !== current) {
        appendLog(`${summary.count} songs indexed`, 'success');
        el.scanCount.textContent = summary.count;
      }
    } catch (error) {
      appendLog(error.message, 'error');
    }
  }, 1000);
}

async function startScan() {
  el.scanLog.innerHTML = '';
  isPaused = false;
  el.btnPause.textContent = 'Pause';
  el.scanLabel.textContent = 'Loading…';
  showView('scanning');

  try {
    const summary = await getSummary();
    el.scanCount.textContent = summary.count;
  } catch (_) {
    el.scanCount.textContent = '0';
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetUrl = isPlaylistPage(tab?.url) ? tab.url
    : isLibraryPage(tab?.url) ? tab.url
      : 'https://suno.com/me';

  appendLog('Loading Suno page…');
  waitingForLibraryLoad = true;
  if (activeTabId) {
    await chrome.tabs.update(activeTabId, { url: targetUrl });
  } else {
    const newTab = await chrome.tabs.create({ url: targetUrl });
    activeTabId = newTab.id;
  }
}

async function beginScroll() {
  el.scanLabel.textContent = 'Scrolling…';
  appendLog('Scanning visible Suno metadata…', 'success');
  await msgContent({ type: 'START_SCROLL' });
  startPolling();
}

async function stopAndShowDone() {
  waitingForLibraryLoad = false;
  stopPolling();
  if (scrollCompleteTimer) {
    clearTimeout(scrollCompleteTimer);
    scrollCompleteTimer = null;
  }
  await msgContent({ type: 'STOP_SCROLL' });
  const completedAt = new Date().toISOString();
  await msgBg({ type: 'SET_SCAN_COMPLETE', completed_at: completedAt });
  const summary = await getSummary();
  renderSummary(summary, 'done');
  el.exportStatus.textContent = 'Metadata only. Audio stays with Suno’s approved download flow.';
  showView('done');
}

async function exportMetadata() {
  el.exportStatus.textContent = 'Preparing metadata JSON…';
  const response = await msgBg({ type: 'GET_EXPORT_DOCUMENT' });
  if (!response?.ok || !response.document) {
    el.exportStatus.textContent = `Export failed: ${response?.error || 'unknown error'}`;
    return;
  }

  try {
    const json = JSON.stringify(response.document, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `BenG_Suno_Metadata_${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    el.exportStatus.textContent = `Exported ${response.document.song_count} metadata records.`;
  } catch (error) {
    el.exportStatus.textContent = `Export failed: ${error.message}`;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SONGS_UPDATED' && state === 'scanning') {
    el.scanCount.textContent = message.total;
  }
  if (message.type === 'SCROLL_COMPLETE' && state === 'scanning') {
    appendLog('Reached the end — finalizing…', 'success');
    el.scanLabel.textContent = 'Finishing…';
    if (scrollCompleteTimer) clearTimeout(scrollCompleteTimer);
    scrollCompleteTimer = setTimeout(() => stopAndShowDone().catch((error) => appendLog(error.message, 'error')), 3000);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || changeInfo.status !== 'complete') return;
  if (waitingForLibraryLoad && isAllowedScanPage(tab.url)) {
    waitingForLibraryLoad = false;
    beginScroll().catch((error) => appendLog(error.message, 'error'));
    return;
  }
  if (state !== 'scanning') init();
});

chrome.tabs.onActivated.addListener(() => {
  if (state !== 'scanning') init();
});

el.btnOpenSuno.addEventListener('click', () => chrome.tabs.create({ url: 'https://suno.com/me' }));
el.btnStartScan.addEventListener('click', () => startScan().catch((error) => appendLog(error.message, 'error')));
el.btnPause.addEventListener('click', async () => {
  isPaused = !isPaused;
  el.btnPause.textContent = isPaused ? 'Resume' : 'Pause';
  el.scanLabel.textContent = isPaused ? 'Paused' : 'Scrolling…';
  await msgContent({ type: isPaused ? 'STOP_SCROLL' : 'START_SCROLL' });
  if (isPaused) stopPolling(); else startPolling();
  appendLog(isPaused ? 'Paused.' : 'Resumed.', isPaused ? 'info' : 'success');
});
el.btnStopScan.addEventListener('click', () => stopAndShowDone().catch((error) => appendLog(error.message, 'error')));
el.btnExportMetadata.addEventListener('click', exportMetadata);
el.btnExportReady.addEventListener('click', exportMetadata);
el.btnScanAgain.addEventListener('click', () => init());
el.btnClearIndex.addEventListener('click', async () => {
  if (!window.confirm('Clear the entire local Ben.G metadata index?')) return;
  const response = await msgBg({ type: 'CLEAR_SONGS' });
  if (!response?.ok) return;
  await init();
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showView('offsite');
    return;
  }
  activeTabId = tab.id;
  const onSuno = /^https:\/\/[^/]*\.?suno\.(com|ai)/i.test(tab.url || '');
  if (!onSuno) {
    showView('offsite');
    return;
  }

  showView('ready');
  try {
    renderSummary(await getSummary(), 'ready');
  } catch (_) {
    el.readySummary.classList.add('hidden');
  }
}

init();
