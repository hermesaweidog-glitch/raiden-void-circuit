import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  STAGE1_GEOMETRY_SETTINGS,
  STAGE_ENTRY_CAMERA_SETTINGS,
  STAGE_GEOMETRY_SETTINGS,
  stageEntryCameraTagForMode,
} from '../src/stage1-geometry-settings.js';

test('all five approved hybrid 3D stage settings ship without validation pages', () => {
  const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.deepEqual(Object.keys(STAGE_GEOMETRY_SETTINGS), ['1', '2', '3', '4', '5']);
  assert.equal(STAGE1_GEOMETRY_SETTINGS.camera.distance, 57);
  assert.equal(STAGE_GEOMETRY_SETTINGS[2].camera.distance, 65);
  assert.equal(STAGE_GEOMETRY_SETTINGS[3].road.cover, 55);
  assert.equal(STAGE_GEOMETRY_SETTINGS[4].camera.distance, 67);
  assert.equal(STAGE_GEOMETRY_SETTINGS[5].posts.count, 2);
  assert.match(game, /SceneGeometryLayer/);
  assert.match(game, /drawHybridStageBackground/);
  assert.match(worker, /stage1-geometry-layer\.js\?v=86/);
  assert.equal(existsSync(new URL('../scene-preview.html', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/scene-preview.js', import.meta.url)), false);
});

test('stage entry camera uses two-second curved zoom with separate endless tag', () => {
  const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.equal(STAGE_ENTRY_CAMERA_SETTINGS.startDistance, 100);
  assert.equal(STAGE_ENTRY_CAMERA_SETTINGS.durationSeconds, 2);
  assert.equal(stageEntryCameraTagForMode('normal'), 'standard');
  assert.equal(stageEntryCameraTagForMode('test'), 'standard');
  assert.equal(stageEntryCameraTagForMode('endless'), 'endless');
  assert.match(game, /easeOutCubic/);
  assert.match(game, /pendingStageEntryCameraTag = 'endless'/);
  assert.match(game, /transitionTimer = 120/);
});
