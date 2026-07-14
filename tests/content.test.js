import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, SECONDARIES, PASSIVES, STAGES, BOSSES, WORLD } from '../src/config.js';

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
