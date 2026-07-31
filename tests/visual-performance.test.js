import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const enemyLayer = readFileSync(new URL('../src/enemy-visual-layer.js', import.meta.url), 'utf8');
const factory = readFileSync(new URL('../src/enemy-model-factory.js', import.meta.url), 'utf8');
const stageLayer = readFileSync(new URL('../src/stage1-geometry-layer.js', import.meta.url), 'utf8');

test('small 3D enemies receive contrast separation without changing bosses', () => {
  assert.match(game, /drawSmallEnemyContrast/);
  assert.match(enemyLayer, /SMALL_TYPES\.has\(type\)/);
  assert.match(enemyLayer, /0xf4ffff/);
});

test('clear reward label stays concise', () => {
  assert.match(game, /通關獎勵\+\$\{clearBonus\}/);
  assert.doesNotMatch(game, /一般模式通關獎勵/);
  assert.doesNotMatch(game, /每次通關/);
});

test('3D startup uses one WebGL context and adaptive internal resolution', () => {
  assert.match(factory, /headless = false/);
  assert.match(enemyLayer, /headless: true/);
  assert.match(stageLayer, /pixelRatio: lowEnd \? 1/);
  assert.match(game, /scheduleStageGeometryInit/);
  assert.match(game, /precompile/);
});
