import test from 'node:test';
import assert from 'node:assert/strict';
import { isBuildMaxed, makeUpgradeChoices, makeUpgradePool, midbossProgress, shouldCullEnemyBullet, splitXpValue, stageProgress, updateGuidance, upgradePower, xpForLevel, xpValueForStage } from '../src/systems.js';
import { ENEMY_TYPES, PILOTS, STAGES } from '../src/config.js';

test('reaper description uses HP units for its twenty-point penalty', () => {
  assert.match(PILOTS.reaper.ability, /最大生命 -20 HP/);
  assert.doesNotMatch(PILOTS.reaper.ability, /生命 -2；/);
});

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
    passives: { magnet: 1, armor: 2, critical: 1, support: 3, overclock: 1, bombcap: 1 },
    secondarySlots: 3,
    passiveSlots: 6,
  };
  const pool = makeUpgradePool(build);
  const secondaryIds = pool.filter(item => item.category === 'secondary').map(item => item.id);
  const passiveIds = pool.filter(item => item.category === 'passive').map(item => item.id);
  assert.deepEqual(new Set(secondaryIds), new Set(['homing', 'rail', 'drone']));
  assert.deepEqual(new Set(passiveIds), new Set(['magnet', 'armor', 'critical', 'overclock', 'bombcap']));
});

test('a completely maxed loadout offers an unlimited ten-percent attack upgrade', () => {
  const build = {
    primaryLevel: 3,
    secondaries: { homing: 3, rail: 3, drone: 3 },
    passives: { magnet: 3, armor: 3, critical: 3, support: 3, overclock: 3, bombcap: 3 },
    fusions: { seekerOrbit: true },
    secondarySlots: 3,
    passiveSlots: 6,
    overdrive: 7,
  };

  assert.equal(isBuildMaxed(build), true);
  assert.ok(makeUpgradePool(build).some(item => item.id === 'overdrive-boost'));
  assert.ok(makeUpgradeChoices(build, () => 0).some(item => item.id === 'overdrive-boost'));
  assert.equal(isBuildMaxed({ ...build, passives: { ...build.passives, armor: 2 } }), false);
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

test('maxed skill pairs expose each fusion exactly once before overdrive', () => {
  const build = {
    primaryLevel: 3,
    secondaries: { drone: 3, homing: 3, rail: 3, prism: 3 },
    passives: {},
    secondarySlots: 4,
    passiveSlots: 6,
    fusions: {},
  };
  let pool = makeUpgradePool(build);
  assert.deepEqual(new Set(pool.filter(item => item.category === 'fusion').map(item => item.id)), new Set(['seekerOrbit', 'lanceOrbit']));
  build.fusions.seekerOrbit = true;
  pool = makeUpgradePool(build);
  assert.ok(!pool.some(item => item.id === 'seekerOrbit'));
  assert.ok(pool.some(item => item.id === 'lanceOrbit'));
});

test('a fusion occupies one secondary slot and reopens exactly one weapon slot', () => {
  const build = {
    primaryLevel: 3,
    secondaries: { chain: 3 },
    passives: {},
    secondarySlots: 3,
    passiveSlots: 6,
    fusions: { seekerOrbit: true },
  };

  const pool = makeUpgradePool(build);
  assert.ok(pool.some(item => item.id === 'acid'));
  assert.ok(pool.some(item => item.id === 'rail'));
  assert.ok(!pool.some(item => item.id === 'seekerOrbit'));

  build.secondaries.acid = 3;
  const filledPool = makeUpgradePool(build);
  assert.ok(!filledPool.some(item => item.id === 'rail'));
});

test('kungfu builds offer basic fist ranks and only six martial secondary techniques', () => {
  const build = {
    primaryLevel: 1,
    secondarySet: 'kungfu',
    secondaries: {},
    passives: {},
    secondarySlots: 3,
    passiveSlots: 6,
  };
  const pool = makeUpgradePool(build);
  const primary = pool.find(item => item.id === 'primary');
  const techniques = pool.filter(item => item.category === 'secondary');

  assert.equal(primary.name, '基本拳法');
  assert.deepEqual(new Set(techniques.map(item => item.id)), new Set(['kiai', 'jointStrike', 'pushHands', 'ironBell', 'afterimage', 'ironMountain']));
  assert.ok(!pool.some(item => ['homing', 'guidance', 'seekerOrbit', 'lanceOrbit'].includes(item.id)));
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

test('early XP pacing awards the first earned level by the second opening wave at x10 scale', () => {
  assert.ok(xpForLevel(1) <= 240);
  assert.ok(xpForLevel(2) > xpForLevel(1));
  assert.ok(Array.from({ length: 35 }, (_, index) => xpForLevel(index + 1)).reduce((sum, value) => sum + value, 0) <= 56000);
});

test('later sectors award richer XP drops without changing opening balance', () => {
  assert.equal(xpValueForStage(4, 0), 40);
  assert.ok(xpValueForStage(4, 4) > xpValueForStage(4, 0));
  const values = splitXpValue(370);
  assert.equal(values.reduce((total, value) => total + value, 0), 370);
  assert.ok(new Set(values).size >= 3, 'large drops should expose multiple visible denominations');
});

test('a full five-sector clear contains enough XP to max equipped skills and continue into overdrive', () => {
  let campaignXp = 0;
  STAGES.forEach((stage, stageIndex) => {
    for (let waveIndex = 0; waveIndex < stage.waves; waveIndex += 1) {
      if (waveIndex + 1 === stage.midbossWave) {
        campaignXp += xpValueForStage(ENEMY_TYPES.midboss.xp, stageIndex);
        continue;
      }
      const count = 6 + stageIndex + Math.floor(waveIndex * .85);
      for (let index = 0; index < count; index += 1) {
        let type = 'scout';
        if (stageIndex >= 1 && (index + waveIndex) % 4 === 0) type = 'striker';
        if (stageIndex >= 2 && (index + waveIndex) % 5 === 0) type = 'gunship';
        campaignXp += xpValueForStage(ENEMY_TYPES[type].xp, stageIndex);
      }
      if (waveIndex === stage.waves - 1) campaignXp += xpValueForStage(ENEMY_TYPES.elite.xp, stageIndex);
    }
  });
  const level36Cost = Array.from({ length: 35 }, (_, index) => xpForLevel(index + 1)).reduce((sum, value) => sum + value, 0);
  assert.ok(campaignXp >= level36Cost, `campaign XP ${campaignXp} must cover level-36 cost ${level36Cost}`);
  assert.ok(campaignXp >= 2463, 'campaign must cover the 23 earned levels needed to max a full equipped loadout');
});

test('route progress reaches and holds explicit midboss and boss nodes', () => {
  const stage = { waves: 8, midbossWave: 4 };
  assert.equal(stageProgress(stage, -1, 'stageIntro'), 0);
  assert.equal(stageProgress(stage, 3, 'playing'), midbossProgress(stage));
  assert.equal(stageProgress(stage, 7, 'playing'), 8 / 9);
  assert.equal(stageProgress(stage, 7, 'bossWarning'), 1);
  assert.equal(stageProgress(stage, 7, 'stageClear'), 1);
});
