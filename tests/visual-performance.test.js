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
  assert.match(stageLayer, /pixelRatio: coarse \? 1/);
  assert.match(stageLayer, /powerPreference: lowEnd \? 'low-power'/);
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

test('boss 2D arrival overlays follow the same projected showcase offset as the 3D model', () => {
  assert.match(enemyLayer, /enemy\.visualOffsetY = offsetPixels/);
  assert.match(game, /const displayY = rendered3D && enemy\.type === 'boss'/);
  assert.match(game, /ctx\.translate\(enemy\.x, displayY\)/);
  assert.match(game, /const barY = displayY - enemy\.radius - 14/);
});

test('equipment icons keep their original colors', () => {
  const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /filter:grayscale\(1\)/);
  assert.match(styles, /filter:drop-shadow/);
});

test('time effects use per-object snapshots instead of a global enemy time scale', () => {
  assert.match(game, /applyWorldFieldToVisibleObjects\(120\)/);
  assert.match(game, /applyKiaiToVisibleObjects\(freezeDuration\)/);
  assert.match(game, /updateEnemyFieldTime\(enemy\)/);
  assert.doesNotMatch(game, /this\.enemyTimeScale = this\.worldFreezeTimer/);
  assert.match(game, /this\.updateDirector\(\)/);
});


test('mobile WebGL avoids preserved buffers and supports adaptive render cadence', () => {
  assert.match(stageLayer, /preserveDrawingBuffer:\s*false/);
  assert.match(stageLayer, /setRenderCadence/);
  assert.match(stageLayer, /backgroundCache/);
  assert.match(game, /Adaptive graphics enabled/);
});


test('title and overlay screens do not keep the full game renderer hot', () => {
  assert.match(game, /if \(this\.mode === 'title'\)/);
  assert.match(game, /staticMode = \['paused','levelup','gameover','victory'\]/);
  assert.match(game, /prepareGraphics\(\)/);
});
