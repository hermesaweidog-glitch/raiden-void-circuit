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
  assert.equal(game.player.build.secondarySlots, 3);
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
    const enemy = { type, hp: 100, maxHp: 100, alive: true, x: 240, y: 120, radius: 50, hitFlash: 0 };
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

test('upgrade cards and combat build strip render skill icons with numeric ranks', () => {
  const { game } = makeGame();
  game.start('falcon');

  assert.ok(game.dom['upgrade-options'].children.every(card => card.innerHTML.includes('upgrade-icon')));
  game.player.build.secondaries = { homing: 2 };
  game.player.build.passives = { armor: 3 };
  game.player.build.revision += 1;
  game.updateHud();

  assert.match(game.dom['primary-build'].innerHTML, /skill-token.+✹.+>1</);
  assert.match(game.dom['secondary-build'].innerHTML, /skill-token.+➤.+>2</);
  assert.match(game.dom['passive-build'].innerHTML, /skill-token.+⬡.+>3</);
  assert.doesNotMatch(game.dom['secondary-build'].innerHTML, />追蹤飛彈</);
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

test('HUD clamps invalid negative HP instead of crashing the frame loop', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.player.hp = -1;
  assert.doesNotThrow(() => game.updateHud());
  assert.equal(game.dom.hp.textContent, '○'.repeat(game.player.maxHp));
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

test('pause mode shows the complete primary, secondary, and passive loadout', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.build.primaryLevel = 3;
  game.player.build.secondaries = { homing: 1, gravity: 2, interceptor: 3 };
  game.player.build.passives = { magnet: 1, armor: 2, critical: 3, salvage: 1, engine: 2, bombcap: 3 };

  game.togglePause();

  assert.equal(game.mode, 'paused');
  assert.equal(game.dom['pause-overlay'].classList.contains('hidden'), false);
  assert.match(game.dom['pause-primary'].textContent, /FALCON.*Lv\.3/);
  assert.match(game.dom['pause-secondary'].textContent, /追蹤飛彈.*微型重力井.*攔截蜂群/);
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

test('bombs destroy ordinary enemies but only damage large targets', () => {
  const { game } = makeGame();
  game.start('falcon');
  game.chooseUpgrade(0);
  game.mode = 'playing';
  game.player.inputLock = 0;
  const enemy = type => ({ id: game.entityId++, type, x: 100, y: 100, radius: 20, hp: 100, maxHp: 100, alive: true, score: 1, xp: 0, color: '#fff' });
  const scout = enemy('scout');
  const elite = enemy('elite');
  const midboss = enemy('midboss');
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
