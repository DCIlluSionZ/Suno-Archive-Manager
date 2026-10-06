'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../src/popup/popup.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../src/popup/popup.js'), 'utf8');

test('side panel presents metadata-only scan and export actions', () => {
  for (const label of ['Scan Library', 'Pause', 'Resume', 'Stop Scan', 'Export Metadata', 'Clear Local Index']) {
    assert.equal(html.includes(label), true, `missing UI label: ${label}`);
  }
  assert.match(html, /metadata only/i);
  for (const oldText of ['Download ZIP', 'Fetching files', 'zip-progress']) {
    assert.equal(html.includes(oldText), false, `legacy ZIP UI remains: ${oldText}`);
  }
});

test('scan refreshes persistent index without auto-clearing it', () => {
  const start = js.indexOf('async function startScan');
  const next = js.indexOf('\nasync function', start + 1);
  const body = js.slice(start, next === -1 ? js.length : next);
  assert.equal(start >= 0, true);
  assert.equal(body.includes("type: 'CLEAR_SONGS'"), false);
  assert.equal(js.includes("type: 'GET_LIBRARY_SUMMARY'"), true);
});

test('metadata export uses service-worker document and a local JSON Blob', () => {
  assert.equal(js.includes("type: 'GET_EXPORT_DOCUMENT'"), true);
  assert.equal(js.includes("type: 'SET_SCAN_COMPLETE'"), true);
  assert.equal(js.includes("type: 'EXPORT_ZIP'"), false);
  assert.equal(js.includes("type: 'GET_SONGS'"), false);
  assert.match(js, /application\/json/);
  assert.match(js, /BenG_Suno_Metadata_/);
  assert.match(js, /URL\.revokeObjectURL/);
});
