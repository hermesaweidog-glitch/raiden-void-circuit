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

test('boss hits use a stable flash instead of high-volume impact particles', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.debugForceBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  const origin = { x: boss.x, y: boss.y };

  for (let i = 0; i < 100; i += 1) game.damageEnemy(boss, 0.1, true);

  assert.deepEqual({ x: boss.x, y: boss.y }, origin);
  assert.ok(boss.hitFlash > 0);
  assert.ok(game.particles.length <= 8);
});

test('particle saturation drops overflow work instead of shifting the entire array', () => {
  const { game } = makeGame();
  const marker = { id: 'oldest' };
  game.particles = [marker, ...Array.from({ length: WORLD.maxParticles - 1 }, () => ({}))];

  game.spawnBurst(100, 100, 90, '#fff');

  assert.equal(game.particles.length, WORLD.maxParticles);
  assert.equal(game.particles[0], marker);
});

test('destroying the first sector boss advances to the second sector without throwing', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.debugForceBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  boss.hp = 1;

  assert.doesNotThrow(() => {
    game.damageEnemy(boss, 2, true);
  });
  assert.ok(game.particles.length <= 64);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 230; i += 1) game.update();
  });

  assert.equal(game.stageIndex, 1);
  assert.equal(game.mode, 'levelup');
  assert.equal(game.upgradeReturnMode, 'stageIntro');
  assert.ok(game.player.pendingLevels > 0);
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

test('XP stays at its drop point until attraction begins', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.x = 240;
  game.player.y = 720;
  game.dropXp(40, 60, 5);
  const orb = game.xpOrbs[0];
  const origin = { x: orb.x, y: orb.y };

  for (let i = 0; i < 60; i += 1) game.updateXpOrbs();

  assert.deepEqual({ x: orb.x, y: orb.y }, origin);
  assert.equal(orb.vx || 0, 0);
  assert.equal(orb.vy || 0, 0);
});

test('each primary weapon exposes a distinct elemental payload at rank three', () => {
  const expected = { falcon: 'burn', lancer: 'chill', wasp: 'shock' };
  for (const [craftId, payload] of Object.entries(expected)) {
    const { game } = makeGame();
    game.start(craftId);
    game.chooseUpgrade(0);
    game.mode = 'playing';
    game.player.build.primaryLevel = 3;
    game.player.fireCooldown = 0;
    game.firePrimary();
    assert.ok(game.playerBullets.some(bullet => bullet.status === payload), `${craftId} should apply ${payload}`);
  }
});
