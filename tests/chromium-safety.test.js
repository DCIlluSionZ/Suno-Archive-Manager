'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const JSZip = require('jszip');

const root = path.join(__dirname, '..');

function buildChrome() {
  execFileSync(process.execPath, ['build.js', 'chrome'], { cwd: root, stdio: 'pipe' });
}

test('Chromium build has no media-download permissions or CDN-only hosts', () => {
  buildChrome();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/chrome/manifest.json'), 'utf8'));
  const permissions = manifest.permissions || [];
  const hosts = manifest.host_permissions || [];
  assert.equal(permissions.includes('downloads'), false);
  assert.equal(permissions.includes('offscreen'), false);
  assert.equal(hosts.some((host) => /cdn[12]\.suno\.ai/i.test(host)), false);
});

test('Chromium build does not package ZIP, ID3, or offscreen media code', () => {
  buildChrome();
  assert.equal(fs.existsSync(path.join(root, 'dist/chrome/offscreen')), false);
  assert.equal(fs.existsSync(path.join(root, 'dist/chrome/lib/jszip.min.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'dist/chrome/lib/id3writer.js')), false);
});

test('Chromium manifest describes the metadata-only workflow', () => {
  buildChrome();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/chrome/manifest.json'), 'utf8'));
  assert.match(manifest.description || '', /metadata/i);
  assert.doesNotMatch(manifest.description || '', /download your entire|local zip/i);
});

test('tracked Chromium ZIP contains only the metadata bridge runtime', async () => {
  const zipPath = path.join(root, 'dist/archive-master-chrome.zip');
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const entries = Object.keys(zip.files);
  assert.equal(entries.some((entry) => /\/offscreen\//.test(entry)), false);
  assert.equal(entries.some((entry) => /\/lib\/(jszip\.min|id3writer)\.js$/.test(entry)), false);
  assert.equal(entries.some((entry) => /shared\/song-metadata\.js$/.test(entry)), true);
  assert.equal(entries.some((entry) => /background\/song-store\.js$/.test(entry)), true);
});

test('package metadata describes the metadata bridge rather than the old downloader', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.description || '', /metadata/i);
  assert.doesNotMatch(pkg.description || '', /download your Suno music library/i);
});
