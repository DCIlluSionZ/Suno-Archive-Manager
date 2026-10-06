'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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
