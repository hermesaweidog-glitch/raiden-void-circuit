import { AIRCRAFT, SECONDARIES, PASSIVES, STAGES, BOSSES, ENEMY_TYPES, WORLD } from './config.js';
import { clamp, distanceSq, makeUpgradeChoices, pickNearestTarget, stagePressure, updateGuidance, xpForLevel } from './systems.js';

const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const choose = items => items[(Math.random() * items.length) | 0];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = WORLD.width;
    this.h = WORLD.height;
    this.dom = Object.fromEntries([
      'score', 'stage', 'level', 'hp', 'bombs', 'xp-bar', 'title-overlay', 'upgrade-overlay',
      'upgrade-options', 'end-overlay', 'end-kicker', 'end-title', 'run-summary', 'announcement',
      'bomb-count', 'primary-build', 'secondary-build', 'passive-build', 'mute-button', 'pause-button',
    ].map(id => [id, document.getElementById(id)]));
    this.mode = 'title';
    this.frame = 0;
    this.score = 0;
    this.best = Number(localStorage.getItem('void-circuit-best') || 0);
    this.stageIndex = 0;
    this.waveIndex = -1;
    this.waveCooldown = 0;
    this.transitionTimer = 0;
    this.entityId = 1;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.xpOrbs = [];
    this.particles = [];
    this.effects = [];
    this.floaters = [];
    this.keys = new Set();
    this.pointer = { active: false, id: null, x: 0, y: 0, startX: 0, startY: 0, playerX: 0, playerY: 0 };
    this.touchSeen = matchMedia('(pointer: coarse)').matches;
    this.muted = localStorage.getItem('void-circuit-muted') === '1';
    this.audio = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.announcementToken = 0;
    this.stars = Array.from({ length: 90 }, (_, i) => ({ x: (i * 71 + 19) % this.w, y: (i * 113 + 7) % this.h, speed: .45 + (i % 5) * .23, size: i % 7 === 0 ? 2 : 1 }));
    this.bindInput();
    document.addEventListener('visibilitychange', () => {
      this.accumulator = 0;
      this.lastTime = performance.now();
      this.pointer.active = false;
      if (document.hidden && this.mode === 'playing') {
        this.mode = 'paused';
        this.dom['pause-button'].textContent = 'RESUME';
      }
    });
    this.updateHud();
    requestAnimationFrame(time => this.loop(time));
  }

  bindInput() {
    window.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      this.initAudio();
      if (this.mode === 'levelup' && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
        this.chooseUpgrade(Number(event.code.slice(-1)) - 1);
        return;
      }
      if (['KeyX', 'KeyB', 'ShiftLeft', 'ShiftRight'].includes(event.code)) this.useBomb();
      if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
      if (event.code === 'KeyM') this.toggleMute();
      if (event.code === 'Space' && this.mode === 'gameover') this.showTitle();
    }, { passive: false });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    const point = event => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * this.w / rect.width, y: (event.clientY - rect.top) * this.h / rect.height };
    };
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.player || !['playing', 'stageIntro', 'bossWarning'].includes(this.mode)) return;
      event.preventDefault();
      this.initAudio();
      if (event.pointerType !== 'mouse') this.touchSeen = true;
      const p = point(event);
      this.pointer = { active: true, id: event.pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, playerX: this.player.x, playerY: this.player.y };
      this.canvas.setPointerCapture?.(event.pointerId);
    }, { passive: false });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.pointer.active || event.pointerId !== this.pointer.id || !this.player) return;
      event.preventDefault();
      const p = point(event);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      const scale = this.touchSeen ? 1.15 : 1;
      this.player.targetX = clamp(this.pointer.playerX + (p.x - this.pointer.startX) * scale, 24, this.w - 24);
      this.player.targetY = clamp(this.pointer.playerY + (p.y - this.pointer.startY) * scale, this.h * .28, this.h - 35);
    }, { passive: false });
    const release = event => {
      if (!event || event.pointerId === this.pointer.id) this.pointer.active = false;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => { this.keys.clear(); this.pointer.active = false; if (this.mode === 'playing') this.togglePause(); });
  }

  start(craftId = 'falcon') {
    const craft = AIRCRAFT[craftId] || AIRCRAFT.falcon;
    this.frame = 0;
    this.score = 0;
    this.stageIndex = 0;
    this.waveIndex = -1;
    this.entityId = 1;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.xpOrbs = [];
    this.particles = [];
    this.effects = [];
    this.floaters = [];
    this.player = {
      x: this.w / 2, y: this.h - 92, targetX: this.w / 2, targetY: this.h - 92,
      radius: 15, hitRadius: 5, craftId, craft, hp: craft.hp, maxHp: craft.hp,
      bombs: 2, maxBombs: 3, invincible: 150, fireCooldown: 0, secondaryCooldowns: {}, inputLock: 0,
      level: 1, xp: 0, xpNeed: xpForLevel(1), pendingLevels: 0,
      build: { primaryLevel: 1, secondaries: {}, passives: {}, secondarySlots: 2, passiveSlots: 4 },
      bombLock: 0,
    };
    this.dom['title-overlay'].classList.add('hidden');
    this.dom['end-overlay'].classList.add('hidden');
    document.getElementById('bomb-button').classList.remove('hidden');
    this.initAudio();
    this.startStage(0);
  }

  showTitle() {
    this.mode = 'title';
    this.dom['end-overlay'].classList.add('hidden');
    this.dom['upgrade-overlay'].classList.add('hidden');
    this.dom['title-overlay'].classList.remove('hidden');
    document.getElementById('bomb-button').classList.add('hidden');
    this.player = null;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.updateHud();
  }

  startStage(index) {
    this.stageIndex = clamp(index, 0, STAGES.length - 1);
    this.waveIndex = -1;
    this.waveCooldown = 0;
    this.mode = 'stageIntro';
    this.transitionTimer = 155;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.effects = [];
    this.player.invincible = Math.max(this.player.invincible, 120);
    const stage = STAGES[this.stageIndex];
    this.announce(`STAGE ${stage.id} — ${stage.name}`, stage.subtitle, 1900);
    this.updateHud();
  }

  loop(time) {
    if (!this.lastTime) this.lastTime = time;
    this.accumulator += Math.min(50, time - this.lastTime);
    this.lastTime = time;
    while (this.accumulator >= 1000 / 60) {
      this.update();
      this.accumulator -= 1000 / 60;
    }
    this.render();
    requestAnimationFrame(next => this.loop(next));
  }

  update() {
    this.frame += 1;
    this.updateParticles();
    if (!this.player || ['title', 'paused', 'levelup', 'gameover', 'victory'].includes(this.mode)) return;
    if (this.mode === 'stageIntro') {
      this.updatePlayer(true);
      if (--this.transitionTimer <= 0) { this.mode = 'playing'; this.spawnNextWave(); }
      return;
    }
    if (this.mode === 'bossWarning') {
      this.updatePlayer(true);
      this.updatePlayerBullets();
      if (--this.transitionTimer <= 0) { this.mode = 'playing'; this.spawnBoss(); }
      return;
    }
    if (this.mode === 'stageClear') {
      this.updatePlayer(true);
      this.updateXpOrbs();
      if (--this.transitionTimer <= 0) {
        if (this.stageIndex >= STAGES.length - 1) this.endRun(true);
        else this.startStage(this.stageIndex + 1);
      }
      return;
    }
    this.updatePlayer(false);
    this.updateSecondaries();
    this.updatePlayerBullets();
    this.updateEnemies();
    this.updateEnemyBullets();
    this.updateXpOrbs();
    this.updateEffects();
    this.updateDirector();
    this.updateHud();
  }

  updateDirector() {
    if (this.mode !== 'playing' || this.enemies.some(enemy => enemy.alive)) return;
    if (this.waveCooldown > 0) { this.waveCooldown -= 1; return; }
    const stage = STAGES[this.stageIndex];
    if (this.waveIndex + 1 < stage.waves) this.spawnNextWave();
    else {
      this.mode = 'bossWarning';
      this.transitionTimer = 175;
      this.enemyBullets = [];
      this.announce('WARNING', `${BOSSES[stage.boss].name} APPROACHING`, 2400);
      this.sound('warning');
    }
  }

  spawnNextWave() {
    this.waveIndex += 1;
    const stage = STAGES[this.stageIndex];
    const pressure = stagePressure(stage, this.waveIndex);
    const isEliteWave = this.waveIndex === stage.waves - 1;
    const count = 4 + this.stageIndex + Math.floor(this.waveIndex * .7);
    const formation = this.waveIndex % 4;
    for (let i = 0; i < count; i += 1) {
      let type = 'scout';
      if (this.stageIndex >= 1 && (i + this.waveIndex) % 4 === 0) type = 'striker';
      if (this.stageIndex >= 2 && (i + this.waveIndex) % 5 === 0) type = 'gunship';
      const xBase = formation === 0 ? 70 + (i % 6) * 68 : formation === 1 ? this.w / 2 + (i - count / 2) * 45 : rand(45, this.w - 45);
      this.spawnEnemy(type, xBase, -45 - Math.floor(i / 6) * 55 - i * 8, pressure, formation, i);
    }
    if (isEliteWave) this.spawnEnemy('elite', this.w / 2, -125, pressure, 3, count + 1);
    this.waveCooldown = 115 + Math.max(0, 40 - this.stageIndex * 8);
    this.announce(`WAVE ${this.waveIndex + 1}/${stage.waves}`, isEliteWave ? 'ELITE SIGNATURE DETECTED' : 'HOSTILES INBOUND', 850);
  }

  spawnEnemy(type, x, y, pressure, formation, index) {
    if (this.enemies.filter(enemy => enemy.alive).length >= WORLD.maxEnemies) return false;
    const base = ENEMY_TYPES[type];
    const stage = STAGES[this.stageIndex];
    this.enemies.push({
      id: this.entityId++, type, x, y, originX: x, radius: base.radius, alive: true,
      hp: base.hp * stage.enemyHp * pressure, maxHp: base.hp * stage.enemyHp * pressure,
      speed: base.speed * stage.enemySpeed * (type === 'elite' ? .8 : 1), score: base.score,
      xp: base.xp, color: base.color, cooldown: rand(45, 120), age: 0, formation, index,
      pressure, stageId: stage.id,
    });
    return true;
  }

  spawnBoss() {
    const stage = STAGES[this.stageIndex];
    const data = BOSSES[stage.boss];
    const hp = data.baseHp * stage.bossHp;
    this.enemies.push({
      id: this.entityId++, type: 'boss', bossId: data.id, name: data.name, x: this.w / 2, y: -85,
      radius: 52, alive: true, hp, maxHp: hp, color: data.color, cooldown: 95,
      age: 0, phase: 0, score: 10000 * stage.id, xp: 65 + stage.id * 15, pressure: 1,
    });
    this.announce(data.name, data.title, 1700);
    this.sound('boss');
  }

  updatePlayer(transitionOnly) {
    const player = this.player;
    const passive = id => player.build.passives[id] || 0;
    const speed = player.craft.speed * (1 + passive('engine') * .06);
    let dx = 0; let dy = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
    if (dx || dy) {
      const length = Math.hypot(dx, dy) || 1;
      player.targetX = clamp(player.x + dx / length * speed, 22, this.w - 22);
      player.targetY = clamp(player.y + dy / length * speed, this.h * .28, this.h - 30);
    }
    player.x += (player.targetX - player.x) * (this.pointer.active ? .32 : .7);
    player.y += (player.targetY - player.y) * (this.pointer.active ? .32 : .7);
    player.invincible = Math.max(0, player.invincible - 1);
    player.fireCooldown = Math.max(0, player.fireCooldown - 1);
    player.bombLock = Math.max(0, player.bombLock - 1);
    player.inputLock = Math.max(0, player.inputLock - 1);
    if (transitionOnly) return;
    if (player.inputLock > 0) return;
    const shouldFire = this.touchSeen || this.keys.has('Space') || (this.pointer.active && !this.touchSeen);
    if (shouldFire) this.firePrimary();
  }

  addPlayerBullet(bullet) {
    if (this.playerBullets.length >= WORLD.maxPlayerBullets) return false;
    this.playerBullets.push(bullet);
    return true;
  }

  addEffect(effect) {
    if (this.effects.length >= WORLD.maxEffects) return false;
    this.effects.push(effect);
    return true;
  }

  firePrimary() {
    const p = this.player;
    if (p.fireCooldown > 0 || this.mode !== 'playing') return;
    const level = p.build.primaryLevel;
    const overclock = p.build.passives.overclock || 0;
    const rate = 1 + overclock * .075;
    const add = (vx, vy, options = {}) => this.addPlayerBullet({
      id: this.entityId++, x: p.x + (options.ox || 0), y: p.y - 22 + (options.oy || 0), vx, vy,
      radius: options.radius || 4, damage: options.damage || 1, life: options.life || 110,
      color: options.color || p.craft.color, kind: options.kind || 'bolt', pierce: options.pierce || 0,
      splash: options.splash || 0, targetId: options.targetId, guidanceActive: options.guidanceActive,
      turn: options.turn || .055, reacquired: false,
    });
    if (p.craft.primary === 'vulcan') {
      p.fireCooldown = Math.max(4, Math.round((11 - level) / rate));
      const count = 1 + Math.floor(level / 2) * 2;
      for (let i = 0; i < count; i += 1) {
        const offset = i - (count - 1) / 2;
        add(offset * .72, -10.8 + Math.abs(offset) * .22, { damage: .9 + level * .13, radius: 3.2, ox: offset * 5, color: '#ff4267' });
      }
    } else if (p.craft.primary === 'laser') {
      p.fireCooldown = Math.max(5, Math.round((14 - level * 1.2) / rate));
      add(0, -13.6, { damage: 2.1 + level * .48, radius: 3 + level * .5, pierce: 1 + Math.floor(level / 2), kind: 'laser', color: '#7df5ff' });
      if (level >= 4) { add(-.3, -12.7, { damage: 1.1, radius: 2.5, ox: -10, pierce: 1, color: '#42e8ff' }); add(.3, -12.7, { damage: 1.1, radius: 2.5, ox: 10, pierce: 1, color: '#42e8ff' }); }
    } else {
      p.fireCooldown = Math.max(10, Math.round((23 - level * 1.7) / rate));
      add(0, -8.9, { damage: 4.2 + level * 1.15, radius: 6.2, splash: 34 + level * 5, kind: 'cannon', color: '#ffd166' });
      if (level >= 3) { add(-1.2, -8.3, { damage: 1.8 + level * .3, radius: 4, splash: 22, ox: -13, color: '#fb923c' }); add(1.2, -8.3, { damage: 1.8 + level * .3, radius: 4, splash: 22, ox: 13, color: '#fb923c' }); }
    }
    this.sound('shoot');
  }

  updateSecondaries() {
    const p = this.player;
    for (const [id, level] of Object.entries(p.build.secondaries)) {
      p.secondaryCooldowns[id] = (p.secondaryCooldowns[id] || 0) - 1;
      if (p.secondaryCooldowns[id] > 0) continue;
      if (id === 'homing') {
        const target = pickNearestTarget(p, this.enemies);
        if (target) {
          const count = 1 + Math.floor((level - 1) / 2);
          for (let i = 0; i < count; i += 1) this.addPlayerBullet({
            id: this.entityId++, x: p.x + (i - (count - 1) / 2) * 18, y: p.y,
            vx: (i - (count - 1) / 2) * .7, vy: -6.2, radius: 5, damage: 3 + level * 1.15,
            life: 190, color: '#ffb703', kind: 'missile', pierce: 0, splash: 14 + level * 2,
            targetId: target.id, guidanceActive: true, turn: .035 + level * .009 + (p.build.passives.guidance || 0) * .005,
            reacquired: false,
          });
        }
        p.secondaryCooldowns[id] = Math.max(30, 88 - level * 9);
      } else if (id === 'drone') {
        const count = Math.min(3, 1 + Math.floor(level / 2));
        for (let i = 0; i < count; i += 1) {
          const angle = this.frame * .035 + i / count * TAU;
          this.addPlayerBullet({ id: this.entityId++, x: p.x + Math.cos(angle) * 34, y: p.y + Math.sin(angle) * 20, vx: Math.sin(angle) * .5, vy: -9, radius: 3.2, damage: 1.5 + level * .55, life: 120, color: '#a78bfa', kind: 'drone', pierce: 0, splash: 0 });
        }
        p.secondaryCooldowns[id] = Math.max(18, 48 - level * 5);
      } else if (id === 'chain') {
        const targets = [...this.enemies].filter(e => e.alive).sort((a, b) => distanceSq(p, a) - distanceSq(p, b)).slice(0, Math.min(4, 1 + level));
        if (targets.length) {
          let previous = { x: p.x, y: p.y };
          const points = [{ ...previous }];
          for (const target of targets) { this.damageEnemy(target, 2.4 + level * 1.15, false); points.push({ x: target.x, y: target.y }); previous = target; }
          this.addEffect({ type: 'arc', points, life: 12, maxLife: 12 });
        }
        p.secondaryCooldowns[id] = Math.max(45, 115 - level * 10);
      } else if (id === 'mines') {
        this.addEffect({ type: 'mine', x: p.x, y: p.y + 22, radius: 10, trigger: 42 + level * 5, timer: 180, damage: 6 + level * 3.2 });
        p.secondaryCooldowns[id] = Math.max(70, 150 - level * 10);
      } else if (id === 'rail') {
        this.addPlayerBullet({ id: this.entityId++, x: p.x, y: p.y - 20, vx: 0, vy: -15, radius: 5, damage: 7 + level * 2.4, life: 75, color: '#fff', kind: 'rail', pierce: 6 + level, splash: 0 });
        p.secondaryCooldowns[id] = Math.max(70, 155 - level * 13);
      } else if (id === 'bombard') {
        const target = pickNearestTarget(p, this.enemies);
        if (target) this.addEffect({ type: 'bombard', x: target.x, y: target.y, timer: 45, maxTimer: 45, radius: 35 + level * 5, damage: 7 + level * 3.2 });
        p.secondaryCooldowns[id] = Math.max(65, 145 - level * 11);
      }
    }
  }

  updatePlayerBullets() {
    for (let i = this.playerBullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.playerBullets[i];
      if (bullet.kind === 'missile' && bullet.guidanceActive) {
        let guided = updateGuidance(bullet, this.enemies, bullet);
        if (!guided.guidanceActive && !bullet.reacquired && (this.player.build.passives.guidance || 0) >= 5) {
          const next = pickNearestTarget(bullet, this.enemies);
          if (next) guided = { ...guided, targetId: next.id, guidanceActive: true, reacquired: true };
        }
        Object.assign(bullet, guided);
      }
      bullet.x += bullet.vx; bullet.y += bullet.vy; bullet.life -= 1;
      let removed = false;
      for (const enemy of this.enemies) {
        if (!enemy.alive || bullet.hitIds?.has(enemy.id)) continue;
        const rr = bullet.radius + enemy.radius;
        if (distanceSq(bullet, enemy) > rr * rr) continue;
        bullet.hitIds ||= new Set(); bullet.hitIds.add(enemy.id);
        this.damageEnemy(enemy, this.rollDamage(bullet.damage), true);
        if (bullet.splash) this.areaDamage(bullet.x, bullet.y, bullet.splash, bullet.damage * .45, enemy.id);
        if (bullet.pierce > 0) bullet.pierce -= 1;
        else { this.playerBullets.splice(i, 1); removed = true; }
        break;
      }
      if (!removed && (bullet.life <= 0 || bullet.y < -45 || bullet.x < -55 || bullet.x > this.w + 55)) this.playerBullets.splice(i, 1);
    }
  }

  rollDamage(base) {
    const level = this.player.build.passives.critical || 0;
    return Math.random() < level * .055 ? base * (1.65 + level * .07) : base;
  }

  updateEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (!enemy.alive) { this.enemies.splice(i, 1); continue; }
      enemy.age += 1;
      if (enemy.type === 'boss') this.updateBoss(enemy);
      else {
        if (enemy.formation === 0) enemy.x = enemy.originX + Math.sin(enemy.age / 32 + enemy.index) * 25;
        else if (enemy.formation === 1) enemy.x = enemy.originX + Math.sin(enemy.age / 18 + enemy.index * .7) * 42;
        else if (enemy.formation === 2) enemy.x += Math.sin(enemy.age / 15 + enemy.index) * 1.25;
        else enemy.x = this.w / 2 + Math.sin(enemy.age / 45 + enemy.index) * (110 + enemy.index % 3 * 20);
        enemy.y += enemy.speed;
        enemy.cooldown -= 1;
        if (enemy.y > 30 && enemy.cooldown <= 0) { this.enemyShoot(enemy); enemy.cooldown = this.enemyCooldown(enemy); }
        if (enemy.y > this.h + 55) { enemy.alive = false; this.enemies.splice(i, 1); continue; }
      }
      const rr = enemy.radius + this.player.hitRadius;
      if (this.player.invincible <= 0 && distanceSq(enemy, this.player) < rr * rr) this.hitPlayer();
    }
  }

  enemyCooldown(enemy) {
    const stage = STAGES[this.stageIndex];
    const base = enemy.type === 'elite' ? 70 : enemy.type === 'gunship' ? 92 : 115;
    return Math.max(28, base / stage.fireRate / enemy.pressure + rand(-12, 16));
  }

  addEnemyBullet(x, y, vx, vy, radius = 5, color = '#ff6b6b', life = 360) {
    if (this.enemyBullets.length >= WORLD.maxEnemyBullets) return false;
    this.enemyBullets.push({ x, y, vx, vy, radius, color, life });
    return true;
  }

  aim(enemy, speed, angleOffset = 0) {
    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x) + angleOffset;
    this.addEnemyBullet(enemy.x, enemy.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 4.5, enemy.color);
  }

  enemyShoot(enemy) {
    const stage = STAGES[this.stageIndex];
    const speed = (1.65 + this.stageIndex * .12) * stage.bulletSpeed;
    const countBonus = Math.floor((stage.bulletCount - .9) * 2.2);
    if (enemy.type === 'scout') this.aim(enemy, speed);
    else if (enemy.type === 'striker') for (let n = -1; n <= 1 + countBonus; n += 1) this.aim(enemy, speed * .92, n * .13 - countBonus * .065);
    else if (enemy.type === 'gunship') {
      const count = 6 + countBonus * 2;
      for (let n = 0; n < count; n += 1) { const a = n / count * TAU + this.frame * .015; this.addEnemyBullet(enemy.x, enemy.y, Math.cos(a) * speed * .78, Math.sin(a) * speed * .78, 5, enemy.color); }
    } else if (enemy.type === 'elite') {
      for (let n = -2 - countBonus; n <= 2 + countBonus; n += 1) this.aim(enemy, speed, n * .14);
    }
    this.sound('enemy');
  }

  updateBoss(boss) {
    if (boss.y < 118) boss.y += 1.35;
    else {
      boss.x = this.w / 2 + Math.sin(boss.age / (50 - this.stageIndex * 3)) * (105 + this.stageIndex * 8);
      boss.y = 118 + Math.sin(boss.age / 37) * 22;
    }
    const ratio = boss.hp / boss.maxHp;
    const phase = ratio > .67 ? 0 : ratio > .34 ? 1 : 2;
    if (phase !== boss.phase) {
      boss.phase = phase;
      boss.cooldown = 45;
      this.enemyBullets = [];
      this.announce(`PHASE ${phase + 1}`, BOSSES[boss.bossId].phases[phase].toUpperCase(), 950);
      this.spawnBurst(boss.x, boss.y, 35, boss.color);
    }
    boss.cooldown -= 1;
    if (boss.y >= 105 && boss.cooldown <= 0) {
      this.bossAttack(boss);
      boss.cooldown = Math.max(24, (90 - phase * 14 - this.stageIndex * 5) / STAGES[this.stageIndex].fireRate);
    }
  }

  bossAttack(boss) {
    const s = STAGES[this.stageIndex];
    const speed = (1.75 + boss.phase * .22) * s.bulletSpeed;
    const radial = (count, bulletSpeed, offset = 0, skip = () => false) => {
      for (let n = 0; n < count; n += 1) { if (skip(n)) continue; const a = n / count * TAU + offset; this.addEnemyBullet(boss.x, boss.y, Math.cos(a) * bulletSpeed, Math.sin(a) * bulletSpeed, 5, boss.color); }
    };
    if (boss.bossId === 'manta') {
      if (boss.phase === 0) for (let n = -3; n <= 3; n += 1) this.aim(boss, speed, n * .13);
      else if (boss.phase === 1) radial(10, speed * .88, boss.age * .025);
      else { for (let x = 25; x < this.w; x += 42) if (Math.abs(x - this.player.x) > 45) this.addEnemyBullet(x, boss.y + 12, 0, speed * 1.28, 5.5, '#ff3158'); }
    } else if (boss.bossId === 'carrier') {
      if (boss.phase === 0) { this.aim({ ...boss, x: boss.x - 38 }, speed); this.aim({ ...boss, x: boss.x + 38 }, speed); }
      else if (boss.phase === 1) radial(12, speed * .58, boss.age * .01);
      else { for (let i = 0; i < 2; i += 1) this.spawnEnemy('striker', boss.x + (i ? 55 : -55), boss.y + 20, 1.25, 2, i); for (let n = -3; n <= 3; n += 1) this.aim(boss, speed, n * .16); }
    } else if (boss.bossId === 'seraph') {
      if (boss.phase === 0) { for (const x of [boss.x - 42, boss.x + 42]) for (let n = -1; n <= 1; n += 1) this.aim({ ...boss, x }, speed, n * .14); }
      else if (boss.phase === 1) radial(16, speed * .78, boss.age * .055);
      else { this.aim(boss, speed * 1.75); this.aim(boss, speed * 1.25, -.09); this.aim(boss, speed * 1.25, .09); }
    } else if (boss.bossId === 'leviathan') {
      if (boss.phase === 0) radial(14, speed * .7, Math.sin(boss.age / 30));
      else if (boss.phase === 1) { for (let n = 0; n < 5; n += 1) this.aim(boss, speed * rand(.72, 1.12), rand(-.45, .45)); }
      else radial(22, speed, boss.age * .02, n => n % 11 === 5 || n % 11 === 6);
    } else {
      if (boss.phase === 0) { for (const x of [28, this.w - 28]) for (let n = 0; n < 4; n += 1) this.addEnemyBullet(x, 100 + n * 40, x < this.w / 2 ? speed : -speed, speed * .45, 5, '#c084fc'); }
      else if (boss.phase === 1) radial(20, speed * .82, boss.age * .075);
      else { radial(28, speed * 1.05, boss.age * .028, n => n >= 12 && n <= 15); this.aim(boss, speed * 1.7); }
    }
    this.sound('enemy');
  }

  updateEnemyBullets() {
    for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.enemyBullets[i];
      bullet.x += bullet.vx; bullet.y += bullet.vy; bullet.life -= 1;
      const rr = bullet.radius + this.player.hitRadius;
      if (this.player.invincible <= 0 && distanceSq(bullet, this.player) < rr * rr) { this.enemyBullets.splice(i, 1); this.hitPlayer(); continue; }
      if (bullet.life <= 0 || bullet.x < -35 || bullet.x > this.w + 35 || bullet.y < -50 || bullet.y > this.h + 45) this.enemyBullets.splice(i, 1);
    }
  }

  damageEnemy(enemy, damage, particles = true) {
    if (!enemy.alive) return;
    enemy.hp -= damage;
    if (particles) this.spawnBurst(enemy.x, enemy.y, 2, enemy.color);
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  areaDamage(x, y, radius, damage, ignoredId = null) {
    const r2 = radius * radius;
    for (const enemy of this.enemies) if (enemy.alive && enemy.id !== ignoredId && distanceSq({ x, y }, enemy) <= r2) this.damageEnemy(enemy, damage, false);
    this.addEffect({ type: 'ring', x, y, radius: 3, maxRadius: radius, life: 14, maxLife: 14, color: '#ffd166' });
  }

  killEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.score += enemy.score;
    this.spawnBurst(enemy.x, enemy.y, enemy.type === 'boss' ? 90 : enemy.type === 'elite' ? 32 : 12, enemy.color);
    this.sound(enemy.type === 'boss' ? 'bossDown' : 'boom');
    if (enemy.type === 'boss') {
      this.grantXp(enemy.xp, true);
      this.completeStage();
    } else {
      this.dropXp(enemy.x, enemy.y, enemy.xp);
      if (enemy.type === 'elite') {
        const salvage = this.player.build.passives.salvage || 0;
        if (Math.random() < .08 + salvage * .055) this.addEffect({ type: 'supply', x: enemy.x, y: enemy.y, supply: Math.random() < .6 ? 'heal' : 'bomb', life: 420, radius: 11 });
      }
    }
  }

  dropXp(x, y, value) {
    if (this.xpOrbs.length >= WORLD.maxXp) {
      const orb = choose(this.xpOrbs); orb.value += value; orb.radius = Math.min(9, orb.radius + .3); return;
    }
    this.xpOrbs.push({ x, y, vx: rand(-1.4, 1.4), vy: rand(-1.5, .3), value, radius: 4 + Math.min(4, value / 10), life: 1200 });
  }

  updateXpOrbs() {
    if (!this.player) return;
    const magnet = this.player.build.passives.magnet || 0;
    const range = 42 + magnet * 30;
    for (let i = this.xpOrbs.length - 1; i >= 0; i -= 1) {
      const orb = this.xpOrbs[i];
      const d2 = distanceSq(orb, this.player);
      if (d2 < range * range || this.mode === 'stageClear') {
        const angle = Math.atan2(this.player.y - orb.y, this.player.x - orb.x);
        const acceleration = .28 + magnet * .08;
        orb.vx += Math.cos(angle) * acceleration; orb.vy += Math.sin(angle) * acceleration;
        const speed = Math.hypot(orb.vx, orb.vy);
        if (speed > 9 + magnet) { orb.vx *= (9 + magnet) / speed; orb.vy *= (9 + magnet) / speed; }
      } else { orb.vx *= .98; orb.vy += .015; }
      orb.x += orb.vx; orb.y += orb.vy; orb.life -= 1;
      if (d2 < (orb.radius + this.player.hitRadius + 8) ** 2) { this.grantXp(orb.value); this.xpOrbs.splice(i, 1); this.sound('xp'); }
      else if (orb.life <= 0) this.xpOrbs.splice(i, 1);
    }
  }

  grantXp(amount, defer = false) {
    if (!this.player) return;
    this.player.xp += amount;
    while (this.player.level < WORLD.maxLevel && this.player.xp >= this.player.xpNeed) {
      this.player.xp -= this.player.xpNeed;
      this.player.level += 1;
      this.player.pendingLevels += 1;
      this.player.xpNeed = xpForLevel(this.player.level);
    }
    if (this.player.level >= WORLD.maxLevel) this.player.xp = Math.min(this.player.xp, this.player.xpNeed);
    this.updateHud();
    if (!defer && this.player.pendingLevels > 0 && this.mode === 'playing') this.showUpgrade();
  }

  showUpgrade() {
    if (this.player.pendingLevels <= 0) return;
    this.mode = 'levelup';
    this.pointer.active = false;
    this.keys.clear();
    this.currentChoices = makeUpgradeChoices(this.player.build);
    const holder = this.dom['upgrade-options']; holder.textContent = '';
    this.currentChoices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'upgrade-card';
      const current = choice.category === 'secondary' ? this.player.build.secondaries[choice.id] || 0 : choice.category === 'passive' ? this.player.build.passives[choice.id] || 0 : choice.id === 'primary' ? this.player.build.primaryLevel : 0;
      button.innerHTML = `<span class="key">${index + 1}</span><small>${choice.category.toUpperCase()} · LV ${current} → ${current + 1}</small><strong>${choice.name}</strong><p>${choice.description}</p>`;
      button.addEventListener('click', () => this.chooseUpgrade(index));
      holder.append(button);
    });
    this.dom['upgrade-overlay'].classList.remove('hidden');
    this.sound('level');
  }

  chooseUpgrade(index) {
    if (this.mode !== 'levelup' || !this.currentChoices?.[index]) return;
    const choice = this.currentChoices[index];
    const p = this.player;
    if (choice.id === 'primary') p.build.primaryLevel = Math.min(5, p.build.primaryLevel + 1);
    else if (choice.category === 'secondary') p.build.secondaries[choice.id] = Math.min(SECONDARIES[choice.id].max, (p.build.secondaries[choice.id] || 0) + 1);
    else if (choice.category === 'passive') {
      p.build.passives[choice.id] = Math.min(PASSIVES[choice.id].max, (p.build.passives[choice.id] || 0) + 1);
      if (choice.id === 'armor') { p.maxHp = p.craft.hp + Math.ceil(p.build.passives.armor / 2); p.hp = Math.min(p.maxHp, p.hp + 1); }
      if (choice.id === 'bombcap' && p.build.passives.bombcap % 2 === 0) { p.maxBombs = Math.min(5, p.maxBombs + 1); p.bombs = Math.min(p.maxBombs, p.bombs + 1); }
    } else if (choice.id === 'repair') p.hp = Math.min(p.maxHp, p.hp + 2);
    else if (choice.id === 'bomb') p.bombs = Math.min(p.maxBombs, p.bombs + 1);
    else this.score += 2500;
    p.pendingLevels -= 1;
    p.inputLock = 18;
    this.pointer.active = false;
    this.keys.clear();
    this.dom['upgrade-overlay'].classList.add('hidden');
    this.mode = 'playing';
    this.updateHud();
    if (p.pendingLevels > 0) setTimeout(() => this.showUpgrade(), 100);
  }

  updateEffects() {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      if (effect.type === 'mine') {
        effect.timer -= 1; effect.y += .35;
        const target = this.enemies.find(enemy => enemy.alive && distanceSq(effect, enemy) < effect.trigger ** 2);
        if (target || effect.timer <= 0) { this.areaDamage(effect.x, effect.y, effect.trigger, effect.damage); this.spawnBurst(effect.x, effect.y, 22, '#fb7185'); this.effects.splice(i, 1); }
      } else if (effect.type === 'bombard') {
        effect.timer -= 1;
        if (effect.timer <= 0) { this.areaDamage(effect.x, effect.y, effect.radius, effect.damage); this.spawnBurst(effect.x, effect.y, 30, '#fb923c'); this.effects.splice(i, 1); }
      } else if (effect.type === 'supply') {
        effect.y += .65; effect.life -= 1;
        if (distanceSq(effect, this.player) < 30 ** 2) { if (effect.supply === 'heal') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); else this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 1); this.effects.splice(i, 1); this.sound('level'); }
        else if (effect.life <= 0 || effect.y > this.h + 30) this.effects.splice(i, 1);
      } else { effect.life -= 1; if (effect.life <= 0) this.effects.splice(i, 1); }
    }
  }

  useBomb() {
    if (!this.player || this.mode !== 'playing' || this.player.bombs <= 0 || this.player.bombLock > 0 || this.player.inputLock > 0) return false;
    this.player.bombs -= 1; this.player.bombLock = 65; this.player.invincible = Math.max(this.player.invincible, 150);
    this.enemyBullets = [];
    const level = this.player.build.passives.bombcap || 0;
    for (const enemy of [...this.enemies]) {
      const damage = enemy.type === 'boss' ? Math.min(enemy.maxHp * .04, 42 + level * 8) : 9999;
      this.damageEnemy(enemy, damage, false);
    }
    this.addEffect({ type: 'ring', x: this.player.x, y: this.player.y, radius: 10, maxRadius: 500, life: 42, maxLife: 42, color: '#ffd166' });
    this.spawnBurst(this.player.x, this.player.y, 90, '#ffd166');
    navigator.vibrate?.(45);
    this.sound('bomb'); this.updateHud(); return true;
  }

  hitPlayer() {
    if (!this.player || this.player.invincible > 0) return;
    this.player.hp -= 1;
    const armor = this.player.build.passives.armor || 0;
    this.player.invincible = 95 + armor * 15;
    this.enemyBullets = this.enemyBullets.filter(b => distanceSq(b, this.player) > 90 ** 2);
    this.spawnBurst(this.player.x, this.player.y, 40, '#ff3158');
    this.sound('hit'); navigator.vibrate?.([25, 30, 25]);
    if (this.player.hp <= 0) this.endRun(false);
    this.updateHud();
  }

  completeStage() {
    this.mode = 'stageClear'; this.transitionTimer = 220; this.enemyBullets = []; this.playerBullets = [];
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
    this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 1);
    this.announce('STAGE CLEAR', `SECTOR ${this.stageIndex + 1} SECURED`, 2300);
  }

  endRun(victory) {
    this.mode = victory ? 'victory' : 'gameover';
    if (this.score > this.best) { this.best = this.score; localStorage.setItem('void-circuit-best', String(this.best)); }
    this.dom['end-kicker'].textContent = victory ? 'VOID CIRCUIT COLLAPSED' : 'RUN TERMINATED';
    this.dom['end-title'].textContent = victory ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.dom['end-title'].style.color = victory ? '#4cff9b' : '#ff3158';
    this.dom['run-summary'].innerHTML = `SCORE　${String(this.score).padStart(7, '0')}<br>STAGE　${this.stageIndex + 1}/5<br>LEVEL　${this.player.level}<br>PRIMARY　LV ${this.player.build.primaryLevel}<br>SECONDARY　${Object.keys(this.player.build.secondaries).length}/2　PASSIVE　${Object.keys(this.player.build.passives).length}/4`;
    this.dom['end-overlay'].classList.remove('hidden');
    this.sound(victory ? 'victory' : 'gameover');
  }

  togglePause() {
    if (this.mode === 'playing') { this.mode = 'paused'; this.dom['pause-button'].textContent = 'RESUME'; this.announce('PAUSED', '按 P / ESC 或 RESUME 繼續', 900); }
    else if (this.mode === 'paused') { this.mode = 'playing'; this.dom['pause-button'].textContent = 'PAUSE'; }
  }

  toggleMute() {
    this.muted = !this.muted; localStorage.setItem('void-circuit-muted', this.muted ? '1' : '0'); this.dom['mute-button'].textContent = this.muted ? 'MUTED' : 'SOUND';
  }

  initAudio() {
    if (!this.audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.audio = new AC(); }
    this.audio?.resume?.();
  }

  sound(type) {
    if (this.muted || !this.audio) return;
    const presets = { shoot:[720,.025,'square',.025], enemy:[220,.04,'triangle',.018], xp:[1040,.025,'sine',.025], boom:[95,.14,'sawtooth',.055], hit:[70,.28,'sawtooth',.09], level:[660,.2,'sine',.07], bomb:[45,.65,'sawtooth',.12], boss:[120,.5,'square',.08], bossDown:[55,.8,'sawtooth',.14], warning:[180,.28,'square',.07], victory:[880,.7,'sine',.08], gameover:[85,.7,'triangle',.08] };
    const [freq, duration, wave, volume] = presets[type] || presets.xp;
    const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain();
    oscillator.type = wave; oscillator.frequency.setValueAtTime(freq, this.audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, freq * (type === 'shoot' ? 1.35 : .45)), this.audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, this.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, this.audio.currentTime + duration);
    oscillator.connect(gain).connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + duration + .02);
  }

  announce(text, sub = '', duration = 1100) {
    const token = ++this.announcementToken;
    this.dom.announcement.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.dom.announcement.classList.remove('hidden');
    setTimeout(() => { if (token === this.announcementToken) this.dom.announcement.classList.add('hidden'); }, duration);
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= .97; p.vy *= .97; p.life -= 1;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) { const f = this.floaters[i]; f.y -= .4; f.life -= 1; if (f.life <= 0) this.floaters.splice(i, 1); }
  }

  spawnBurst(x, y, count, color) {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= WORLD.maxParticles) this.particles.shift();
      const angle = Math.random() * TAU; const speed = rand(.8, 5.5);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(14, 42), maxLife: 42, color: Array.isArray(color) ? choose(color) : color, size: rand(1.2, 3.8) });
    }
  }

  updateHud() {
    const p = this.player;
    this.dom.score.textContent = String(this.score).padStart(7, '0');
    this.dom.stage.textContent = p ? `${this.stageIndex + 1}-${Math.max(1, this.waveIndex + 1)}` : '—';
    this.dom.level.textContent = p ? String(p.level).padStart(2, '0') : '—';
    this.dom.hp.textContent = p ? '●'.repeat(p.hp) + '○'.repeat(Math.max(0, p.maxHp - p.hp)) : '—';
    this.dom.bombs.textContent = p ? '◆'.repeat(p.bombs) + '◇'.repeat(Math.max(0, p.maxBombs - p.bombs)) : '—';
    this.dom['bomb-count'].textContent = p?.bombs ?? 0;
    this.dom['xp-bar'].style.width = p ? `${clamp(p.xp / p.xpNeed * 100, 0, 100)}%` : '0%';
    this.dom['primary-build'].textContent = p ? `${p.craft.name} ${p.craft.primary.toUpperCase()} Lv.${p.build.primaryLevel}` : '—';
    this.dom['secondary-build'].textContent = p ? Object.entries(p.build.secondaries).map(([id,l]) => `${SECONDARIES[id].name} ${l}`).join(' · ') || '尚未取得' : '—';
    this.dom['passive-build'].textContent = p ? Object.entries(p.build.passives).map(([id,l]) => `${PASSIVES[id].name} ${l}`).join(' · ') || '尚未取得' : '—';
    this.dom['mute-button'].textContent = this.muted ? 'MUTED' : 'SOUND';
  }

  render() {
    const ctx = this.ctx; const stage = STAGES[this.stageIndex] || STAGES[0];
    const gradient = ctx.createLinearGradient(0, 0, 0, this.h); gradient.addColorStop(0, stage.theme[0]); gradient.addColorStop(1, stage.theme[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.w, this.h);
    this.drawBackground(ctx, stage);
    this.drawXp(ctx); this.drawEffects(ctx); this.drawEnemies(ctx); this.drawBullets(ctx); this.drawPlayer(ctx); this.drawParticles(ctx);
    if (this.mode === 'paused') { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0,0,this.w,this.h); ctx.fillStyle='#ffd166'; ctx.font='900 38px monospace'; ctx.textAlign='center'; ctx.fillText('PAUSED',this.w/2,this.h/2); }
  }

  drawBackground(ctx, stage) {
    const scroll = this.frame * (1.2 + this.stageIndex * .14);
    ctx.save(); ctx.globalAlpha = .24; ctx.strokeStyle = stage.id % 2 ? '#42e8ff' : '#ff8a4c'; ctx.lineWidth = 1;
    for (let y = -80 + scroll % 80; y < this.h + 80; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(this.w,y); ctx.stroke(); }
    for (let x = 0; x <= this.w; x += 60) { ctx.beginPath(); ctx.moveTo(this.w/2 + (x-this.w/2)*.25,0); ctx.lineTo(x,this.h); ctx.stroke(); }
    ctx.restore();
    for (const star of this.stars) { const y = (star.y + scroll * star.speed) % this.h; ctx.fillStyle = `rgba(210,250,255,${.18 + star.speed * .16})`; ctx.fillRect(star.x,y,star.size,star.size); }
  }

  drawPlayer(ctx) {
    if (!this.player) return; const p = this.player;
    if (p.invincible > 0 && Math.floor(this.frame / 4) % 2 === 0) ctx.globalAlpha = .45;
    ctx.save(); ctx.translate(p.x,p.y); ctx.fillStyle='rgba(66,232,255,.16)'; ctx.beginPath(); ctx.ellipse(0,4,30,36,0,0,TAU); ctx.fill();
    ctx.fillStyle=p.craft.color; ctx.beginPath(); ctx.moveTo(0,-27); ctx.lineTo(-13,7); ctx.lineTo(-29,15); ctx.lineTo(-12,20); ctx.lineTo(0,12); ctx.lineTo(12,20); ctx.lineTo(29,15); ctx.lineTo(13,7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#dffcff';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#c9fbff';ctx.fillRect(-4,-17,8,15);ctx.fillStyle=this.frame%6<3?'#ffd166':'#ff5e32';ctx.fillRect(-9,20,5,13);ctx.fillRect(4,20,5,13);ctx.restore();
    ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y,p.hitRadius,0,TAU);ctx.fill();
    if(p.invincible>0){ctx.strokeStyle='rgba(66,232,255,.65)';ctx.beginPath();ctx.arc(p.x,p.y,27+Math.sin(this.frame/8)*3,0,TAU);ctx.stroke();}
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) { if(!e.alive)continue; ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.arc(0,0,e.radius*1.45,0,TAU);ctx.fill();ctx.fillStyle=e.color;ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1.5;
      if(e.type==='boss'){const sides=6+this.stageIndex;ctx.beginPath();for(let n=0;n<sides;n++){const a=n/sides*TAU-Math.PI/2;const r=n%2?e.radius*.72:e.radius;if(n===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#07111d';ctx.fillRect(-28,-10,56,20);ctx.fillStyle='#fff';ctx.fillRect(-18,-5,36,7);}
      else{ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(-e.radius,-12);ctx.lineTo(-5,-5);ctx.lineTo(0,-e.radius);ctx.lineTo(5,-5);ctx.lineTo(e.radius,-12);ctx.closePath();ctx.fill();ctx.stroke();}
      ctx.restore();
      if(e.type==='boss'||e.type==='elite'){
        const width=e.type==='boss'?180:55;
        const barX=e.x-width/2;
        const barY=e.y-e.radius-14;
        ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(barX,barY,width,6);
        ctx.fillStyle=e.color;ctx.fillRect(barX,barY,width*clamp(e.hp/e.maxHp,0,1),6);
        if(e.type==='boss'){
          ctx.fillStyle='rgba(255,255,255,.9)';
          ctx.fillRect(barX+width*.33-1,barY-1,2,8);
          ctx.fillRect(barX+width*.67-1,barY-1,2,8);
        }
      }
    }
  }

  drawBullets(ctx) {
    for(const b of this.playerBullets){ctx.fillStyle=b.color;ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.5,0,TAU);ctx.fill();ctx.globalAlpha=1;if(b.kind==='laser'||b.kind==='rail'){ctx.fillRect(b.x-b.radius/2,b.y-16,b.radius,32);}else{ctx.beginPath();ctx.ellipse(b.x,b.y,b.radius,b.radius*(b.kind==='missile'?1.8:1.4),0,0,TAU);ctx.fill();}}
    for(const b of this.enemyBullets){ctx.fillStyle=b.color;ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.2,0,TAU);ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(b.x-1.5,b.y-1.5,b.radius*.28,0,TAU);ctx.fill();ctx.globalAlpha=1;}
  }

  drawXp(ctx) { for(const o of this.xpOrbs){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(this.frame*.025);ctx.fillStyle='rgba(76,255,155,.18)';ctx.fillRect(-o.radius*1.8,-o.radius*1.8,o.radius*3.6,o.radius*3.6);ctx.fillStyle='#4cff9b';ctx.fillRect(-o.radius,-o.radius,o.radius*2,o.radius*2);ctx.fillStyle='#fff';ctx.fillRect(-1,-o.radius,2,o.radius*2);ctx.restore();} }

  drawEffects(ctx) {
    for(const e of this.effects){if(e.type==='arc'){ctx.strokeStyle='#67e8f9';ctx.lineWidth=3;ctx.globalAlpha=e.life/e.maxLife;ctx.beginPath();e.points.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x+rand(-3,3),p.y+rand(-3,3));});ctx.stroke();ctx.globalAlpha=1;}
      else if(e.type==='mine'){ctx.fillStyle='#fb7185';ctx.beginPath();ctx.arc(e.x,e.y,8+Math.sin(this.frame/5)*2,0,TAU);ctx.fill();ctx.strokeStyle='rgba(251,113,133,.35)';ctx.beginPath();ctx.arc(e.x,e.y,e.trigger,0,TAU);ctx.stroke();}
      else if(e.type==='bombard'){ctx.strokeStyle=`rgba(251,146,60,${.3+Math.sin(this.frame*.3)*.3})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(e.x-e.radius,e.y);ctx.lineTo(e.x+e.radius,e.y);ctx.moveTo(e.x,e.y-e.radius);ctx.lineTo(e.x,e.y+e.radius);ctx.stroke();}
      else if(e.type==='ring'){const t=1-e.life/e.maxLife;e.radius+=(e.maxRadius-e.radius)*.12;ctx.strokeStyle=e.color;ctx.globalAlpha=1-t;ctx.lineWidth=4;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      else if(e.type==='supply'){ctx.fillStyle=e.supply==='heal'?'#ff3158':'#ffd166';ctx.beginPath();ctx.arc(e.x,e.y,11,0,TAU);ctx.fill();ctx.fillStyle='#07111d';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText(e.supply==='heal'?'+':'B',e.x,e.y+4);}
    }
  }

  drawParticles(ctx) { for(const p of this.particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}ctx.globalAlpha=1; }

  debugState() {
    return { mode:this.mode, frame:this.frame, score:this.score, stage:this.stageIndex+1, wave:this.waveIndex+1, enemies:this.enemies.filter(e=>e.alive).length, boss:this.enemies.find(e=>e.type==='boss'&&e.alive)?.bossId||null, enemyBullets:this.enemyBullets.length, playerBullets:this.playerBullets.length, xpOrbs:this.xpOrbs.length, level:this.player?.level||0, hp:this.player?.hp||0, bombs:this.player?.bombs||0, primaryLevel:this.player?.build.primaryLevel||0, secondaries:this.player?{...this.player.build.secondaries}:{}, passives:this.player?{...this.player.build.passives}:{} };
  }
  debugForceBoss(){if(!this.player)return false;this.enemies=[];this.enemyBullets=[];this.waveIndex=STAGES[this.stageIndex].waves-1;this.mode='playing';this.spawnBoss();return true;}
  debugForceStage(stage){if(!this.player)return false;this.startStage(clamp(Number(stage)-1,0,STAGES.length-1));return true;}
}
