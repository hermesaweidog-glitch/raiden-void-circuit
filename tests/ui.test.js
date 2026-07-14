import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('page exposes complete desktop and mobile controls', () => {
  for (const id of ['game', 'aircraft-select', 'upgrade-overlay', 'bomb-button', 'pause-button', 'mute-button', 'end-overlay']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test('page exposes a route bar with mandatory midboss and boss nodes', () => {
  for (const id of ['route-progress', 'route-label', 'route-status', 'route-fill', 'midboss-node', 'boss-node']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.doesNotMatch(html, /id=["']stage["']>1-1/);
  assert.match(html, /<small>SECTOR<\/small>/);
});

test('page is installable and loads modular entry point', () => {
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /type="module" src="\.\/src\/main\.js"/);
  assert.match(html, /viewport-fit=cover/);
});
