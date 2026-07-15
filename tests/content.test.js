import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, SECONDARIES, PASSIVES, STAGES, BOSSES, ENEMY_TYPES, WORLD } from '../src/config.js';

test('final content roster is complete', () => {
  assert.equal(Object.keys(AIRCRAFT).length, 3);
  assert.equal(Object.keys(SECONDARIES).length, 6);
  assert.equal(Object.keys(PASSIVES).length, 8);
  assert.equal(STAGES.length, 5);
  assert.equal(Object.keys(BOSSES).length, 5);
});

test('runtime budgets are explicit and mobile-safe', () => {
  assert.equal(WORLD.maxPlayerBullets, 220);
  assert.equal(WORLD.maxEnemyBullets, 260);
  assert.equal(WORLD.maxEnemies, 40);
  assert.ok(WORLD.maxParticles <= 260);
  assert.equal(WORLD.maxEffects, 40);
  assert.equal(WORLD.maxLevel, 22);
});

test('all persistent upgrades use exactly three ranks', () => {
  assert.ok(Object.values(SECONDARIES).every(item => item.max === 3));
  assert.ok(Object.values(PASSIVES).every(item => item.max === 3));
  assert.equal(WORLD.maxUpgradeRank, 3);
});

test('difficulty rises discretely across all five stages', () => {
  for (let i = 1; i < STAGES.length; i += 1) {
    for (const key of ['enemySpeed', 'bulletSpeed', 'bulletCount', 'fireRate', 'enemyHp', 'bossHp']) {
      assert.ok(STAGES[i][key] > STAGES[i - 1][key], `${key} must rise at stage ${i + 1}`);
    }
  }
});

test('every boss has at least three phases and a unique title', () => {
  const titles = new Set();
  for (const boss of Object.values(BOSSES)) {
    assert.ok(boss.phases.length >= 3);
    titles.add(boss.name);
  }
  assert.equal(titles.size, 5);
});

test('every sector has enough waves and a mandatory midboss checkpoint', () => {
  assert.ok(ENEMY_TYPES.midboss, 'midboss archetype must exist');
  for (const stage of STAGES) {
    assert.ok(stage.waves >= 8, `${stage.name} needs at least eight waves`);
    assert.ok(stage.midbossWave >= 3, `${stage.name} checkpoint is too early`);
    assert.ok(stage.midbossWave <= stage.waves - 2, `${stage.name} needs waves after its checkpoint`);
  }
});
