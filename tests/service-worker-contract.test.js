'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('service worker uses IndexedDB store messages instead of session storage or ZIP export', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/background/service-worker.js'), 'utf8');
  assert.equal(source.includes('chrome.storage.session'), false);
  assert.equal(source.includes("type === 'GET_LIBRARY_SUMMARY'"), true);
  assert.equal(source.includes("type === 'GET_EXPORT_DOCUMENT'"), true);
  assert.equal(source.includes("type === 'SET_SCAN_COMPLETE'"), true);
  assert.equal(source.includes("type === 'EXPORT_ZIP'"), false);
});
