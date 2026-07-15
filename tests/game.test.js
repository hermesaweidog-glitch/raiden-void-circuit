import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, WORLD } from '../src/config.js';
import { Game } from '../src/game.js';

class FakeClassList {
  constructor() { this.values = new Set(['hidden']); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

function fakeElement() {
  return {
    textContent: '',
    innerHTML: '',
    children: [],
    style: { width: '', left: '' },
    classList: new FakeClassList(),
    append(child) { this.children.push(child); },
    addEventListener() {},
  };
}

function makeGame() {
  const elements = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id);
    },
    createElement: () => fakeElement(),
    addEventListener() {},
  };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0;
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, configurable: true });

  const canvas = {
    getContext: () => ({}),
    addEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800 }),
  };
  return { game: new Game(canvas), elements };
}

test('a new run opens one starter upgrade before stage movement begins', () => {
  const { game } = makeGame();

  game.start('falcon');

  assert.equal(game.mode, 'levelup');
  assert.equal(game.player.pendingLevels, 1);
  assert.equal(game.player.build.secondarySlots, 3);
  assert.equal(game.player.build.passiveSlots, 6);
  assert.equal(game.currentChoices.length, 3);
  assert.equal(game.dom['upgrade-kicker'].textContent, 'PRE-FLIGHT UPGRADE');
  assert.equal(game.dom['upgrade-title'].textContent, '選擇開局強化');

  game.chooseUpgrade(0);

  assert.equal(game.player.pendingLevels, 0);
  assert.equal(game.mode, 'stageIntro');
});

test('midboss checkpoint blocks route progress until the target is destroyed', () => {
  const { game } = makeGame();
  const stage = STAGES[0];
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.enemies = [];
  game.waveIndex = stage.midbossWave - 2;

  game.spawnNextWave();

  const active = game.enemies.filter(enemy => enemy.alive);
  assert.equal(game.waveIndex + 1, stage.midbossWave);
  assert.deepEqual(active.map(enemy => enemy.type), ['midboss']);

  game.waveCooldown = 0;
  game.updateDirector();
  assert.equal(game.waveIndex + 1, stage.midbossWave);

  game.killEnemy(active[0]);
  game.waveCooldown = 0;
  game.updateDirector();
  assert.equal(game.waveIndex + 1, stage.midbossWave + 1);
});

test('route timeline advances every frame without jumping when a wave spawns', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.routeProgress = 0;

  game.updateRouteProgress();
  const afterFrame = game.routeProgress;
  assert.ok(afterFrame > 0);
  game.enemies = [];
  game.spawnNextWave();
  assert.equal(game.routeProgress, afterFrame);

  for (let i = 0; i < 120; i += 1) game.updateRouteProgress();
  assert.ok(game.routeProgress > afterFrame);
  assert.ok(game.routeProgress < 1);
});

test('large-enemy hits use a stable flash instead of geometry shifts or impact bursts', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  for (const type of ['boss', 'midboss', 'elite']) {
    const enemy = { type, hp: 100, maxHp: 100, alive: true, x: 240, y: 120, radius: 50, hitFlash: 0 };
    game.particles = [];
    const origin = { x: enemy.x, y: enemy.y, radius: enemy.radius };

    for (let i = 0; i < 25; i += 1) game.damageEnemy(enemy, .1, true);

    assert.deepEqual({ x: enemy.x, y: enemy.y, radius: enemy.radius }, origin);
    assert.ok(enemy.hitFlash > 0);
    assert.equal(game.particles.length, 0);
  }
});

test('particle saturation drops overflow work instead of shifting the entire array', () => {
  const { game } = makeGame();
  const marker = { id: 'oldest' };
  game.particles = [marker, ...Array.from({ length: WORLD.maxParticles - 1 }, () => ({}))];

  game.spawnBurst(100, 100, 90, '#fff');

  assert.equal(game.particles.length, WORLD.maxParticles);
  assert.equal(game.particles[0], marker);
});

test('destroying a boss grants one immediate upgrade without XP or a next-stage prompt', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.debugForceBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  boss.hp = 1;
  const xp = game.player.xp;

  assert.doesNotThrow(() => game.damageEnemy(boss, 2, true));
  assert.ok(game.particles.length <= 64);
  assert.equal(game.player.xp, xp);
  assert.equal(game.player.pendingLevels, 1);
  assert.equal(game.mode, 'levelup');
  assert.equal(game.upgradeReturnMode, 'stageClear');

  game.chooseUpgrade(0);
  assert.equal(game.mode, 'stageClear');
  assert.doesNotThrow(() => { for (let i = 0; i < 100; i += 1) game.update(); });

  assert.equal(game.stageIndex, 1);
  assert.equal(game.mode, 'stageIntro');
  assert.equal(game.player.pendingLevels, 0);
});

test('end screen remains actionable when browser storage rejects a new high score', () => {
  for (const victory of [false, true]) {
    const { game } = makeGame();
    game.start('falcon');
    game.chooseUpgrade(0);
    game.score = game.best + 1;
    globalThis.localStorage.setItem = () => { throw new DOMException('quota probe', 'QuotaExceededError'); };

    assert.doesNotThrow(() => game.endRun(victory));
    assert.equal(game.mode, victory ? 'victory' : 'gameover');
    assert.equal(game.dom['end-overlay'].classList.contains('hidden'), false);
  }
});

test('multiple enemy bullets hitting in one frame only damage the player once', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.invincible = 0;
  game.enemyBullets = Array.from({ length: 2 }, () => ({
    x: game.player.x,
    y: game.player.y,
    vx: 0,
    vy: 0,
    radius: 5,
    life: 60,
  }));
  const hp = game.player.hp;

  assert.doesNotThrow(() => game.updateEnemyBullets());
  assert.equal(game.player.hp, hp - 1);
  assert.equal(game.enemyBullets.length, 0);
});

test('stage clear has a short frame fallback and a real-time deadline', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';

  game.completeStage();

  assert.ok(game.transitionTimer <= 100);
  assert.ok(game.transitionDeadline > performance.now());
});

test('the aircraft visibly flies in from below and exits upward after stage clear', () => {
  const { game } = makeGame();
  game.start('falcon');
  assert.ok(game.player.y > game.h);
  assert.ok(game.player.targetY < game.h);
  game.chooseUpgrade(0);
  const entryY = game.player.y;
  game.update();
  assert.ok(game.player.y < entryY);
  assert.ok(game.player.y > game.h, 'entry should animate instead of snapping into place');

  game.mode = 'playing';
  game.completeStage();
  assert.ok(game.player.targetY < 0);
  const exitY = game.player.y;
  game.update();
  assert.ok(game.player.y < exitY);
});

test('ordinary encounters hide wave numbering and use at least six formations', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  const formations = new Set();

  for (let i = 0; i < STAGES[0].waves; i += 1) {
    game.enemies = [];
    game.spawnNextWave();
    for (const enemy of game.enemies) if (enemy.type !== 'midboss') formations.add(enemy.formation);
    if (game.waveIndex === 0) assert.doesNotMatch(game.dom.announcement.innerHTML, /WAVE/i);
  }

  assert.ok(formations.size >= 6);
});

test('XP follows the scrolling map and auto-attracts before leaving the playfield', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.x = 240;
  game.player.y = 720;
  game.dropXp(40, 60, 5);
  const orb = game.xpOrbs[0];
  const origin = { x: orb.x, y: orb.y };
  const scrollSpeed = game.worldScrollSpeed();

  for (let i = 0; i < 60; i += 1) game.updateXpOrbs();

  assert.equal(orb.x, origin.x);
  assert.ok(Math.abs(orb.y - origin.y - scrollSpeed * 60) < 1e-9);

  orb.y = game.h - 110;
  game.updateXpOrbs();
  assert.equal(orb.attracting, true);
});

test('world scrolling pauses with gameplay instead of drifting behind frozen pickups', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'paused';
  const pausedAt = game.worldScroll;
  game.update();
  assert.equal(game.worldScroll, pausedAt);
  game.mode = 'playing';
  game.update();
  assert.equal(game.worldScroll, pausedAt + game.worldScrollSpeed());
});

test('later-sector XP drops split into visibly distinct denominations', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.stageIndex = 4;

  game.dropXp(120, 120, 20);

  assert.ok(game.xpOrbs.reduce((total, orb) => total + orb.value, 0) > 20);
  assert.ok(new Set(game.xpOrbs.map(orb => orb.color)).size >= 2);

  game.stageIndex = 0;
  game.xpOrbs = Array.from({ length: WORLD.maxXp }, () => ({ value: 1, radius: 4, color: '#4cff9b' }));
  game.dropXp(120, 120, 20);
  assert.equal(game.xpOrbs.reduce((total, orb) => total + orb.value, 0), WORLD.maxXp + 20);
  assert.ok(game.xpOrbs.some(orb => orb.value >= 20 && orb.color === '#ff72f1'));
});

test('deficit-only field supplies drop rarely and replace hidden stage refills', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  const enemy = { type: 'scout', x: 100, y: 100 };
  game.player.bombs = game.player.maxBombs;

  assert.equal(game.maybeDropSupply(enemy, () => 0), false, 'full resources must not produce supplies');
  game.player.hp -= 1;
  assert.equal(game.maybeDropSupply(enemy, () => 0), true);
  assert.equal(game.effects.at(-1).supply, 'heal');
  assert.ok(game.effects.at(-1).radius >= 15);

  game.player.bombs -= 1;
  const hp = game.player.hp;
  const bombs = game.player.bombs;
  game.completeStage();
  assert.equal(game.player.hp, hp);
  assert.equal(game.player.bombs, bombs);

  game.effects = Array.from({ length: WORLD.maxEffects }, () => ({ type: 'ring' }));
  game.player.hp -= 1;
  assert.equal(game.maybeDropSupply(enemy, () => 0), true);
  assert.equal(game.effects.length, WORLD.maxEffects);
  assert.ok(game.effects.some(effect => effect.type === 'supply'));

  game.effects = [{ type: 'supply', x: 100, y: 100, supply: 'heal', life: 520, radius: 11 }];
  game.mode = 'stageClear';
  const damagedHp = game.player.hp;
  for (let i = 0; i < 90; i += 1) game.updateEffects();
  assert.equal(game.player.hp, damagedHp + 1, 'stage-clear supplies should fly to the player instead of disappearing');
});

test('new secondary archetypes create distinct gravity, prism, and interception effects', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.enemies = [{ id: 99, type: 'elite', x: 240, y: 180, radius: 25, hp: 100, maxHp: 100, alive: true }];

  game.player.build.secondaries = { gravity: 1 };
  game.updateSecondaries();
  assert.ok(game.effects.some(effect => effect.type === 'gravity'));

  game.player.secondaryCooldowns.prism = 0;
  game.player.build.secondaries = { prism: 1 };
  game.updateSecondaries();
  assert.ok(game.effects.some(effect => effect.type === 'prism'));
  assert.ok(game.enemies[0].hp < 100);

  game.player.secondaryCooldowns.interceptor = 0;
  game.player.build.secondaries = { interceptor: 1 };
  game.enemyBullets = [{ x: 240, y: 650, vx: 0, vy: 1, radius: 5 }];
  game.updateSecondaries();
  assert.equal(game.enemyBullets.length, 0);
});

test('primary weapons gain elemental payloads only from independent post-max passives', () => {
  const expected = { incendiary: 'burn', cryo: 'chill', voltaic: 'shock' };
  for (const craftId of ['falcon', 'lancer', 'wasp']) {
    const { game } = makeGame();
    game.start(craftId);
    game.chooseUpgrade(0);
    game.mode = 'playing';
    game.player.build.primaryLevel = 3;
    game.player.fireCooldown = 0;
    game.firePrimary();
    assert.ok(game.playerBullets.every(bullet => !bullet.status && !bullet.statuses?.length));
  }

  for (const [passive, payload] of Object.entries(expected)) {
    const { game } = makeGame();
    game.start('falcon');
    game.chooseUpgrade(0);
    game.mode = 'playing';
    game.player.build.primaryLevel = 3;
    game.player.build.passives[passive] = 1;
    game.player.fireCooldown = 0;
    game.firePrimary();
    assert.ok(game.playerBullets.some(bullet => bullet.statuses?.includes(payload)), `${passive} should apply ${payload}`);
  }
});

test('elemental control effects keep large-enemy motion smooth under repeated hits', () => {
  const { game } = makeGame();
  game.start('lancer');
  game.chooseUpgrade(0);
  const enemy = { id: 7, type: 'midboss', x: 240, y: 140, hp: 100, maxHp: 100, alive: true, hitFlash: 0 };
  game.enemies = [enemy];
  const origin = { x: enemy.x, y: enemy.y };
  const bullet = { statuses: ['chill'], statusPowers: { chill: 5 }, damage: 1 };

  for (let i = 0; i < 8; i += 1) game.applyBulletStatus(bullet, enemy);

  assert.deepEqual({ x: enemy.x, y: enemy.y }, origin);
  assert.ok(enemy.chillTimer > 0);
  assert.ok(game.updateEnemyStatus(enemy) >= .8);
});
