import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const modularAssets = ['far-a', 'far-b', 'mid-a', 'mid-b', 'near-a', 'near-b'];

test('stage one scene lab exposes live controls and six modular scenery assets', () => {
  const html = readFileSync(new URL('../scene-preview.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../src/scene-preview.js', import.meta.url), 'utf8');
  assert.match(html, /STAGE 1 SCENE LAB/);
  assert.match(html, /路燈速度/);
  assert.match(html, /下載參數/);
  assert.match(js, /static mirage|drawAsset|drawRoadPosts/);
  for (const name of modularAssets) {
    assert.equal(existsSync(new URL(`../assets/scenes/neon-outskirts/modular/${name}.webp`, import.meta.url)), true);
  }
});
