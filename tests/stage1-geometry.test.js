import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { STAGE1_GEOMETRY_SETTINGS } from '../src/stage1-geometry-settings.js';

test('stage one uses fixed Three.js geometry settings without shipping the validation page', () => {
  const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.equal(STAGE1_GEOMETRY_SETTINGS.camera.pitch, 35);
  assert.equal(STAGE1_GEOMETRY_SETTINGS.road.top, 0.29);
  assert.equal(STAGE1_GEOMETRY_SETTINGS.posts.speed, 0.28);
  assert.match(game, /Stage1GeometryLayer/);
  assert.match(game, /drawStage1RoadBase/);
  assert.match(worker, /stage1-geometry-layer\.js\?v=76/);
  assert.equal(existsSync(new URL('../scene-preview.html', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/scene-preview.js', import.meta.url)), false);
});
