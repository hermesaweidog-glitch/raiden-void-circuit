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

test('boss showcase uses projected visible model bounds and eases back to combat placement', () => {
  const source = readFileSync(new URL('../src/enemy-visual-layer.js', import.meta.url), 'utf8');
  assert.match(source, /projectedVisibleBounds\(root\)/);
  assert.match(source, /alignBossShowcase\(instance, enemy\)/);
  assert.match(source, /preferredCenter = this\.height \* 0\.31/);
  assert.match(source, /topSafe = clamp\(this\.height \* 0\.055, 34, 48\)/);
  assert.match(source, /settleBlend = holding/);
});
