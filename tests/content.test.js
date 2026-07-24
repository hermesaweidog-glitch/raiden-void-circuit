import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { AIRCRAFT, FUSIONS, PILOTS, SECONDARIES, PASSIVES, PRIMARY_ICON, STAGES, BOSSES, ENEMY_TYPES, WORLD } from '../src/config.js';

test('final content roster is complete', () => {
  assert.equal(Object.keys(AIRCRAFT).length, 3);
  assert.ok(Object.keys(SECONDARIES).length >= 9);
  assert.ok(['gravity', 'prism', 'interceptor'].every(id => SECONDARIES[id]));
  assert.ok(SECONDARIES.acid && !SECONDARIES.mines);
  assert.ok(Object.keys(PASSIVES).length >= 12);
  assert.ok(['capacitor', 'payload', 'flux', 'harvester', 'directCore', 'pierceCore', 'areaCore', 'siege', 'fieldAmp'].every(id => PASSIVES[id]));
  assert.ok(PASSIVES.support && !PASSIVES.engine);
  assert.ok(['incendiary', 'cryo', 'voltaic'].every(id => !PASSIVES[id]));
  assert.equal(STAGES.length, 5);
  assert.equal(Object.keys(BOSSES).length, 5);
  assert.equal(Object.keys(PILOTS).length, 8);
  assert.match(PILOTS.imperial.ability, /超頻.*源晶礦結算獲取量.*1%/);
  assert.deepEqual(Object.keys(FUSIONS), ['seekerOrbit', 'seekerOrbitPlus', 'lanceOrbit', 'clusterStars', 'blackHole', 'langinus', 'suicideSquad', 'luckyStar', 'taijiMaster', 'sixHarmony', 'sixMeridians', 'overclockDirect', 'overclockPierce', 'overclockArea', 'world']);
});

test('runtime budgets are explicit and mobile-safe', () => {
  assert.equal(WORLD.maxPlayerBullets, 220);
  assert.equal(WORLD.maxEnemyBullets, 260);
  assert.equal(WORLD.maxEnemies, 40);
  assert.ok(WORLD.maxParticles <= 260);
  assert.equal(WORLD.maxEffects, 40);
  assert.ok(WORLD.maxLevel >= 36);
});

test('all persistent upgrades use exactly three ranks', () => {
  assert.ok(Object.values(SECONDARIES).every(item => item.max === 3));
  assert.ok(Object.values(PASSIVES).every(item => item.max === 3));
  assert.equal(WORLD.maxUpgradeRank, 3);
});

test('every persistent skill uses a unique generated image icon', () => {
  const skills = [...Object.values(SECONDARIES), ...Object.values(PASSIVES)];
  const icons = skills.map(skill => skill.icon);

  assert.equal(PRIMARY_ICON, 'assets/icons/primary-cannon.webp');
  assert.ok(icons.every(Boolean));
  assert.ok(icons.every(icon => /^assets\/icons\/.+\.(webp|svg)$/.test(icon)));
  assert.equal(new Set(icons).size, skills.length);
  assert.ok(!icons.includes(PRIMARY_ICON));
  assert.ok([PRIMARY_ICON, ...icons].every(icon => existsSync(new URL(`../${icon}`, import.meta.url))));
});

test('aircraft selection uses three distinct generated craft portraits', () => {
  const art = Object.values(AIRCRAFT).map(craft => craft.art);
  assert.equal(new Set(art).size, 3);
  assert.ok(art.every(path => /^assets\/aircraft\/.+\.webp$/.test(path)));
  assert.ok(art.every(path => existsSync(new URL(`../${path}`, import.meta.url))));
});

test('all eight pilots use distinct generated portraits', () => {
  const art = Object.values(PILOTS).map(pilot => pilot.art);
  assert.equal(new Set(art).size, 8);
  assert.ok(art.every(path => /^assets\/pilots\/.+\.webp$/.test(path)));
  assert.ok(art.every(path => existsSync(new URL(`../${path}`, import.meta.url))));
});

test('difficulty rises discretely across all five stages', () => {
  for (let i = 1; i < STAGES.length; i += 1) {
    for (const key of ['enemySpeed', 'bulletSpeed', 'bulletCount', 'fireRate', 'enemyHp', 'bossHp']) {
      assert.ok(STAGES[i][key] > STAGES[i - 1][key], `${key} must rise at stage ${i + 1}`);
    }
  }
});

test('stage one is a gentle onboarding sector tuned to 0.7 hp', () => {
  assert.equal(STAGES[0].enemyHp, .7);
  assert.equal(STAGES[0].bossHp, .7);
  assert.ok(STAGES[0].bulletCount <= .55, 'stage one bullet density stays low');
  assert.ok(STAGES[0].fireRate <= .5, 'stage one fire rate stays low');
});

test('every boss has at least three phases and a unique title', () => {
  const titles = new Set();
  const sprites = new Set();
  for (const boss of Object.values(BOSSES)) {
    assert.ok(boss.phases.length >= 3);
    assert.ok(boss.sprite && boss.accent);
    titles.add(boss.name);
    sprites.add(boss.sprite);
  }
  assert.equal(titles.size, 5);
  assert.equal(sprites.size, 5);
});

test('every sector has enough waves and a mandatory midboss checkpoint', () => {
  assert.ok(ENEMY_TYPES.midboss, 'midboss archetype must exist');
  assert.ok(ENEMY_TYPES.midboss.hp >= 130, 'midboss needs enough durability to showcase its pattern');
  for (const stage of STAGES) {
    assert.ok(stage.waves >= 8, `${stage.name} needs at least eight waves`);
    assert.ok(stage.midbossWave >= 3, `${stage.name} checkpoint is too early`);
    assert.ok(stage.midbossWave <= stage.waves - 2, `${stage.name} needs waves after its checkpoint`);
  }
});


test('music scenes include the selected menu and boss tracks, extended original exploration, and user-provided warning', () => {
  for (const path of [
    '../assets/audio/menu.mp3',
    '../assets/audio/stage.mp3',
    '../assets/audio/boss-warning.mp3',
    '../assets/audio/boss.mp3',
  ]) assert.ok(existsSync(new URL(path, import.meta.url)), `missing ${path}`);
});
