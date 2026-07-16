import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUpgradeChoices, makeUpgradePool, midbossProgress, shouldCullEnemyBullet, splitXpValue, stageProgress, updateGuidance, upgradePower, xpForLevel, xpValueForStage } from '../src/systems.js';

test('upgrade choices are unique and omit maxed items', () => {
  const build = {
    primaryLevel: 5,
    secondaries: { homing: 5, drone: 2 },
    passives: { magnet: 5 },
    secondarySlots: 3,
    passiveSlots: 6,
  };
  const choices = makeUpgradeChoices(build, () => 0.42);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(choice => choice.id)).size, 3);
  assert.ok(!choices.some(choice => ['primary', 'homing', 'magnet'].includes(choice.id)));
  assert.ok(choices.every(choice => choice.icon));
});

test('full equipment slots only offer upgrades for owned equipment', () => {
  const build = {
    primaryLevel: 5,
    secondaries: { homing: 2, rail: 1, drone: 1 },
    passives: { magnet: 1, armor: 2, critical: 1, engine: 3, overclock: 1, bombcap: 1 },
    secondarySlots: 3,
    passiveSlots: 6,
  };
  const pool = makeUpgradePool(build);
  const secondaryIds = pool.filter(item => item.category === 'secondary').map(item => item.id);
  const passiveIds = pool.filter(item => item.category === 'passive').map(item => item.id);
  assert.deepEqual(new Set(secondaryIds), new Set(['homing', 'rail', 'drone']));
  assert.deepEqual(new Set(passiveIds), new Set(['magnet', 'armor', 'critical', 'overclock', 'bombcap']));
});

test('three visible ranks preserve the former 1, 3, and 5 power milestones', () => {
  assert.deepEqual([0, 1, 2, 3].map(upgradePower), [0, 1, 3, 5]);
});

test('opening choices are sampled from the whole pool without a guaranteed primary slot', () => {
  const build = { primaryLevel: 1, secondaries: {}, passives: {}, secondarySlots: 3, passiveSlots: 6 };
  const choices = makeUpgradeChoices(build, () => 0);
  assert.equal(choices.length, 3);
  assert.ok(!choices.some(choice => choice.id === 'primary'));
});

test('dependent passives appear only after their matching secondary is owned', () => {
  const build = { primaryLevel: 1, secondaries: {}, passives: {}, secondarySlots: 3, passiveSlots: 6 };
  let pool = makeUpgradePool(build);
  assert.ok(!pool.some(item => item.id === 'guidance'));


  build.secondaries.homing = 1;
  pool = makeUpgradePool(build);
  assert.ok(pool.some(item => item.id === 'guidance'));

  assert.ok(!pool.some(item => ['incendiary', 'cryo', 'voltaic'].includes(item.id)));
});

test('homing missile never reacquires after target death', () => {
  const missile = { targetId: 7, guidanceActive: true, vx: 0, vy: -5, turn: 0.1 };
  const enemies = [{ id: 8, x: 120, y: 80, alive: true }];
  const result = updateGuidance(missile, enemies, { x: 100, y: 200 });
  assert.equal(result.guidanceActive, false);
  assert.equal(result.targetId, 7);
  assert.equal(result.vx, 0);
  assert.equal(result.vy, -5);
});

test('homing missile steers only toward its original live target', () => {
  const missile = { targetId: 7, guidanceActive: true, vx: 0, vy: -5, turn: 0.1 };
  const enemies = [
    { id: 7, x: 150, y: 100, alive: true },
    { id: 8, x: 20, y: 190, alive: true },
  ];
  const result = updateGuidance(missile, enemies, { x: 100, y: 200 });
  assert.equal(result.guidanceActive, true);
  assert.equal(result.targetId, 7);
  assert.ok(result.vx > 0);
});

test('enemy bullets remain alive until their full body crosses the playfield edge', () => {
  assert.equal(shouldCullEnemyBullet({ x: 240, y: 400, radius: 5, life: 0 }, 480, 800), false);
  assert.equal(shouldCullEnemyBullet({ x: -4, y: 400, radius: 5, life: -20 }, 480, 800), false);
  assert.equal(shouldCullEnemyBullet({ x: -6, y: 400, radius: 5, life: 300 }, 480, 800), true);
  assert.equal(shouldCullEnemyBullet({ x: 240, y: 804, radius: 5, life: 300 }, 480, 800), false);
  assert.equal(shouldCullEnemyBullet({ x: 240, y: 806, radius: 5, life: 300 }, 480, 800), true);
});

test('early XP pacing awards the first earned level by the second opening wave', () => {
  assert.equal(xpForLevel(1), 32);
  assert.ok(xpForLevel(2) > xpForLevel(1));
});

test('later sectors award richer XP drops without changing opening balance', () => {
  assert.equal(xpValueForStage(4, 0), 4);
  assert.ok(xpValueForStage(4, 4) > xpValueForStage(4, 0));
  const values = splitXpValue(37);
  assert.equal(values.reduce((total, value) => total + value, 0), 37);
  assert.ok(new Set(values).size >= 3, 'large drops should expose multiple visible denominations');
});

test('route progress reaches and holds explicit midboss and boss nodes', () => {
  const stage = { waves: 8, midbossWave: 4 };
  assert.equal(stageProgress(stage, -1, 'stageIntro'), 0);
  assert.equal(stageProgress(stage, 3, 'playing'), midbossProgress(stage));
  assert.equal(stageProgress(stage, 7, 'playing'), 8 / 9);
  assert.equal(stageProgress(stage, 7, 'bossWarning'), 1);
  assert.equal(stageProgress(stage, 7, 'stageClear'), 1);
});
