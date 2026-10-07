'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('MAIN-world observer never synthesizes or blocks Suno fetch responses', () => {
  const source = fs.readFileSync(path.join(root, 'src/content/content-script-main.js'), 'utf8');
  assert.equal(source.includes('new Response('), false);
  assert.equal(/statsig|segment|stratovibe|sentry|rgstr|pixel/i.test(source), false);
  assert.match(source, /trueFetch\.apply\(this, args\)/);
  assert.match(source, /return response/);
});

test('Chromium manifest loads shared metadata helper before MAIN observer', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifests/manifest.chrome.json'), 'utf8'));
  const main = manifest.content_scripts.find((entry) => entry.world === 'MAIN');
  assert.ok(main);
  assert.deepEqual(main.js.slice(0, 2), ['shared/song-metadata.js', 'content/content-script-main.js']);
});

test('Chrome build copies shared metadata module', () => {
  const build = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
  assert.match(build, /path\.join\(SRC, 'shared'\)/);
});


test('Chromium observer injects only on library/profile and explicit playlist pages', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifests/manifest.chrome.json'), 'utf8'));
  for (const entry of manifest.content_scripts) {
    assert.equal(entry.matches.includes('https://*.suno.com/*'), false);
    assert.equal(entry.matches.includes('https://*.suno.ai/*'), false);
    assert.deepEqual(entry.matches, [
      'https://*.suno.com/me*',
      'https://*.suno.com/library*',
      'https://*.suno.com/playlist/*',
      'https://*.suno.ai/me*',
      'https://*.suno.ai/library*',
      'https://*.suno.ai/playlist/*',
    ]);
  }
});

test('MAIN-world observer limits captured clips to Ben.G creator handles', () => {
  const source = fs.readFileSync(path.join(root, 'src/content/content-script-main.js'), 'utf8');
  assert.match(source, /realdci/i);
  assert.match(source, /dciawake/i);
  assert.match(source, /allowedHandles/);
});
