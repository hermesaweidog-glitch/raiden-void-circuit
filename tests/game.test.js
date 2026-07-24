import test from 'node:test';
import assert from 'node:assert/strict';
import { FUSIONS, STAGES, WORLD } from '../src/config.js';
import { Game } from '../src/game.js';
import { xpValueForStage } from '../src/systems.js';
import { maxedMetaState, META_STORAGE_KEY } from '../src/meta.js';

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
  // Tests run against the fully-upgraded meta baseline: firepower ×1.0 and xp ×1.0
  // exactly match the pre-meta tuning the assertions below were written for.
  globalThis.localStorage = { getItem: key => key === META_STORAGE_KEY ? JSON.stringify(maxedMetaState()) : null, setItem() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0;
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, configurable: true });

  const canvas = {
    getContext: () => ({}),
    addEventListener() {},
    setPointerCapture() {},
    hasPointerCapture: () => false,
    releasePointerCapture() { throw new Error('stale pointer capture must not be released'); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800 }),
  };
  return { game: new Game(canvas), elements };
}

test('a new run opens one starter upgrade before stage movement begins', () => {
  const { game } = makeGame();

  game.start('falcon');

  assert.equal(game.mode, 'levelup');
  assert.equal(game.player.pendingLevels, 1);
  assert.equal(game.player.build.secondarySlots, 4);
  assert.equal(game.player.build.passiveSlots, 6);
  assert.equal(game.currentChoices.length, 3);
  assert.equal(game.dom['upgrade-kicker'].textContent, 'PRE-FLIGHT UPGRADE');
  assert.equal(game.dom['upgrade-title'].textContent, '選擇開局強化');

  game.chooseUpgrade(0);

  assert.equal(game.player.pendingLevels, 0);
  assert.equal(game.mode, 'stageIntro');
});

test('retry returns to aircraft selection instead of reusing the previous craft', () => {
  const { game } = makeGame();
  game.start('wasp');
  game.chooseUpgrade(0);
  game.xpOrbs.push({ x: 12, y: 34 });
  game.effects.push({ type: 'supply' });
  game.particles.push({ life: 10 });
  game.floaters.push({ text: 'stale' });
  game.keys.add('ArrowLeft');
  game.pointer.active = true;
  game.pointer.id = 7;
  game.frame = 999;
  game.worldScroll = 321;
  game.score = 4567;
  game.stageIndex = 4;
  game.waveIndex = 8;
  game.waveCooldown = 17;
  game.routeProgress = .82;
  game.transitionTimer = 44;
  game.transitionDeadline = 12345;
  game.entityId = 77;
  game.upgradeReturnMode = 'boss';
  game.lastSoundFrame = { enemy: 22 };
  game.dom.announcement.classList.remove('hidden');
  game.dom['pause-button'].textContent = 'RESUME';
  const announcementToken = game.announcementToken;
  game.endRun(false);

  game.restart();

  assert.equal(game.mode, 'title');
  assert.equal(game.player, null);
  assert.equal(game.dom['title-overlay'].classList.contains('hidden'), false);
  assert.deepEqual(game.xpOrbs, []);
  assert.deepEqual(game.effects, []);
  assert.deepEqual(game.particles, []);
  assert.deepEqual(game.floaters, []);
  assert.equal(game.keys.size, 0);
  assert.equal(game.pointer.active, false);
  assert.equal(game.pointer.id, null);
  assert.equal(game.frame, 0);
  assert.equal(game.worldScroll, 0);
  assert.equal(game.score, 0);
  assert.equal(game.stageIndex, 0);
  assert.equal(game.waveIndex, -1);
  assert.equal(game.waveCooldown, 0);
  assert.equal(game.routeProgress, 0);
  assert.equal(game.transitionTimer, 0);
  assert.equal(game.transitionDeadline, 0);
  assert.equal(game.entityId, 1);
  assert.equal(game.upgradeReturnMode, null);
  assert.deepEqual(game.lastSoundFrame, {});
  assert.equal(game.announcementToken, announcementToken + 1);
  assert.equal(game.dom.announcement.classList.contains('hidden'), true);
  assert.equal(game.dom['pause-button'].textContent, 'PAUSE');
});

test('healing supplies use a green field-repair identity', () => {
  const { game } = makeGame();
  const heal = game.supplyStyle('heal');
  const bomb = game.supplyStyle('bomb');

  assert.equal(heal.color, '#4cff9b');
  assert.equal(heal.label, '+');
  assert.notEqual(heal.color, bomb.color);
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

test('midboss is invulnerable until reaching its combat station', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.spawnEnemy('midboss', WORLD.width / 2, -110, 1, 7, 0);
  const midboss = game.enemies[0];
  const hp = midboss.hp;

  game.damageEnemy(midboss, 50, false);
  assert.equal(midboss.hp, hp);
  midboss.orbiting = true;
  midboss.y = 145;
  game.damageEnemy(midboss, 50, false);
  assert.ok(midboss.hp < hp);
});

test('enemies above the screen top cannot be hit by player fire', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  const entering = { id: 460, type: 'scout', x: 240, y: -30, radius: 14, hp: 100, maxHp: 100, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [entering];

  game.damageEnemy(entering, 50, false);
  assert.equal(entering.hp, 100, 'off-screen enemies take no direct damage');

  game.playerBullets = [{ id: 1, x: 240, y: -30, vx: 0, vy: -10, radius: 6, damage: 5, life: 60, pierce: 0 }];
  game.updatePlayerBullets();
  assert.equal(entering.hp, 100, 'bullets pass through enemies above the screen');
  assert.equal(game.playerBullets.length, 1, 'the bullet is not consumed by an off-screen enemy');

  entering.y = 40;
  game.damageEnemy(entering, 5, false);
  assert.ok(entering.hp < 100, 'the same enemy is damageable once its sprite enters the field');
});

test('midboss borrows a distinct opening weapon from each sector boss', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  const midboss = { x: 240, y: 145, age: 120, color: '#fff' };

  const counts = STAGES.map((_, stageIndex) => {
    game.stageIndex = stageIndex;
    game.enemyBullets = [];
    game.midbossAttack(midboss);
    return game.enemyBullets.length;
  });

  assert.deepEqual(counts, [7, 9, 6, 14, 8]);
  assert.equal(new Set(counts).size, STAGES.length);

  game.stageIndex = 4;
  game.enemyBullets = [];
  game.midbossAttack(midboss);
  assert.ok(game.enemyBullets.every(bullet => bullet.x < -bullet.radius || bullet.x > WORLD.width + bullet.radius));
  game.updateEnemyBullets();
  assert.equal(game.enemyBullets.length, 8);
  for (let frame = 1; frame < 20; frame += 1) game.updateEnemyBullets();
  assert.ok(game.enemyBullets.every(bullet => bullet.x >= 0 && bullet.x <= WORLD.width));
});

test('midboss update schedules a finite repeating attack cooldown', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.stageIndex = 1;
  game.spawnEnemy('midboss', WORLD.width / 2, 145, 1, 0, 0);
  const midboss = game.enemies[0];
  midboss.orbiting = true;
  midboss.orbitAge = 0;
  midboss.orbitCenterX = midboss.x;
  midboss.motionScale = 1;
  midboss.cooldown = 0;

  game.updateMidboss(midboss);

  assert.ok(Number.isFinite(midboss.cooldown));
  assert.ok(midboss.cooldown > 0, `cooldown=${midboss.cooldown}`);
  assert.equal(game.enemyBullets.length, 9);
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
    const enemy = { type, hp: 100, maxHp: 100, alive: true, orbiting: true, x: 240, y: 120, radius: 50, hitFlash: 0 };
    game.particles = [];
    const origin = { x: enemy.x, y: enemy.y, radius: enemy.radius };

    for (let i = 0; i < 25; i += 1) game.damageEnemy(enemy, .1, true);

    assert.deepEqual({ x: enemy.x, y: enemy.y, radius: enemy.radius }, origin);
    assert.ok(enemy.hitFlash > 0);
    assert.equal(game.particles.length, 0);
  }
});

test('large enemies enter their orbit without snapping backward or sideways', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';

  const midboss = {
    id: 1, type: 'midboss', x: 240, y: 144.5, age: 220, motionScale: 1,
    cooldown: 999, hp: 100, maxHp: 100, alive: true, radius: 34,
  };
  game.updateMidboss(midboss);
  const midbossEntry = { x: midboss.x, y: midboss.y };
  game.updateMidboss(midboss);
  assert.ok(Math.hypot(midboss.x - midbossEntry.x, midboss.y - midbossEntry.y) < 4);

  const boss = {
    id: 2, type: 'boss', bossId: 'manta', x: 240, y: 117.5, age: 150, motionScale: 1,
    cooldown: 999, phase: 0, hp: 100, maxHp: 100, alive: true, radius: 52, color: '#fff',
  };
  game.updateBoss(boss);
  const bossEntry = { x: boss.x, y: boss.y };
  game.updateBoss(boss);
  assert.ok(Math.hypot(boss.x - bossEntry.x, boss.y - bossEntry.y) < 4);
});

test('particle saturation drops overflow work instead of shifting the entire array', () => {
  const { game } = makeGame();
  const marker = { id: 'oldest' };
  game.particles = [marker, ...Array.from({ length: WORLD.maxParticles - 1 }, () => ({}))];

  game.spawnBurst(100, 100, 90, '#fff');

  assert.equal(game.particles.length, WORLD.maxParticles);
  assert.equal(game.particles[0], marker);
});

test('a sector boss is invulnerable until reaching its combat station', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.debugForceBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  const hp = boss.hp;

  game.damageEnemy(boss, 50, false);
  assert.equal(boss.hp, hp);
  for (let i = 0; i < 400 && boss.arriving; i += 1) game.updateBoss(boss);
  assert.equal(boss.arriving, false);
  game.damageEnemy(boss, 50, false);
  assert.ok(boss.hp < hp);
});

test('destroying a boss grants one immediate upgrade without XP or a next-stage prompt', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.debugForceBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  for (let i = 0; i < 400 && boss.arriving; i += 1) game.updateBoss(boss);
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

test('boss phase changes preserve bullets already in flight', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.debugForceBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  boss.y = 118;
  boss.orbiting = true;
  boss.orbitAge = 0;
  boss.orbitCenterX = boss.x;
  boss.cooldown = 999;
  boss.hp = boss.maxHp * .5;
  const existing = { x: 20, y: 20, vx: 0, vy: 1, radius: 5, life: 120 };
  game.enemyBullets = [existing];

  game.updateBoss(boss);

  assert.equal(boss.phase, 1);
  assert.ok(game.enemyBullets.includes(existing));
});

test('later boss phases combine every earlier attack pattern', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.debugForceBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  boss.y = 118;
  boss.age = 120;

  const bulletCounts = [0, 1, 2].map(phase => {
    boss.phase = phase;
    game.enemyBullets = [];
    game.bossAttack(boss);
    return game.enemyBullets.length;
  });

  assert.equal(bulletCounts[0], 7);
  assert.ok(bulletCounts[1] >= bulletCounts[0] + 10);
  assert.ok(bulletCounts[2] >= bulletCounts[1] + 7);
});

test('carrier opens with a three-turret converging barrage', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.stageIndex = 1;
  game.enemyBullets = [];
  game.bossAttack({ bossId: 'carrier', phase: 0, x: 240, y: 118, age: 120, color: '#ff8a4c' });

  assert.equal(game.enemyBullets.length, 9);
  assert.equal(new Set(game.enemyBullets.map(bullet => bullet.x)).size, 3);
  assert.ok(new Set(game.enemyBullets.map(bullet => bullet.vx.toFixed(3))).size >= 5);
});

test('raijin side gates cover the arena with wider readable lanes', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.stageIndex = 4;
  game.enemyBullets = [];
  game.bossAttack({ bossId: 'raijin', phase: 0, x: 240, y: 118, age: 120, color: '#c084fc' });

  const rows = [...new Set(game.enemyBullets.map(bullet => bullet.y))].sort((a, b) => a - b);
  assert.equal(game.enemyBullets.length, 8);
  assert.ok(rows.at(-1) - rows[0] >= 270);
  assert.ok(rows.slice(1).every((y, index) => y - rows[index] >= 80));
  assert.ok(game.enemyBullets.every(bullet => bullet.vy > 0));
  assert.ok(game.enemyBullets.every(bullet => bullet.x < -bullet.radius || bullet.x > WORLD.width + bullet.radius));
  game.updateEnemyBullets();
  assert.equal(game.enemyBullets.length, 8);
  for (let frame = 1; frame < 20; frame += 1) game.updateEnemyBullets();
  assert.ok(game.enemyBullets.every(bullet => bullet.x >= 0 && bullet.x <= WORLD.width));
});

test('raijin phase-one gate launch rows sweep vertically between volleys', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.stageIndex = 4;
  const boss = { bossId: 'raijin', phase: 0, x: 240, y: 118, age: 0, color: '#c084fc' };

  game.bossAttack(boss);
  const firstRows = [...new Set(game.enemyBullets.map(bullet => bullet.y))];
  game.enemyBullets = [];
  boss.age = 30;
  game.bossAttack(boss);
  const secondRows = [...new Set(game.enemyBullets.map(bullet => bullet.y))];

  assert.ok(firstRows.some((row, index) => Math.abs(row - secondRows[index]) >= 45));
});

test('upgrade cards and combat build strip render skill icons with ranks and MAX labels', () => {
  const { game } = makeGame();
  game.start('falcon');

  assert.ok(game.dom['upgrade-options'].children.every(card => card.innerHTML.includes('upgrade-icon')));
  game.player.build.secondaries = { homing: 2 };
  game.player.build.passives = { armor: 3 };
  game.player.build.revision += 1;
  game.updateHud();

  assert.match(game.dom['primary-build'].innerHTML, /skill-token.+primary-cannon\.webp.+>1 · \+0%</);
  assert.match(game.dom['secondary-build'].innerHTML, /skill-token.+homing\.webp.+>2</);
  assert.match(game.dom['passive-build'].innerHTML, /skill-token.+armor\.webp.+>MAX</);
  assert.doesNotMatch(game.dom['secondary-build'].innerHTML, />追蹤飛彈</);
});

test('fusion consumes both component weapons and renders as one MAX secondary', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.player.build.secondaries = { drone: 3, homing: 3, chain: 3 };
  game.currentChoices = [FUSIONS.seekerOrbit];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';

  game.chooseUpgrade(0);
  game.updateHud();

  assert.deepEqual(game.player.build.secondaries, { chain: 3 });
  assert.equal(game.player.build.fusions.seekerOrbit, true);
  assert.match(game.dom['secondary-build'].innerHTML, /追獵軌道/);
  assert.match(game.dom['secondary-build'].innerHTML, />MAX</);
  assert.doesNotMatch(game.dom['secondary-build'].innerHTML, /軌道無人機|追蹤飛彈/);
});

test('passive fusions render in the passive strip instead of the secondary strip', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.player.build.secondaries = { chain: 3 };
  game.player.build.passives = { armor: 2 };
  game.player.build.fusions = { seekerOrbit: true, langinus: true, suicideSquad: true, luckyStar: true };
  game.player.build.revision += 1;
  game.updateHud();

  assert.match(game.dom['secondary-build'].innerHTML, /追獵軌道/, 'weapon fusions stay in the secondary strip');
  assert.doesNotMatch(game.dom['secondary-build'].innerHTML, /朗基努斯之槍|自殺突擊隊|幸運星/, 'passive fusions must not render as secondaries');
  assert.match(game.dom['passive-build'].innerHTML, /朗基努斯之槍/);
  assert.match(game.dom['passive-build'].innerHTML, /自殺突擊隊/);
  assert.match(game.dom['passive-build'].innerHTML, /幸運星/);

  game.updatePausePanel();
  assert.doesNotMatch(game.dom['pause-secondary'].textContent, /朗基努斯之槍|自殺突擊隊|幸運星/);
  assert.match(game.dom['pause-passive'].textContent, /朗基努斯之槍/);

  game.endRun(false);
  assert.match(game.dom['run-summary'].innerHTML, /SECONDARY　2\/4/, 'the end screen counts the weapon fusion as an occupied secondary slot');
  assert.match(game.dom['run-summary'].innerHTML, /PASSIVE　4\/6/, 'the end screen counts passive fusions as occupied passive slots');
});

test('seeker orbit launches max-rank orange missiles from every satellite', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial', secondaries: ['drone', 'homing'] });
  game.player.pendingLevels = 1;
  game.currentChoices = [FUSIONS.seekerOrbit];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.chooseUpgrade(0);
  game.player.x = 240;
  game.player.y = 500;
  game.enemies = [{ id: 700, type: 'scout', x: 240, y: 180, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' }];
  game.playerBullets = [];
  game.effects = [];
  game.player.secondaryCooldowns.seekerOrbit = 0;

  game.updateSecondaries();

  const satellites = game.effects.filter(effect => effect.type === 'seekerSatellite');
  const missiles = game.playerBullets.filter(bullet => bullet.kind === 'missile');
  assert.equal(satellites.length, 3);
  assert.equal(missiles.length, 9);
  assert.equal(new Set(missiles.map(missile => `${missile.x.toFixed(2)},${missile.y.toFixed(2)}`)).size, 3);
  assert.ok(missiles.every(missile => missile.color === '#ff9f1c'));
  assert.ok(missiles.every(missile => missile.damage === 7 && missile.splash === 24));
  assert.ok(missiles.every(missile => missile.guidanceActive && missile.targetId === 700));
  assert.ok(!game.playerBullets.some(bullet => bullet.color === '#a78bfa'));
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
    if (victory) {
      // Normal-mode victories surface the clear-bonus dialog first; confirming reveals the summary.
      assert.equal(game.dom['clear-overlay'].classList.contains('hidden'), false);
      game.dom['clear-confirm'].onclick();
    }
    assert.match(game.dom['run-summary'].innerHTML, /summary-ore/, 'settlement highlights ore with shared styling');
    assert.equal(game.dom['end-overlay'].classList.contains('hidden'), false);
  }
});

test('multiple enemy bullets hitting in one frame only damage the player once', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.invincible = 0;
  game.enemyBullets = [5, 10].map(damage => ({
    x: game.player.x,
    y: game.player.y,
    vx: 0,
    vy: 0,
    radius: 5,
    life: 60,
    damage,
  }));
  const hp = game.player.hp;

  assert.doesNotThrow(() => game.updateEnemyBullets());
  assert.equal(game.player.hp, hp - 10);
  assert.equal(game.enemyBullets.length, 0);
});

test('small enemies deal five damage while elite and boss attacks deal ten', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  const shooter = { x: 240, y: 120, age: 0, phase: 0, pressure: 1, color: '#fff' };

  game.enemyShoot({ ...shooter, type: 'scout' });
  assert.ok(game.enemyBullets.length > 0);
  assert.ok(game.enemyBullets.every(bullet => bullet.damage === 5));

  game.enemyBullets = [];
  game.enemyShoot({ ...shooter, type: 'elite' });
  assert.ok(game.enemyBullets.length > 0);
  assert.ok(game.enemyBullets.every(bullet => bullet.damage === 10));

  game.enemyBullets = [];
  game.bossAttack({ ...shooter, type: 'boss', bossId: 'manta' });
  assert.ok(game.enemyBullets.length > 0);
  assert.ok(game.enemyBullets.every(bullet => bullet.damage === 10));
});

test('HUD clamps invalid negative HP instead of crashing the frame loop', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.player.hp = -1;
  assert.doesNotThrow(() => game.updateHud());
  assert.equal(game.dom.hp.textContent, `0 / ${game.player.maxHp}`);
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

test('late-stage lateral enemies keep their drift centerline in reach and stay visible for most of each cycle', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.stageIndex = 4;
  game.spawnEnemy('scout', -72, 120, 1, 1, 0);
  const enemy = game.enemies[0];
  enemy.speed = 0;
  enemy.cooldown = 999;

  assert.ok(enemy.originX >= enemy.radius);
  let centerOutsideFrames = 0;
  let fullyOffscreenFrames = 0;
  for (let frame = 0; frame < 126; frame += 1) {
    game.updateEnemies();
    if (enemy.x < 0 || enemy.x > WORLD.width) centerOutsideFrames += 1;
    if (enemy.x + enemy.radius < 0 || enemy.x - enemy.radius > WORLD.width) fullyOffscreenFrames += 1;
  }
  assert.ok(centerOutsideFrames > 0, 'drift may still briefly cross outside the arena');
  assert.ok(fullyOffscreenFrames < 63, 'enemy must remain targetable for more than half of its drift cycle');
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

test('XP follows the scrolling map and drifts off the bottom when not collected', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.x = 240;
  game.player.y = 100;
  game.dropXp(40, 60, 5);
  const orb = game.xpOrbs[0];
  const origin = { x: orb.x, y: orb.y };
  const scrollSpeed = game.worldScrollSpeed();

  for (let i = 0; i < 60; i += 1) game.updateXpOrbs();

  assert.equal(orb.x, origin.x);
  assert.ok(Math.abs(orb.y - origin.y - scrollSpeed * 60) < 1e-9);

  orb.y = game.h - 110;
  game.updateXpOrbs();
  assert.equal(Boolean(orb.attracting), false, 'orbs no longer auto-attract near the bottom — missed pickups are lost');
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

test('pause mode shows the complete primary, secondary, and passive loadout', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  game.player.build.secondaries = { homing: 1, gravity: 2, interceptor: 3 };
  game.player.build.passives = { magnet: 1, armor: 2, critical: 3, salvage: 1, support: 2, bombcap: 3 };

  game.togglePause();

  assert.equal(game.mode, 'paused');
  assert.equal(game.dom['pause-overlay'].classList.contains('hidden'), false);
  assert.match(game.dom['pause-primary'].textContent, /FALCON.*MAX/);
  assert.match(game.dom['pause-secondary'].textContent, /追蹤導彈.*微型重力井.*攔截蜂群/);
  assert.match(game.dom['pause-passive'].textContent, /磁力核心.*炸彈電容/);

  game.togglePause();
  assert.equal(game.dom['pause-overlay'].classList.contains('hidden'), true);
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
  assert.equal(game.xpOrbs.reduce((total, orb) => total + orb.value, 0), WORLD.maxXp + 200);
  assert.ok(game.xpOrbs.some(orb => orb.value >= 200 && orb.color === '#ff72f1'));
});

test('deficit-only field supplies drop rarely and replace hidden stage refills', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  const enemy = { type: 'scout', x: 100, y: 100 };
  game.player.bombs = game.player.maxBombs;
  game.player.shield = 1;

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
  assert.equal(game.player.hp, game.player.maxHp, 'stage-clear supplies should fly to the player and stop at max HP');
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
  assert.ok(game.effects.some(effect => effect.type === 'prismSatellite'));
  assert.equal(game.enemies[0].hp, 100, 'prism satellites must not duplicate chain lightning with instant multi-target damage');
  game.updateEffects();
  assert.ok(game.playerBullets.some(bullet => bullet.kind === 'prism'));

  game.player.secondaryCooldowns.interceptor = 0;
  game.player.build.secondaries = { interceptor: 1 };
  game.enemyBullets = [{ x: game.player.x, y: game.player.y - 120, vx: 0, vy: 1, radius: 5 }];
  game.updateSecondaries();
  assert.equal(game.enemyBullets.length, 1, 'interception must telegraph before deleting bullets');
  assert.ok(game.effects.some(effect => effect.type === 'interceptorPulse'));
  assert.ok(game.player.secondaryCooldowns.interceptor >= 100);
  for (let frame = 0; frame < 20; frame += 1) game.updateEffects();
  assert.equal(game.enemyBullets.length, 0);
});

test('lancer beam grows visibly thicker with each primary upgrade', () => {
  const { game } = makeGame();
  game.start('lancer');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 1;
  game.firePrimary();
  const firstRankRadius = game.playerBullets.find(bullet => bullet.kind === 'beam').radius;
  game.player.build.primaryLevel = 3;
  game.firePrimary();
  const maxRankRadius = game.playerBullets.find(bullet => bullet.kind === 'beam').radius;

  assert.ok(maxRankRadius - firstRankRadius >= 3.5);
});

test('lancer beam pierces every aligned enemy even at its first rank', () => {
  const { game } = makeGame();
  game.start('lancer');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 1;
  game.firePrimary();
  game.enemies = [180, 300, 420].map((y, index) => ({ id: 300 + index, type: 'scout', x: game.player.x, y, radius: 12, hp: 100, maxHp: 100, alive: true, score: 1, xp: 0, color: '#fff' }));

  game.updatePlayerBullets();

  assert.ok(game.enemies.every(enemy => enemy.hp < 100));
});

test('falcon vulcan spreads its outer shots into a visibly wider cone', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  game.firePrimary();
  const velocities = game.playerBullets.map(bullet => bullet.vx);
  assert.ok(Math.max(...velocities) >= 3.0);
  assert.ok(Math.min(...velocities) <= -3.0);
});

test('field supplies magnetize like XP and a shield blocks one hit', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  const supply = { type: 'supply', x: game.player.x + 35, y: game.player.y, supply: 'shield', life: 520, radius: 16, attracting: false };
  game.effects = [supply];

  game.updateEffects();
  assert.equal(supply.attracting, true);
  assert.ok(supply.x < game.player.x + 35);
  for (let frame = 0; frame < 20 && game.effects.length; frame += 1) game.updateEffects();
  assert.equal(game.player.shield, 1);

  const hp = game.player.hp;
  game.player.invincible = 0;
  game.hitPlayer();
  assert.equal(game.player.hp, hp);
  assert.equal(game.player.shield, 0);
  assert.ok(game.player.invincible >= 100);
});

test('shield supplies can drop at full resources and health or bomb drops are slightly more common', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  const enemy = { type: 'scout', x: 100, y: 100 };
  game.player.bombs = game.player.maxBombs;

  assert.equal(game.maybeDropSupply(enemy, () => 0), true);
  assert.equal(game.effects.at(-1).supply, 'shield');
  game.effects = [];
  game.player.shield = 1;
  game.player.hp -= 1;
  assert.equal(game.maybeDropSupply(enemy, () => .005), true, 'scout supply chance should exceed the former 0.35% rate');
});

test('shield drops are hard-capped at two per stage and reset on sector shift', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.player.hp = game.player.maxHp;
  game.player.bombs = game.player.maxBombs;
  game.player.shield = 0;
  const enemy = { type: 'scout', x: 100, y: 100 };

  assert.equal(game.maybeDropSupply(enemy, () => 0), true);
  assert.equal(game.maybeDropSupply(enemy, () => 0), false, 'a second shield cannot coexist on the field');
  game.effects = game.effects.filter(effect => !(effect.type === 'supply' && effect.supply === 'shield'));
  assert.equal(game.maybeDropSupply(enemy, () => 0), true, 'another shield may drop after the first leaves the field');
  assert.equal(game.maybeDropSupply(enemy, () => 0), false);
  assert.equal(game.player.shieldsDropped, 2);

  // Sector shift (endless boss clear path) resets the per-stage shield budget.
  game.mode = 'playing';
  game.runMode = 'endless';
  const boss = { id: 880, type: 'boss', bossId: 'manta', x: 240, y: 118, radius: 52, hp: 0, maxHp: 100, alive: true, orbiting: true, score: 1000, xp: 65, color: '#fff', escort: false };
  game.enemies = [boss];
  game.killEnemy(boss);
  assert.equal(game.player.shieldsDropped, 0, 'new sector restores shield drop budget');
  game.effects = game.effects.filter(effect => effect.type !== 'supply');
  game.player.hp = game.player.maxHp;
  game.player.bombs = game.player.maxBombs;
  game.player.shield = 0;
  assert.equal(game.maybeDropSupply(enemy, () => .02), true);
});

test('gemini wasp fires two parallel forward main shells', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'wasp', pilotId: 'gemini' });
  game.chooseUpgrade(0);
  game.player.build.primaryLevel = 1;
  game.mode = 'playing';
  game.player.fireCooldown = 0;
  game.playerBullets = [];
  game.firePrimary();
  const shells = game.playerBullets.filter(bullet => bullet.kind === 'cannon');
  assert.equal(shells.length, 2, 'gemini adds one extra main shell');
  assert.ok(shells.every(shell => Math.abs(shell.vx) < 1e-9), 'both shells fire straight forward');
  assert.ok(Math.abs(shells[0].x - shells[1].x) > 8, 'shells are laterally separated');
  const mainDamage = 5.2 + 1 * 1.45;
  assert.ok(shells.every(shell => Math.abs(shell.damage - mainDamage) < 1e-9), 'both shells carry full centre-shell damage');
});

test('new passive modules alter cooldown, area damage, shield window, and XP gain', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.passives = { capacitor: 3, payload: 3, flux: 3, harvester: 3 };
  game.player.build.secondaries = { rail: 1 };

  game.player.xp = 0;
  game.grantXp(10, true);
  assert.equal(game.player.xp, 14);
  game.updateSecondaries();
  assert.ok(game.player.secondaryCooldowns.rail < 142);

  game.enemies = [{ id: 911, type: 'scout', x: 100, y: 100, radius: 12, hp: 1000, maxHp: 1000, alive: true }];
  game.areaDamage(100, 100, 50, 10);
  assert.equal(game.enemies[0].hp, 870);

  game.player.shield = 1;
  game.player.invincible = 0;
  game.hitPlayer();
  assert.equal(game.player.invincible, 110);
  assert.equal(game.player.phaseClearTimer, 120);
  assert.ok(game.player.phaseClearRadius > 125);
});

test('maxed loadouts automatically stack ten-percent attack upgrades and keep a MAX primary token', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'gemini' });
  game.chooseUpgrade(0);
  game.player.build.primaryLevel = 3;
  game.player.build.secondaries = { homing: 3, rail: 3, drone: 3 };
  game.player.build.passives = { magnet: 3, armor: 3, critical: 3, support: 3, overclock: 3, bombcap: 3 };
  game.player.build.fusions = { seekerOrbit: true, langinus: true };
  game.player.hp = game.player.maxHp;
  game.player.bombs = game.player.maxBombs;
  game.player.pendingLevels = 1;
  game.mode = 'playing';
  game.pointer = { active: true, id: 7, x: 120, y: 600 };
  game.keys.add('ArrowLeft');
  game.player.inputLock = 0;
  const enemy = { id: 450, type: 'scout', x: 100, y: 100, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };

  game.showUpgrade();
  assert.equal(game.mode, 'playing');
  assert.equal(game.dom['upgrade-overlay'].classList.contains('hidden'), true);
  assert.equal(game.pointer.active, true);
  assert.equal(game.pointer.id, 7);
  assert.equal(game.keys.has('ArrowLeft'), true);
  assert.equal(game.player.inputLock, 0);
  game.damageEnemy(enemy, 10, false);
  assert.equal(game.player.build.overdrive, 1);
  assert.equal(enemy.hp, 890);
  game.updateHud();
  assert.match(game.dom['primary-build'].innerHTML, />MAX · \+10%</);
});

test('maxed primaries use one fixed craft-specific payload', () => {
  const expected = { falcon: 'burn', lancer: 'shock' };
  for (const [craftId, payload] of Object.entries(expected)) {
    const { game } = makeGame();
    game.start(craftId);
    game.chooseUpgrade(0);
    game.mode = 'playing';
    game.player.build.primaryLevel = 3;
    game.player.fireCooldown = 0;
    game.firePrimary();
    assert.ok(game.playerBullets.length > 0);
    assert.ok(game.playerBullets.every(bullet => bullet.statuses?.length === 1 && bullet.statuses[0] === payload));
  }

  const { game } = makeGame();
  game.start('wasp');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  game.player.fireCooldown = 0;
  game.firePrimary();
  assert.ok(game.playerBullets.every(bullet => bullet.thunderHammer && !bullet.statuses?.length));
});

test('lancer maintains one continuous beam that damages targets every frame', () => {
  const { game } = makeGame();
  game.start('lancer');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  game.player.fireCooldown = 0;
  game.firePrimary();
  game.firePrimary();

  assert.equal(game.playerBullets.filter(bullet => bullet.kind === 'beam').length, 1);
  const beam = game.playerBullets.find(bullet => bullet.kind === 'beam');
  assert.equal(beam.endY, 0);
  const enemy = { id: 91, type: 'scout', x: game.player.x, y: 200, radius: 12, hp: 100, maxHp: 100, alive: true, score: 1, xp: 1, color: '#fff' };
  game.enemies = [enemy];
  game.updatePlayerBullets();
  assert.ok(enemy.hp < 100);
  assert.equal(beam.y, game.player.y - 22);
});

test('wasp thunder hammer explodes when a primary shot destroys an enemy', () => {
  const { game } = makeGame();
  game.start('wasp');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  game.player.fireCooldown = 0;
  game.firePrimary();
  const target = { id: 92, type: 'scout', x: 100, y: 100, radius: 10, hp: .1, maxHp: 10, alive: true, score: 1, xp: 0, color: '#fff' };
  const nearby = { id: 93, type: 'scout', x: 170, y: 100, radius: 10, hp: 100, maxHp: 100, alive: true, score: 1, xp: 0, color: '#fff' };
  const bullet = game.playerBullets.find(item => item.thunderHammer);
  Object.assign(bullet, { x: target.x, y: target.y, vx: 0, vy: 0 });
  game.playerBullets = [bullet];
  game.enemies = [target, nearby];

  game.updatePlayerBullets();

  assert.equal(target.alive, false);
  assert.ok(nearby.hp < 100);
  assert.ok(game.effects.some(effect => effect.type === 'hammer'));
});

test('wasp thunder hammer triggers on every hit with wider radius and halved damage', () => {
  const { game } = makeGame();
  game.start('wasp');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  game.player.fireCooldown = 0;
  game.firePrimary();
  const bullet = game.playerBullets.find(item => item.thunderHammer);
  assert.equal(bullet.hammerRadius, (78 + 5 * 4) * 1.5);
  assert.equal(bullet.hammerDamage, (6 + 5 * 1.6) * .5);

  const tough = { id: 94, type: 'gunship', x: 100, y: 100, radius: 10, hp: 100000, maxHp: 100000, alive: true, score: 1, xp: 0, color: '#fff' };
  const nearby = { id: 95, type: 'scout', x: 170, y: 100, radius: 10, hp: 100, maxHp: 100, alive: true, score: 1, xp: 0, color: '#fff' };
  Object.assign(bullet, { x: tough.x, y: tough.y, vx: 0, vy: 0 });
  game.playerBullets = [bullet];
  game.enemies = [tough, nearby];

  game.updatePlayerBullets();

  assert.equal(tough.alive, true, 'the target survives the hit');
  assert.ok(nearby.hp < 100, 'hammer still splashes neighbours on a non-lethal hit');
  assert.ok(game.effects.some(effect => effect.type === 'hammer'));
});

test('falcon burn deals thirty percent of primary dps without stacking', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  const enemy = { id: 96, type: 'gunship', x: 100, y: 100, radius: 10, hp: 100000, maxHp: 100000, alive: true, score: 1, xp: 0, color: '#fff' };
  const bullet = { statuses: ['burn'], statusPowers: { burn: 5 }, damage: 1 };

  game.applyBulletStatus(bullet, enemy);
  const expected = game.primaryDamagePerSecond() * .3 / 4;
  assert.equal(enemy.burnDamage, expected);

  game.applyBulletStatus(bullet, enemy);
  assert.equal(enemy.burnDamage, expected, 'reapplying burn must not stack the damage');
});

test('bombs destroy ordinary enemies but only damage large targets', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.inputLock = 0;
  const enemy = type => ({ id: game.entityId++, type, x: 100, y: 100, radius: 20, hp: 100, maxHp: 100, alive: true, score: 1, xp: 0, color: '#fff' });
  const scout = enemy('scout');
  const elite = enemy('elite');
  const midboss = { ...enemy('midboss'), orbiting: true };
  const boss = { ...enemy('boss'), bossId: 'manta' };
  game.enemies = [scout, elite, midboss, boss];

  assert.equal(game.useBomb(), true);

  assert.equal(scout.alive, false);
  for (const large of [elite, midboss, boss]) {
    assert.equal(large.alive, true);
    assert.ok(large.hp < large.maxHp);
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

test('test mode starts with selected craft, pilot, build, stage, and immortality flags', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'lancer', pilotId: 'rambo', startStage: 3, secondaries: ['rail', 'gravity'], passives: ['magnet'], playerInvincible: true, enemiesImmortal: true });
  assert.equal(game.runMode, 'test');
  assert.equal(game.stageIndex, 2);
  assert.equal(game.mode, 'stageIntro');
  assert.equal(game.player.pendingLevels, 0);
  assert.equal(game.player.build.primaryLevel, 3);
  assert.deepEqual(game.player.build.secondaries, { rail: 3, gravity: 3 });
  assert.deepEqual(game.player.build.passives, { magnet: 3 });
  assert.equal(game.player.pilot.id, 'rambo');
  assert.equal(game.player.maxHp, 50 + 10, 'max fuel tank 50 plus the rambo bonus');
  assert.equal(game.player.maxBombs, 4);
  assert.deepEqual(game.testFlags, { playerInvincible: true, enemiesImmortal: true, startAtBoss: false, endless: false });
});

test('endless mode shifts sectors seamlessly on boss kills without a stage-clear pause', () => {
  const { game } = makeGame();
  game.start({ runMode: 'endless', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.stageIndex = 4;
  const boss = { id: 800, type: 'boss', bossId: 'raijin', x: 240, y: 118, radius: 52, hp: 0, maxHp: 1000, alive: true, orbiting: true, score: 100, xp: 65, color: '#fff' };
  game.enemies = [boss];

  game.killEnemy(boss);

  assert.equal(game.endlessCycle, 1, 'clearing sector five raises the cycle');
  assert.equal(game.stageIndex, 0, 'the run loops back to sector one');
  assert.notEqual(game.mode, 'stageClear', 'endless must never enter the stage-clear transition');
  assert.equal(game.player.pendingLevels === 0 && game.mode === 'playing' || game.mode === 'levelup', true, 'boss reward upgrade still fires');

  game.mode = 'playing';
  game.stageIndex = 2;
  const midBoss = { id: 801, type: 'boss', bossId: 'seraph', x: 240, y: 118, radius: 52, hp: 0, maxHp: 1000, alive: true, orbiting: true, score: 100, xp: 65, color: '#fff' };
  game.enemies = [midBoss];
  game.killEnemy(midBoss);
  assert.equal(game.stageIndex, 3, 'mid-run sectors advance in order');
  assert.equal(game.endlessCycle, 1);
});

test('endless director spawns waves on a fixed timer and tracks depth as one km per wave', () => {
  const { game } = makeGame();
  game.start({ runMode: 'endless', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.endlessWaveTimer = 0;

  game.updateDirector();
  assert.equal(game.endlessWave, 1, 'first wave spawns when the timer expires');
  assert.equal(game.endlessDepth, 1, 'depth advances one km per wave');
  assert.equal(game.endlessWaveTimer, 300, 'the next wave is scheduled on a fixed five-second timer');
  assert.ok(game.enemies.length > 0, 'the wave actually spawned');

  const alive = game.enemies.filter(enemy => enemy.alive).length;
  game.updateDirector();
  assert.equal(game.endlessWave, 1, 'no spawn while the timer is still counting down');
  game.endlessWaveTimer = 0;
  game.updateDirector();
  assert.equal(game.endlessWave, 2, 'waves keep coming even while earlier enemies are alive');
  assert.ok(game.enemies.filter(enemy => enemy.alive).length >= alive, 'new enemies joined the field');
});

test('endless enemy damage grows two per sector from stage six and caps at thirty', () => {
  const { game } = makeGame();
  game.start({ runMode: 'endless', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.endlessCycle = 0;
  game.stageIndex = 0;
  assert.equal(game.endlessDamage(5), 5, 'sectors 1-5 keep base damage');
  game.stageIndex = 4;
  assert.equal(game.endlessDamage(5), 5, 'sector five still base');
  game.endlessCycle = 1;
  game.stageIndex = 0; // sector 6
  assert.equal(game.endlessDamage(5), 7, 'sector six adds +2');
  assert.equal(game.endlessDamage(10), 12);
  game.stageIndex = 2; // sector 8 = +6
  assert.equal(game.endlessDamage(5), 11);
  game.endlessCycle = 5;
  game.stageIndex = 4; // sector 5*5+4 = 29 → +25
  assert.equal(game.endlessDamage(5), 30, 'small hits cap at thirty');
  assert.equal(game.endlessDamage(10), 30, 'large hits cap at thirty');
  game.endlessCycle = 20;
  game.stageIndex = 0;
  assert.equal(game.endlessDamage(10), 30, 'the cap never rises');

  game.runMode = 'normal';
  game.endlessCycle = 5;
  assert.equal(game.endlessDamage(10), 10, 'normal mode is unaffected');
});

test('endless xp keeps sector-five value into cycle two with a gentler growth curve', () => {
  const sectorFive = xpValueForStage(5, 4);
  const sectorSix = xpValueForStage(5, 5);
  assert.ok(sectorSix >= sectorFive, 'cycle two must not reset the xp value');
  const campaignStep = xpValueForStage(5, 4) - xpValueForStage(5, 3);
  const endlessStep = xpValueForStage(5, 6) - xpValueForStage(5, 5);
  assert.ok(endlessStep < campaignStep, 'the endless curve grows more slowly than the campaign curve');

  const { game } = makeGame();
  game.start({ runMode: 'endless', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.endlessCycle = 1;
  game.stageIndex = 0;
  assert.equal(game.xpStageIndex(), 5, 'cycle two sector one reads as the sixth sector for xp');
});

test('gemini adds primary and secondary projectiles and makes the craft twenty percent larger', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'gemini' });
  game.chooseUpgrade(0);
  game.player.build.primaryLevel = 1;
  game.mode = 'playing';
  game.player.fireCooldown = 0;
  game.playerBullets = [];
  game.firePrimary();
  assert.equal(game.player.scale, 1.2);
  assert.equal(game.playerBullets.length, 3, 'Falcon rank 1 fires two pellets plus Gemini bonus');
  game.player.build.secondaries = { rail: 1 };
  game.player.secondaryCooldowns.rail = 0;
  game.playerBullets = [];
  game.updateSecondaries();
  assert.equal(game.playerBullets.filter(bullet => bullet.kind === 'rail').length, 2);
});

test('gemini lancer fires two thick beams and gemini wasp fires a second main shell', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'lancer', pilotId: 'gemini' });
  game.chooseUpgrade(0);
  game.player.build.primaryLevel = 3;
  game.mode = 'playing';
  game.firePrimary();
  assert.equal(game.playerBullets.filter(bullet => bullet.kind === 'beam').length, 2);
  assert.ok(game.playerBullets.every(bullet => bullet.radius >= 15.4));
  game.start({ runMode: 'normal', craftId: 'wasp', pilotId: 'gemini' });
  game.chooseUpgrade(0);
  game.player.build.primaryLevel = 1;
  game.mode = 'playing';
  game.player.fireCooldown = 0;
  game.playerBullets = [];
  game.firePrimary();
  const shells = game.playerBullets.filter(bullet => bullet.kind === 'cannon');
  assert.equal(shells.length, 2, 'gemini adds one extra main shell instead of side shots');
  assert.ok(shells.every(shell => Math.abs(shell.vx) < 1e-9), 'parallel forward only');
  const mainDamage = 5.2 + 1 * 1.45;
  assert.ok(shells.every(shell => Math.abs(shell.damage - mainDamage) < 1e-9), 'both shells carry full centre-shell damage');
});

test('shadow periodically enters a two-second invulnerable phase', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'shadow' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.invincible = 0;
  game.player.shadowCooldown = 1;
  game.updatePlayer(false);
  assert.equal(game.player.shadowTimer, 120);
  assert.ok(game.player.invincible > 0);
});

test('shadow keeps the extended hit invulnerability without a retaliation attack', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'shadow' });
  game.mode = 'playing';
  game.player.invincible = 0;
  game.player.x = 240;
  game.player.y = 600;
  const near = { id: 801, type: 'scout', x: 280, y: 560, radius: 10, hp: 10000, maxHp: 10000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [near];

  game.hitPlayer(5);

  assert.equal(game.player.invincible, 120);
  assert.equal(near.hp, 10000, 'taking damage no longer triggers a retaliation attack');
  assert.ok(!game.effects.some(effect => effect.type === 'shadowRetaliation'));
});

test('DPS tracks rolling one-second, ten-second, and current-stage values plus peaks', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.runFrames = 60;
  game.stageFrames = 60;
  const enemy = { id: 99, type: 'scout', x: 100, y: 100, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.damageEnemy(enemy, 12, false);
  assert.equal(game.dps.one, 120);
  assert.equal(game.dps.ten, 120);
  assert.equal(game.dps.total, 120);
  assert.equal(game.dpsBest.one, 120);
  game.endRun(false);
  assert.match(game.dom['run-summary'].innerHTML, /BEST 1S DPS/);
  assert.match(game.dom['run-summary'].innerHTML, /BEST STAGE DPS/);
  assert.match(game.dom['run-summary'].innerHTML, /TIME/);
});

test('test enemy immortality records damage but clamps targets to one HP', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial', playerInvincible: true, enemiesImmortal: true });
  game.runFrames = 60;
  const enemy = { id: 100, type: 'scout', x: 100, y: 100, radius: 10, hp: 5, maxHp: 5, alive: true, score: 0, xp: 0, color: '#fff' };
  game.damageEnemy(enemy, 20, false);
  assert.equal(enemy.hp, 1);
  assert.equal(enemy.alive, true);
  assert.ok(game.dps.total > 0);
  const hp = game.player.hp;
  game.hitPlayer();
  assert.equal(game.player.hp, hp);
  const bombTarget = { ...enemy, id: 101, hp: 5 };
  game.enemies = [bombTarget];
  game.mode = 'playing';
  game.player.bombLock = 0;
  game.useBomb();
  assert.equal(bombTarget.hp, 1);
  assert.equal(bombTarget.alive, true);
});

test('gravity wells ignore an invulnerable midboss until it reaches station', () => {
  const { game } = makeGame();
  game.start('falcon');
  const midboss = { id: 101, type: 'midboss', x: 100, y: 100, radius: 34, hp: 100, maxHp: 100, alive: true, orbiting: false };
  game.enemies = [midboss];
  game.effects = [{ type: 'gravity', x: 180, y: 180, radius: 200, timer: 50, damage: 1, pulse: 1 }];
  game.updateEffects();
  assert.deepEqual({ x: midboss.x, y: midboss.y }, { x: 100, y: 100 });
});

test('pause panel identifies the active pilot and returns to the prior combat state', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'shadow' });
  game.chooseUpgrade(0);
  game.mode = 'bossWarning';
  game.togglePause();
  assert.equal(game.mode, 'paused');
  assert.match(game.dom['pause-pilot'].textContent, /陰影/);
  game.togglePause();
  assert.equal(game.mode, 'bossWarning');
});

test('test deployment enforces pilot slot caps and can start directly at the selected boss', () => {
  const { game } = makeGame();
  game.start({
    runMode: 'test', craftId: 'falcon', pilotId: 'joker', startStage: 2, startAtBoss: true,
    secondaries: ['homing', 'drone', 'chain', 'acid', 'rail'],
    passives: ['magnet', 'overclock', 'armor', 'critical', 'salvage', 'support', 'bombcap', 'payload'],
  });
  assert.equal(Object.keys(game.player.build.secondaries).length, 4);
  assert.equal(Object.keys(game.player.build.passives).length, 7);
  assert.equal(game.player.build.secondarySlots, 4);
  assert.equal(game.player.build.passiveSlots, 7);
  assert.equal(game.waveIndex, STAGES[1].waves);
  game.transitionTimer = 0;
  game.transitionDeadline = 0;
  game.update();
  assert.equal(game.mode, 'playing');
  assert.equal(game.enemies.filter(enemy => enemy.type === 'boss').length, 1);
  assert.equal(game.enemies.length, 1, 'boss deployment must not also spawn wave one');
});

test('kungfu deployment keeps up to four martial techniques and marks its dedicated build', () => {
  const { game } = makeGame();
  game.start({
    runMode: 'test', craftId: 'falcon', pilotId: 'kungfu',
    secondaries: ['homing', 'kiai', 'jointStrike', 'pushHands', 'ironBell'],
    passives: ['guidance', 'overclock'],
  });

  assert.equal(game.player.build.secondarySet, 'kungfu');
  assert.deepEqual(game.player.build.secondaries, { kiai: 3, jointStrike: 3, pushHands: 3, ironBell: 3 });
  assert.deepEqual(game.player.build.passives, { overclock: 3 });
  assert.equal(game.player.build.secondarySlots, 4);
});

test('kungfu alone reaches the upper combat lane and basic fist ranks increase collision damage', () => {
  let setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu' });
  setup.game.mode = 'playing';
  setup.game.player.y = setup.game.h * .14;
  setup.game.player.targetY = setup.game.player.y;
  setup.game.keys.add('ArrowUp');
  setup.game.updatePlayer(false);
  assert.equal(setup.game.player.targetY, setup.game.h * .14);

  const target = { id: 505, type: 'scout', x: setup.game.player.x, y: setup.game.player.y, originX: setup.game.player.x, formation: 0, index: 0, speed: 0, cooldown: 999, age: 0, radius: 12, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  setup.game.player.build.primaryLevel = 3;
  setup.game.enemies = [target];
  setup.game.updateEnemies();
  assert.equal(target.hp, 940);

  setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  setup.game.mode = 'playing';
  setup.game.player.y = setup.game.h * .28;
  setup.game.player.targetY = setup.game.player.y;
  setup.game.keys.add('ArrowUp');
  setup.game.updatePlayer(false);
  assert.equal(setup.game.player.targetY, setup.game.h * .28);
});

test('kungfu primary HUD shows total overclock firepower and dodge while dodge upgrades prevent enemy damage', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu' });
  game.player.build.overdrive = 3;
  game.player.build.revision += 1;
  game.updateHud();

  assert.equal(game.player.build.evasion, 20);
  assert.match(game.dom['primary-build'].innerHTML, /基本拳法/);
  assert.match(game.dom['primary-build'].innerHTML, /火力 \+30%/);
  assert.doesNotMatch(game.dom['primary-build'].innerHTML, /\+110%/);
  assert.match(game.dom['primary-build'].innerHTML, /唯快不破/);
  assert.match(game.dom['primary-build'].innerHTML, /20%/);
  assert.match(game.dom['primary-build'].innerHTML, /<b>MAX · \+30%<\/b>/);
  assert.match(game.dom['primary-build'].innerHTML, /<b>20%<\/b>/);

  game.currentChoices = [{ id: 'evasion-boost', category: 'evasion' }];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.chooseUpgrade(0);
  assert.equal(game.player.build.evasion, 22);

  game.player.hp = game.player.maxHp;
  game.player.shield = 1;
  game.player.invincible = 0;
  const originalRandom = Math.random;
  try {
    Math.random = () => .1;
    game.hitPlayer(10);
    assert.equal(game.player.hp, game.player.maxHp);
    assert.equal(game.player.shield, 1);
    assert.ok(game.effects.some(effect => effect.type === 'kungfuDodge'));

    Math.random = () => .99;
    game.player.invincible = 0;
    game.hitPlayer(10);
    assert.equal(game.player.shield, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test('kiai clears bullets while joint strike slows nearby targets and push hands attacks only forward', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu', secondaries: ['kiai', 'jointStrike', 'pushHands'] });
  game.mode = 'playing';
  game.player.x = 240;
  game.player.y = 500;
  game.enemyBullets = [{ x: 10, y: 10, vx: 0, vy: 1, radius: 4, life: 100 }];
  const near = { id: 506, type: 'scout', x: 240, y: 450, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  const forward = { id: 507, type: 'scout', x: 285, y: 410, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  const behind = { id: 508, type: 'scout', x: 240, y: 600, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [near, forward, behind];
  game.player.secondaryCooldowns = { kiai: 0, jointStrike: 0, pushHands: 0 };

  game.updateSecondaries();

  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.kungfuFreezeTimer, 72);
  assert.ok(near.hp < 1000);
  assert.equal(near.kungfuSlowTimer, 90);
  assert.equal(near.kungfuSlowFactor, .6);
  assert.ok(forward.hp < 1000);
  assert.equal(behind.hp, 1000);
  assert.ok(game.effects.some(effect => effect.type === 'kiai'));
  assert.ok(game.effects.some(effect => effect.type === 'jointStrike'));
  assert.ok(game.effects.some(effect => effect.type === 'pushHands'));
});

test('focused payload boosts kungfu area damage by thirty percent and reach by forty percent', () => {
  const measurePush = passives => {
    const { game } = makeGame();
    game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu', secondaries: ['pushHands'], passives });
    game.player.x = 240;
    game.player.y = 500;
    const target = { id: 590, type: 'scout', x: 240, y: 400, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
    game.enemies = [target];
    game.player.secondaryCooldowns.pushHands = 0;
    const originalRandom = Math.random;
    try {
      Math.random = () => .99;
      game.updateSecondaries();
    } finally {
      Math.random = originalRandom;
    }
    const effect = game.effects.find(item => item.type === 'pushHands');
    return { damage: 1000 - target.hp, range: effect.range, width: effect.width };
  };

  const base = measurePush([]);
  const boosted = measurePush(['payload']);
  assert.ok(Math.abs(boosted.damage / base.damage - 1.3) < 1e-9);
  assert.ok(Math.abs(boosted.range / base.range - 1.4) < 1e-9);
  assert.ok(Math.abs(boosted.width / base.width - 1.4) < 1e-9);
});

test('taiji master consumes its techniques, clears its colored push area, and applies iron mountain', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu', secondaries: ['pushHands', 'ironMountain', 'ironBell'] });
  game.player.pendingLevels = 1;
  game.currentChoices = [FUSIONS.taijiMaster];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.chooseUpgrade(0);

  assert.deepEqual(game.player.build.secondaries, { ironBell: 3 });
  assert.deepEqual(game.player.build.fusions, { taijiMaster: true });

  game.player.x = 240;
  game.player.y = 500;
  game.enemyBullets = [
    { x: 240, y: 430, vx: 0, vy: 1, radius: 4, life: 100 },
    { x: 20, y: 430, vx: 0, vy: 1, radius: 4, life: 100 },
  ];
  const target = { id: 601, type: 'scout', x: 240, y: 420, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [target];
  game.player.secondaryCooldowns.taijiMaster = 0;
  game.updateSecondaries();

  assert.equal(game.enemyBullets.length, 1);
  assert.equal(game.enemyBullets[0].x, 20);
  assert.ok(target.hp < 950);
  assert.equal(target.kungfuAttackLock, 90);
  assert.equal(target.ironMountainCooldown, 300);
  assert.ok(game.effects.some(effect => effect.type === 'pushHands' && effect.color === '#facc15'));
  assert.ok(game.effects.some(effect => effect.type === 'ironMountain'));
});

test('six harmony focuses all afterimages on one enemy but spreads and slows against groups', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu', secondaries: ['afterimage', 'jointStrike'] });
  game.player.pendingLevels = 1;
  game.currentChoices = [FUSIONS.sixHarmony];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.chooseUpgrade(0);
  game.player.x = 240;
  game.player.y = 500;

  const makeTarget = (id, x) => ({ id, type: 'scout', x, y: 390, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' });
  const solo = makeTarget(610, 240);
  game.enemies = [solo];
  game.player.secondaryCooldowns.sixHarmony = 0;
  game.updateSecondaries();
  assert.ok(solo.hp < 900);
  assert.equal(solo.kungfuSlowTimer, 90);
  assert.equal(solo.kungfuSlowFactor, .6);
  assert.equal(game.effects.filter(effect => effect.type === 'afterimage').length, 3);

  const group = [makeTarget(611, 180), makeTarget(612, 240), makeTarget(613, 300)];
  game.enemies = group;
  game.effects = [];
  game.player.secondaryCooldowns.sixHarmony = 0;
  game.updateSecondaries();
  assert.ok(group.every(target => target.hp < 1000));
  assert.ok(group.every(target => target.kungfuSlowTimer === 90 && target.kungfuSlowFactor === .6));
  assert.equal(game.effects.filter(effect => effect.type === 'afterimage').length, 3);
});

test('iron bell stacks behind item shields while afterimage and iron mountain deliver martial damage', () => {
  let setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu', secondaries: ['ironBell'] });
  setup.game.mode = 'playing';
  setup.game.player.secondaryCooldowns.ironBell = 0;
  setup.game.updateSecondaries();
  assert.equal(setup.game.player.kungfuShield, 1);
  assert.equal(setup.game.player.kungfuShieldTimer, 240);
  setup.game.player.shield = 1;
  setup.game.player.invincible = 0;
  const originalRandom = Math.random;
  try {
    Math.random = () => .99;
    setup.game.hitPlayer();
    assert.equal(setup.game.player.shield, 0, 'item shield must be consumed first');
    assert.equal(setup.game.player.kungfuShield, 1);
    setup.game.player.invincible = 0;
    setup.game.hitPlayer();
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(setup.game.player.kungfuShield, 0);
  assert.equal(setup.game.player.hp, setup.game.player.maxHp);

  setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu', secondaries: ['afterimage', 'ironMountain'] });
  setup.game.mode = 'playing';
  setup.game.player.x = 240;
  setup.game.player.y = 500;
  const targets = [0, 1, 2, 3].map(index => ({ id: 510 + index, type: 'scout', x: 180 + index * 40, y: 390, originX: 180 + index * 40, formation: 0, index, speed: 0, cooldown: 999, age: 0, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' }));
  setup.game.enemies = targets;
  setup.game.player.secondaryCooldowns.afterimage = 0;
  setup.game.updateSecondaries();
  assert.equal(targets.filter(target => target.hp < 1000).length, 3);
  assert.equal(setup.game.effects.filter(effect => effect.type === 'afterimage').length, 3);

  const collisionTarget = targets[0];
  collisionTarget.x = setup.game.player.x;
  collisionTarget.originX = setup.game.player.x;
  collisionTarget.y = setup.game.player.y;
  collisionTarget.hp = 1000;
  setup.game.enemies = [collisionTarget];
  setup.game.updateEnemies();
  assert.ok(collisionTarget.hp < 930);
  assert.equal(collisionTarget.kungfuAttackLock, 90);
  assert.equal(collisionTarget.ironMountainCooldown, 300);
});

test('test immortality flags can be cancelled from pause and stage DPS freezes outside combat', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial', playerInvincible: true, enemiesImmortal: true });
  game.mode = 'playing';
  game.stageFrames = 60;
  const enemy = { id: 500, type: 'scout', x: 0, y: 0, radius: 8, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.damageEnemy(enemy, 10, false);
  const before = { frames: game.stageFrames, total: game.dps.total };
  game.togglePause();
  game.setTestFlag('playerInvincible', false);
  game.setTestFlag('enemiesImmortal', false);
  for (let i = 0; i < 5; i += 1) game.update();
  assert.deepEqual({ frames: game.stageFrames, total: game.dps.total }, before);
  game.togglePause();
  const hp = game.player.hp;
  game.player.invincible = 0;
  game.hitPlayer();
  assert.equal(game.player.hp, hp - 10);
  game.startStage(1);
  assert.equal(game.stageFrames, 0);
  assert.deepEqual(game.dps, { one: 0, ten: 0, total: 0 });
});

test('acid vulnerability, support protocol, and both fusion payloads alter combat output', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  const target = { id: 501, type: 'scout', x: 240, y: 520, radius: 10, hp: 2000, maxHp: 2000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [target];
  game.player.x = 240;
  game.player.y = 700;
  game.player.build.secondaries = { acid: 3 };
  game.player.secondaryCooldowns.acid = 0;
  game.playerBullets = [];
  game.updateSecondaries();
  assert.equal(game.playerBullets.filter(bullet => bullet.kind === 'acid').length, 0, 'acid no longer fires green pellets');
  const cone = game.effects.find(effect => effect.type === 'acidCone');
  assert.ok(cone, 'acid sprays a one-shot cone effect');
  assert.ok(cone.range > 200 && cone.halfAngle > 0);
  assert.ok(target.hp < 2000, 'enemies inside the cone take damage immediately');
  assert.equal(target.acidTimer, 300);
  assert.equal(target.acidAmp, .4);
  // A target outside the fan is untouched.
  const miss = { id: 502, type: 'scout', x: 40, y: 520, radius: 10, hp: 2000, maxHp: 2000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [miss];
  game.player.secondaryCooldowns.acid = 0;
  game.updateSecondaries();
  assert.equal(miss.hp, 2000, 'enemies outside the fan are not hit');
  assert.equal(miss.acidTimer || 0, 0);

  const hpAfterCone = target.hp;
  target.alive = true;
  game.enemies = [target];
  game.damageEnemy(target, 10, false);
  assert.ok(target.hp < hpAfterCone - 100, 'acid amp still multiplies follow-up hits');

  const originalRandom = Math.random;
  Math.random = () => 0;
  game.player.build.passives = { support: 3 };
  assert.equal(game.rollDamage(10), 30);
  Math.random = originalRandom;

  game.player.build.secondaries = { homing: 3, drone: 3 };
  game.player.build.fusions = { seekerOrbit: true };
  game.player.secondaryCooldowns = { homing: 0, drone: 0 };
  game.playerBullets = [];
  game.enemies = [target];
  game.updateSecondaries();
  assert.ok(game.playerBullets.some(bullet => bullet.kind === 'missile' && bullet.guidanceActive));

  game.player.build.secondaries = { rail: 3, prism: 3 };
  game.player.build.fusions = { lanceOrbit: true };
  game.playerBullets = [];
  game.effects = [];
  game.updateSecondaries();
  assert.equal(game.effects.filter(effect => effect.type === 'lanceOrbit').length, 3);
  assert.equal(game.playerBullets.length, 0);
});

test('cluster stars fires piercing rays toward multiple locked targets', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  game.mode = 'playing';
  game.player.build.secondaries = {};
  game.player.build.fusions = { clusterStars: true };
  game.player.secondaryCooldowns = {};
  const enemyAt = (id, x, y) => ({ id, type: 'scout', x, y, radius: 10, hp: 100, maxHp: 100, alive: true, score: 0, xp: 0, color: '#fff' });
  game.enemies = [enemyAt(601, 100, 100), enemyAt(602, 380, 120), enemyAt(603, 240, 60)];
  game.playerBullets = [];

  game.updateSecondaries();

  const rays = game.effects.filter(effect => effect.type === 'kungfuBeam' && effect.color === '#f0abfc');
  assert.equal(rays.length, 3, 'one instant beam per locked target');
  assert.ok(rays.every(ray => ray.life === 30 && ray.maxLife === 30), 'beams remain visible for 0.5 seconds');
  assert.ok(game.enemies.every(enemy => enemy.hp < 100), 'each locked target receives one-time damage');
  assert.equal(game.effects.filter(effect => effect.type === 'clusterLock').length, 3, 'each target receives a lock-on marker');
  assert.ok(game.effects.some(effect => effect.type === 'clusterFlash'), 'launch produces a muzzle starburst');
});

test('black hole gravity wells apply the acid amplification debuff', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  game.mode = 'playing';
  game.player.build.secondaries = {};
  game.player.build.fusions = { blackHole: true };
  game.player.secondaryCooldowns = {};
  const enemy = { id: 611, type: 'scout', x: 240, y: 200, radius: 10, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [enemy];
  game.effects = [];

  game.updateSecondaries();
  const well = game.effects.find(effect => effect.type === 'gravity' && effect.blackHole);
  assert.ok(well, 'black hole spawns a flagged gravity well');
  assert.ok(well.radius > 52 + 5 * 6, 'pull radius is wider than a max-rank gravity well');

  game.updateEffects();
  assert.ok(enemy.acidTimer > 0, 'trapped enemies receive the acid debuff');
  assert.equal(enemy.acidAmp, .4, 'debuff uses the max-rank acid amplification');
});

test('suicide squad auto-detonates a bomb when the player takes damage', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  game.mode = 'playing';
  game.player.build.fusions = { suicideSquad: true };
  game.player.invincible = 0;
  game.player.shield = 0;
  game.player.bombs = 2;
  const scout = { id: 621, type: 'scout', x: 240, y: 200, radius: 10, hp: 10, maxHp: 10, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [scout];
  game.enemyBullets = [{ x: 0, y: 0, radius: 4 }];

  game.hitPlayer();

  assert.equal(game.player.bombs, 1, 'one bomb is consumed');
  assert.equal(scout.alive, false, 'the auto-bomb clears ordinary enemies');
  assert.equal(game.enemyBullets.length, 0, 'the auto-bomb clears enemy bullets');

  game.player.invincible = 0;
  game.player.bombs = 0;
  game.hitPlayer();
  assert.equal(game.player.bombs, 0, 'no trigger without bomb stock');
});

test('seeker orbit plus keeps satellites firing and grants max guidance with relock', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  game.mode = 'playing';
  game.player.build.secondaries = {};
  game.player.build.passives = {};
  game.player.build.fusions = { seekerOrbitPlus: true };
  game.player.secondaryCooldowns = {};
  const enemy = { id: 631, type: 'scout', x: 240, y: 200, radius: 10, hp: 100, maxHp: 100, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [enemy];
  game.playerBullets = [];

  assert.equal(game.passiveRank('guidance'), 3, 'fused guidance reads as max rank');
  game.updateSecondaries();
  assert.ok(game.playerBullets.some(bullet => bullet.kind === 'missile' && bullet.guidanceActive), 'satellites still launch homing missiles');
});

test('joker, reaper, kungfu, and gambler implement their distinct pilot rules', () => {
  let setup = makeGame();
  const jokerRandom = Math.random;
  try {
    Math.random = () => .5;
    setup.game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'joker' });
  } finally {
    Math.random = jokerRandom;
  }
  assert.equal(setup.game.mode, 'stageIntro', 'joker must auto-pick the opening upgrade');
  assert.equal(setup.game.player.pendingLevels, 0);
  assert.equal(setup.game.player.build.secondarySlots, 4);

  setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'reaper' });
  const reaperTarget = { id: 502, type: 'scout', x: 0, y: 0, radius: 8, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  const reaperRandom = Math.random;
  try {
    Math.random = () => .99;
    setup.game.damageEnemy(reaperTarget, 10, false);
  } finally {
    Math.random = reaperRandom;
  }
  assert.equal(setup.game.player.maxHp, 60 - 20, 'reaper pays two hearts off the falcon 60 HP baseline');
  assert.equal(reaperTarget.hp, 850);

  setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'kungfu', passives: ['armor'] });
  setup.game.mode = 'playing';
  assert.equal(setup.game.player.maxHp, (60 + 15) * 2, 'kungfu doubles the falcon baseline plus armor');
  setup.game.firePrimary();
  setup.game.updateSecondaries();
  assert.equal(setup.game.playerBullets.length, 0);
  setup.game.player.y = 650;
  const kungfuHp = setup.game.player.hp;
  const bodyTarget = { id: 503, type: 'scout', x: setup.game.player.x, y: setup.game.player.y, originX: setup.game.player.x, formation: 0, index: 0, speed: 0, cooldown: 999, age: 0, radius: 12, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  setup.game.enemies = [bodyTarget];
  setup.game.updateEnemies();
  assert.equal(setup.game.player.hp, kungfuHp);
  assert.ok(bodyTarget.hp < 1000);

  setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'gambler' });
  setup.game.mode = 'playing';
  setup.game.player.y = 650;
  setup.game.player.invincible = 0;
  assert.equal(setup.game.player.hitRadius, 2);
  assert.equal(setup.game.player.maxHp, Math.floor(60 / 2), 'gambler halves the falcon 60 HP baseline');
  setup.game.enemyBullets = [{ x: setup.game.player.x + 33, y: setup.game.player.y + 15, vx: 0, vy: 0, radius: 5, life: 30 }];
  setup.game.updateEnemyBullets();
  assert.equal(setup.game.player.grazeBonus, .01);
  setup.game.updateHud();
  assert.match(setup.game.dom['primary-build'].innerHTML, /狂熱/);
  assert.match(setup.game.dom['primary-build'].innerHTML, /\+1%/);
  setup.game.enemyBullets = [{ x: setup.game.player.x, y: setup.game.player.y, vx: 0, vy: 0, radius: 5, life: 30 }];
  setup.game.player.invincible = 0;
  setup.game.updateEnemyBullets();
  assert.equal(setup.game.player.grazeBonus, 0);
});

test('pilot extra primary tokens expose soul taker, battlefield cleanup, and supply chain values', () => {
  let setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'reaper' });
  setup.game.updateHud();
  assert.match(setup.game.dom['primary-build'].innerHTML, /奪魂者/);
  assert.match(setup.game.dom['primary-build'].innerHTML, /1%/);

  setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  setup.game.updateHud();
  assert.match(setup.game.dom['primary-build'].innerHTML, /戰場清理/);
  assert.match(setup.game.dom['primary-build'].innerHTML, /\+0%/);

  setup = makeGame();
  setup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'rambo' });
  setup.game.updateHud();
  assert.match(setup.game.dom['primary-build'].innerHTML, /補給鏈/);
  assert.match(setup.game.dom['primary-build'].innerHTML, /MAX/);
});

test('soul taker executes only primary targets and its overclock caps at five percent', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'reaper' });
  const enemy = () => ({ id: 700, type: 'scout', x: 0, y: 0, radius: 8, hp: 10000, maxHp: 10000, alive: true, score: 0, xp: 0, color: '#fff' });
  const originalRandom = Math.random;
  try {
    Math.random = () => .009;
    const secondaryTarget = enemy();
    game.damageEnemy(secondaryTarget, 1, false);
    assert.equal(secondaryTarget.alive, true);
    const primaryTarget = enemy();
    game.damageEnemy(primaryTarget, 1, false, 'primary');
    assert.equal(primaryTarget.alive, false);
    const boss = { id: 701, type: 'boss', bossId: 'manta', x: 0, y: 118, radius: 52, hp: 10000, maxHp: 10000, alive: true, orbiting: true, score: 0, xp: 0, color: '#fff' };
    game.damageEnemy(boss, 1, false, 'primary');
    assert.equal(boss.alive, true, 'soul taker must never execute a boss');
    assert.ok(boss.hp > 9000, 'the boss only takes regular damage');
    const midboss = { id: 703, type: 'midboss', x: 0, y: 145, radius: 34, hp: 10000, maxHp: 10000, alive: true, orbiting: true, score: 0, xp: 0, color: '#fff' };
    game.damageEnemy(midboss, 1, false, 'primary');
    assert.equal(midboss.alive, true, 'soul taker must never execute a midboss');
    assert.ok(midboss.hp > 9000, 'the midboss only takes regular damage');
  } finally {
    Math.random = originalRandom;
  }

  game.player.build.soulTaker = 4.5;
  game.currentChoices = [{ id: 'soul-taker-boost', category: 'soulTaker' }];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.chooseUpgrade(0);
  assert.equal(game.player.build.soulTaker, 5);

  game.player.build.fusions = { luckyStar: true };
  game.player.build.revision += 1;
  const originalRandom2 = Math.random;
  try {
    Math.random = () => .069;
    const luckyTarget = { id: 702, type: 'scout', x: 0, y: 0, radius: 8, hp: 10000, maxHp: 10000, alive: true, score: 0, xp: 0, color: '#fff' };
    game.damageEnemy(luckyTarget, 1, false, 'primary');
    assert.equal(luckyTarget.alive, true, 'lucky star no longer alters soul taker probability');
  } finally {
    Math.random = originalRandom2;
  }
  game.updateHud();
  assert.match(game.dom['primary-build'].innerHTML, /5%/, 'the HUD soul taker badge stays at its own capped value');
});

test('battlefield cleanup no longer changes XP or repairs and instead raises ore settlement', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  game.player.build.battlefieldCleanup = 50;
  game.grantXp(100, true);
  assert.equal(game.player.xp, 100, 'imperial no longer scales XP');

  game.player.hp = 0;
  game.currentChoices = [{ id: 'repair', category: 'supply' }];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.chooseUpgrade(0);
  assert.equal(game.player.hp, 20, 'upgrade repair keeps its normal amount');

  game.player.hp = 0;
  game.effects = [{ type: 'supply', supply: 'heal', x: game.player.x, y: game.player.y, life: 10, radius: 16 }];
  game.updateEffects();
  assert.equal(game.player.hp, 10, 'field healing keeps its normal amount');

  game.currentChoices = [{ id: 'battlefield-cleanup-boost', category: 'battlefieldCleanup' }];
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.chooseUpgrade(0);
  assert.equal(game.player.build.battlefieldCleanup, 51);

  game.runOre = 1000;
  const settlement = game.oreSettlement(500);
  assert.deepEqual(settlement, { base: 1500, percent: 51, bonus: 765, total: 2265 });
});

test('imperial ore settlement bonus includes the normal-mode clear reward', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.player.build.battlefieldCleanup = 25;
  game.runOre = 500;
  const before = game.meta.ore;

  game.endRun(true);

  assert.equal(game.meta.ore, before + 2500, '500 collected + 1500 clear reward receive the full 25% settlement bonus');
  assert.match(game.dom['clear-body'].innerHTML, /獲得源晶礦　2500/);
  assert.match(game.dom['clear-body'].innerHTML, /戰場清理額外 \+500/);
  assert.match(game.dom['clear-body'].innerHTML, /累積源晶礦/);
});

test('rambo supply chain restores two bombs after bosses and bombs deal fifty percent more to large targets', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'rambo' });
  game.mode = 'playing';
  game.player.bombs = 0;
  const defeatedBoss = { id: 701, type: 'boss', x: 240, y: 100, radius: 52, hp: 0, maxHp: 10000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.killEnemy(defeatedBoss);
  assert.equal(game.player.bombs, 2, 'boss kills restore two bombs instead of a full refill');

  game.mode = 'playing';
  game.player.bombs = game.player.maxBombs - 1;
  const secondBoss = { ...defeatedBoss, id: 703, alive: true };
  game.killEnemy(secondBoss);
  assert.equal(game.player.bombs, game.player.maxBombs, 'restore is capped at the bomb limit');

  game.mode = 'playing';
  game.player.bombs = 1;
  game.player.bombLock = 0;
  game.player.invincible = 0;
  const large = { id: 702, type: 'boss', x: 240, y: 100, radius: 52, hp: 100000, maxHp: 100000, alive: true, score: 0, xp: 0, color: '#fff' };
  game.enemies = [large];
  game.useBomb();
  assert.equal(large.hp, 99220);
});

test('joker has a twenty percent chance to earn one bonus pick without chaining', () => {
  const pendingAfterPick = (random, bonusAlreadyGranted = false) => {
    const { game } = makeGame();
    game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'joker' });
    game.mode = 'playing';
    game.player.pendingLevels = 1;
    game.jokerBonusPick = bonusAlreadyGranted;
    game.currentChoices = [{ id: 'magnet', category: 'passive', icon: 'assets/icons/magnet.webp', name: '磁力核心', description: '' }];
    const originalRandom = Math.random;
    try {
      Math.random = () => random;
      game.chooseUpgrade(0, true);
    } finally {
      Math.random = originalRandom;
    }
    return game.player.pendingLevels;
  };
  assert.equal(pendingAfterPick(.19), 1, 'bonus roll below 20% grants exactly one extra pick');
  assert.equal(pendingAfterPick(.2), 0, 'roll at or above 20% grants nothing');
  assert.equal(pendingAfterPick(.19, true), 0, 'a bonus pick never chains into another bonus');
});

test('joker auto-upgrades without pausing combat or clearing held input', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'joker' });
  game.mode = 'playing';
  game.player.pendingLevels = 1;
  game.player.inputLock = 0;
  game.pointer = { ...game.pointer, active: true, id: 9, x: 180, y: 610 };
  game.keys.add('ArrowLeft');

  game.showUpgrade();

  assert.equal(game.mode, 'playing');
  assert.equal(game.dom['upgrade-overlay'].classList.contains('hidden'), true);
  assert.equal(game.pointer.active, true);
  assert.equal(game.pointer.id, 9);
  assert.equal(game.keys.has('ArrowLeft'), true);
  assert.equal(game.player.inputLock, 0);
});

test('the normal sector-five boss enters a rewardless multi-burst finale before victory', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.startStage(4);
  game.mode = 'playing';
  const boss = { id: 504, type: 'boss', x: 240, y: 150, radius: 60, hp: 0, maxHp: 10000, alive: true, score: 5000, xp: 999, color: '#fff' };
  const bursts = [];
  game.spawnBurst = (...args) => bursts.push(args);
  game.killEnemy(boss);
  assert.equal(game.mode, 'finale');
  assert.equal(game.player.pendingLevels, 0);
  assert.equal(game.xpOrbs.length, 0);
  for (let i = 0; i < 205 && game.mode === 'finale'; i += 1) game.updateFinale();
  assert.equal(game.mode, 'victory');
  assert.ok(bursts.length >= 10);
  assert.ok(bursts.some(args => args[2] === 120), 'finale must end in one large explosion');
});

test('abandoning from pause enters failed-run settlement instead of returning directly to title', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.runOre = 125;
  game.togglePause();
  const abandoned = game.abandonRun();
  assert.equal(abandoned, true);
  assert.equal(game.mode, 'gameover');
  assert.ok(game.player, 'the run remains available for settlement and combat review');
  assert.equal(game.dom['pause-overlay'].classList.contains('hidden'), true);
  assert.equal(game.dom['end-overlay'].classList.contains('hidden'), false);
  assert.equal(game.dom['end-title'].textContent, 'MISSION FAILED');
  assert.match(game.dom['run-summary'].innerHTML, /獲得源晶礦/);
});

// --- Meta progression & ore economy ---------------------------------------

test('the codex records craft, pilot, secondary, passive, and fusion pickups', () => {
  const { game } = makeGame();
  // Codex must start from a clean profile, not the maxed test baseline.
  game.meta = { ore: 0, upgrades: {}, unlocks: [], cleared: false, codex: [] };
  game.start({ runMode: 'test', craftId: 'lancer', pilotId: 'rambo' });
  assert.ok(game.meta.codex.includes('craft:lancer'), 'starting a run records the craft');
  assert.ok(game.meta.codex.includes('pilot:rambo'), 'starting a run records the pilot');

  game.mode = 'levelup';
  game.currentChoices = [{ id: 'homing', category: 'secondary', name: '追蹤飛彈', icon: '', description: '' }];
  game.chooseUpgrade(0);
  assert.ok(game.meta.codex.includes('secondary:homing'), 'secondary picks are recorded');

  game.mode = 'levelup';
  game.currentChoices = [{ id: 'armor', category: 'passive', name: '反應裝甲', icon: '', description: '' }];
  game.chooseUpgrade(0);
  assert.ok(game.meta.codex.includes('passive:armor'), 'passive picks are recorded');

  game.mode = 'levelup';
  game.currentChoices = [{ id: 'blackHole', category: 'fusion', name: '黑洞', icon: '', description: '' }];
  game.chooseUpgrade(0);
  assert.ok(game.meta.codex.includes('fusion:blackHole'), 'fusion picks are recorded');
});

test('max mode never writes to the codex so it cannot fake unlocks', () => {
  const { game } = makeGame();
  game.meta = { ore: 0, upgrades: {}, unlocks: [], cleared: false, codex: [] };
  game.start({ runMode: 'normal', craftId: 'wasp', pilotId: 'gemini', maxMode: true });
  assert.equal(game.meta.codex.length, 0, 'max-mode probing leaves the codex empty');
});

test('fresh meta state halves firepower, sets 25 base hp, and starts with no lives or slot bonuses', async () => {
  const meta = await import('../src/meta.js');
  const fresh = meta.metaFromUpgrades(meta.defaultMetaState().upgrades);
  assert.equal(fresh.attackMultiplier, .5);
  assert.equal(fresh.baseHp, 25);
  assert.equal(fresh.lives, 0);
  assert.equal(fresh.bombs, 2);
  assert.equal(fresh.secondarySlots, 2);
  assert.equal(fresh.passiveSlots, 4);
  assert.ok(Math.abs(fresh.xpMultiplier - .7) < 1e-9);
  assert.equal(fresh.overdriveStep, 1, 'fresh overdrive grants 1% per pick');

  const maxed = meta.metaFromUpgrades(meta.maxedMetaState().upgrades);
  assert.equal(maxed.attackMultiplier, 1);
  assert.equal(maxed.baseHp, 50);
  assert.equal(maxed.lives, 1);
  assert.equal(maxed.bombs, 3);
  assert.equal(maxed.secondarySlots, 4);
  assert.equal(maxed.passiveSlots, 6);
  assert.ok(Math.abs(maxed.xpMultiplier - 1) < 1e-9);
  assert.equal(maxed.overdriveStep, 10, 'maxed overdrive boost reaches 10% per pick');
});

test('normal-mode clears flag the meta state so endless mode can unlock', async () => {
  const meta = await import('../src/meta.js');
  assert.equal(meta.defaultMetaState().cleared, false);
  assert.equal(meta.maxedMetaState().cleared, true);
  assert.equal(meta.normalizeMetaState({ cleared: true }).cleared, true);
  assert.equal(meta.normalizeMetaState({}).cleared, false);

  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.meta.cleared = false;
  game.endRun(true);
  assert.equal(game.meta.cleared, true, 'a normal-mode victory marks the profile as cleared');
  assert.equal(game.dom['clear-overlay'].classList.contains('hidden'), false, 'clear dialog appears above the summary');
  assert.match(game.dom['clear-body'].innerHTML, /無限模式已解鎖/, 'first clear highlights the endless unlock');
});

test('black holes drag enemy bullets inward and erase them at the core', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  game.mode = 'playing';
  game.effects = [{ type: 'gravity', blackHole: true, x: 240, y: 300, radius: 90, timer: 300, damage: .45, pulse: 0 }];
  game.enemies = [];
  const farBullet = { x: 240, y: 380, vx: 0, vy: 0, radius: 4, life: 100, damage: 5 };
  const coreBullet = { x: 244, y: 302, vx: 0, vy: 0, radius: 4, life: 100, damage: 5 };
  game.enemyBullets = [farBullet, coreBullet];

  game.updateEffects();

  assert.equal(game.enemyBullets.length, 1, 'bullets at the core are destroyed');
  assert.ok(game.enemyBullets[0].y < 380, 'surviving bullets are pulled toward the singularity');
});

test('meta purchases spend ore, respect caps, and unlocks are one-time', async () => {
  const meta = await import('../src/meta.js');
  const state = meta.defaultMetaState();
  state.ore = 350;
  assert.equal(meta.purchaseUpgrade(state, 'firepower'), true, 'first firepower rank costs 100');
  assert.equal(state.ore, 250);
  assert.equal(state.upgrades.firepower, 1);
  assert.equal(meta.purchaseUpgrade(state, 'firepower'), true, 'second rank costs 200');
  assert.equal(state.ore, 50);
  assert.equal(meta.purchaseUpgrade(state, 'firepower'), false, 'cannot afford rank three');

  state.ore = 600;
  assert.equal(meta.purchaseUnlock(state, 'rambo'), true);
  assert.equal(state.ore, 100);
  assert.equal(meta.purchaseUnlock(state, 'rambo'), false, 'already owned');
  assert.equal(meta.isPilotUnlocked(state, 'rambo'), true);
  assert.equal(meta.isPilotUnlocked(state, 'gambler'), false);
  assert.equal(meta.isCraftUnlocked(state, 'falcon'), true, 'falcon is free');

  const capped = meta.maxedMetaState();
  capped.ore = 99999;
  assert.equal(meta.purchaseUpgrade(capped, 'firepower'), false, 'maxed rank cannot be bought again');
});

test('ore drops: small enemies use mining base while elite x3, midboss x5, and boss x10 use stacked base', async () => {
  const meta = await import('../src/meta.js');
  assert.equal(meta.oreDropFor('scout', 40, () => .29, 18), 18, 'small enemies use the permanent mining base');
  assert.equal(meta.oreDropFor('scout', 40, () => .31, 18), 0, 'roll over 0.3 drops nothing');
  assert.equal(meta.oreDropFor('elite', 10, () => .99), 30, 'elite pays three times stacked base');
  assert.equal(meta.oreDropFor('midboss', 10, () => .99), 50, 'midboss pays five times base');
  assert.equal(meta.oreDropFor('boss', 12, () => .99), 120, 'boss pays ten times the current base');
});

test('killing enemies drops ore pickups, bosses raise the base by one, and the run banks once on game over', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  const originalRandom = Math.random;
  try {
    Math.random = () => .1;
    const scout = { id: 601, type: 'scout', x: 100, y: 300, radius: 14, hp: 0, maxHp: 10, alive: true, score: 100, xp: 5, color: '#fff' };
    game.enemies = [scout];
    game.killEnemy(scout);
    const ore = game.effects.find(effect => effect.type === 'ore');
    assert.ok(ore, 'small enemies drop an ore pickup on the field');
    assert.equal(ore.value, 20, 'max mining rank raises the small-enemy drop base from 10 to 20');

    game.collectOre(ore.value, ore.x, ore.y);
    assert.equal(game.runOre, 20);

    game.mode = 'playing';
    const boss = { id: 602, type: 'boss', bossId: 'manta', x: 240, y: 118, radius: 52, hp: 0, maxHp: 100, alive: true, orbiting: true, score: 1000, xp: 65, color: '#fff' };
    game.enemies = [boss];
    game.killEnemy(boss);
    // maxed oreGain 10 + base 10 = 20 stacked; boss = 200
    assert.equal(game.runOre, 20 + 200, 'boss ore is collected instantly at ten times stacked base');
    assert.equal(game.oreBossBonus, 1, 'each boss kill raises the drop base by one');
  } finally {
    Math.random = originalRandom;
  }

  const banked = game.bankOre(0);
  assert.equal(banked, 220);
  assert.equal(game.bankOre(0), 0, 'banking is idempotent per run');
});

test('abandoning from pause banks run ore with the imperial settlement bonus', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.battlefieldCleanup = 20;
  game.runOre = 500;
  const before = game.meta.ore;
  game.togglePause();
  game.abandonRun();
  assert.equal(game.meta.ore, before + 600, 'pause abandon applies the 20% ore settlement bonus');
  assert.equal(game.mode, 'gameover');
  assert.equal(game.lastOreSettlement.total, 600);
});

test('endless cycle 2+ never drops below stage-5 aggressiveness', () => {
  const { game } = makeGame();
  game.start({ runMode: 'endless', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.endlessCycle = 0;
  game.stageIndex = 4;
  const stageFive = game.activeStage();
  game.endlessCycle = 1;
  game.stageIndex = 0;
  const cycleTwo = game.activeStage();
  assert.ok(cycleTwo.fireRate >= stageFive.fireRate - 1e-9, 'cycle2 fireRate >= S5');
  assert.ok(cycleTwo.bulletCount >= stageFive.bulletCount - 1e-9, 'cycle2 bulletCount >= S5');
  assert.ok(cycleTwo.enemySpeed >= stageFive.enemySpeed - 1e-9, 'cycle2 enemySpeed >= S5');
});

test('endless HP grows per stage from sector six via endlessStageDepth', () => {
  const { game } = makeGame();
  game.start({ runMode: 'endless', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.endlessCycle = 0;
  game.stageIndex = 0;
  assert.equal(game.endlessStageDepth(), 0, 'first five sectors have zero depth');
  game.stageIndex = 4;
  assert.equal(game.endlessStageDepth(), 0);
  game.endlessCycle = 1;
  game.stageIndex = 0; // sector 6
  assert.equal(game.endlessStageDepth(), 1);
  game.stageIndex = 2; // sector 8
  assert.equal(game.endlessStageDepth(), 3);

  // Spawning with depth=1 should raise HP vs depth=0 baseline on same pressure.
  game.endlessCycle = 0;
  game.stageIndex = 4;
  game.enemies = [];
  game.spawnEnemy('scout', 100, 100, 1, 0, 0);
  const earlyHp = game.enemies[0].maxHp;
  game.enemies = [];
  game.endlessCycle = 1;
  game.stageIndex = 0;
  game.spawnEnemy('scout', 100, 100, 1, 0, 0);
  const laterHp = game.enemies[0].maxHp;
  assert.ok(laterHp > earlyHp, 'sector six scout HP exceeds sector five baseline');
});

test('max mode and test mode runs never bank ore into the meta wallet', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'imperial', maxMode: true });
  game.chooseUpgrade(0);
  game.runOre = 500;
  const before = game.meta.ore;
  game.bankOre(0);
  assert.equal(game.meta.ore, before, 'max mode ore stays out of the wallet');

  const testSetup = makeGame();
  testSetup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  testSetup.game.runOre = 500;
  const beforeTest = testSetup.game.meta.ore;
  testSetup.game.bankOre(0);
  assert.equal(testSetup.game.meta.ore, beforeTest, 'test mode ore is never banked');
});

test('spare lives trigger a frozen three-second replacement-airframe sequence', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.runLives = 1;
  game.player.invincible = 0;
  game.player.hp = 1;
  game.enemyBullets = [{ x: 10, y: 10, vx: 0, vy: 1, radius: 4, life: 100, damage: 5 }];
  const scout = { id: 640, type: 'scout', x: 200, y: 200, originX: 200, formation: 0, index: 0, speed: 0, cooldown: 999, age: 0, radius: 14, hp: 10, maxHp: 10, alive: true, score: 10, xp: 2, color: '#fff' };
  game.enemies = [scout];

  game.hitPlayer(5);

  assert.equal(game.mode, 'respawning');
  assert.equal(game.runLives, 0);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.player.respawnVisible, false);
  assert.equal(game.respawnTransition.timer, 180);
  assert.equal(game.enemies[0].hp, 10, 'replacement sequence does not bomb enemies');

  for (let i = 0; i < 120; i += 1) game.update();
  assert.equal(game.player.respawnVisible, true);
  assert.equal(game.enemyBullets.length, 0, 'enemy bullets clear when the replacement enters');
  for (let i = 0; i < 60; i += 1) game.update();
  assert.equal(game.mode, 'playing');
  assert.equal(game.player.x, game.w / 2);
  assert.equal(game.player.y, game.h - 120);

  game.player.invincible = 0;
  game.player.hp = 1;
  game.hitPlayer(5);
  assert.equal(game.mode, 'gameover', 'no lives left ends the run');
});

test('shadow phase continuously clears bullets in a small radius while invulnerable', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'shadow' });
  game.mode = 'playing';
  game.player.x = 240;
  game.player.y = 500;
  game.player.targetX = 240;
  game.player.targetY = 500;
  game.player.shadowTimer = 60;
  game.enemyBullets = [
    { x: 240, y: 460, vx: 0, vy: 1, radius: 4, life: 100 },
    { x: 240, y: 200, vx: 0, vy: 1, radius: 4, life: 100 },
  ];

  game.updatePlayer(false);

  assert.equal(game.enemyBullets.length, 1, 'bullets inside the shadow radius are erased');
  assert.equal(game.enemyBullets[0].y, 200, 'distant bullets survive');
});

test('closing the upgrade menu grants a short invulnerability window', () => {
  const { game } = makeGame();
  game.start({ runMode: 'normal', craftId: 'falcon', pilotId: 'imperial' });
  game.player.invincible = 0;
  game.player.pendingLevels = 1;
  game.upgradeReturnMode = 'playing';
  game.mode = 'levelup';
  game.currentChoices = [{ id: 'repair', category: 'supply', icon: '✚', name: '緊急維修', description: '' }];
  game.chooseUpgrade(0);
  assert.ok(game.player.invincible >= 45, 'leaving the upgrade list grants grace frames');
});

test('deep endless cycles add midboss escorts and a second boss', () => {
  const { game } = makeGame();
  game.start({ runMode: 'endless', craftId: 'falcon', pilotId: 'imperial' });
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.stageIndex = 0;
  game.waveIndex = STAGES[0].waves;
  game.endlessCycle = 2;
  game.endlessWaveTimer = 0;
  game.enemies = [];
  game.updateDirector();
  assert.equal(game.mode, 'playing', 'endless boss warnings keep combat running');
  assert.ok(game.endlessBossWarningTimer > 0, 'endless warning runs on its own timer');
  game.spawnBoss();
  assert.equal(game.enemies.filter(enemy => enemy.type === 'boss').length, 1);
  assert.equal(game.enemies.filter(enemy => enemy.type === 'midboss').length, 1, 'cycle three bosses arrive with a midboss escort');

  game.endlessCycle = 6;
  game.waveIndex = STAGES[0].waves;
  game.endlessWaveTimer = 0;
  game.enemies = [];
  game.updateDirector();
  assert.equal(game.mode, 'playing', 'deep endless boss warnings also keep combat running');
  assert.ok(game.endlessBossWarningTimer > 0);
  game.spawnBoss();
  const bosses = game.enemies.filter(enemy => enemy.type === 'boss');
  assert.equal(bosses.length, 2, 'cycle seven adds an escort boss');
  assert.equal(bosses.filter(boss => boss.escort).length, 1, 'exactly one is flagged as escort');

  const escort = bosses.find(boss => boss.escort);
  escort.hp = 0;
  escort.arriving = false;
  escort.y = 118;
  const stageBefore = game.stageIndex;
  game.killEnemy(escort);
  assert.equal(game.stageIndex, stageBefore, 'killing the escort never advances the sector');
});

test('test mode can run endless rules for waves, damage scaling, and seamless boss loops', () => {
  const { game } = makeGame();
  game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial', endless: true });
  assert.equal(game.testFlags.endless, true);
  assert.equal(game.isEndless(), true);
  game.mode = 'playing';
  game.endlessCycle = 1;
  game.stageIndex = 0; // sector 6
  assert.equal(game.endlessDamage(5), 7, 'test-endless applies +2 per sector from stage six');

  game.endlessWaveTimer = 0;
  game.updateDirector();
  assert.equal(game.endlessWave, 1, 'the endless director drives waves in test mode');

  game.stageIndex = 4;
  const boss = { id: 720, type: 'boss', bossId: 'raijin', x: 240, y: 118, radius: 52, hp: 0, maxHp: 100, alive: true, orbiting: true, score: 100, xp: 65, color: '#fff' };
  game.enemies = [boss];
  game.killEnemy(boss);
  assert.equal(game.stageIndex, 0, 'test-endless loops sectors seamlessly');
  assert.equal(game.endlessCycle, 2);
});

test('lancer boosts secondary damage by ten percent while wasp gains bombs and a passive slot', () => {
  const lancerSetup = makeGame();
  lancerSetup.game.start({ runMode: 'test', craftId: 'lancer', pilotId: 'imperial' });
  lancerSetup.game.mode = 'playing';
  const lancerTarget = { id: 801, type: 'scout', x: 0, y: 100, radius: 8, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  lancerSetup.game.damageEnemy(lancerTarget, 10, false, 'secondary');
  assert.equal(1000 - lancerTarget.hp, 110, 'lancer secondary damage is boosted ten percent');

  const lancerPrimaryTarget = { id: 802, type: 'scout', x: 0, y: 100, radius: 8, hp: 1000, maxHp: 1000, alive: true, score: 0, xp: 0, color: '#fff' };
  lancerSetup.game.damageEnemy(lancerPrimaryTarget, 10, false, 'primary');
  assert.equal(1000 - lancerPrimaryTarget.hp, 100, 'primary fire is not boosted');

  const waspSetup = makeGame();
  waspSetup.game.start({ runMode: 'test', craftId: 'wasp', pilotId: 'imperial' });
  assert.equal(waspSetup.game.player.maxBombs, 4, 'wasp carries one extra bomb');
  assert.equal(waspSetup.game.player.build.passiveSlots, 7, 'wasp adds one passive slot to the maxed six');

  const falconSetup = makeGame();
  falconSetup.game.start({ runMode: 'test', craftId: 'falcon', pilotId: 'imperial' });
  assert.equal(falconSetup.game.player.maxHp, 60, 'falcon flies with 50 base plus its 10 armor bonus');
});
