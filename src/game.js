import { AIRCRAFT, BUILD_LIMITS, FUSIONS, KUNGFU_SECONDARIES, SECONDARIES, PASSIVES, PILOTS, PRIMARY_ICON, STAT_SCALE, STAGES, BOSSES, ENEMY_TYPES, WORLD } from './config.js';
import { clamp, distanceSq, makeUpgradeChoices, midbossProgress, pickNearestTarget, shouldCullEnemyBullet, splitXpValue, stagePressure, updateGuidance, upgradePower, xpForLevel, xpValueForStage } from './systems.js';
import { loadMetaState, maxedMetaState, metaFromUpgrades, ORE_BASE_VALUE, ORE_CLEAR_BONUS, ORE_STAGE_BONUS, oreDropFor, saveMetaState } from './meta.js';
import { MusicController } from './audio.js';

const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const choose = items => items[(Math.random() * items.length) | 0];
const skillIconMarkup = icon => icon.startsWith('assets/') ? `<img src="${icon}" alt="" draggable="false">` : icon;
const isLargeEnemyType = type => type === 'elite' || type === 'midboss' || type === 'boss';
const enemyDamage = type => isLargeEnemyType(type) ? 10 : 5;
const KUNGFU_FIST_DAMAGE_BONUS = [0, 30, 90, 150];
const BOSS_WARNING_DURATION_MS = 3100;
const BOSS_WARNING_DURATION_FRAMES = Math.ceil(BOSS_WARNING_DURATION_MS / (1000 / 60));
const readStorage = (key, fallback = null) => {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
};
const writeStorage = (key, value) => {
  try { localStorage.setItem(key, value); return true; }
  catch { return false; }
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = WORLD.width;
    this.h = WORLD.height;
    this.dom = Object.fromEntries([
      'score', 'stage', 'level', 'hp', 'bombs', 'xp-bar', 'title-overlay', 'upgrade-overlay',
      'upgrade-options', 'upgrade-kicker', 'upgrade-title', 'end-overlay', 'end-kicker', 'end-title', 'run-summary', 'announcement',
      'bomb-count', 'primary-build', 'secondary-build', 'passive-build', 'mute-button', 'pause-button',
      'route-label', 'route-status', 'route-fill', 'midboss-node', 'boss-node', 'ore', 'lives', 'clear-overlay', 'clear-body', 'clear-confirm',
      'pause-overlay', 'pause-primary', 'pause-secondary', 'pause-passive',
      'pause-pilot', 'pause-fab', 'pause-test-controls', 'pause-player-invincible', 'pause-enemies-immortal', 'dps-1s', 'dps-10s', 'dps-total', 'review-button', 'damage-review', 'review-overlay', 'review-back', 'review-summary',
    ].map(id => [id, document.getElementById(id)]));
    this.mode = 'title';
    this.hudBuildRevision = -1;
    this.frame = 0;
    this.worldScroll = 0;
    this.sceneScroll = 0;
    this.score = 0;
    this.best = Number(readStorage('void-circuit-best', '0'));
    this.meta = loadMetaState();
    this.metaCombat = metaFromUpgrades(this.meta.upgrades);
    this.maxMode = false;
    this.runOre = 0;
    this.oreBossBonus = 0;
    this.oreBanked = false;
    this.lastOreSettlement = null;
    this.damageSources = {};
    this.damageHits = {};
    this.endlessBossWarningTimer = 0;
    this.endlessBossSpawned = false;
    this.runLives = 0;
    this.stageIndex = 0;
    this.waveIndex = -1;
    this.waveCooldown = 0;
    this.routeProgress = 0;
    this.transitionTimer = 0;
    this.transitionDeadline = 0;
    this.entityId = 1;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.xpOrbs = [];
    this.particles = [];
    this.effects = [];
    this.healDropsThisStage = 0;
    this.bossHealOpportunityRestored = false;
    this.floaters = [];
    this.keys = new Set();
    this.pointer = { active: false, id: null, x: 0, y: 0, startX: 0, startY: 0, playerX: 0, playerY: 0 };
    this.touchSeen = matchMedia('(pointer: coarse)').matches;
    this.muted = readStorage('void-circuit-muted') === '1';
    this.audio = null;
    this.music = new MusicController({ muted: this.muted });
    this.music.prepare('menu');
    this.lastSoundFrame = {};
    this.lastTime = 0;
    this.accumulator = 0;
    this.announcementToken = 0;
    this.stars = Array.from({ length: 90 }, (_, i) => ({ x: (i * 71 + 19) % this.w, y: (i * 113 + 7) % this.h, speed: .45 + (i % 5) * .23, size: i % 7 === 0 ? 2 : 1 }));
    this.craftImages = Object.fromEntries(Object.values(AIRCRAFT).map(craft => {
      if (typeof Image === 'undefined') return [craft.id, null];
      const image = new Image();
      image.decoding = 'async';
      image.src = craft.art;
      return [craft.id, image];
    }));
    this.bindInput();
    document.addEventListener('visibilitychange', () => {
      this.accumulator = 0;
      this.lastTime = performance.now();
      this.pointer.active = false;
      if (document.hidden) {
        if (this.mode === 'playing') this.setPaused(true);
        else this.music.pause();
      } else if (this.mode !== 'paused') this.music.resume();
    });
    this.updateHud();
    requestAnimationFrame(time => this.loop(time));
  }

  bindInput() {
    window.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      this.initAudio();
      if (this.mode === 'levelup' && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
        this.chooseUpgrade(Number(event.code.slice(-1)) - 1);
        return;
      }
      if (['KeyX', 'KeyB', 'ShiftLeft', 'ShiftRight'].includes(event.code)) this.useBomb();
      if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
      if (event.code === 'KeyM') this.toggleMute();
      if (event.code === 'Space' && this.mode === 'gameover') this.restart();
    }, { passive: false });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    const unlockAudio = () => this.initAudio();
    window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    window.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
    window.addEventListener('click', unlockAudio, { capture: true, passive: true });
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
      this.player.targetY = clamp(this.pointer.playerY + (p.y - this.pointer.startY) * scale, this.playerMinY(), this.h - 35);
    }, { passive: false });
    const release = event => {
      if (!event || event.pointerId === this.pointer.id) this.pointer.active = false;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => { this.keys.clear(); this.pointer.active = false; if (this.mode === 'playing') this.togglePause(); });
    this.dom['review-button']?.addEventListener('click', () => { this.dom['review-summary'].innerHTML = this.damageReviewMarkup(); this.dom['end-overlay'].classList.add('hidden'); this.dom['review-overlay'].classList.remove('hidden'); });
    this.dom['review-back']?.addEventListener('click', () => { this.dom['review-overlay'].classList.add('hidden'); this.dom['end-overlay'].classList.remove('hidden'); });
  }

  start(craftOrOptions = 'falcon') {
    const options = typeof craftOrOptions === 'string' ? { craftId: craftOrOptions } : (craftOrOptions || {});
    const craft = AIRCRAFT[options.craftId] || AIRCRAFT.falcon;
    const craftId = craft.id;
    const pilot = PILOTS[options.pilotId] || PILOTS.imperial;
    this.runMode = ['normal', 'endless', 'test'].includes(options.runMode) ? options.runMode : 'normal';
    this.maxMode = Boolean(options.maxMode);
    const metaState = this.maxMode ? maxedMetaState() : this.meta;
    this.metaCombat = metaFromUpgrades(metaState.upgrades);
    this.runOre = 0;
    this.oreBossBonus = 0;
    this.oreBanked = false;
    this.lastOreSettlement = null;
    this.damageSources = {};
    this.damageHits = {};
    this.endlessBossWarningTimer = 0;
    this.endlessBossSpawned = false;
    this.runLives = this.metaCombat.lives;
    this.endlessCycle = 0;
    this.endlessWave = 0;
    this.endlessDepth = 0;
    this.endlessWaveTimer = 0;
    this.pendingStageMusic = false;
    this.testFlags = {
      playerInvincible: this.runMode === 'test' && Boolean(options.playerInvincible),
      enemiesImmortal: this.runMode === 'test' && Boolean(options.enemiesImmortal),
      startAtBoss: this.runMode === 'test' && Boolean(options.startAtBoss),
      endless: this.runMode === 'test' && Boolean(options.endless),
    };
    const isTest = this.runMode === 'test';
    const slotBonus = pilot.id === 'joker' ? 1 : 0;
    const secondarySlots = Math.min(BUILD_LIMITS.secondary, this.metaCombat.secondarySlots + slotBonus);
    const passiveSlots = Math.min(BUILD_LIMITS.passive, this.metaCombat.passiveSlots + slotBonus + (craft.passiveSlotBonus || 0));
    const secondaryCatalog = pilot.id === 'kungfu' ? KUNGFU_SECONDARIES : SECONDARIES;
    const selectedSecondaries = isTest ? Object.fromEntries([...new Set(options.secondaries || [])].filter(id => secondaryCatalog[id]).slice(0, secondarySlots).map(id => [id, secondaryCatalog[id].max])) : {};
    const selectedPassives = isTest ? (() => { const seenGroups = new Set(); return Object.fromEntries([...new Set(options.passives || [])].filter(id => { const item = PASSIVES[id]; if (!item || (pilot.id === 'kungfu' && id === 'guidance')) return false; if (item.exclusiveGroup) { if (seenGroups.has(item.exclusiveGroup)) return false; seenGroups.add(item.exclusiveGroup); } return true; }).slice(0, passiveSlots).map(id => [id, PASSIVES[id].max])); })() : {};
    const baseBombCap = Math.min(5, 3 + Math.max(0, (selectedPassives.bombcap || 0) - 1)) + (craft.bombCapBonus || 0);
    const maxHp = this.calculateMaxHp(craft, pilot.id, selectedPassives.armor || 0);
    const bombBonus = pilot.id === 'rambo' ? 1 : 0;
    const maxBombs = baseBombCap + bombBonus;
    this.lastCraftId = craft.id;
    this.frame = 0;
    this.worldScroll = 0;
    this.sceneScroll = 0;
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
    this.kungfuFreezeTimer = 0;
    this.worldFreezeTimer = 0;
    this.worldCooldown = 600;
    this.bossHealOpportunityRestored = false;
    this.respawnTransition = null;
    this.runFrames = 0;
    this.stageFrames = 0;
    this.damageTotal = 0;
    this.stageDamageTotal = 0;
    this.damageLog = [];
    this.dps = { one: 0, ten: 0, total: 0 };
    this.dpsBest = { one: 0, ten: 0, total: 0 };
    this.player = {
      x: this.w / 2, y: this.h - 92, targetX: this.w / 2, targetY: this.h - 92,
      radius: 15 * (pilot.id === 'gemini' ? 1.2 : 1), hitRadius: pilot.id === 'gambler' ? 2 : 5 * (pilot.id === 'gemini' ? 1.2 : 1), scale: pilot.id === 'gemini' ? 1.2 : 1,
      craftId, craft, pilotId: pilot.id, pilot, hp: maxHp, maxHp,
      bombs: isTest ? maxBombs : Math.min(maxBombs, this.metaCombat.bombs + bombBonus + (craft.bombCapBonus || 0)), maxBombs, shield: 0, kungfuShield: 0, kungfuShieldTimer: 0, phaseClearTimer: 0, phaseClearRadius: 0, shieldsDropped: 0, invincible: 150, fireCooldown: 0, secondaryCooldowns: {}, inputLock: 0, respawnVisible: true,
      shadowCooldown: 360, shadowTimer: 0, grazeBonus: 0,
      level: 1, xp: 0, xpNeed: xpForLevel(1), pendingLevels: isTest ? 0 : 1,
      build: { pilotId: pilot.id, primaryLevel: isTest ? WORLD.maxUpgradeRank : 1, secondarySet: pilot.id === 'kungfu' ? 'kungfu' : 'standard', secondaries: selectedSecondaries, passives: selectedPassives, fusions: {}, secondarySlots, passiveSlots, evasion: pilot.id === 'kungfu' ? 20 : 0, soulTaker: pilot.id === 'reaper' ? 1 : 0, battlefieldCleanup: 0, overdrive: 0, overdriveStep: this.metaCombat?.overdriveStep ?? 1, revision: 0 },
      bombLock: 0,
    };
    this.hudBuildRevision = -1;
    this.jokerBonusPick = false;
    // Record craft + pilot in the codex (skip MAX-mode probing so it can't fake unlocks).
    if (!this.maxMode) { this.recordCodex(`craft:${craft.id}`); this.recordCodex(`pilot:${pilot.id}`); }
    this.dom['title-overlay'].classList.add('hidden');
    this.dom['end-overlay'].classList.add('hidden');
    this.dom['pause-overlay'].classList.add('hidden');
    document.getElementById('bomb-button').classList.remove('hidden');
    this.dom['pause-fab'].classList.remove('hidden');
    this.initAudio();
    this.startStage(isTest ? clamp(Number(options.startStage || 1) - 1, 0, STAGES.length - 1) : 0);
    if (isTest && options.startAtBoss) {
      this.waveIndex = STAGES[this.stageIndex].waves;
      this.beginBossWarning();
    }
    if (!isTest) this.showUpgrade();
  }

  calculateMaxHp(craft, pilotId, armorRank = 0) {
    const healthFactor = pilotId === 'kungfu' ? 2 : 1;
    const base = (this.metaCombat?.baseHp ?? 25) + (craft.hpBonus || 0);
    const pilotBase = pilotId === 'gambler' ? Math.max(STAT_SCALE, Math.floor(base / 2)) : base;
    let maxHp = (pilotBase + Math.ceil(upgradePower(armorRank) / 2) * STAT_SCALE / 2) * healthFactor;
    if (pilotId === 'rambo') maxHp += STAT_SCALE;
    if (pilotId === 'reaper') maxHp = Math.max(STAT_SCALE, maxHp - 2 * STAT_SCALE);
    return maxHp;
  }

  secondaryCatalog(player = this.player) {
    return player?.build.secondarySet === 'kungfu' ? KUNGFU_SECONDARIES : SECONDARIES;
  }

  playerMinY(player = this.player) {
    return this.h * (player?.pilotId === 'kungfu' ? .14 : .28);
  }

  oreSettlementMultiplier(player = this.player) {
    return 1 + (player?.build.battlefieldCleanup || 0) / 100;
  }

  oreSettlement(clearBonus = 0, player = this.player) {
    const base = Math.max(0, Math.floor(this.runOre + clearBonus));
    const percent = Math.max(0, player?.build.battlefieldCleanup || 0);
    const total = Math.floor(base * this.oreSettlementMultiplier(player) + 1e-9);
    return { base, percent, bonus: Math.max(0, total - base), total };
  }

  isEndless() {
    return this.runMode === 'endless' || Boolean(this.testFlags?.endless);
  }

  endlessStageDepth() {
    if (!this.isEndless()) return 0;
    // First five stages keep normal values. From stage 6 onward, depth grows
    // once per cleared stage rather than once per five-stage cycle.
    return Math.max(0, this.endlessCycle * STAGES.length + this.stageIndex - (STAGES.length - 1));
  }

  // Combat-facing stage profile. Endless cycle 2+ (stage 6 onwards) never dips
  // below VOID THRONE aggressiveness, and keeps climbing with each cycle.
  // HP growth is handled separately via endlessStageDepth() at spawn time.
  activeStage() {
    const stage = STAGES[this.stageIndex] || STAGES[0];
    if (!this.isEndless() || this.endlessCycle < 1) return stage;
    const floor = STAGES[STAGES.length - 1];
    const cycleBoost = 1 + (this.endlessCycle - 1) * .06;
    return {
      ...stage,
      enemySpeed: Math.max(stage.enemySpeed, floor.enemySpeed) * cycleBoost,
      bulletSpeed: Math.max(stage.bulletSpeed, floor.bulletSpeed) * cycleBoost,
      bulletCount: Math.max(stage.bulletCount, floor.bulletCount) * (1 + (this.endlessCycle - 1) * .04),
      fireRate: Math.max(stage.fireRate, floor.fireRate) * (1 + (this.endlessCycle - 1) * .04),
      enemyHp: Math.max(stage.enemyHp, floor.enemyHp),
      bossHp: Math.max(stage.bossHp, floor.bossHp),
    };
  }

  endlessDamage(base) {
    if (!this.isEndless()) return base;
    const depth = this.endlessStageDepth();
    if (depth <= 0) return base;
    const damage = base + depth * 2;
    // Keep the intended 27 → 30 final step for ordinary enemies.
    return damage >= 29 ? 30 : Math.min(30, damage);
  }

  endlessHpGrowth(type) {
    const depth = this.endlessStageDepth();
    if (depth <= 0) return 1;
    if (type === 'boss') return Math.pow(1.205, depth) * (1 + depth * .04);
    if (type === 'elite' || type === 'midboss') return Math.pow(1.185, depth) * (1 + depth * .035);
    return Math.pow(1.165, depth) * (1 + depth * .03);
  }

  xpStageIndex() {
    return this.stageIndex + (this.isEndless() ? this.endlessCycle * STAGES.length : 0);
  }

  repairAmount(units = 2, player = this.player) {
    const kungfuMultiplier = player?.pilotId === 'kungfu' ? 2 : 1;
    return units * STAT_SCALE * kungfuMultiplier;
  }

  restart() {
    this.showTitle();
  }

  abandonRun() {
    if (this.mode !== 'paused' || !this.player) return false;
    this.dom['pause-overlay'].classList.add('hidden');
    this.dom['pause-button'].textContent = 'PAUSE';
    this.pauseReturnMode = null;
    this.endRun(false);
    return true;
  }

  showTitle() {
    // Returning from an active run banks any unbanked ore (pause → title included).
    if (!this.oreBanked && this.runOre > 0 && this.mode !== 'title') {
      this.bankOre(0);
    }
    this.mode = 'title';
    this.frame = 0;
    this.worldScroll = 0;
    this.sceneScroll = 0;
    this.score = 0;
    this.stageIndex = 0;
    this.waveIndex = -1;
    this.waveCooldown = 0;
    this.routeProgress = 0;
    this.transitionTimer = 0;
    this.transitionDeadline = 0;
    this.entityId = 1;
    this.hudBuildRevision = -1;
    this.upgradeReturnMode = null;
    this.pendingStageMusic = false;
    this.lastSoundFrame = {};
    this.announcementToken += 1;
    this.runOre = 0;
    this.oreBossBonus = 0;
    this.oreBanked = false;
    this.lastOreSettlement = null;
    this.damageSources = {};
    this.damageHits = {};
    this.endlessBossWarningTimer = 0;
    this.endlessBossSpawned = false;
    this.dom['end-overlay'].classList.add('hidden');
    this.dom['upgrade-overlay'].classList.add('hidden');
    this.dom['pause-overlay'].classList.add('hidden');
    this.dom['clear-overlay']?.classList.add('hidden');
    this.dom['review-overlay']?.classList.add('hidden');
    this.dom['title-overlay'].classList.remove('hidden');
    this.dom.announcement.classList.add('hidden');
    this.dom['pause-button'].textContent = 'PAUSE';
    document.getElementById('bomb-button').classList.add('hidden');
    this.dom['pause-fab'].classList.add('hidden');
    this.player = null;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.xpOrbs = [];
    this.effects = [];
    this.particles = [];
    this.floaters = [];
    this.currentChoices = [];
    this.keys.clear();
    if (this.pointer.id !== null && this.canvas.hasPointerCapture?.(this.pointer.id)) this.canvas.releasePointerCapture?.(this.pointer.id);
    this.pointer = { active: false, id: null, x: 0, y: 0, startX: 0, startY: 0, playerX: 0, playerY: 0 };
    this.onShowTitle?.();
    this.music.scene('menu', { fadeOut: .35, fadeIn: .60, restart: true });
    this.updateHud();
  }

  startStage(index) {
    this.stageIndex = clamp(index, 0, STAGES.length - 1);
    this.sceneScroll = 0;
    this.stageFrames = 0;
    this.stageDamageTotal = 0;
    this.damageLog = [];
    this.dps = { one: 0, ten: 0, total: 0 };
    this.waveIndex = -1;
    this.waveCooldown = 0;
    this.routeProgress = 0;
    this.mode = 'stageIntro';
    this.transitionTimer = 75;
    this.transitionDeadline = performance.now() + 1250;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.effects = [];
    this.player.y = this.h + 64;
    this.player.targetY = this.h - 92;
    this.player.targetX = clamp(this.player.x, 24, this.w - 24);
    this.player.invincible = Math.max(this.player.invincible, 120);
    this.player.shieldsDropped = 0;
    this.healDropsThisStage = 0;
    this.bossHealOpportunityRestored = false;
    const stage = STAGES[this.stageIndex];
    this.announce(`STAGE ${stage.id} — ${stage.name}`, stage.subtitle, 1900);
    // Keep the menu track through the initial pre-flight upgrade. Actual combat
    // music begins after the starter choice; test runs and later sectors start it here.
    if (this.runMode === 'test' || this.runFrames > 0) {
      this.music.scene('stage', { fadeOut: .32, fadeIn: .60, restart: true });
    }
    this.updateHud();
  }

  loop(time) {
    try {
      if (!this.lastTime) this.lastTime = time;
      this.accumulator += Math.min(50, time - this.lastTime);
      this.lastTime = time;
      while (this.accumulator >= 1000 / 60) {
        this.update();
        this.accumulator -= 1000 / 60;
      }
      this.render();
    } catch (error) {
      this.accumulator = 0;
      console.error('Raiden frame recovered after an unexpected error', error);
    }
    requestAnimationFrame(next => this.loop(next));
  }

  transitionElapsed() {
    this.transitionTimer -= 1;
    return this.transitionTimer <= 0 || (this.transitionDeadline > 0 && performance.now() >= this.transitionDeadline);
  }

  update() {
    this.frame += 1;
    const runActive = this.player && (this.mode === 'stageIntro' || this.mode === 'bossWarning' || this.mode === 'playing' || this.mode === 'stageClear');
    if (runActive) {
      this.worldScroll += this.worldScrollSpeed();
      const bossSceneLocked = this.mode === 'bossWarning' || this.enemies.some(enemy => enemy.type === 'boss' && enemy.alive);
      if (!bossSceneLocked) this.sceneScroll += this.worldScrollSpeed();
      this.runFrames += 1;
      this.stageFrames += 1;
      this.updateDps();
    }
    this.updateParticles();
    if (!this.player || this.mode === 'title' || this.mode === 'paused' || this.mode === 'levelup' || this.mode === 'gameover' || this.mode === 'victory') return;
    if (this.mode === 'respawning') { this.updateRespawnTransition(); return; }
    this.updateRouteProgress();
    if (this.mode === 'finale') {
      this.updateFinale();
      return;
    }
    if (this.mode === 'stageIntro') {
      this.updatePlayer(true);
      if (this.transitionElapsed()) { this.mode = 'playing'; if (!this.isEndless() && !this.enemies.some(enemy => enemy.type === 'boss' && enemy.alive)) this.spawnNextWave(); }
      return;
    }
    if (this.mode === 'bossWarning') {
      this.updatePlayer(true);
      this.updatePlayerBullets();
      this.updateXpOrbs();
      this.updateEffects();
      if (this.transitionElapsed()) { this.mode = 'playing'; this.spawnBoss(); }
      return;
    }
    if (this.mode === 'stageClear') {
      this.updatePlayer(true);
      this.updateXpOrbs();
      this.updateEffects();
      if (this.transitionElapsed()) {
        if (this.stageIndex >= STAGES.length - 1 && this.isEndless()) {
          this.endlessCycle += 1;
          this.startStage(0);
        } else if (this.stageIndex >= STAGES.length - 1) this.endRun(true);
        else this.startStage(this.stageIndex + 1);
      }
      return;
    }
    this.updatePlayer(false);
    this.updateSecondaries();
    this.updatePlayerBullets();
    if (this.player.build.fusions?.world) {
      if (this.worldFreezeTimer > 0) this.worldFreezeTimer -= 1;
      this.worldCooldown -= 1;
      if (this.worldCooldown <= 0) {
        this.worldFreezeTimer = 120; this.worldCooldown = 600;
        this.addEffect({ type: 'worldStop', x: this.w / 2, y: this.h / 2, life: 120, maxLife: 120 });
        this.announce('光速超越', 'LIGHT SPEED EXCEEDED', 700);
      }
    }
    const kungfuFrozen = this.kungfuFreezeTimer > 0;
    if (this.kungfuFreezeTimer > 0) this.kungfuFreezeTimer -= 1;
    this.enemyTimeScale = this.worldFreezeTimer > 0 ? .2 : 1;
    if (kungfuFrozen) this.updateKungfuCollisionOnly();
    else {
      this.updateEnemies();
      this.updateEnemyBullets();
    }
    this.updateXpOrbs();
    this.updateEffects();
    this.updateEndlessBossWarning();
    if (!kungfuFrozen) this.updateDirector();
    this.updateHud();
  }

  worldScrollSpeed() {
    return 1.2 + this.stageIndex * .14;
  }

  updateRouteProgress() {
    const stage = STAGES[this.stageIndex];
    if (!stage || this.mode === 'stageIntro') return;
    if (this.isEndless()) {
      this.routeProgress = clamp((this.waveIndex + 1) / (stage.waves + 1), 0, 1);
      return;
    }
    if (this.mode === 'stageClear') {
      this.routeProgress = Math.min(1, this.routeProgress + .025);
      return;
    }
    const boss = this.enemies.find(enemy => enemy.type === 'boss' && enemy.alive);
    if (this.mode === 'bossWarning' || boss) {
      this.routeProgress = Math.min(1, this.routeProgress + .006);
      return;
    }
    const waveNumber = Math.max(0, this.waveIndex + 1);
    const midboss = this.enemies.find(enemy => enemy.type === 'midboss' && enemy.alive);
    const checkpoint = midbossProgress(stage);
    const cap = waveNumber >= stage.midbossWave && !midboss ? .985 : checkpoint;
    const speed = 1 / (stage.waves * 300);
    this.routeProgress = Math.min(cap, this.routeProgress + speed);
  }

  updateDirector() {
    if (this.mode !== 'playing') return;
    if (this.isEndless()) { this.updateEndlessDirector(); return; }
    if (this.enemies.some(enemy => enemy.alive)) return;
    if (this.waveCooldown > 0) { this.waveCooldown -= 1; return; }
    const stage = STAGES[this.stageIndex];
    if (this.waveIndex + 1 < stage.waves) this.spawnNextWave();
    else this.beginBossWarning();
  }

  beginBossWarning() {
    const stage = STAGES[this.stageIndex];
    if (this.isEndless()) {
      if (this.endlessBossWarningTimer > 0 || this.enemies.some(enemy => enemy.type === 'boss' && enemy.alive)) return;
      this.endlessBossWarningTimer = BOSS_WARNING_DURATION_FRAMES;
      this.endlessBossSpawned = false;
      this.announce('WARNING', `${BOSSES[stage.boss].name} APPROACHING`, BOSS_WARNING_DURATION_MS);
      this.music.scene('warning', { fadeOut: .24, fadeIn: .03, restart: true });
      return;
    }
    this.mode = 'bossWarning';
    this.transitionTimer = BOSS_WARNING_DURATION_FRAMES;
    this.transitionDeadline = performance.now() + BOSS_WARNING_DURATION_MS;
    this.enemyBullets = [];
    this.announce('WARNING', `${BOSSES[stage.boss].name} APPROACHING`, BOSS_WARNING_DURATION_MS);
    this.music.scene('warning', { fadeOut: .24, fadeIn: .03, restart: true });
  }

  updateEndlessBossWarning() {
    if (!this.isEndless() || this.endlessBossWarningTimer <= 0) return;
    this.endlessBossWarningTimer -= 1;
    const elapsed = BOSS_WARNING_DURATION_FRAMES - this.endlessBossWarningTimer;
    if (!this.endlessBossSpawned && elapsed >= 60) {
      this.endlessBossSpawned = true;
      this.spawnBoss({ startMusic: false });
    }
    if (this.endlessBossWarningTimer <= 0) {
      if (!this.endlessBossSpawned) this.spawnBoss({ startMusic: false });
      this.music.scene('boss', { fadeOut: .10, fadeIn: .18, restart: true });
    }
  }

  updateEndlessDirector() {
    this.endlessWaveTimer -= 1;
    if (this.endlessWaveTimer > 0) return;
    const stage = STAGES[this.stageIndex];
    const bossAlive = this.enemies.some(enemy => enemy.type === 'boss' && enemy.alive);
    if (bossAlive) {
      this.spawnBossReinforcement();
      this.endlessWaveTimer = 300;
      return;
    }
    if (this.waveIndex + 1 >= stage.waves) {
      if (this.endlessBossWarningTimer <= 0) this.beginBossWarning();
      this.endlessWaveTimer = 300;
      return;
    } else {
      this.spawnNextWave();
      if (this.endlessCycle >= 4 && this.waveIndex + 1 === stage.midbossWave) this.spawnEnemy('midboss', this.w * .75, -130, 1 + this.endlessCycle * .1, 7, 1);
    }
    this.endlessWave += 1;
    this.endlessDepth = this.endlessWave;
    this.endlessWaveTimer = 300;
  }

  spawnBossReinforcement() {
    const normalTypes = new Set(['scout', 'striker', 'gunship']);
    let normalCount = 0;
    for (const enemy of this.enemies) if (enemy.alive && normalTypes.has(enemy.type)) normalCount += 1;
    const cap = 20;
    if (normalCount >= cap) return;
    const stage = STAGES[this.stageIndex];
    const pressure = stagePressure(stage, Math.max(0, this.waveIndex));
    const formation = (this.waveIndex * 3 + this.stageIndex) % 7;
    const count = Math.min(cap - normalCount, 6 + this.stageIndex + Math.floor(Math.max(0, this.waveIndex) * .35));
    for (let i = 0; i < count; i += 1) {
      let type = 'scout';
      if (this.stageIndex >= 1 && (i + this.waveIndex) % 4 === 0) type = 'striker';
      if (this.stageIndex >= 2 && (i + this.waveIndex) % 5 === 0) type = 'gunship';
      const x = 55 + (i % 6) * ((this.w - 110) / 5);
      const y = -45 - Math.floor(i / 6) * 60;
      this.spawnEnemy(type, x, y, pressure, formation, i);
    }
  }

  spawnEndlessEscortBoss() {
    const stage = STAGES[(this.stageIndex + 2) % STAGES.length];
    const data = BOSSES[stage.boss];
    const depth = this.endlessStageDepth();
    const bossHpGrowth = this.endlessHpGrowth('boss');
    const hp = data.baseHp * stage.bossHp * bossHpGrowth * .6 * STAT_SCALE;
    this.enemies.push({
      id: this.entityId++, type: 'boss', bossId: data.id, name: data.name, x: this.w / 4, y: -85,
      radius: 52, alive: true, hp, maxHp: hp, color: data.color, cooldown: 130,
      age: 0, phase: 0, hitFlash: 0, score: 5000 * stage.id, xp: 40 + stage.id * 10, pressure: 1, arriving: true, escort: true,
    });
  }

  spawnNextWave() {
    this.waveIndex += 1;
    const stage = STAGES[this.stageIndex];
    const pressure = stagePressure(stage, this.waveIndex);
    const waveNumber = this.waveIndex + 1;
    const isMidbossWave = waveNumber === stage.midbossWave;
    const isEliteWave = this.waveIndex === stage.waves - 1;
    const count = 6 + this.stageIndex + Math.floor(this.waveIndex * .85);
    const formation = (this.waveIndex * 3 + this.stageIndex) % 7;
    if (isMidbossWave) {
      this.spawnEnemy('midboss', this.w / 2, -110, pressure, 7, 0);
      this.announce('CHECKPOINT LOCKED', 'MIDBOSS SIGNATURE · DESTROY TO ADVANCE', 1500);
    } else {
      for (let i = 0; i < count; i += 1) {
        let type = 'scout';
        if (this.stageIndex >= 1 && (i + this.waveIndex) % 4 === 0) type = 'striker';
        if (this.stageIndex >= 2 && (i + this.waveIndex) % 5 === 0) type = 'gunship';
        const centerOffset = i - (count - 1) / 2;
        let x = 70 + (i % 6) * 68;
        let y = -45 - Math.floor(i / 6) * 60;
        if (formation === 1) { x = this.w / 2 + centerOffset * 39; y = -50 - Math.abs(centerOffset) * 25; }
        else if (formation === 2) { x = i % 2 ? this.w - 58 - Math.floor(i / 2) * 26 : 58 + Math.floor(i / 2) * 26; y = -45 - i * 30; }
        else if (formation === 3) { const a = count <= 1 ? 0 : i / (count - 1) * Math.PI; x = this.w / 2 + Math.cos(a) * 175; y = -70 - Math.sin(a) * 105; }
        else if (formation === 4) { x = rand(42, this.w - 42); y = -45 - (i % 3) * 74 - Math.floor(i / 3) * 26; }
        else if (formation === 5) { x = i % 2 ? this.w - 48 : 48; y = -48 - i * 38; }
        else if (formation === 6) { x = (i % 3 + 1) * this.w / 4 + rand(-24, 24); y = -48 - Math.floor(i / 3) * 82 - (i % 3) * 12; }
        this.spawnEnemy(type, x, y, pressure, formation, i);
      }
      if (isEliteWave) {
        this.spawnEnemy('elite', this.w / 2, -125, pressure, 7, count + 1);
        this.announce('ELITE SIGNATURE', 'HIGH-VALUE TARGET INBOUND', 950);
      }
    }
    this.waveCooldown = 95 + Math.max(0, 30 - this.stageIndex * 6);
  }

  spawnEnemy(type, x, y, pressure, formation, index) {
    let activeEnemies = 0;
    for (const enemy of this.enemies) if (enemy.alive) activeEnemies += 1;
    if (activeEnemies >= WORLD.maxEnemies) return false;
    const base = ENEMY_TYPES[type];
    const stage = this.activeStage();
    const depth = this.endlessStageDepth();
    const hpGrowth = this.endlessHpGrowth(type);
    const endlessSpeed = 1 + this.endlessCycle * .05;
    const hp = base.hp * stage.enemyHp * pressure * hpGrowth * STAT_SCALE;
    const spawnX = isLargeEnemyType(type) ? x : clamp(x, base.radius, this.w - base.radius);
    this.enemies.push({
      id: this.entityId++, type, x: spawnX, y, originX: spawnX, radius: base.radius, alive: true,
      hp, maxHp: hp,
      speed: base.speed * stage.enemySpeed * endlessSpeed * (type === 'elite' ? .8 : 1), score: base.score,
      xp: base.xp, color: base.color, cooldown: rand(45, 120), age: 0, formation, index,
      pressure, stageId: stage.id,
    });
    return true;
  }

  spawnBoss({ startMusic = true } = {}) {
    const route = STAGES[this.stageIndex];
    const stage = this.activeStage();
    const data = BOSSES[route.boss];
    const depth = this.endlessStageDepth();
    const bossHpGrowth = this.endlessHpGrowth('boss');
    const hp = data.baseHp * stage.bossHp * bossHpGrowth * STAT_SCALE;
    if (!this.bossHealOpportunityRestored) {
      this.healDropsThisStage = Math.max(0, this.healDropsThisStage - 1);
      this.bossHealOpportunityRestored = true;
    }
    this.enemies.push({
      id: this.entityId++, type: 'boss', bossId: data.id, name: data.name, x: this.w / 2, y: -85,
      radius: 52, alive: true, hp, maxHp: hp, color: data.color, cooldown: 95,
      age: 0, phase: 0, hitFlash: 0, score: 10000 * route.id, xp: 65 + route.id * 15, pressure: 1, arriving: true,
    });
    if (this.isEndless()) {
      if (this.endlessCycle >= 2) this.spawnEnemy('midboss', this.w / 3, -110, 1 + this.endlessCycle * .1, 7, 0);
      if (this.endlessCycle >= 6) this.spawnEndlessEscortBoss();
    }
    this.announce(data.name, data.title, 1700);
    if (startMusic) this.music.scene('boss', { fadeOut: .08, fadeIn: .18, restart: true });
  }

  updatePlayer(transitionOnly) {
    const player = this.player;
    const speed = player.craft.speed;
    if (!transitionOnly) {
      let dx = 0; let dy = 0;
      if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
      if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
      if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
      if (dx || dy) {
        const length = Math.hypot(dx, dy) || 1;
        player.targetX = clamp(player.x + dx / length * speed, 22, this.w - 22);
        player.targetY = clamp(player.y + dy / length * speed, this.playerMinY(player), this.h - 30);
      }
    }
    const easing = transitionOnly ? .08 : this.pointer.active ? .32 : .7;
    player.x += (player.targetX - player.x) * easing;
    player.y += (player.targetY - player.y) * easing;
    player.invincible = Math.max(0, player.invincible - 1);
    if (player.pilotId === 'shadow') {
      if (player.shadowTimer > 0) {
        player.shadowTimer -= 1;
        player.invincible = Math.max(player.invincible, 2);
        const clearRadius = 90;
        this.enemyBullets = this.enemyBullets.filter(bullet => distanceSq(bullet, player) > clearRadius ** 2);
        // Ten pulses over the two-second phase; total damage equals three seconds of primary DPS.
        if (player.shadowTimer % 12 === 0) {
          const pulseDamage = this.primaryDamagePerSecond(player) * .3;
          for (const enemy of this.enemies) {
            if (enemy.alive && distanceSq(enemy, player) <= clearRadius ** 2) this.damageEnemy(enemy, pulseDamage, false, 'pilot:陰影｜相位領域');
          }
        }
      } else {
        player.shadowCooldown -= 1;
        if (player.shadowCooldown <= 0) {
          player.shadowTimer = 120;
          player.shadowCooldown = 360;
          player.invincible = Math.max(player.invincible, 120);
          this.announce('SHADOW PHASE', '2.0 SECONDS INVULNERABLE', 900);
        }
      }
    }
    player.fireCooldown = Math.max(0, player.fireCooldown - 1);
    player.bombLock = Math.max(0, player.bombLock - 1);
    player.inputLock = Math.max(0, player.inputLock - 1);
    if (player.phaseClearTimer > 0) {
      player.phaseClearTimer -= 1;
      this.enemyBullets = this.enemyBullets.filter(bullet => distanceSq(bullet, player) > player.phaseClearRadius ** 2);
    }
        if (player.kungfuShieldTimer > 0) {
      player.kungfuShieldTimer -= 1;
      if (player.kungfuShieldTimer <= 0) player.kungfuShield = 0;
    }
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

  primaryProjectileBonus() {
    return this.player?.pilotId === 'gemini' ? 1 : 0;
  }

  projectileBonus() {
    return 0;
  }

  primaryDamagePerSecond(player = this.player) {
    if (!player || player.pilotId === 'kungfu') return 0;
    const level = upgradePower(player.build.primaryLevel);
    const overclock = upgradePower(player.build.passives.overclock || 0);
    const rate = 1 + overclock * .075;
    const projectileBonus = player.pilotId === 'gemini' ? 1 : 0;
    let baseDps = 0;
    if (player.craft.primary === 'vulcan') {
      const cooldown = Math.max(4, Math.round((11 - level) / rate));
      const count = 1 + Math.floor(level / 2) * 2 + projectileBonus;
      baseDps = this.vulcanPelletDamage(level) * count * 60 / cooldown;
    } else if (player.craft.primary === 'laser') {
      baseDps = (.35 + level * .08125) * (1 + projectileBonus) * 60;
    } else {
      const cooldown = Math.max(10, Math.round((23 - level * 1.7) / rate));
      let volleyDamage = (5.2 + level * 1.45) * (1 + projectileBonus);
      if (level >= 3) volleyDamage += (1.8 + level * .3) * 4;
      baseDps = volleyDamage * 60 / cooldown;
    }
    const critical = upgradePower(player === this.player ? this.passiveRank('critical') : player.build.passives.critical || 0);
    const expectedCritical = 1 + critical * .055 * ((1.65 + critical * .07) - 1);
    const supportRank = player === this.player ? this.passiveRank('support') : player.build.passives.support || 0;
    const expectedSupport = 1 + [0, .02, .03, .04][supportRank] * ([1, 1.5, 2, 3][supportRank] - 1);
    return baseDps * expectedCritical * expectedSupport;
  }

  // Falcon's shotgun grows through pellet count, not pellet damage.
  // All three ranks use the former rank-3 pellet damage.
  vulcanPelletDamage() {
    return 1.31;
  }

  firePrimary() {
    const p = this.player;
    if (p.fireCooldown > 0 || this.mode !== 'playing' || p.pilotId === 'kungfu') return;
    const level = upgradePower(p.build.primaryLevel);
    const overclock = upgradePower(p.build.passives.overclock || 0);
    const rate = 1 + overclock * .075;
    const primaryMaxed = p.build.primaryLevel >= WORLD.maxUpgradeRank;
    const fixedStatus = primaryMaxed ? { vulcan: 'burn', laser: 'shock' }[p.craft.primary] : null;
    const statuses = fixedStatus ? [fixedStatus] : [];
    const statusPowers = fixedStatus ? { [fixedStatus]: level } : {};
    const add = (vx, vy, options = {}) => this.addPlayerBullet({
      id: this.entityId++, x: p.x + (options.ox || 0), y: p.y - 22 + (options.oy || 0), vx, vy,
      radius: options.radius || 4, damage: options.damage || 1, life: options.life || 110,
      color: options.color || p.craft.color, kind: options.kind || 'bolt', pierce: options.pierce || 0,
      primary: true,
      splash: options.splash || 0, targetId: options.targetId, guidanceActive: options.guidanceActive,
      turn: options.turn || .055, reacquired: false, statuses: options.statuses || statuses, statusPowers: options.statusPowers || statusPowers,
      thunderHammer: options.thunderHammer || false, hammerRadius: options.hammerRadius || 0, hammerDamage: options.hammerDamage || 0,
      damageSource: options.damageSource || `primary:${p.craft.name}｜本體`,
    });
    if (p.craft.primary === 'vulcan') {
      p.fireCooldown = Math.max(4, Math.round((11 - level) / rate));
      const count = ({ 1: 2, 3: 3, 5: 5 }[level] || Math.max(2, level)) + this.primaryProjectileBonus();
      for (let i = 0; i < count; i += 1) {
        const offset = i - (count - 1) / 2;
        add(offset * 1.6, -10.8 + Math.abs(offset) * .22, { damage: this.vulcanPelletDamage(level), radius: 3.2, ox: offset * 5, color: '#ff4267' });
      }
    } else if (p.craft.primary === 'laser') {
      p.fireCooldown = 0;
      const beamCount = 1 + this.primaryProjectileBonus();
      for (let slot = 0; slot < beamCount; slot += 1) {
        const offsetX = (slot - (beamCount - 1) / 2) * 38;
        const beamData = {
          x: p.x + offsetX, y: p.y - 22, endY: 0, vx: 0, vy: 0, radius: (4 + level * level * .48) * 1.5,
          damage: .35 + level * .08125, life: 2, color: '#7df5ff', kind: 'beam', beamSlot: slot, offsetX, primary: true,
          maxTargets: Infinity, statuses, statusPowers,
        };
        const beam = this.playerBullets.find(bullet => bullet.kind === 'beam' && bullet.beamSlot === slot);
        if (beam) Object.assign(beam, beamData);
        else this.addPlayerBullet({ id: this.entityId++, ...beamData });
      }
    } else {
      p.fireCooldown = Math.max(10, Math.round((23 - level * 1.7) / rate));
      const hammer = primaryMaxed ? { thunderHammer: true, hammerRadius: (78 + level * 4) * 1.5, hammerDamage: (6 + level * 1.6) * .5 } : {};
      const mainShells = 1 + this.primaryProjectileBonus();
      for (let i = 0; i < mainShells; i += 1) {
        // Gemini (or multi-shell) fires parallel forward shots — position offset only, no sideways vx.
        const lane = mainShells > 1 ? (i - (mainShells - 1) / 2) : 0;
        add(0, -8.9, { damage: 5.2 + level * 1.45, radius: 6.2, splash: 34 + level * 5, ox: lane * 14, kind: 'cannon', color: '#ffd166', ...hammer });
      }
      if (level >= 3) {
        for (const side of [-1, 1]) {
          add(side * 1.05, -8.45, { damage: 1.8 + level * .3, radius: 4, splash: 22, ox: side * 12, kind: 'cannon', color: '#fb923c', ...hammer });
          add(side * 1.45, -8.15, { damage: 1.8 + level * .3, radius: 3.6, splash: 20, ox: side * 19, kind: 'cannon', color: '#fb923c', ...hammer });
        }
      }
    }
    this.sound('shoot');
  }

  nearestEnemies(origin, limit, maxDistanceSq = Infinity, excludedId = null) {
    const selected = [];
    while (selected.length < limit) {
      let nearest = null;
      let nearestDistance = maxDistanceSq;
      for (const enemy of this.enemies) {
        if (!enemy.alive || enemy.id === excludedId || selected.includes(enemy)) continue;
        const d2 = distanceSq(origin, enemy);
        if (d2 < nearestDistance) { nearest = enemy; nearestDistance = d2; }
      }
      if (!nearest) break;
      selected.push(nearest);
    }
    return selected;
  }

  setSecondaryCooldown(id, frames) {
    const capacitor = upgradePower(this.passiveRank('capacitor'));
    this.player.secondaryCooldowns[id] = Math.max(12, Math.round(frames * (1 - capacitor * .045)));
  }

  updateSecondaries() {
    const p = this.player;
    if (p.pilotId === 'kungfu') {
      this.updateKungfuSecondaries();
      return;
    }
    if (p.build.fusions?.seekerOrbit || p.build.fusions?.seekerOrbitPlus) {
      const droneLevel = upgradePower(3);
      const missileLevel = upgradePower(3);
      const satelliteCount = Math.min(3, 1 + Math.floor(droneLevel / 2)) + this.projectileBonus();
      const missileCount = 1 + Math.floor((missileLevel - 1) / 2) + this.projectileBonus();
      const satellites = [];
      for (let slot = 0; slot < satelliteCount; slot += 1) {
        const angle = this.frame * .035 + slot / satelliteCount * TAU;
        const satellite = { x: p.x + Math.cos(angle) * 34, y: p.y + Math.sin(angle) * 20 };
        satellites.push(satellite);
        const existing = this.effects.find(effect => effect.type === 'seekerSatellite' && effect.slot === slot);
        if (existing) Object.assign(existing, satellite, { life: 2, angle });
        else this.addEffect({ type: 'seekerSatellite', slot, ...satellite, angle, life: 2 });
      }
      p.secondaryCooldowns.seekerOrbit = (p.secondaryCooldowns.seekerOrbit || 0) - 1;
      if (p.secondaryCooldowns.seekerOrbit <= 0) {
        const target = pickNearestTarget(p, this.enemies);
        if (target) {
          for (const satellite of satellites) {
            for (let shot = 0; shot < missileCount; shot += 1) this.addPlayerBullet({
              id: this.entityId++, x: satellite.x, y: satellite.y - 6,
              vx: Math.sin((shot - (missileCount - 1) / 2) * .42) * 6.2, vy: -Math.cos((shot - (missileCount - 1) / 2) * .42) * 6.2, radius: 5, damage: 7,
              life: 190, color: '#ff9f1c', kind: 'missile', pierce: 0, splash: 24,
              targetId: target.id, guidanceActive: true, guidanceDelay: 30, turn: .08 + upgradePower(this.passiveRank('guidance')) * .012,
              reacquired: false, damageSource: p.build.fusions?.seekerOrbitPlus ? 'fusion:追獵軌道+' : 'fusion:追獵軌道',
            });
          }
        }
        this.setSecondaryCooldown('seekerOrbit', 43);
      }
    }
    if (p.build.fusions?.lanceOrbit) {
      const count = 3 + this.projectileBonus();
      for (let index = 0; index < count; index += 1) {
        const existing = this.effects.find(effect => effect.type === 'lanceOrbit' && effect.slot === index);
        if (existing) existing.life = 2;
        else this.addEffect({ type: 'lanceOrbit', slot: index, count, angle: index / count * TAU, x: p.x, y: p.y, life: 2 });
      }
    }
    if (p.build.fusions?.clusterStars) {
      p.secondaryCooldowns.clusterStars = (p.secondaryCooldowns.clusterStars || 0) - 1;
      if (p.secondaryCooldowns.clusterStars <= 0) {
        const level = upgradePower(3);
        const targets = this.nearestEnemies(p, 3 + this.projectileBonus());
        const hitCounts = new Map();
        if (targets.length) {
          this.addEffect({ type: 'clusterFlash', x: p.x, y: p.y - 14, life: 18, maxLife: 18 });
          this.spawnBurst(p.x, p.y - 14, 10, ['#fff', '#f0abfc']);
        }
        for (const target of targets) {
          this.addEffect({ type: 'clusterLock', x: target.x, y: target.y, life: 22, maxLife: 22 });
          this.fireKungfuBeam(target, { width: 8, damage: 7 + level * 2.4, source: 'fusion:群星', hitCounts, maxHitsPerTarget: 1, color: '#f0abfc' });
        }
        this.setSecondaryCooldown('clusterStars', Math.max(40, 100 - level * 10));
      }
    }
    if (p.build.fusions?.blackHole) {
      p.secondaryCooldowns.blackHole = (p.secondaryCooldowns.blackHole || 0) - 1;
      if (p.secondaryCooldowns.blackHole <= 0) {
        const level = upgradePower(3);
        const count = 1 + this.projectileBonus();
        const targets = this.nearestEnemies(p, count);
        for (let index = 0; index < count && targets.length; index += 1) {
          const target = targets[index] || targets[0];
          this.addEffect({ type: 'gravity', blackHole: true, x: target.x + (index - (count - 1) / 2) * 22, y: target.y, radius: (52 + level * 6) * 1.15 * this.fieldMultiplier(), timer: 300, damage: .45 + level * .18, pulse: 0, damageSource: 'fusion:黑洞' });
        }
        // Longer-lived, rarer singularity: duration 300 < cooldown 380 keeps at
        // most one black hole on the field without projectile upgrades.
        this.setSecondaryCooldown('blackHole', 380);
      }
    }
    for (const [id, rank] of Object.entries(p.build.secondaries)) {
      if (p.build.fusions?.seekerOrbit && (id === 'homing' || id === 'drone')) continue;
      if (p.build.fusions?.lanceOrbit && (id === 'rail' || id === 'prism')) continue;
      const level = upgradePower(rank);
      p.secondaryCooldowns[id] = (p.secondaryCooldowns[id] || 0) - 1;
      if (p.secondaryCooldowns[id] > 0) continue;
      if (id === 'homing') {
        const target = pickNearestTarget(p, this.enemies);
        if (target) {
          const count = 1 + Math.floor((level - 1) / 2) + this.projectileBonus();
          for (let i = 0; i < count; i += 1) this.addPlayerBullet({
            id: this.entityId++, x: p.x + (i - (count - 1) / 2) * 18, y: p.y,
            vx: Math.sin((i - (count - 1) / 2) * .42) * 6.2, vy: -Math.cos((i - (count - 1) / 2) * .42) * 6.2, radius: 5, damage: (3 + level * 1.15) * .8,
            life: 190, color: '#ffb703', kind: 'missile', pierce: 0, splash: 14 + level * 2,
            targetId: target.id, guidanceActive: true, guidanceDelay: 30, turn: .035 + level * .009 + upgradePower(this.passiveRank('guidance')) * .012,
            reacquired: false, damageSource: 'secondary:追蹤導彈',
          });
        }
        this.setSecondaryCooldown(id, Math.max(30, 88 - level * 9));
      } else if (id === 'drone') {
        const count = Math.min(3, 1 + Math.floor(level / 2)) + this.projectileBonus();
        const target = p.build.fusions?.seekerOrbit ? pickNearestTarget(p, this.enemies) : null;
        for (let i = 0; i < count; i += 1) {
          const angle = this.frame * .035 + i / count * TAU;
          this.addPlayerBullet({ id: this.entityId++, x: p.x + Math.cos(angle) * 34, y: p.y + Math.sin(angle) * 20, vx: Math.sin(angle) * .5, vy: -9, radius: 3.2, damage: 1.5 + level * .55, life: 120, color: '#a78bfa', kind: target ? 'missile' : 'drone', pierce: 0, splash: 0, targetId: target?.id, guidanceActive: Boolean(target), turn: .08, damageSource: p.build.fusions?.seekerOrbit ? 'fusion:追獵軌道' : 'secondary:無人機' });
        }
        this.setSecondaryCooldown(id, Math.max(12, 36 - level * 4));
      } else if (id === 'chain') {
        const targets = this.nearestEnemies(p, Math.min(4, 1 + level) + this.projectileBonus());
        if (targets.length) {
          let previous = { x: p.x, y: p.y };
          const points = [{ ...previous }];
          for (const target of targets) { this.damageEnemy(target, 2.4 + level * 1.15, false, 'secondary:連鎖電弧'); points.push({ x: target.x, y: target.y }); previous = target; }
          this.addEffect({ type: 'arc', points, life: 12, maxLife: 12 });
        }
        this.setSecondaryCooldown(id, Math.max(45, 115 - level * 10));
      } else if (id === 'acid') {
        const amp = [0, .2, .3, .4][rank];
        const halfAngle = .42 + rank * .04;
        const range = 210 + level * 18;
        // One-shot fan blast: no projectiles. Damage scales with rank so a full cone still
        // outpaces the old multi-pellet spray against packed targets.
        const blastDamage = (.55 + level * .16) * (1.4 + rank * .35);
        const origin = { x: p.x, y: p.y - 18 };
        this.addEffect({ type: 'acidCone', x: origin.x, y: origin.y, range, halfAngle, life: 20, maxLife: 20 });
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          const dx = enemy.x - origin.x;
          const dy = enemy.y - origin.y;
          const dist = Math.hypot(dx, dy);
          if (dist > range + enemy.radius) continue;
          // Measure angle from straight up (-PI/2).
          let delta = Math.atan2(dy, dx) + Math.PI / 2;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) > halfAngle) continue;
          this.damageEnemy(enemy, blastDamage, true, 'secondary:酸性噴霧');
          enemy.acidTimer = 300;
          enemy.acidAmp = Math.max(enemy.acidAmp || 0, amp);
        }
        this.setSecondaryCooldown(id, Math.max(10, 28 - level * 2));
      } else if (id === 'rail') {
        const count = 1 + this.projectileBonus();
        for (let index = 0; index < count; index += 1) this.addPlayerBullet({ id: this.entityId++, x: p.x + (index - (count - 1) / 2) * 14, y: p.y - 20, vx: 0, vy: -15, radius: 5, damage: 7 + level * 2.4, life: 75, color: '#fff', kind: 'rail', pierce: 6 + level, splash: 0, damageType: 'pierce', damageSource: 'secondary:磁軌爆發' });
        this.setSecondaryCooldown(id, Math.max(70, 155 - level * 13));
      } else if (id === 'bombard') {
        const count = 1 + this.projectileBonus();
        const targets = this.nearestEnemies(p, count);
        for (let index = 0; index < count && targets.length; index += 1) {
          const target = targets[index] || targets[0];
          const targetOffsetX = (index - (count - 1) / 2) * 18;
          const lockX = target.x + targetOffsetX;
          const lockY = target.y;
          this.addEffect({
            type: 'bombard',
            x: lockX,
            y: lockY,
            startX: lockX,
            startY: lockY,
            targetId: target.id,
            targetOffsetX,
            timer: 45,
            maxTimer: 45,
            firing: false,
            shotIndex: 0,
            shotCount: 3,
            shotInterval: 6,
            radius: 35 + level * 5,
            damage: (7 + level * 3.2) * .45, damageSource: 'secondary:轟炸莢艙',
          });
        }
        this.setSecondaryCooldown(id, Math.max(65, 145 - level * 11));
      } else if (id === 'gravity') {
        const count = 1 + this.projectileBonus();
        const targets = this.nearestEnemies(p, count);
        for (let index = 0; index < count && targets.length; index += 1) {
          const target = targets[index] || targets[0];
          this.addEffect({ type: 'gravity', x: target.x + (index - (count - 1) / 2) * 22, y: target.y, radius: 52 + level * 6, timer: 100 + level * 10, damage: .45 + level * .18, pulse: 0, damageSource: 'secondary:微型重力井' });
        }
        this.setSecondaryCooldown(id, Math.max(95, 190 - level * 15));
      } else if (id === 'prism') {
        this.effects = this.effects.filter(effect => effect.type !== 'prismSatellite');
        const count = Math.min(3, 1 + Math.floor(level / 2)) + this.projectileBonus();
        for (let index = 0; index < count; index += 1) this.addEffect({
          type: 'prismSatellite', angle: index / count * TAU, x: p.x, y: p.y,
          life: 190 + level * 8, maxLife: 190 + level * 8, pulse: index * 6, rank: level,
        });
        this.setSecondaryCooldown(id, Math.max(95, 175 - level * 10));
      } else if (id === 'interceptor') {
        this.addEffect({ type: 'interceptorPulse', x: p.x, y: p.y, timer: 18, maxTimer: 18, count: Math.min(6, 1 + level) + this.projectileBonus(), range: 170 });
        this.setSecondaryCooldown(id, Math.max(100, 160 - level * 12));
      }
    }
  }

  beamEndBeyondScreen(origin, target) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.hypot(this.w, this.h) * 1.35 / length;
    return { x: origin.x + dx * scale, y: origin.y + dy * scale };
  }

  distanceToSegmentSquared(point, start, end) {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const wx = point.x - start.x;
    const wy = point.y - start.y;
    const lengthSq = vx * vx + vy * vy || 1;
    const t = clamp((wx * vx + wy * vy) / lengthSq, 0, 1);
    const dx = point.x - (start.x + vx * t);
    const dy = point.y - (start.y + vy * t);
    return dx * dx + dy * dy;
  }

  fireKungfuBeam(target, { width, damage, source, near = 1, far = 1, hitCounts = null, maxHitsPerTarget = 1, color = '#38bdf8' }) {
    const start = { x: this.player.x, y: this.player.y };
    const end = this.beamEndBeyondScreen(start, target);
    const maxDistance = Math.hypot(this.w, this.h);
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.y + enemy.radius < 0) continue;
      const hitRadius = width / 2 + enemy.radius;
      if (this.distanceToSegmentSquared(enemy, start, end) > hitRadius * hitRadius) continue;
      const count = hitCounts?.get(enemy.id) || 0;
      if (count >= maxHitsPerTarget) continue;
      const distanceRatio = clamp(Math.hypot(enemy.x - start.x, enemy.y - start.y) / maxDistance, 0, 1);
      const distanceMultiplier = near + (far - near) * distanceRatio;
      this.damageEnemy(enemy, this.rollDamage(damage * distanceMultiplier), true, source, 'pierce', true);
      hitCounts?.set(enemy.id, count + 1);
    }
    this.addEffect({ type: 'kungfuBeam', x1: start.x, y1: start.y, x2: end.x, y2: end.y, width, color, life: 30, maxLife: 30 });
  }

  updateKungfuFusions() {
    const p = this.player;
    const payloadPower = upgradePower(p.build.passives.payload || 0);
    const areaScale = 1 + payloadPower * .08;
    const damageScale = 1 + payloadPower * .06;
    if (p.build.fusions?.sixMeridians) {
      const key = 'fusion-sixMeridians';
      p.secondaryCooldowns[key] = (p.secondaryCooldowns[key] || 0) - 1;
      if (p.secondaryCooldowns[key] <= 0) {
        const targets = this.enemies.filter(e => e.alive && e.y + e.radius >= 0).sort((a,b) => distanceSq(p,b)-distanceSq(p,a)).slice(0,5);
        const hitCounts = new Map();
        for (const target of targets) {
          this.fireKungfuBeam(target, { width: 10, damage: 4, source: 'fusion:六脈神劍', near: 1.5, far: 1, hitCounts, maxHitsPerTarget: 2, color: '#c4b5fd' });
        }
        p.secondaryCooldowns[key]=90;
      }
    }
    if (p.build.fusions?.taijiMaster) {
      p.secondaryCooldowns.taijiMaster = (p.secondaryCooldowns.taijiMaster || 0) - 1;
      if (p.secondaryCooldowns.taijiMaster <= 0) {
        const range = 125 * areaScale;
        const width = 122 * areaScale;
        const nearEdge = p.y - 28;
        const farEdge = nearEdge - range;
        const inPushArea = object => object.y + (object.radius || 0) >= farEdge
          && object.y - (object.radius || 0) <= nearEdge
          && Math.abs(object.x - p.x) <= width / 2 + (object.radius || 0);
        this.enemyBullets = this.enemyBullets.filter(bullet => !inPushArea(bullet));
        for (const enemy of this.enemies) {
          if (!enemy.alive || !inPushArea(enemy)) continue;
          this.damageEnemy(enemy, this.rollDamage(3.3 * 1.85 * damageScale), true, 'fusion:太極宗');
          if ((enemy.ironMountainCooldown || 0) <= 0) {
            enemy.kungfuAttackLock = 90;
            enemy.ironMountainCooldown = 300;
            this.addEffect({ type: 'ironMountain', x: enemy.x, y: enemy.y, life: 20, maxLife: 20 });
          }
        }
        this.addEffect({ type: 'pushHands', x: p.x, y: nearEdge, range, width, color: '#facc15', strokeColor: '#fef3c7', life: 14, maxLife: 14 });
        this.setSecondaryCooldown('taijiMaster', 14);
      }
    }
    if (p.build.fusions?.sixHarmony) {
      p.secondaryCooldowns.sixHarmony = (p.secondaryCooldowns.sixHarmony || 0) - 1;
      if (p.secondaryCooldowns.sixHarmony <= 0) {
        const targets = this.nearestEnemies(p, 3, (250 * areaScale) ** 2);
        for (let strike = 0; strike < 3 && targets.length; strike += 1) {
          const enemy = targets[strike % targets.length];
          this.damageEnemy(enemy, this.rollDamage(4.2 * damageScale), true, 'fusion:六合拳');
          enemy.kungfuSlowTimer = 90;
          enemy.kungfuSlowFactor = Math.min(enemy.kungfuSlowFactor || 1, .6);
          this.addEffect({ type: 'afterimage', x: enemy.x, y: enemy.y, craftId: p.craftId, color: '#34d399', strike, life: 22, maxLife: 22 });
        }
        this.setSecondaryCooldown('sixHarmony', 60);
      }
    }
  }

  updateKungfuSecondaries() {
    const p = this.player;
    this.updateKungfuFusions();
    for (const [id, rank] of Object.entries(p.build.secondaries)) {
      if (id === 'ironMountain') continue;
      p.secondaryCooldowns[id] = (p.secondaryCooldowns[id] || 0) - 1;
      if (p.secondaryCooldowns[id] > 0) continue;
      if (id === 'kiai') {
        this.enemyBullets = [];
        this.kungfuFreezeTimer = Math.max(this.kungfuFreezeTimer, [0, 18, 42, 72][rank]);
        this.addEffect({ type: 'kiai', x: p.x, y: p.y, life: 24, maxLife: 24 });
        this.setSecondaryCooldown(id, [0, 720, 660, 600][rank]);
      } else if (id === 'jointStrike') {
        const payloadPower = upgradePower(p.build.passives.payload || 0);
        const areaScale = 1 + payloadPower * .08;
        const damageScale = 1 + payloadPower * .06;
        const radius = [0, 50, 62, 74][rank] * areaScale;
        const slowFactor = [1, .8, .7, .6][rank];
        for (const enemy of this.enemies) {
          if (!enemy.alive || distanceSq(p, enemy) > (radius + enemy.radius) ** 2) continue;
          this.damageEnemy(enemy, this.rollDamage([0, 2, 2.8, 3.7][rank] * damageScale), true, 'secondary:關節打擊');
          enemy.kungfuSlowTimer = 90;
          enemy.kungfuSlowFactor = Math.min(enemy.kungfuSlowFactor || 1, slowFactor);
        }
        this.addEffect({ type: 'jointStrike', x: p.x, y: p.y, radius, life: 18, maxLife: 18 });
        this.setSecondaryCooldown(id, [0, 60, 50, 40][rank]);
      } else if (id === 'pushHands') {
        const payloadPower = upgradePower(p.build.passives.payload || 0);
        const areaScale = 1 + payloadPower * .08;
        const damageScale = 1 + payloadPower * .06;
        const range = [0, 72, 98, 125][rank] * areaScale;
        const width = [0, 82, 102, 122][rank] * areaScale;
        for (const enemy of this.enemies) {
          if (!enemy.alive || enemy.y > p.y - range / 2 + enemy.radius || enemy.y < p.y - range - enemy.radius || Math.abs(enemy.x - p.x) > width / 2 + enemy.radius) continue;
          this.damageEnemy(enemy, this.rollDamage([0, 1.6, 2.3, 3.3][rank] * damageScale), true, 'secondary:推手');
        }
        this.addEffect({ type: 'pushHands', x: p.x, y: p.y - range / 2, range: range / 2, width, life: 12, maxLife: 12 });
        this.setSecondaryCooldown(id, [0, 22, 18, 14][rank]);
      } else if (id === 'fajin') {
        const target = pickNearestTarget(p, this.enemies);
        if (target) {
          const angle = Math.atan2(target.y-p.y,target.x-p.x);
          const range=[0,220,250,280][rank];
          this.addPlayerBullet({ id:this.entityId++, x:p.x, y:p.y, vx:Math.cos(angle)*12, vy:Math.sin(angle)*12, radius:[0,9,11,13][rank], damage:[0,2.8,3.6,4.5][rank], life:Math.ceil(range/12), color:'#60a5fa', kind:'fajin', pierce:99, splash:0, originX:p.x, originY:p.y, distanceScale:{near:1,far:.5,min:0,max:range}, damageType:'pierce', damageSource:'secondary:發勁' });
        }
        this.setSecondaryCooldown(id, [0,84,72,60][rank]);
      } else if (id === 'cloudHand') {
        const targets=this.enemies.filter(e=>e.alive&&e.y+e.radius>=0);
        const target=targets.sort((a,b)=>distanceSq(p,b)-distanceSq(p,a))[0];
        if(target) this.fireKungfuBeam(target, { width: [0, 7, 9, 11][rank], damage: [0, 3, 4, 5.2][rank], source: 'secondary:穿雲手', color: '#38bdf8' });
        this.setSecondaryCooldown(id, [0,180,150,120][rank]);
      } else if (id === 'ironBell') {
        p.kungfuShield = 1;
        p.kungfuShieldTimer = [0, 120, 180, 240][rank];
        this.addEffect({ type: 'ironBell', x: p.x, y: p.y, life: 28, maxLife: 28 });
        this.setSecondaryCooldown(id, [0, 900, 780, 660][rank]);
      } else if (id === 'afterimage') {
        const targets = this.nearestEnemies(p, rank, [0, 170, 210, 250][rank] ** 2);
        for (const enemy of targets) {
          this.damageEnemy(enemy, this.rollDamage([0, 2.4, 3.2, 4.2][rank]), true, 'secondary:殘影');
          this.addEffect({ type: 'afterimage', x: enemy.x, y: enemy.y, craftId: p.craftId, life: 22, maxLife: 22 });
        }
        this.setSecondaryCooldown(id, 60);
      }
    }
  }

  updatePlayerBullets() {
    for (let i = this.playerBullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.playerBullets[i];
      if (bullet.kind === 'beam') {
        bullet.x = this.player.x + (bullet.offsetX || 0);
        bullet.y = this.player.y - 22;
        bullet.life -= 1;
        let targets = 0;
        for (const enemy of this.enemies) {
          if (!enemy.alive || enemy.y > bullet.y || Math.abs(enemy.x - bullet.x) > enemy.radius + bullet.radius) continue;
          { const traveled = bullet.originX === undefined ? 0 : Math.hypot(bullet.x-bullet.originX, bullet.y-bullet.originY); const ds=bullet.distanceScale; const mult=ds ? ds.near + (ds.far-ds.near)*clamp((traveled-(ds.min||0))/Math.max(1,ds.max-(ds.min||0)),0,1) : 1; const count=bullet.hitCounts?.get(enemy.id)||0; if (!bullet.maxHitsPerTarget || count < bullet.maxHitsPerTarget) { this.damageEnemy(enemy, this.rollDamage(bullet.damage*mult), true, bullet.damageSource || (bullet.primary ? `primary:${this.player.craft.name}｜本體` : 'other:其他傷害'), bullet.damageType, true); bullet.hitCounts?.set(enemy.id,count+1); } }
          this.applyBulletStatus(bullet, enemy);
          targets += 1;
          if (targets >= bullet.maxTargets) break;
        }
        if (bullet.life <= 0) this.playerBullets.splice(i, 1);
        continue;
      }
      if (bullet.kind === 'missile' && bullet.guidanceDelay > 0) bullet.guidanceDelay -= 1;
      if (bullet.kind === 'missile' && bullet.guidanceActive && !(bullet.guidanceDelay > 0)) {
        let guided = updateGuidance(bullet, this.enemies, bullet);
        if (!guided.guidanceActive && !bullet.reacquired && upgradePower(this.passiveRank('guidance')) >= 5) {
          const next = pickNearestTarget(bullet, this.enemies);
          if (next) guided = { ...guided, targetId: next.id, guidanceActive: true, reacquired: true };
        }
        Object.assign(bullet, guided);
      }
      bullet.x += bullet.vx; bullet.y += bullet.vy; bullet.life -= 1;
      let removed = false;
      for (const enemy of this.enemies) {
        if (!enemy.alive || bullet.hitIds?.has(enemy.id)) continue;
        if (enemy.y + enemy.radius < 0) continue;
        const rr = bullet.radius + enemy.radius;
        if (distanceSq(bullet, enemy) > rr * rr) continue;
        bullet.hitIds ||= new Set(); bullet.hitIds.add(enemy.id);
        { const traveled = bullet.originX === undefined ? 0 : Math.hypot(bullet.x-bullet.originX, bullet.y-bullet.originY); const ds=bullet.distanceScale; const mult=ds ? ds.near + (ds.far-ds.near)*clamp((traveled-(ds.min||0))/Math.max(1,ds.max-(ds.min||0)),0,1) : 1; const count=bullet.hitCounts?.get(enemy.id)||0; if (!bullet.maxHitsPerTarget || count < bullet.maxHitsPerTarget) { this.damageEnemy(enemy, this.rollDamage(bullet.damage*mult), true, bullet.damageSource || (bullet.primary ? `primary:${this.player.craft.name}｜本體` : 'other:其他傷害'), bullet.damageType, true); bullet.hitCounts?.set(enemy.id,count+1); } }
        this.applyBulletStatus(bullet, enemy);
        if (bullet.splash) this.areaDamage(bullet.x, bullet.y, bullet.splash, bullet.damage * .45, enemy.id, `${bullet.damageSource || 'other:其他傷害'}｜爆炸`);
        if (bullet.thunderHammer) this.triggerThunderHammer(enemy.x, enemy.y, bullet.hammerRadius, bullet.hammerDamage, enemy.id, `primary:${this.player.craft.name}｜雷神之錘`);
        if (bullet.pierce > 0) bullet.pierce -= 1;
        else { this.playerBullets.splice(i, 1); removed = true; }
        break;
      }
      if (!removed && (bullet.life <= 0 || bullet.y < -45 || bullet.x < -55 || bullet.x > this.w + 55)) this.playerBullets.splice(i, 1);
    }
  }

  passiveRank(id) {
    const p = this.player;
    if (!p) return 0;
    const fusions = p.build.fusions || {};
    if (fusions.langinus && (id === 'critical' || id === 'support')) return 3;
    if (fusions.suicideSquad && (id === 'bombcap' || id === 'payload')) return 3;
    if (fusions.luckyStar && (id === 'salvage' || id === 'magnet' || id === 'harvester')) return 3;
    if (fusions.seekerOrbitPlus && id === 'guidance') return 3;
    if ((fusions.overclockDirect || fusions.overclockPierce || fusions.overclockArea) && id === 'overclock') return 3;
    if (fusions.overclockDirect && id === 'directCore') return 3;
    if (fusions.overclockPierce && id === 'pierceCore') return 3;
    if (fusions.overclockArea && id === 'areaCore') return 3;
    if (fusions.world && (id === 'fieldAmp' || id === 'capacitor')) return 3;
    return p.build.passives[id] || 0;
  }

  luckyOreBonus() {
    return this.player?.build?.fusions?.luckyStar ? 2 : 0;
  }

  fieldMultiplier() {
    return [1, 1.05, 1.10, 1.15][Math.min(3, this.passiveRank('fieldAmp'))] || 1;
  }

  damageTypeMultiplier(type, eligible = true) {
    if (!eligible) return 1;
    const f = this.player?.build?.fusions || {};
    if (type === 'direct' && f.overclockDirect) return 1.25;
    if (type === 'pierce' && f.overclockPierce) return 1.25;
    if (type === 'area' && f.overclockArea) return 1.25;
    const id = { direct: 'directCore', pierce: 'pierceCore', area: 'areaCore' }[type];
    const rank = id ? this.passiveRank(id) : 0;
    return [1, 1.10, 1.15, 1.20][rank] || 1;
  }

  inferDamageType(source) {
    const text = String(source || '');
    if (/爆炸|雷神之錘|酸性噴霧|微型重力井|黑洞|轟炸莢艙|關節打擊|推手|太極|相位領域/.test(text)) return 'area';
    if (/LANCER|磁軌|稜鏡|槍騎|群星|發勁|穿雲|六脈|連鎖電擊/.test(text)) return 'pierce';
    return 'direct';
  }

  rollDamage(base) {
    const level = upgradePower(this.passiveRank('critical'));
    const critical = Math.random() < level * .055;
    this.pendingCriticalEffect = critical;
    const criticalDamage = critical ? base * (1.65 + level * .07) : base;
    const supportRank = this.passiveRank('support');
    const chance = [0, .02, .03, .04][supportRank];
    const multiplier = [1, 1.5, 2, 3][supportRank];
    const supportTriggered = Math.random() < chance;
    this.pendingSupportEffect = supportTriggered;
    return supportTriggered ? criticalDamage * multiplier : criticalDamage;
  }

  applyBulletStatus(bullet, enemy) {
    if (bullet.acidAmp) {
      enemy.acidTimer = 300;
      enemy.acidAmp = Math.max(enemy.acidAmp || 0, bullet.acidAmp);
      enemy.statusFlash = 14;
      enemy.statusFlashColor = '#a3e635';
    }
    const statuses = bullet.statuses || (bullet.status ? [bullet.status] : []);
    for (const status of statuses) {
      const power = bullet.statusPowers?.[status] || bullet.statusPower || 1;
      enemy.statusFlash = 10;
      enemy.statusFlashColor = { burn: '#ff8a4c', chill: '#42e8ff', shock: '#facc15' }[status];
      if (status === 'burn') {
        enemy.burnTimer = Math.max(enemy.burnTimer || 0, 90 + power * 12);
        enemy.burnDamage = this.primaryDamagePerSecond() * .3 / 4;
        enemy.burnSource = `primary:${this.player.craft.name}｜燃燒`;
      } else if (status === 'chill') {
        enemy.chillTimer = Math.max(enemy.chillTimer || 0, 75 + power * 6);
        enemy.chillStacks = (enemy.chillStacks || 0) + 1;
        if (enemy.chillStacks >= 6) { enemy.freezeTimer = 20 + power * 4; enemy.chillStacks = 0; }
      } else if (status === 'shock' && (enemy.shockCooldown || 0) <= 0) {
        const points = [{ x: enemy.x, y: enemy.y }];
        let current = enemy;
        for (let bounce = 0; bounce < 3; bounce += 1) {
          let target = null;
          let nearestDistance = 180 ** 2;
          for (const candidate of this.enemies) {
            if (!candidate.alive || candidate.id === current.id) continue;
            const d2 = distanceSq(current, candidate);
            if (d2 < nearestDistance) { target = candidate; nearestDistance = d2; }
          }
          // Previously hit enemies may be selected again, but each bounce
          // still requires another living enemy near the current target.
          if (!target) break;
          this.damageEnemy(target, bullet.damage * .64, false, `primary:${this.player.craft.name}｜連鎖電擊`);
          points.push({ x: target.x, y: target.y });
          current = target;
        }
        this.addEffect({ type: 'arc', points, life: 12, maxLife: 12 });
        enemy.shockCooldown = 10;
      }
    }
  }

  updateEnemyStatus(enemy) {
    enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - 1);
    enemy.statusFlash = Math.max(0, (enemy.statusFlash || 0) - 1);
    enemy.shockCooldown = Math.max(0, (enemy.shockCooldown || 0) - 1);
    enemy.burnTimer = Math.max(0, (enemy.burnTimer || 0) - 1);
    enemy.chillTimer = Math.max(0, (enemy.chillTimer || 0) - 1);
    enemy.freezeTimer = Math.max(0, (enemy.freezeTimer || 0) - 1);
    enemy.acidTimer = Math.max(0, (enemy.acidTimer || 0) - 1);
    enemy.kungfuHitCooldown = Math.max(0, (enemy.kungfuHitCooldown || 0) - 1);
    enemy.kungfuSlowTimer = Math.max(0, (enemy.kungfuSlowTimer || 0) - 1);
    enemy.kungfuAttackLock = Math.max(0, (enemy.kungfuAttackLock || 0) - 1);
    enemy.ironMountainCooldown = Math.max(0, (enemy.ironMountainCooldown || 0) - 1);
    if (enemy.burnTimer > 0 && this.frame % 20 === 0) this.damageEnemy(enemy, enemy.burnDamage || .1, false, enemy.burnSource || 'primary:主武器｜燃燒');
    if (!enemy.alive) return 0;
    if (enemy.chillTimer <= 0 && enemy.freezeTimer <= 0) enemy.chillStacks = 0;
    const heavy = isLargeEnemyType(enemy.type);
    if (enemy.freezeTimer > 0) return heavy ? .82 : .18;
    if (enemy.chillTimer > 0) return heavy ? .88 : .62;
    if (enemy.kungfuSlowTimer > 0) return heavy ? 1 - (1 - (enemy.kungfuSlowFactor || 1)) * .5 : (enemy.kungfuSlowFactor || 1);
    return 1;
  }

  updateEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (!enemy.alive) { this.enemies.splice(i, 1); continue; }
      const motionScale = this.updateEnemyStatus(enemy) * (this.enemyTimeScale || 1);
      if (!enemy.alive) { this.enemies.splice(i, 1); continue; }
      enemy.age += motionScale;
      enemy.motionScale = motionScale;
      if (enemy.type === 'boss') this.updateBoss(enemy);
      else if (enemy.type === 'midboss') this.updateMidboss(enemy);
      else {
        if (enemy.formation === 0) enemy.x = enemy.originX + Math.sin(enemy.age / 32 + enemy.index) * 25;
        else if (enemy.formation === 1) enemy.x = enemy.originX + Math.sin(enemy.age / 20 + enemy.index * .7) * 28;
        else if (enemy.formation === 2) enemy.x = enemy.originX + Math.sin(enemy.age / 15 + enemy.index) * 48;
        else if (enemy.formation === 3) enemy.x = enemy.originX + Math.sin(enemy.age / 38 + enemy.index * .55) * 35;
        else if (enemy.formation === 4) enemy.x = enemy.originX + Math.sin(enemy.age / 24 + enemy.index * 1.7) * 22;
        else if (enemy.formation === 5) enemy.x = clamp(enemy.originX + (enemy.index % 2 ? -1 : 1) * enemy.age * .62, 20, this.w - 20);
        else enemy.x = enemy.originX + Math.sin(enemy.age / 27 + enemy.index) * 18;
        enemy.y += enemy.speed * motionScale;
        if (!(enemy.kungfuAttackLock > 0)) {
          enemy.cooldown -= motionScale;
          if (enemy.y > 30 && enemy.cooldown <= 0) { this.enemyShoot(enemy); enemy.cooldown = this.enemyCooldown(enemy); }
        }
        if (enemy.y > this.h + 55) { enemy.alive = false; this.enemies.splice(i, 1); continue; }
      }
      const kungfu = this.player.pilotId === 'kungfu';
      const fistPower = kungfu ? upgradePower(this.player.build.primaryLevel) : 0;
      const rr = enemy.radius + (kungfu ? this.player.radius + fistPower * 1.2 : this.player.hitRadius);
      if (distanceSq(enemy, this.player) < rr * rr) {
        if (kungfu && (enemy.kungfuHitCooldown || 0) <= 0) {
          const ironMountain = this.player.build.secondaries.ironMountain || 0;
          const taiji = Boolean(this.player.build.fusions?.taijiMaster);
          const fistDamage = 2.4 * (1 + KUNGFU_FIST_DAMAGE_BONUS[this.player.build.primaryLevel] / 100);
          const collisionSource = taiji ? 'pilot:功夫｜撞擊傷害(太極宗)' : ironMountain ? 'pilot:功夫｜撞擊傷害(鐵山靠)' : 'pilot:功夫｜撞擊傷害';
          this.damageEnemy(enemy, this.rollDamage(fistDamage * [1, 1.3, 1.55, 1.85][ironMountain]), true, collisionSource);
          if (ironMountain && (enemy.ironMountainCooldown || 0) <= 0) {
            enemy.kungfuAttackLock = [0, 48, 60, 90][ironMountain];
            enemy.ironMountainCooldown = 300;
            this.addEffect({ type: 'ironMountain', x: enemy.x, y: enemy.y, life: 20, maxLife: 20 });
          }
          const overclock = upgradePower(this.player.build.passives.overclock || 0);
          enemy.kungfuHitCooldown = Math.max(2, 4 - Math.floor(overclock / 2));
        }
        else if (!kungfu && this.player.invincible <= 0) this.hitPlayer(this.endlessDamage(enemyDamage(enemy.type)));
      }
    }
  }

  updateKungfuCollisionOnly() {
    if (this.player?.pilotId !== 'kungfu') return;
    const fistPower = upgradePower(this.player.build.primaryLevel);
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.y + enemy.radius < 0 || (enemy.kungfuHitCooldown || 0) > 0) continue;
      const rr = enemy.radius + this.player.radius + fistPower * 1.2;
      if (distanceSq(enemy, this.player) >= rr * rr) continue;
      const ironMountain = this.player.build.secondaries.ironMountain || 0;
      const taiji = Boolean(this.player.build.fusions?.taijiMaster);
      const fistDamage = 2.4 * (1 + KUNGFU_FIST_DAMAGE_BONUS[this.player.build.primaryLevel] / 100);
      const collisionSource = taiji ? 'pilot:功夫｜撞擊傷害(太極宗)' : ironMountain ? 'pilot:功夫｜撞擊傷害(鐵山靠)' : 'pilot:功夫｜撞擊傷害';
      this.damageEnemy(enemy, this.rollDamage(fistDamage * [1, 1.3, 1.55, 1.85][ironMountain]), true, collisionSource);
      enemy.kungfuHitCooldown = 4;
    }
  }

  updateMidboss(enemy) {
    const motionScale = enemy.motionScale || 1;
    if (!enemy.orbiting) {
      enemy.y = Math.min(145, enemy.y + 1.15 * motionScale);
      if (enemy.y >= 145) {
        enemy.orbiting = true;
        enemy.orbitAge = 0;
        enemy.orbitCenterX = enemy.x;
      }
    } else {
      enemy.orbitAge += motionScale;
      enemy.x = enemy.orbitCenterX + Math.sin(enemy.orbitAge / 42) * 118;
      enemy.y = 145 + Math.sin(enemy.orbitAge / 31) * 12;
    }
    if (!(enemy.kungfuAttackLock > 0)) {
      enemy.cooldown -= motionScale;
      if (enemy.y >= 80 && enemy.cooldown <= 0) {
        this.midbossAttack(enemy);
        enemy.cooldown = Math.max(52, 98 / this.activeStage().fireRate);
      }
    }
  }

  midbossAttack(enemy) {
    const speed = (1.55 + this.stageIndex * .1) * this.activeStage().bulletSpeed;
    if (this.stageIndex === 0) {
      for (let shot = -3; shot <= 3; shot += 1) this.aim(enemy, speed, shot * .13);
    } else if (this.stageIndex === 1) {
      for (let turret = -1; turret <= 1; turret += 1) {
        const x = enemy.x + turret * 34;
        for (let shot = -1; shot <= 1; shot += 1) this.aimFrom(x, enemy.y + 7, speed * .94, shot * .13 + turret * .025, enemy.color, 10);
      }
    } else if (this.stageIndex === 2) {
      for (const x of [enemy.x - 36, enemy.x + 36]) {
        for (let shot = -1; shot <= 1; shot += 1) this.aimFrom(x, enemy.y, speed, shot * .14, enemy.color, 10);
      }
    } else if (this.stageIndex === 3) {
      for (let shot = 0; shot < 14; shot += 1) {
        const angle = shot / 14 * TAU + enemy.age * .018;
        this.addEnemyBullet(enemy.x, enemy.y, Math.cos(angle) * speed * .7, Math.sin(angle) * speed * .7, 5, enemy.color, 360, 0, 10);
      }
    } else {
      for (const x of [-36, this.w + 36]) {
        for (let row = 0; row < 4; row += 1) this.addEnemyBullet(x, 170 + row * 88, x < this.w / 2 ? speed * .82 : -speed * .82, speed * .58, 5, '#c084fc', 360, 30, 10);
      }
    }
    this.sound('enemy');
  }

  enemyCooldown(enemy) {
    const stage = this.activeStage();
    const base = enemy.type === 'elite' ? 70 : enemy.type === 'gunship' ? 92 : 115;
    return Math.max(28, base / stage.fireRate / enemy.pressure + rand(-12, 16));
  }

  addEnemyBullet(x, y, vx, vy, radius = 5, color = '#ff6b6b', life = 360, entryGrace = 0, damage = 5) {
    if (this.enemyBullets.length >= WORLD.maxEnemyBullets) return false;
    this.enemyBullets.push({ x, y, vx, vy, radius, color, life, entryGrace, damage: this.endlessDamage(damage) });
    return true;
  }

  aim(enemy, speed, angleOffset = 0) {
    this.aimFrom(enemy.x, enemy.y, speed, angleOffset, enemy.color, enemyDamage(enemy.type));
  }

  aimFrom(x, y, speed, angleOffset = 0, color = '#ff6b6b', damage = 5) {
    const angle = Math.atan2(this.player.y - y, this.player.x - x) + angleOffset;
    this.addEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 4.5, color, 360, 0, damage);
  }

  enemyShoot(enemy) {
    const stage = this.activeStage();
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
    const motionScale = boss.motionScale || 1;
    if (!boss.orbiting) {
      boss.y = Math.min(118, boss.y + 1.35 * motionScale);
      if (boss.y >= 118) {
        boss.orbiting = true;
        boss.arriving = false;
        boss.orbitAge = 0;
        boss.orbitCenterX = boss.x;
      }
    } else {
      boss.orbitAge += motionScale;
      boss.x = boss.orbitCenterX + Math.sin(boss.orbitAge / (50 - this.stageIndex * 3)) * (105 + this.stageIndex * 8);
      boss.y = 118 + Math.sin(boss.orbitAge / 37) * 22;
    }
    const ratio = boss.hp / boss.maxHp;
    const phase = ratio > .67 ? 0 : ratio > .34 ? 1 : 2;
    if (phase !== boss.phase) {
      boss.phase = phase;
      boss.cooldown = 45;
      this.player.invincible = Math.max(this.player.invincible, 30);
      this.announce(`PHASE ${phase + 1}`, BOSSES[boss.bossId].phases[phase].toUpperCase(), 950);
      this.spawnBurst(boss.x, boss.y, 24, boss.color);
    }
    if (!(boss.kungfuAttackLock > 0)) {
      boss.cooldown -= motionScale;
      if (boss.y >= 105 && boss.cooldown <= 0) {
        this.bossAttack(boss);
        boss.cooldown = Math.max(24, (90 - phase * 14 - this.stageIndex * 5) / this.activeStage().fireRate);
      }
    }
  }

  bossAttack(boss) {
    const s = this.activeStage();
    const speed = (1.75 + boss.phase * .22) * s.bulletSpeed;
    const radial = (count, bulletSpeed, offset = 0, skip = () => false) => {
      for (let n = 0; n < count; n += 1) { if (skip(n)) continue; const a = n / count * TAU + offset; this.addEnemyBullet(boss.x, boss.y, Math.cos(a) * bulletSpeed, Math.sin(a) * bulletSpeed, 5, boss.color, 360, 0, 10); }
    };
    if (boss.bossId === 'manta') {
      for (let n = -3; n <= 3; n += 1) this.aim(boss, speed, n * .13);
      if (boss.phase >= 1) radial(10, speed * .88, boss.age * .025);
      if (boss.phase >= 2) for (let x = 25; x < this.w; x += 42) if (Math.abs(x - this.player.x) > 45) this.addEnemyBullet(x, boss.y + 12, 0, speed * 1.28, 5.5, '#ff3158', 360, 0, 10);
    } else if (boss.bossId === 'carrier') {
      for (let turret = -1; turret <= 1; turret += 1) {
        const x = boss.x + turret * 42;
        for (let shot = -1; shot <= 1; shot += 1) this.aimFrom(x, boss.y + 9, speed * .96, shot * .13 + turret * .025, boss.color, 10);
      }
      if (boss.phase >= 1) radial(12, speed * .58, boss.age * .01);
      if (boss.phase >= 2) { for (let i = 0; i < 2; i += 1) this.spawnEnemy('striker', boss.x + (i ? 55 : -55), boss.y + 20, 1.25, 2, i); for (let n = -3; n <= 3; n += 1) this.aim(boss, speed, n * .16); }
    } else if (boss.bossId === 'seraph') {
      for (const x of [boss.x - 42, boss.x + 42]) for (let n = -1; n <= 1; n += 1) this.aim({ ...boss, x }, speed, n * .14);
      if (boss.phase >= 1) radial(16, speed * .78, boss.age * .055);
      if (boss.phase >= 2) { this.aim(boss, speed * 1.75); this.aim(boss, speed * 1.25, -.09); this.aim(boss, speed * 1.25, .09); }
    } else if (boss.bossId === 'leviathan') {
      radial(14, speed * .7, Math.sin(boss.age / 30));
      if (boss.phase >= 1) for (let n = 0; n < 5; n += 1) this.aim(boss, speed * rand(.72, 1.12), rand(-.45, .45));
      if (boss.phase >= 2) radial(22, speed, boss.age * .02, n => n % 11 === 5 || n % 11 === 6);
    } else {
      const gateTop = 145 + Math.sin(boss.age * .055) * 75;
      for (const x of [-36, this.w + 36]) for (let n = 0; n < 4; n += 1) this.addEnemyBullet(x, gateTop + n * 110, x < this.w / 2 ? speed * .9 : -speed * .9, speed * .62, 5, '#c084fc', 360, 30, 10);
      if (boss.phase >= 1) radial(20, speed * .82, boss.age * .075);
      if (boss.phase >= 2) { radial(28, speed * 1.05, boss.age * .028, n => n >= 12 && n <= 15); this.aim(boss, speed * 1.7); }
    }
    this.sound('enemy');
  }

  updateEnemyBullets() {
    const canHitPlayer = this.player.invincible <= 0;
    let playerHitDamage = 0;
    for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.enemyBullets[i];
      const enemyTimeScale = this.enemyTimeScale || 1;
      bullet.x += bullet.vx * enemyTimeScale; bullet.y += bullet.vy * enemyTimeScale; bullet.life -= enemyTimeScale;
      const rr = bullet.radius + this.player.hitRadius;
      if (canHitPlayer && distanceSq(bullet, this.player) < rr * rr) { this.enemyBullets.splice(i, 1); playerHitDamage = Math.max(playerHitDamage, bullet.damage || 5); continue; }
      const scale = this.player.scale || 1;
      const hullDx = bullet.x - this.player.x;
      const hullDy = bullet.y - (this.player.y + 4 * scale);
      const hullContact = (hullDx / (30 * scale + bullet.radius)) ** 2 + (hullDy / (36 * scale + bullet.radius)) ** 2 <= 1;
      if (canHitPlayer && this.player.pilotId === 'gambler' && !bullet.grazed && hullContact) {
        bullet.grazed = true;
        this.player.grazeBonus += .01;
        this.player.build.revision += 1;
        this.addEffect({ type: 'floatingText', x: this.player.x, y: this.player.y - 28, text: `+${Math.round(this.player.grazeBonus * 100)}%`, color: '#4cff9b', life: 40, maxLife: 40 });
      }
      if (bullet.entryGrace > 0) bullet.entryGrace -= 1;
      else if (shouldCullEnemyBullet(bullet, this.w, this.h)) this.enemyBullets.splice(i, 1);
    }
    if (playerHitDamage > 0) this.hitPlayer(playerHitDamage);
  }

  recordDamage(amount, source = 'other:其他傷害') {
    if (!(amount > 0)) return;
    this.damageTotal += amount;
    this.stageDamageTotal += amount;
    this.damageLog.push({ frame: this.runFrames, amount });
    const key = typeof source === 'string' && source.includes(':') ? source : 'other:其他傷害';
    this.damageSources[key] = (this.damageSources[key] || 0) + amount;
    this.damageHits[key] = (this.damageHits[key] || 0) + 1;
    this.updateDps();
  }

  damageReviewMarkup() {
    const categoryNames = { primary: '主武器', secondary: '副武器', pilot: '駕駛員被動', other: '其他' };
    const entries = Object.entries(this.damageSources || {}).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    if (!entries.length) return '<p class="damage-empty">本場尚無有效傷害紀錄。</p>';
    const groups = {};
    for (const [key, value] of entries) {
      const [rawCategory, ...labelParts] = key.split(':');
      const category = rawCategory === 'fusion' ? 'secondary' : rawCategory;
      (groups[category] ||= []).push({ label: labelParts.join(':') || '其他傷害', value, hits: this.damageHits?.[key] || 1 });
    }
    const order = ['primary', 'secondary', 'pilot', 'other'];
    const sections = order.filter(category => groups[category]?.length).map(category => {
      const rows = groups[category];
      const subtotal = rows.reduce((sum, row) => sum + row.value, 0);
      const subtotalShare = subtotal / total * 100;
      return `<section class="damage-group"><header class="damage-group-head"><div><h3>${categoryNames[category] || category}</h3><small>${subtotalShare.toFixed(1)}% of total</small></div><b>${Math.round(subtotal).toLocaleString()}</b></header><div class="damage-table-head"><span>傷害來源</span><span>總傷害</span><span>占比</span><span>命中</span><span>平均</span></div>${rows.map(row => { const share = row.value / total * 100; return `<div class="damage-row"><div class="damage-source"><span>${row.label}</span><i style="--damage-share:${Math.max(2, share)}%"></i></div><b>${Math.round(row.value).toLocaleString()}</b><small>${share.toFixed(1)}%</small><small>${row.hits.toLocaleString()}</small><small>${Math.round(row.value / Math.max(1, row.hits)).toLocaleString()}</small></div>`; }).join('')}</section>`;
    }).join('');
    const top = entries[0];
    const topLabel = top[0].split(':').slice(1).join(':') || '其他傷害';
    return `<div class="damage-overview"><div><small>總傷害</small><strong>${Math.round(total).toLocaleString()}</strong></div><div><small>最高傷害來源</small><strong>${topLabel}</strong></div><div><small>傷害項目</small><strong>${entries.length}</strong></div></div>${sections}`;
  }

  updateDps() {
    if (!this.dps) return;
    const elapsed = Math.max(1 / 60, this.stageFrames / 60);
    const sumWindow = seconds => this.damageLog.reduce((sum, hit) => hit.frame > this.runFrames - seconds * 60 ? sum + hit.amount : sum, 0);
    this.dps.one = sumWindow(1) / Math.min(1, elapsed);
    this.dps.ten = sumWindow(10) / Math.min(10, elapsed);
    this.dps.total = this.stageDamageTotal / elapsed;
    this.dpsBest.one = Math.max(this.dpsBest.one, this.dps.one);
    this.dpsBest.ten = Math.max(this.dpsBest.ten, this.dps.ten);
    this.dpsBest.total = Math.max(this.dpsBest.total, this.dps.total);
    this.damageLog = this.damageLog.filter(hit => hit.frame > this.runFrames - 600);
  }

  damageEnemy(enemy, damage, particles = true, source = null, damageType = null, typeCoreEligible = true) {
    if (!enemy.alive) { this.pendingCriticalEffect = false; this.pendingSupportEffect = false; return; }
    if (enemy.y + enemy.radius < 0) { this.pendingCriticalEffect = false; this.pendingSupportEffect = false; return; }
    if (enemy.type === 'midboss' && !enemy.orbiting) { this.pendingCriticalEffect = false; this.pendingSupportEffect = false; return; }
    if (enemy.type === 'boss' && enemy.arriving) { this.pendingCriticalEffect = false; this.pendingSupportEffect = false; return; }
    // 暴擊矩陣：只顯示獨立的 CRIT! 文字脈衝。
    if (this.pendingCriticalEffect) {
      this.addEffect({ type: 'criticalHit', x: enemy.x, y: enemy.y - enemy.radius * .35, life: 24, maxLife: 24 });
    }
    // 火力支援：黃色擴散環搭配白／黃／橘火花，與暴擊特效明確區隔。
    if (this.pendingSupportEffect) {
      this.addEffect({ type: 'ring', x: enemy.x, y: enemy.y, radius: 4, maxRadius: Math.max(28, enemy.radius + 22), life: 16, maxLife: 16, color: '#fde047' });
      this.spawnBurst(enemy.x, enemy.y, 9, ['#fff', '#fde047', '#fb923c']);
    }
    this.pendingCriticalEffect = false;
    this.pendingSupportEffect = false;
    const overdrive = this.player?.build?.overdrive || 0;
    const overdriveStep = this.player?.build?.overdriveStep ?? 1;
    const pilotMultiplier = this.player?.pilotId === 'reaper' ? 1.5 : this.player?.pilotId === 'gambler' ? 1 + (this.player.grazeBonus || 0) : 1;
    const acidMultiplier = enemy.acidTimer > 0 ? 1 + (enemy.acidAmp || 0) : 1;
    const isPrimarySource = source === 'primary' || String(source || '').startsWith('primary:');
    const metaMultiplier = (this.metaCombat?.attackMultiplier ?? 1) * (!isPrimarySource && this.player?.craft?.secondaryBoost ? 1 + this.player.craft.secondaryBoost : 1);
    const resolvedType = damageType || this.inferDamageType(source);
    const typeMultiplier = this.damageTypeMultiplier(resolvedType, typeCoreEligible);
    const siegeMultiplier = enemy.type === 'boss' ? [1, 1.15, 1.20, 1.25][this.passiveRank('siege')] : 1;
    const soulTaken = isPrimarySource && this.player?.pilotId === 'reaper' && enemy.type !== 'boss' && enemy.type !== 'midboss' && Math.random() < (this.player.build.soulTaker || 1) / 100;
    const adjustedDamage = soulTaken ? Math.max(enemy.hp, 0) : damage * STAT_SCALE * (1 + overdrive * overdriveStep / 100) * pilotMultiplier * acidMultiplier * metaMultiplier * typeMultiplier * siegeMultiplier;
    const immortal = Boolean(this.testFlags?.enemiesImmortal);
    this.recordDamage(immortal ? adjustedDamage : Math.min(adjustedDamage, Math.max(0, enemy.hp)), source || 'other:其他傷害');
    enemy.hp = immortal ? Math.max(1, enemy.hp - adjustedDamage) : enemy.hp - adjustedDamage;
    if (particles && isLargeEnemyType(enemy.type)) enemy.hitFlash = 4;
    else if (particles) this.spawnBurst(enemy.x, enemy.y, 2, enemy.color);
    if (soulTaken) {
      this.addEffect({ type: 'floatingText', x: enemy.x, y: enemy.y - enemy.radius, text: 'SOUL TAKEN', color: '#c084fc', life: 45, maxLife: 45 });
      this.spawnBurst(enemy.x, enemy.y, 18, '#c084fc');
    }
    if (!immortal && enemy.hp <= 0) this.killEnemy(enemy);
  }

  areaDamage(x, y, radius, damage, ignoredId = null, source = null) {
    radius *= this.fieldMultiplier();
    const r2 = radius * radius;
    const payload = upgradePower(this.passiveRank('payload'));
    const boostedDamage = damage * (1 + payload * .06);
    for (const enemy of this.enemies) {
      const dx = enemy.x - x; const dy = enemy.y - y;
      if (enemy.alive && enemy.id !== ignoredId && dx * dx + dy * dy <= r2) this.damageEnemy(enemy, boostedDamage, false, source, 'area', true);
    }
    this.addEffect({ type: 'ring', x, y, radius: 3, maxRadius: radius, life: 14, maxLife: 14, color: '#ffd166' });
  }

  triggerThunderHammer(x, y, radius, damage, ignoredId = null, source = null) {
    radius *= this.fieldMultiplier();
    const r2 = radius * radius;
    for (const enemy of this.enemies) {
      const dx = enemy.x - x; const dy = enemy.y - y;
      if (enemy.alive && enemy.id !== ignoredId && dx * dx + dy * dy <= r2) this.damageEnemy(enemy, damage, false, source, 'area', true);
    }
    this.addEffect({ type: 'hammer', x, y, radius: 8, maxRadius: radius, life: 18, maxLife: 18, color: '#7dd3fc' });
    this.spawnBurst(x, y, 18, ['#fff', '#7dd3fc', '#facc15']);
  }

  killEnemy(enemy) {
    if (!enemy.alive) return;
    if (enemy.type === 'boss' && this.player?.pilotId === 'rambo') this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 2);
    if (enemy.type === 'boss' && this.runMode === 'normal' && this.stageIndex === STAGES.length - 1) {
      this.beginFinale(enemy);
      return;
    }
    enemy.alive = false;
    this.score += enemy.score;
    this.dropOre(enemy);
    this.spawnBurst(enemy.x, enemy.y, enemy.type === 'boss' ? 56 : enemy.type === 'midboss' ? 34 : enemy.type === 'elite' ? 28 : 12, enemy.color);
    this.sound(enemy.type === 'boss' ? 'bossDown' : 'boom');
    if (enemy.type === 'boss' && !enemy.escort) {
      this.oreBossBonus += ORE_STAGE_BONUS;
      if (this.player) this.player.shieldsDropped = 0;
      this.healDropsThisStage = 0;
      if (this.isEndless()) {
        this.music.stop({ duration: .38, clearDesired: true });
        this.pendingStageMusic = true;
        if (this.stageIndex >= STAGES.length - 1) { this.endlessCycle += 1; this.stageIndex = 0; }
        else this.stageIndex += 1;
        this.waveIndex = -1;
        const nextStage = STAGES[this.stageIndex];
        this.announce(`SECTOR SHIFT — ${nextStage.name}`, nextStage.subtitle, 1600);
        this.player.pendingLevels += 1;
        this.showUpgrade();
      } else {
        this.completeStage();
        this.player.pendingLevels += 1;
        this.showUpgrade();
      }
    } else {
      this.dropXp(enemy.x, enemy.y, enemy.xp);
      this.maybeDropSupply(enemy);
    }
  }

  dropOre(enemy, random = Math.random) {
    const permanentBase = ORE_BASE_VALUE + (this.metaCombat?.oreBonus ?? 0) + this.luckyOreBonus();
    const stackedBase = permanentBase + this.oreBossBonus;
    const value = oreDropFor(enemy.type, stackedBase, random, permanentBase);
    if (!value) return false;
    if (enemy.type === 'boss' || enemy.type === 'midboss') { this.collectOre(value, enemy.x, enemy.y); return true; }
    return this.addEffect({ type: 'ore', x: enemy.x, y: enemy.y, value, life: 900, radius: 7, vy: .5 });
  }

  collectOre(value, x, y) {
    this.runOre += value;
    this.addEffect({ type: 'floatingText', x, y: y - 14, text: `+${value} ◆`, color: '#67e8f9', life: 40, maxLife: 40 });
    this.updateHud();
  }

  recordCodex(id) {
    if (!this.meta) return;
    if (!Array.isArray(this.meta.codex)) this.meta.codex = [];
    if (this.meta.codex.includes(id)) return;
    this.meta.codex.push(id);
    saveMetaState(this.meta);
  }

  bankOre(clearBonus = 0) {
    if (this.oreBanked) return 0;
    this.oreBanked = true;
    const settlement = this.oreSettlement(clearBonus);
    this.lastOreSettlement = settlement;
    if (this.maxMode || this.runMode === 'test' || settlement.total <= 0) return settlement.total;
    this.meta.ore += settlement.total;
    saveMetaState(this.meta);
    return settlement.total;
  }

  beginFinale(enemy) {
    enemy.alive = false;
    this.score += enemy.score;
    this.dropOre(enemy);
    this.oreBossBonus += ORE_STAGE_BONUS;
    this.mode = 'finale';
    this.enemyBullets = [];
    this.playerBullets = [];
    this.finaleTimer = 200;
    this.finaleFlash = 0;
    this.finaleCenter = { x: enemy.x, y: enemy.y, color: enemy.color };
    this.spawnBurst(enemy.x, enemy.y, 24, enemy.color);
    this.announce('CORE COLLAPSE', 'FINAL DETONATION', 2200);
  }

  updateFinale() {
    this.finaleTimer -= 1;
    this.updatePlayer(true);
    this.updateEffects();
    const center = this.finaleCenter;
    if (this.finaleTimer > 28 && this.finaleTimer % 12 === 0) {
      const x = center.x + rand(-58, 58); const y = center.y + rand(-46, 46);
      this.spawnBurst(x, y, 18, choose(['#fff', '#ffd166', center.color]));
      this.addEffect({ type: 'ring', x, y, radius: 4, maxRadius: rand(28, 58), life: 16, maxLife: 16, color: '#fff' });
      this.finaleFlash = Math.max(this.finaleFlash, .16);
      this.sound('boom');
    }
    if (this.finaleTimer === 28) {
      this.spawnBurst(center.x, center.y, 120, ['#fff', '#ffd166', '#ff3158']);
      this.addEffect({ type: 'ring', x: center.x, y: center.y, radius: 8, maxRadius: 520, life: 30, maxLife: 30, color: '#fff' });
      this.finaleFlash = 1;
      this.sound('bossDown');
    }
    this.finaleFlash = Math.max(0, this.finaleFlash - .035);
    this.updateHud();
    if (this.finaleTimer <= 0) this.endRun(true);
  }

  maybeDropSupply(enemy, random = Math.random) {
    const fieldSupplies = new Set(this.effects.filter(effect => effect.type === 'supply').map(effect => effect.supply));
    const needsHeal = this.player.hp < this.player.maxHp && this.healDropsThisStage < 2 && !fieldSupplies.has('heal');
    const needsBomb = this.player.bombs < this.player.maxBombs && !fieldSupplies.has('bomb');
    const needsShield = this.player.shield < 1 && this.player.shieldsDropped < 2 && !fieldSupplies.has('shield');
    if (!needsHeal && !needsBomb && !needsShield) return false;
    const salvage = upgradePower(this.passiveRank('salvage'));
    const baseChance = { scout: .006, striker: .008, gunship: .012, elite: .035, midboss: .06 }[enemy.type] || .006;
    const shieldBoost = needsShield ? .02 : 0;
    const kungfuHealBoost = this.player.pilotId === 'kungfu' && needsHeal ? .22 : 0;
    if (random() >= Math.min(kungfuHealBoost ? .38 : .14, baseChance + salvage * .004 + shieldBoost + kungfuHealBoost)) return false;
    const candidates = [];
    if (needsHeal) candidates.push('heal', 'heal', ...(this.player.pilotId === 'kungfu' ? ['heal', 'heal', 'heal', 'heal'] : []));
    if (needsBomb) candidates.push('bomb');
    if (needsShield) candidates.push('shield', 'shield');
    const supply = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    if (this.effects.length >= WORLD.maxEffects) {
      const visualIndex = this.effects.findIndex(effect => effect.type !== 'supply');
      if (visualIndex < 0) return false;
      this.effects.splice(visualIndex, 1);
    }
    const dropped = this.addEffect({ type: 'supply', x: enemy.x, y: enemy.y, supply, life: 520, radius: 16 });
    if (dropped && supply === 'shield') this.player.shieldsDropped += 1;
    if (dropped && supply === 'heal') this.healDropsThisStage += 1;
    return dropped;
  }

  supplyStyle(type) {
    if (type === 'heal') return { color: '#4cff9b', label: '+' };
    if (type === 'shield') return { color: '#c084fc', label: '◇' };
    return { color: '#ffd166', label: 'B' };
  }

  xpOrbStyle(value) {
    if (value >= 200) return { color: '#ff72f1', glow: 'rgba(255,114,241,.24)', radius: 8 };
    if (value >= 80) return { color: '#ffd166', glow: 'rgba(255,209,102,.22)', radius: 6.5 };
    if (value >= 30) return { color: '#42e8ff', glow: 'rgba(66,232,255,.2)', radius: 5 };
    return { color: '#4cff9b', glow: 'rgba(76,255,155,.18)', radius: 4 };
  }

  dropXp(x, y, value) {
    const values = splitXpValue(xpValueForStage(value, this.xpStageIndex()));
    for (const orbValue of values) {
      if (this.xpOrbs.length >= WORLD.maxXp) {
        const orb = choose(this.xpOrbs);
        orb.value += orbValue;
        Object.assign(orb, this.xpOrbStyle(orb.value));
        continue;
      }
      const style = this.xpOrbStyle(orbValue);
      this.xpOrbs.push({ x, y, vx: 0, vy: 0, attracting: false, value: orbValue, radius: style.radius, color: style.color, glow: style.glow, life: 1600 });
    }
  }

  updateXpOrbs() {
    if (!this.player) return;
    const magnet = upgradePower(this.passiveRank('magnet'));
    // Base pull matches former magnet lv1 (72); lv3 (power 5) still reaches 192.
    const range = 72 + magnet * 24;
    for (let i = this.xpOrbs.length - 1; i >= 0; i -= 1) {
      const orb = this.xpOrbs[i];
      const dx = this.player.x - orb.x;
      const dy = this.player.y - orb.y;
      const d2 = dx * dx + dy * dy;
      if (!orb.attracting) {
        orb.y += this.worldScrollSpeed();
      }
      if (d2 < range * range || orb.attracting || this.mode === 'stageClear') {
        orb.attracting = true;
        const distance = Math.max(1, Math.sqrt(d2));
        const speed = Math.min(9 + magnet * .8, Math.max(2.45 + magnet * .28, distance * .12));
        orb.x += dx / distance * speed;
        orb.y += dy / distance * speed;
      }
      orb.life -= 1;
      if (d2 < (orb.radius + this.player.hitRadius + 8) ** 2) { this.grantXp(orb.value); this.xpOrbs.splice(i, 1); this.sound('xp'); }
      else if (orb.life <= 0) this.xpOrbs.splice(i, 1);
    }
  }

  grantXp(amount, defer = false) {
    if (!this.player) return;
    const harvester = upgradePower(this.passiveRank('harvester'));
    this.player.xp += Math.max(1, Math.round(amount * (1 + harvester * .08) * (this.metaCombat?.xpMultiplier ?? 1)));
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
    if (this.mode === 'levelup') return;
    this.upgradeReturnMode = this.mode;
    const choiceCount = 3;
    const skillPool = makeUpgradeChoices(this.player.build, Math.random, choiceCount);
    const firepower = skillPool.find(choice => choice.id === 'overdrive-boost');
    const pilotOverclocks = skillPool.filter(choice => ['evasion-boost', 'soul-taker-boost', 'battlefield-cleanup-boost'].includes(choice.id));
    const normalSkills = skillPool.filter(choice => choice.id !== 'overdrive-boost' && !pilotOverclocks.includes(choice));
    this.currentChoices = [...(firepower ? [firepower] : []), ...pilotOverclocks, ...normalSkills].slice(0, choiceCount);
    const repairAmount = this.repairAmount();
    const supplies = [];
    if (this.player.hp < this.player.maxHp) supplies.push({ id: 'repair', category: 'supply', icon: '✚', name: '緊急維修', description: `恢復 ${repairAmount} 點生命。` });
    if (this.player.bombs < this.player.maxBombs) supplies.push({ id: 'bomb', category: 'supply', icon: '◈', name: '炸彈補給', description: '補充 1 枚炸彈。' });
    // 補給只填補一般技能不足的空位；順序固定為一般技能、治療、炸彈。
    for (const supply of supplies) {
      if (this.currentChoices.length >= choiceCount) break;
      this.currentChoices.push(supply);
    }
    // 若沒有任何一般技能，仍保證受傷時能看到治療，其次才是炸彈。
    if (!this.currentChoices.length && supplies.length) this.currentChoices = supplies.slice(0, choiceCount);
    const skillChoices = this.currentChoices.filter(choice => choice.category !== 'supply');
    // 只有畫面上真正只剩火力超頻一項時才自動選擇；
    // 只要有治療或炸彈補給，就必須開啟升級畫面讓玩家選擇。
    if (this.currentChoices.length === 1 && skillChoices.length === 1 && skillChoices[0].id === 'overdrive-boost') {
      this.addEffect({ type: 'floatingText', x: this.player.x, y: this.player.y - 34, text: `火力超頻 +${this.player.build.overdriveStep ?? 1}%`, color: '#ffd166', life: 70, maxLife: 70 });
      this.chooseUpgrade(this.currentChoices.indexOf(skillChoices[0]), true);
      return;
    }
    if (this.player.pilotId === 'joker' && skillChoices.length) {
      const choice = choose(skillChoices);
      this.addEffect({ type: 'floatingText', x: this.player.x, y: this.player.y - 34, text: `RANDOM · ${choice.name}`, color: '#c084fc', life: 70, maxLife: 70 });
      this.chooseUpgrade(this.currentChoices.indexOf(choice), true);
      return;
    }
    this.mode = 'levelup';
    this.pointer.active = false;
    this.keys.clear();
    const isStarterUpgrade = this.upgradeReturnMode === 'stageIntro' && this.player.level === 1;
    this.dom['upgrade-kicker'].textContent = isStarterUpgrade ? 'PRE-FLIGHT UPGRADE' : 'LEVEL UP';
    this.dom['upgrade-title'].textContent = isStarterUpgrade ? '選擇開局強化' : '選擇一項強化';
    const holder = this.dom['upgrade-options']; holder.textContent = '';
    this.currentChoices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'upgrade-card';
      const current = choice.category === 'secondary' ? this.player.build.secondaries[choice.id] || 0 : choice.category === 'passive' ? this.player.build.passives[choice.id] || 0 : choice.category === 'overdrive' ? this.player.build.overdrive || 0 : choice.category === 'evasion' ? this.player.build.evasion ?? 20 : choice.category === 'soulTaker' ? this.player.build.soulTaker || 1 : choice.category === 'battlefieldCleanup' ? this.player.build.battlefieldCleanup || 0 : choice.id === 'primary' ? this.player.build.primaryLevel : 0;
      const next = current + 1 >= WORLD.maxUpgradeRank && ['primary', 'secondary', 'passive'].includes(choice.category) ? 'MAX' : current + 1;
      const progress = choice.category === 'overdrive' ? `火力 +${current * (this.player.build.overdriveStep ?? 1)}% → +${(current + 1) * (this.player.build.overdriveStep ?? 1)}%` : choice.category === 'evasion' ? `${current}% → ${Math.min(30, current + 2)}%` : choice.category === 'soulTaker' ? `${current}% → ${Math.min(5, current + .5)}%` : choice.category === 'battlefieldCleanup' ? `+${current}% → +${current + 1}%` : choice.category === 'fusion' ? 'FUSION · UNLOCK' : `LV ${current} → ${next}`;
      button.innerHTML = `<span class="upgrade-icon" aria-hidden="true">${skillIconMarkup(choice.icon)}</span><span class="key">${index + 1}</span><small>${choice.category.toUpperCase()} · ${progress}</small><strong>${choice.name}</strong><p>${choice.description}</p>`;
      button.addEventListener('click', () => this.chooseUpgrade(index));
      holder.append(button);
    });
    this.dom['upgrade-overlay'].classList.remove('hidden');
    this.sound('level');
  }

  chooseUpgrade(index, preserveInput = false) {
    if ((!preserveInput && this.mode !== 'levelup') || !this.currentChoices?.[index]) return;
    const choice = this.currentChoices[index];
    const p = this.player;
    if (choice.id === 'overdrive-boost') p.build.overdrive = (p.build.overdrive || 0) + 1;
    else if (choice.id === 'evasion-boost') p.build.evasion = Math.min(30, (p.build.evasion ?? 20) + 2);
    else if (choice.id === 'soul-taker-boost') p.build.soulTaker = Math.min(5, (p.build.soulTaker || 1) + .5);
    else if (choice.id === 'battlefield-cleanup-boost') p.build.battlefieldCleanup = (p.build.battlefieldCleanup || 0) + 1;
    else if (choice.category === 'fusion') {
      const fusion = FUSIONS[choice.id];
      p.build.fusions[choice.id] = true;
      for (const id of fusion.requires) {
        delete p.build.secondaries[id];
        delete p.secondaryCooldowns[id];
      }
      for (const id of fusion.consumesSecondaries || []) {
        delete p.build.secondaries[id];
        delete p.secondaryCooldowns[id];
      }
      for (const id of fusion.requiresPassives || []) delete p.build.passives[id];
      if (choice.id === 'seekerOrbitPlus') delete p.build.fusions.seekerOrbit;
      if (choice.id === 'world') { this.worldCooldown = 600; this.worldFreezeTimer = 0; }
      if (choice.id === 'suicideSquad') {
        const previous = p.maxBombs;
        p.maxBombs = Math.min(5, 3 + 2) + (p.pilotId === 'rambo' ? 1 : 0);
        p.bombs = Math.min(p.maxBombs, p.bombs + Math.max(0, p.maxBombs - previous));
      }
    }
    else if (choice.id === 'primary') {
      p.build.primaryLevel = Math.min(WORLD.maxUpgradeRank, p.build.primaryLevel + 1);
      if (p.pilotId === 'kungfu') for (const id of Object.keys(p.build.secondaries)) p.build.secondaries[id] = p.build.primaryLevel;
    }
    else if (choice.category === 'secondary') {
      const item = this.secondaryCatalog(p)[choice.id];
      p.build.secondaries[choice.id] = p.pilotId === 'kungfu' ? Math.min(item.max, p.build.primaryLevel) : Math.min(item.max, (p.build.secondaries[choice.id] || 0) + 1);
    }
    else if (choice.category === 'passive') {
      p.build.passives[choice.id] = Math.min(PASSIVES[choice.id].max, (p.build.passives[choice.id] || 0) + 1);
      if (choice.id === 'armor') { const previous = p.maxHp; p.maxHp = this.calculateMaxHp(p.craft, p.pilotId, p.build.passives.armor); p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - previous)); }
      if (choice.id === 'bombcap') { const previous = p.maxBombs; p.maxBombs = Math.min(5, 3 + Math.max(0, p.build.passives.bombcap - 1)) + (p.craft.bombCapBonus || 0) + (p.pilotId === 'rambo' ? 1 : 0); p.bombs = Math.min(p.maxBombs, p.bombs + Math.max(0, p.maxBombs - previous)); }
    } else if (choice.id === 'repair') p.hp = Math.min(p.maxHp, p.hp + this.repairAmount());
    else if (choice.id === 'bomb') p.bombs = Math.min(p.maxBombs, p.bombs + 1);
    else this.score += 2500;
    if (choice.category === 'fusion') this.recordCodex(`fusion:${choice.id}`);
    else if (choice.category === 'secondary') this.recordCodex(`secondary:${choice.id}`);
    else if (choice.category === 'passive') this.recordCodex(`passive:${choice.id}`);
    p.build.revision += 1;
    p.pendingLevels -= 1;
    if (p.pilotId === 'joker' && choice.category !== 'supply') {
      if (!this.jokerBonusPick && Math.random() < .2) {
        this.jokerBonusPick = true;
        p.pendingLevels += 1;
        this.addEffect({ type: 'floatingText', x: p.x, y: p.y - 50, text: 'JOKER BONUS', color: '#c084fc', life: 70, maxLife: 70 });
      } else {
        this.jokerBonusPick = false;
      }
    }
    if (!preserveInput) {
      p.inputLock = 18;
      this.pointer.active = false;
      this.keys.clear();
      p.invincible = Math.max(p.invincible, 45);
    }
    this.dom['upgrade-overlay'].classList.add('hidden');
    const leavingPreflight = this.upgradeReturnMode === 'stageIntro' && this.runFrames === 0 && this.stageIndex === 0;
    const resumeStageMusic = leavingPreflight || this.pendingStageMusic;
    this.pendingStageMusic = false;
    this.mode = this.upgradeReturnMode || 'playing';
    if (resumeStageMusic) this.music.scene('stage', { fadeOut: .32, fadeIn: .60, restart: true });
    if (this.mode === 'stageClear') {
      this.transitionTimer = 90;
      this.transitionDeadline = performance.now() + 1500;
    }
    this.updateHud();
    if (p.pendingLevels > 0) setTimeout(() => this.showUpgrade(), 100);
  }

  updateEffects() {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      if (effect.type === 'bombard') {
        effect.timer -= 1;
        if (effect.timer > 0) continue;

        if (!effect.firing) {
          const target = this.enemies.find(enemy => enemy.id === effect.targetId && enemy.alive);
          effect.endX = target ? target.x + (effect.targetOffsetX || 0) : effect.startX;
          effect.endY = target ? target.y : effect.startY;
          effect.firing = true;
          effect.shotIndex = 0;
        }

        const progress = effect.shotCount <= 1 ? 1 : effect.shotIndex / (effect.shotCount - 1);
        const shotX = effect.startX + (effect.endX - effect.startX) * progress;
        const shotY = effect.startY + (effect.endY - effect.startY) * progress;

        this.areaDamage(shotX, shotY, effect.radius, effect.damage, null, effect.damageSource || 'secondary:轟炸莢艙');
        this.spawnBurst(shotX, shotY, 22, '#fb923c');
        effect.shotIndex += 1;

        if (effect.shotIndex >= effect.shotCount) this.effects.splice(i, 1);
        else effect.timer = effect.shotInterval;
      } else if (effect.type === 'gravity') {
        effect.timer -= 1; effect.pulse += 1;
        for (const enemy of this.enemies) {
          if (!enemy.alive || enemy.type === 'boss' || (enemy.type === 'midboss' && !enemy.orbiting)) continue;
          const d2 = distanceSq(effect, enemy);
          if (d2 > effect.radius ** 2) continue;
          if (effect.blackHole) {
            enemy.acidTimer = Math.max(enemy.acidTimer || 0, 90);
            enemy.acidAmp = Math.max(enemy.acidAmp || 0, .4);
          }
          enemy.x += (effect.x - enemy.x) * .035;
          enemy.y += (effect.y - enemy.y) * .02;
        }
        if (effect.blackHole) {
          for (let b = this.enemyBullets.length - 1; b >= 0; b -= 1) {
            const bullet = this.enemyBullets[b];
            const d2 = distanceSq(effect, bullet);
            if (d2 > effect.radius ** 2) continue;
            bullet.x += (effect.x - bullet.x) * .16;
            bullet.y += (effect.y - bullet.y) * .16;
            if (distanceSq(effect, bullet) < 20 ** 2) {
              this.spawnBurst(bullet.x, bullet.y, 1, '#a3e635');
              this.enemyBullets.splice(b, 1);
            }
          }
        }
        if (effect.pulse % 12 === 0) this.areaDamage(effect.x, effect.y, effect.radius, effect.damage, null, effect.damageSource || (effect.blackHole ? 'fusion:黑洞' : 'secondary:微型重力井'));
        if (effect.timer <= 0) this.effects.splice(i, 1);
      } else if (effect.type === 'lanceOrbit') {
        effect.life -= 1; effect.angle += .035;
        effect.x = this.player.x + Math.cos(effect.angle) * 42;
        effect.y = this.player.y + Math.sin(effect.angle) * 24;
        for (const enemy of this.enemies) {
          if (enemy.alive && enemy.y < effect.y && Math.abs(enemy.x - effect.x) <= enemy.radius + 4.5) this.damageEnemy(enemy, .275, false, 'fusion:貫通光環');
        }
        if (effect.life <= 0) this.effects.splice(i, 1);
      } else if (effect.type === 'prismSatellite') {
        effect.life -= 1; effect.angle += .045; effect.pulse -= 1;
        effect.x = this.player.x + Math.cos(effect.angle) * 44;
        effect.y = this.player.y + Math.sin(effect.angle) * 22;
        if (effect.pulse <= 0) {
          this.addPlayerBullet({ id: this.entityId++, x: effect.x, y: effect.y - 8, vx: 0, vy: -12.5, radius: 3.5, damage: 1.2 + effect.rank * .48, life: 90, color: '#f0abfc', kind: 'prism', pierce: 99, splash: 0, damageType: 'pierce', damageSource: 'secondary:稜鏡衛星' });
          effect.pulse = Math.max(12, 25 - effect.rank * 2);
        }
        if (effect.life <= 0) this.effects.splice(i, 1);
      } else if (effect.type === 'interceptorPulse') {
        effect.timer -= 1; effect.x = this.player.x; effect.y = this.player.y;
        if (effect.timer <= 0) {
          for (let count = 0; count < effect.count; count += 1) {
            let bestIndex = -1; let bestDistance = effect.range ** 2;
            for (let bulletIndex = 0; bulletIndex < this.enemyBullets.length; bulletIndex += 1) {
              const d2 = distanceSq(effect, this.enemyBullets[bulletIndex]);
              if (d2 < bestDistance) { bestDistance = d2; bestIndex = bulletIndex; }
            }
            if (bestIndex < 0) break;
            const [bullet] = this.enemyBullets.splice(bestIndex, 1);
            this.addEffect({ type: 'ring', x: bullet.x, y: bullet.y, radius: 2, maxRadius: 22, life: 15, maxLife: 15, color: '#34d399' });
          }
          this.spawnBurst(effect.x, effect.y, 18, '#34d399');
          this.effects.splice(i, 1);
        }
      } else if (effect.type === 'supply') {
        effect.life -= 1;
        const magnet = upgradePower(this.passiveRank('magnet'));
        const dx = this.player.x - effect.x; const dy = this.player.y - effect.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < (72 + magnet * 24) ** 2 || this.mode === 'stageClear') {
          effect.attracting = true;
          const distance = Math.max(1, Math.sqrt(d2));
          const speed = Math.min(10 + magnet * .8, Math.max(2.7 + magnet * .32, distance * .14));
          effect.x += dx / distance * speed;
          effect.y += dy / distance * speed;
        } else effect.y += .65;
        if (distanceSq(effect, this.player) < 30 ** 2) {
          if (effect.supply === 'heal') {
            const healing = this.repairAmount(1);
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + healing);
            this.announce('FIELD REPAIR', `+${healing} HP`, 900);
          } else if (effect.supply === 'bomb') {
            this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 1);
            this.announce('BOMB RESTORED', '+1 BOMB', 900);
          } else {
            this.player.shield = 1;
            this.announce('PHASE SHIELD', 'BLOCKS ONE HIT', 900);
          }
          this.effects.splice(i, 1); this.sound('level'); this.updateHud();
        }
        else if (effect.life <= 0 || (!effect.attracting && effect.y > this.h + 30)) this.effects.splice(i, 1);
      } else if (effect.type === 'ore') {
        effect.life -= 1;
        const magnet = upgradePower(this.passiveRank('magnet'));
        const dx = this.player.x - effect.x; const dy = this.player.y - effect.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < (72 + magnet * 24) ** 2 || this.mode === 'stageClear') {
          effect.attracting = true;
          const distance = Math.max(1, Math.sqrt(d2));
          const speed = Math.min(10 + magnet * .8, Math.max(2.7 + magnet * .32, distance * .14));
          effect.x += dx / distance * speed;
          effect.y += dy / distance * speed;
        } else effect.y += effect.vy || .5;
        if (distanceSq(effect, this.player) < 30 ** 2) {
          this.collectOre(effect.value, effect.x, effect.y);
          this.effects.splice(i, 1); this.sound('xp'); this.updateHud();
        } else if (effect.life <= 0 || (!effect.attracting && effect.y > this.h + 30)) this.effects.splice(i, 1);
      } else if (effect.type === 'floatingText') { effect.y -= .55; effect.life -= 1; if (effect.life <= 0) this.effects.splice(i, 1); }
      else if (effect.type === 'dodgeMiss') { effect.x += effect.vx; effect.y -= .7; effect.vx *= .96; effect.life -= 1; if (effect.life <= 0) this.effects.splice(i, 1); }
      else if (effect.type === 'criticalHit') { effect.y -= .35; effect.life -= 1; if (effect.life <= 0) this.effects.splice(i, 1); }
      else { effect.life -= 1; if (effect.life <= 0) this.effects.splice(i, 1); }
    }
  }

  detonateBomb() {
    this.enemyBullets = [];
    const level = upgradePower(this.passiveRank('bombcap'));
    for (const enemy of [...this.enemies]) {
      const large = isLargeEnemyType(enemy.type);
      const ramboMultiplier = large && this.player.pilotId === 'rambo' ? 1.5 : 1;
      const damage = (large ? Math.min(enemy.maxHp * .025, 52 + level * 10) : enemy.hp / STAT_SCALE + 1) * ramboMultiplier;
      this.damageEnemy(enemy, damage, false, 'other:全畫面炸彈', 'area', false);
    }
    this.addEffect({ type: 'ring', x: this.player.x, y: this.player.y, radius: 10, maxRadius: 500, life: 42, maxLife: 42, color: '#ffd166' });
    this.spawnBurst(this.player.x, this.player.y, 90, '#ffd166');
    this.sound('bomb');
  }

  useBomb() {
    if (!this.player || this.mode !== 'playing' || this.player.bombs <= 0 || this.player.bombLock > 0 || this.player.inputLock > 0) return false;
    this.player.bombs -= 1; this.player.bombLock = 65; this.player.invincible = Math.max(this.player.invincible, 150);
    this.detonateBomb();
    navigator.vibrate?.(45);
    this.updateHud(); return true;
  }

  hitPlayer(damage = STAT_SCALE) {
    if (!this.player || this.player.invincible > 0 || this.testFlags?.playerInvincible) return;
    if (this.player.pilotId === 'kungfu' && Math.random() < (this.player.build.evasion ?? 20) / 100) {
      this.player.invincible = 18;
      this.addEffect({ type: 'kungfuDodge', x: this.player.x, y: this.player.y, life: 24, maxLife: 24 });
      this.addEffect({ type: 'dodgeMiss', x: this.player.x, y: this.player.y - 10, vx: Math.random() < .5 ? -1.7 : 1.7, life: 32, maxLife: 32 });
      this.spawnBurst(this.player.x, this.player.y, 12, '#e0f2fe');
      return;
    }
    if (this.player.pilotId === 'gambler' && this.player.grazeBonus > 0) {
      this.player.grazeBonus = 0;
      this.player.build.revision += 1;
    }
    if (this.player.shield > 0) {
      const flux = this.passiveRank('flux');
      this.player.shield = 0;
      this.player.invincible = 110;
      this.player.phaseClearTimer = flux > 0 ? 120 : 0;
      this.player.phaseClearRadius = (flux > 0 ? [0, 125, 145, 165][flux] : 110) * this.fieldMultiplier();
      this.enemyBullets = this.enemyBullets.filter(b => distanceSq(b, this.player) > this.player.phaseClearRadius ** 2);
      this.addEffect({ type: 'ring', x: this.player.x, y: this.player.y, radius: 10, maxRadius: 90, life: 24, maxLife: 24, color: '#c084fc' });
      this.spawnBurst(this.player.x, this.player.y, 28, '#c084fc');
      this.announce('SHIELD BREAK', 'PHASE WINDOW ACTIVE', 800);
      this.sound('hit'); this.updateHud(); return;
    }
    if (this.player.kungfuShield > 0) {
      const flux = this.passiveRank('flux');
      this.player.kungfuShield = 0;
      this.player.kungfuShieldTimer = 0;
      this.player.invincible = 90;
      this.player.phaseClearTimer = flux > 0 ? 120 : 0;
      this.player.phaseClearRadius = (flux > 0 ? [0, 125, 145, 165][flux] : 90) * this.fieldMultiplier();
      this.enemyBullets = this.enemyBullets.filter(b => distanceSq(b, this.player) > this.player.phaseClearRadius ** 2);
      this.addEffect({ type: 'ironBellBreak', x: this.player.x, y: this.player.y, life: 24, maxLife: 24 });
      this.spawnBurst(this.player.x, this.player.y, 24, '#facc15');
      this.announce('GOLDEN BELL', 'MARTIAL GUARD BROKEN', 800);
      this.sound('hit'); this.updateHud(); return;
    }
    this.player.hp -= damage;
    const armor = upgradePower(this.player.build.passives.armor || 0);
    const armorExtension = armor * 15;
    this.player.invincible = this.player.pilotId === 'shadow' ? Math.max(120, 95 + armorExtension) : 95 + armorExtension;
    this.enemyBullets = this.enemyBullets.filter(b => distanceSq(b, this.player) > 90 ** 2);
    if (this.player.build.fusions?.suicideSquad && this.player.bombs > 0) {
      this.player.bombs -= 1;
      this.detonateBomb();
      this.announce('SUICIDE SQUAD', 'AUTO BOMB TRIGGERED', 900);
    }
    this.spawnBurst(this.player.x, this.player.y, 40, '#ff3158');
    this.sound('hit'); navigator.vibrate?.([25, 30, 25]);
    if (this.player.hp <= 0) {
      if (this.runLives > 0) this.respawnPlayer();
      else this.endRun(false);
    }
    this.updateHud();
  }

  respawnPlayer() {
    this.runLives -= 1;
    const p = this.player;
    const deathX = p.x; const deathY = p.y;
    p.hp = p.maxHp;
    p.shield = 0; p.kungfuShield = 0; p.kungfuShieldTimer = 0;
    p.respawnVisible = false;
    p.invincible = 0;
    p.inputLock = 999;
    this.pointer.active = false;
    this.keys.clear();
    this.mode = 'respawning';
    this.respawnTransition = { timer: 180, total: 180, entryStart: 60, targetX: this.w / 2, targetY: this.h - 120 };
    this.playerBullets = [];
    this.spawnBurst(deathX, deathY, 80, ['#fff', '#ff3158', '#ffd166']);
    this.addEffect({ type: 'ring', x: deathX, y: deathY, radius: 10, maxRadius: 130, life: 70, maxLife: 70, color: '#ff3158' });
    this.announce('AIRFRAME LOST', `BACKUP UNIT INBOUND · ${this.runLives} REMAINING`, 2500);
    this.updateHud();
  }

  updateRespawnTransition() {
    this.updateEffects();
    const transition = this.respawnTransition;
    const p = this.player;
    if (!transition || !p) return;
    transition.timer -= 1;
    // Keep the battlefield fully frozen until the replacement reaches its fixed rally point.
    if (transition.timer === transition.entryStart) {
      this.enemyBullets = [];
      p.x = transition.targetX;
      p.targetX = transition.targetX;
      p.y = this.h + 72;
      p.targetY = transition.targetY;
      p.respawnVisible = true;
      p.invincible = 240;
      this.spawnBurst(p.x, this.h - 8, 32, '#42e8ff');
      this.announce('BACKUP AIRFRAME', 'RE-ENTERING COMBAT ZONE', 900);
    }
    if (transition.timer <= transition.entryStart && p.respawnVisible) {
      const progress = 1 - transition.timer / transition.entryStart;
      const eased = 1 - (1 - clamp(progress, 0, 1)) ** 3;
      p.y = (this.h + 72) + (transition.targetY - (this.h + 72)) * eased;
      p.x = transition.targetX;
    }
    if (transition.timer <= 0) {
      p.x = transition.targetX; p.targetX = transition.targetX;
      p.y = transition.targetY; p.targetY = transition.targetY;
      p.inputLock = 0;
      p.respawnVisible = true;
      this.respawnTransition = null;
      this.mode = 'playing';
      this.announce('COMBAT RESTORED', 'BACKUP AIRFRAME ONLINE', 700);
    }
    this.updateHud();
  }

  completeStage() {
    this.music.stop({ duration: .38, clearDesired: true });
    this.mode = 'stageClear'; this.transitionTimer = 90; this.transitionDeadline = performance.now() + 1500; this.enemyBullets = []; this.playerBullets = [];
    this.player.targetY = -80;
    this.announce('STAGE CLEAR', `SECTOR ${this.stageIndex + 1} SECURED`, 2300);
  }

  endRun(victory) {
    this.mode = victory ? 'victory' : 'gameover';
    this.dom['pause-overlay'].classList.add('hidden');
    this.dom['pause-button'].textContent = 'PAUSE';
    // Results are intentionally silent; let the active track recede instead of
    // adding a victory/game-over jingle.
    this.music.stop({ duration: 3.2, clearDesired: true });
    this.updateDps();
    if (this.score > this.best) { this.best = this.score; writeStorage('void-circuit-best', String(this.best)); }
    this.dom['end-kicker'].textContent = victory ? 'VOID CIRCUIT COLLAPSED' : 'RUN TERMINATED';
    this.dom['end-title'].textContent = victory ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.dom['end-title'].style.color = victory ? '#4cff9b' : '#ff3158';
    const elapsedSeconds = this.runFrames / 60;
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = (elapsedSeconds % 60).toFixed(1).padStart(4, '0');
    const dps = value => value.toFixed(1);
    const fusionIds = Object.keys(this.player.build.fusions || {});
    const secondaryFusionCount = fusionIds.filter(id => FUSIONS[id]?.kind !== 'passive').length;
    const passiveFusionCount = fusionIds.filter(id => FUSIONS[id]?.kind === 'passive').length;
    const depthLine = this.isEndless() ? `DEPTH　${Math.max(0, this.endlessDepth || 0)} km<br>` : `STAGE　${this.stageIndex + 1}/5<br>`;
    const clearBonus = victory && this.runMode === 'normal' ? ORE_CLEAR_BONUS : 0;
    const firstClear = victory && this.runMode === 'normal' && !this.maxMode && !this.meta.cleared;
    if (firstClear) this.meta.cleared = true;
    const banked = this.bankOre(clearBonus);
    const settlement = this.lastOreSettlement || this.oreSettlement(clearBonus);
    const unbankedNote = this.maxMode || this.runMode === 'test' ? '（未入帳）' : '';
    const cleanupNote = settlement.bonus > 0 ? `<small>戰場清理額外 +${settlement.bonus}</small>` : '';
    const oreLine = `<div class="summary-ore"><b>獲得源晶礦　${settlement.total}</b>${cleanupNote}<b>累積源晶礦　${this.meta.ore} ${unbankedNote}</b></div>`;
    this.dom['damage-review'].innerHTML = this.damageReviewMarkup();
    this.dom['damage-review'].classList.add('hidden');
    this.dom['review-overlay']?.classList.add('hidden');
    this.dom['run-summary'].innerHTML = `SCORE　${String(this.score).padStart(7, '0')}<br>${depthLine}${oreLine}LEVEL　${this.player.level}<br>TIME　${String(minutes).padStart(2, '0')}:${seconds}<br><br>BEST 1S DPS　${dps(this.dpsBest.one)}<br>BEST 10S DPS　${dps(this.dpsBest.ten)}<br>BEST STAGE DPS　${dps(this.dpsBest.total)}<br><br>PRIMARY　${this.player.build.primaryLevel >= WORLD.maxUpgradeRank ? 'MAX' : `LV ${this.player.build.primaryLevel}`}<br>SECONDARY　${Object.keys(this.player.build.secondaries).length + secondaryFusionCount}/${this.player.build.secondarySlots}　PASSIVE　${Object.keys(this.player.build.passives).length + passiveFusionCount}/${this.player.build.passiveSlots}`;
    if (victory && this.runMode === 'normal') {
      const skipBank = this.maxMode || this.runMode === 'test';
      const cleanupLine = settlement.bonus > 0 ? `<small>戰場清理額外 +${settlement.bonus}</small>` : '';
      this.dom['clear-body'].innerHTML = `<div class="summary-ore"><b>獲得源晶礦　${settlement.total}</b>${cleanupLine}<b>累積源晶礦　${this.meta.ore} ${skipBank ? '（未入帳）' : ''}</b></div>${firstClear ? '<span class="clear-unlock">🔓 無限模式已解鎖！<br>主選單新增 ENDLESS 出擊選項。</span>' : ''}`;
      this.dom['clear-overlay'].classList.remove('hidden');
      this.dom['clear-confirm'].onclick = () => {
        this.dom['clear-overlay'].classList.add('hidden');
        this.dom['end-overlay'].classList.remove('hidden');
      };
    } else {
      this.dom['end-overlay'].classList.remove('hidden');
    }
    this.dom['pause-fab'].classList.add('hidden');
  }

  updatePausePanel() {
    if (!this.player) return;
    const p = this.player;
    const list = (items, catalog) => Object.entries(items).map(([id, rank]) => { const item = catalog[id]; return item ? `${item.name} ${rank >= item.max ? 'MAX' : `Lv.${rank}`}` : id; }).join('　/　') || '尚未取得';
    const kungfu = p.build.secondarySet === 'kungfu';
    const mastery = p.build.primaryLevel >= WORLD.maxUpgradeRank ? ` · ${kungfu ? '宗師境界' : p.craft.mastery}` : '';
    const overdrive = p.build.overdrive ? ` · 攻擊 +${p.build.overdrive * (p.build.overdriveStep ?? 1)}%` : '';
    const modeLabel = { normal: '一般模式', endless: `無限模式 · 循環 ${this.endlessCycle + 1}`, test: '測試模式' }[this.runMode] || '一般模式';
    const testFlags = this.runMode === 'test' ? ` · 自身${this.testFlags.playerInvincible ? '無敵' : '可受傷'} · 敵人${this.testFlags.enemiesImmortal ? '不死' : '可擊破'}` : '';
    this.dom['pause-pilot'].textContent = `${p.pilot.name} · ${p.pilot.ability} · ${modeLabel}${testFlags}`;
    this.dom['pause-primary'].textContent = `${kungfu ? `基本拳法 · 傷害 +${KUNGFU_FIST_DAMAGE_BONUS[p.build.primaryLevel]}% · ${p.build.primaryLevel >= WORLD.maxUpgradeRank ? 'MAX' : `Lv.${p.build.primaryLevel}`}　/　唯快不破 · 迴避 ${p.build.evasion ?? 20}%` : `${p.craft.name} · ${p.craft.primary.toUpperCase()} · ${p.build.primaryLevel >= WORLD.maxUpgradeRank ? 'MAX' : `Lv.${p.build.primaryLevel}`}`}${mastery}${overdrive}`;
    const fusionNames = kind => Object.keys(p.build.fusions || {}).filter(id => (FUSIONS[id]?.kind === 'passive') === (kind === 'passive')).map(id => FUSIONS[id].name).join('　/　');
    const weaponFusions = fusionNames('secondary');
    const passiveFusions = fusionNames('passive');
    this.dom['pause-secondary'].textContent = `${list(p.build.secondaries, this.secondaryCatalog(p))}${weaponFusions ? `　/　合成：${weaponFusions}` : ''}`;
    this.dom['pause-passive'].textContent = `${list(p.build.passives, PASSIVES)}${passiveFusions ? `　/　合成：${passiveFusions}` : ''}`;
    const controls = this.dom['pause-test-controls'];
    controls.classList[this.runMode !== 'test' ? 'add' : 'remove']('hidden');
    this.dom['pause-player-invincible'].checked = Boolean(this.testFlags.playerInvincible);
    this.dom['pause-enemies-immortal'].checked = Boolean(this.testFlags.enemiesImmortal);
  }

  setTestFlag(flag, enabled) {
    if (this.runMode !== 'test' || !(flag in this.testFlags)) return false;
    this.testFlags[flag] = Boolean(enabled);
    this.updatePausePanel();
    return true;
  }

  setPaused(paused) {
    if (paused && ['stageIntro', 'bossWarning', 'playing', 'stageClear'].includes(this.mode)) {
      this.pauseReturnMode = this.mode;
      this.mode = 'paused';
      this.pointer.active = false;
      this.keys.clear();
      this.updatePausePanel();
      this.dom['pause-overlay'].classList.remove('hidden');
      this.dom['pause-button'].textContent = 'RESUME';
      this.music.pause();
    } else if (!paused && this.mode === 'paused') {
      this.mode = this.pauseReturnMode || 'playing';
      this.dom['pause-overlay'].classList.add('hidden');
      this.dom['pause-button'].textContent = 'PAUSE';
      this.music.resume();
    }
  }

  togglePause() {
    if (['stageIntro', 'bossWarning', 'playing', 'stageClear'].includes(this.mode)) this.setPaused(true);
    else if (this.mode === 'paused') this.setPaused(false);
  }

  toggleMute() {
    this.muted = !this.muted;
    writeStorage('void-circuit-muted', this.muted ? '1' : '0');
    this.dom['mute-button'].textContent = this.muted ? 'MUTED' : 'SOUND';
    this.music.setMuted(this.muted);
  }

  initAudio() {
    if (!this.audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.audio = new AC(); }
    this.audio?.resume?.()?.catch?.(() => {});
    if (this.mode === 'title') this.music.prepare('menu');
    this.music.unlock();
  }

  sound(type) {
    if (this.muted || !this.audio) return;
    const frameGap = { shoot: 4, enemy: 3, xp: 2 }[type] || 0;
    if (frameGap && this.frame - (this.lastSoundFrame[type] ?? -frameGap) < frameGap) return;
    this.lastSoundFrame[type] = this.frame;
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
    const available = Math.max(0, WORLD.maxParticles - this.particles.length);
    const accepted = Math.min(count, available);
    for (let i = 0; i < accepted; i += 1) {
      const angle = Math.random() * TAU; const speed = rand(.8, 5.5);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(14, 42), maxLife: 42, color: Array.isArray(color) ? choose(color) : color, size: rand(1.2, 3.8) });
    }
  }

  updateHud() {
    const p = this.player;
    const stage = STAGES[this.stageIndex] || STAGES[0];
    const waveNumber = Math.max(0, this.waveIndex + 1);
    const midboss = this.enemies.find(enemy => enemy.type === 'midboss' && enemy.alive);
    const boss = this.enemies.find(enemy => enemy.type === 'boss' && enemy.alive);
    const routeMode = boss ? 'boss' : this.mode === 'levelup' ? (this.upgradeReturnMode || 'playing') : this.mode;
    const progress = p ? this.routeProgress : 0;
    const checkpointReached = waveNumber >= stage.midbossWave;
    const checkpointCleared = checkpointReached && !midboss;
    let routeStatus = 'STANDBY';
    if (p) {
      if (routeMode === 'stageIntro') routeStatus = 'DEPLOY';
      else if (midboss) routeStatus = 'CHECKPOINT';
      else if (boss || routeMode === 'bossWarning') routeStatus = 'BOSS';
      else if (routeMode === 'stageClear') routeStatus = 'CLEAR';
      else routeStatus = 'HOSTILES';
    }
    const setText = (id, value) => { const el = this.dom[id]; if (!el) return; const next = String(value); if (el.textContent !== next) el.textContent = next; };
    const setStyle = (id, property, value) => { const el = this.dom[id]; if (el && el.style[property] !== value) el.style[property] = value; };
    const setClass = (id, name, active) => { const el = this.dom[id]; if (el && el.classList.contains(name) !== active) el.classList[active ? 'add' : 'remove'](name); };
    setText('score', String(this.score).padStart(7, '0'));
    setText('stage', p ? `${this.isEndless() ? `∞${this.endlessCycle + 1}·` : ''}S${String(stage.id).padStart(2, '0')}` : '—');
    setText('level', p ? String(p.level).padStart(2, '0') : '—');
    setText('ore', p ? `◆${this.runOre}` : '—');
    setText('lives', p ? '▲'.repeat(1 + this.runLives) : '—');
    setText('dps-1s', this.dps ? this.dps.one.toFixed(1) : '0.0');
    setText('dps-10s', this.dps ? this.dps.ten.toFixed(1) : '0.0');
    setText('dps-total', this.dps ? this.dps.total.toFixed(1) : '0.0');
    setClass('pause-fab', 'hidden', !p || ['title', 'levelup', 'gameover', 'victory'].includes(this.mode));
    const displayedHp = p ? clamp(Math.ceil(p.hp), 0, p.maxHp) : 0;
    setText('hp', p ? `${displayedHp} / ${p.maxHp}` : '—');
    setText('bombs', p ? '◆'.repeat(p.bombs) + '◇'.repeat(Math.max(0, p.maxBombs - p.bombs)) : '—');
    setText('bomb-count', p?.bombs ?? 0);
    setStyle('xp-bar', 'width', p ? `${clamp(p.xp / p.xpNeed * 100, 0, 100)}%` : '0%');
    if (this.dom['route-label']) this.dom['route-label'].innerHTML = p ? this.isEndless() ? `<span class="depth-label">DEPTH <b>${this.endlessDepth || 0}</b> km</span><span class="depth-stage"> · ${stage.name}</span>` : `${stage.name} · ${stage.subtitle}` : 'AWAITING DEPLOYMENT';
    setText('route-status', routeStatus);
    setStyle('route-fill', 'width', `${progress * 100}%`);
    setStyle('midboss-node', 'left', `${midbossProgress(stage) * 100}%`);
    setClass('midboss-node', 'active', Boolean(midboss));
    setClass('midboss-node', 'cleared', Boolean(!midboss && checkpointCleared));
    setClass('boss-node', 'active', Boolean(boss || routeMode === 'bossWarning'));
    setClass('boss-node', 'cleared', Boolean(!boss && routeMode !== 'bossWarning' && (routeMode === 'stageClear' || routeMode === 'victory')));
    const buildRevision = p?.build.revision ?? -1;
    if (buildRevision !== this.hudBuildRevision) {
      const token = (icon, badge, name, level = badge) => `<span class="skill-token" title="${name} ${level}" aria-label="${name}${level}"><i aria-hidden="true">${skillIconMarkup(icon)}</i><b>${badge}</b></span>`;
      const rankBadge = level => level >= WORLD.maxUpgradeRank ? 'MAX' : level;
      const primaryBadge = rankBadge(p?.build.primaryLevel || 0);
      const kungfu = p?.build.secondarySet === 'kungfu';
      const secondaryCatalog = this.secondaryCatalog(p);
      const firepowerBonus = (p?.build.overdrive || 0) * (p?.build.overdriveStep ?? 1);
      const primaryName = kungfu ? '基本拳法' : `${p?.craft.name}主武器`;
      const primaryIcon = kungfu ? 'assets/icons/basic-fist.svg' : PRIMARY_ICON;
      const primaryToken = p ? token(primaryIcon, `${primaryBadge} · +${firepowerBonus}%`, `${primaryName} · 超頻火力 +${firepowerBonus}%`, p.build.primaryLevel) : '';
      const extraPrimaryToken = !p ? ''
        : p.pilotId === 'kungfu' ? token('assets/icons/swift-defense.svg', `${p.build.evasion ?? 20}%`, `唯快不破 · 迴避 ${p.build.evasion ?? 20}%`, `${p.build.evasion ?? 20}%`)
        : p.pilotId === 'gambler' ? token('assets/icons/frenzy.svg', `+${Math.round((p.grazeBonus || 0) * 100)}%`, `狂熱 · 傷害 +${Math.round((p.grazeBonus || 0) * 100)}%`)
        : p.pilotId === 'reaper' ? token('assets/icons/soul-taker.svg', `${p.build.soulTaker || 1}%`, `奪魂者 · 主武器即死 ${p.build.soulTaker || 1}%`)
        : p.pilotId === 'imperial' ? token('assets/icons/battlefield-cleanup.svg', `+${p.build.battlefieldCleanup || 0}%`, `戰場清理 · 源晶礦結算 +${p.build.battlefieldCleanup || 0}%`)
        : p.pilotId === 'rambo' ? token('assets/icons/supply-chain.svg', '+50%', '補給鏈 · 炸彈對大型目標傷害 +50%', '+50%')
        : '';
      const emptyToken = (locked = false) => `<span class="skill-token empty${locked ? ' locked' : ''}" aria-hidden="true"><i></i><b></b></span>`;
      const fillSlots = (tokens, visibleSlots, unlockedSlots) => Array.from({ length: visibleSlots }, (_, index) => tokens[index] || emptyToken(index >= unlockedSlots)).join('');
      const primaryTokens = p ? [primaryToken, extraPrimaryToken].filter(Boolean) : [];
      this.dom['primary-build'].innerHTML = fillSlots(primaryTokens, 2, p ? 2 : 0);
      const fusionToken = id => token(FUSIONS[id].icon, 'MAX', FUSIONS[id].name, 'MAX');
      const fusionIds = p ? Object.keys(p.build.fusions || {}) : [];
      const secondaryTokens = p ? Object.entries(p.build.secondaries).map(([id, level]) => token(secondaryCatalog[id].icon, rankBadge(level), secondaryCatalog[id].name, level)).concat(fusionIds.filter(id => FUSIONS[id]?.kind !== 'passive').map(fusionToken)) : [];
      const passiveTokens = p ? Object.entries(p.build.passives).map(([id, level]) => token(PASSIVES[id].icon, rankBadge(level), PASSIVES[id].name, level)).concat(fusionIds.filter(id => FUSIONS[id]?.kind === 'passive').map(fusionToken)) : [];
      this.dom['secondary-build'].innerHTML = fillSlots(secondaryTokens, BUILD_LIMITS.secondary, p?.build.secondarySlots || 0);
      this.dom['passive-build'].innerHTML = fillSlots(passiveTokens, BUILD_LIMITS.passive, p?.build.passiveSlots || 0);
      this.hudBuildRevision = buildRevision;
    }
    setText('mute-button', this.muted ? 'MUTED' : 'SOUND');
  }

  render() {
    const ctx = this.ctx; const stage = STAGES[this.stageIndex] || STAGES[0];
    const gradient = ctx.createLinearGradient(0, 0, 0, this.h); gradient.addColorStop(0, stage.theme[0]); gradient.addColorStop(1, stage.theme[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.w, this.h);
    this.drawBackground(ctx, stage);
    this.drawXp(ctx); this.drawEffects(ctx); this.drawEnemies(ctx); this.drawBullets(ctx); this.drawPlayer(ctx); this.drawParticles(ctx); this.drawSkillGauge(ctx); this.drawWorldOverlay(ctx);
    if (this.finaleFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(this.finaleFlash, 0, 1)})`; ctx.fillRect(0,0,this.w,this.h); }
    if (this.mode === 'paused') { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0,0,this.w,this.h); ctx.fillStyle='#ffd166'; ctx.font='900 38px monospace'; ctx.textAlign='center'; ctx.fillText('PAUSED',this.w/2,this.h/2); }
  }

  drawWorldOverlay(ctx) {
    if (!this.player?.build.fusions?.world) return;
    const x = this.w / 2;
    const y = this.h * .44;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.worldFreezeTimer > 0) {
      const elapsed = 120 - this.worldFreezeTimer;
      const phase = (elapsed % 30) / 30;
      const beat = Math.exp(-Math.pow((phase - .08) / .07, 2)) + .55 * Math.exp(-Math.pow((phase - .28) / .09, 2));
      const scale = 1 + beat * .22;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#f472b6';
      ctx.shadowBlur = 18 + beat * 18;
      ctx.fillStyle = `rgba(255,235,245,${.42 + beat * .28})`;
      ctx.font = '900 104px monospace';
      ctx.fillText('0.0', 0, 0);
      ctx.strokeStyle = `rgba(244,114,182,${.5 + beat * .35})`;
      ctx.lineWidth = 3;
      ctx.strokeText('0.0', 0, 0);
      ctx.restore();
      return;
    }
    if (this.worldCooldown > 0 && this.worldCooldown <= 120) {
      const seconds = (this.worldCooldown / 60).toFixed(1);
      const fade = .55 + .25 * Math.sin(this.frame * .18);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#e0f2fe';
      ctx.font = '900 82px monospace';
      ctx.shadowColor = '#67e8f9';
      ctx.shadowBlur = 12;
      ctx.fillText(seconds, x, y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = Math.min(1, fade + .2);
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.strokeText(seconds, x, y);
    }
    ctx.restore();
  }

  drawBackground(ctx, stage) {
    const scroll = this.worldScroll;
    if (stage.id === 1) this.drawNeonOutskirts(ctx, stage);
    ctx.save(); ctx.globalAlpha = .24; ctx.strokeStyle = stage.id % 2 ? '#42e8ff' : '#ff8a4c'; ctx.lineWidth = 1;
    for (let y = -80 + scroll % 80; y < this.h + 80; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(this.w,y); ctx.stroke(); }
    for (let x = 0; x <= this.w; x += 60) { ctx.beginPath(); ctx.moveTo(this.w/2 + (x-this.w/2)*.25,0); ctx.lineTo(x,this.h); ctx.stroke(); }
    ctx.restore();
    for (const star of this.stars) { const y = (star.y + scroll * star.speed) % this.h; ctx.fillStyle = `rgba(210,250,255,${.18 + star.speed * .16})`; ctx.fillRect(star.x,y,star.size,star.size); }
    if (stage.id === 1) this.drawNeonOutskirtsParticles(ctx);
  }

  drawNeonOutskirts(ctx) {
    const scroll = this.sceneScroll;
    const bossLocked = this.mode === 'bossWarning' || this.enemies.some(enemy => enemy.type === 'boss' && enemy.alive);
    const horizonY = 88;
    const sideBoundary = (side, y) => {
      const t = clamp((y - horizonY) / (this.h - horizonY), 0, 1);
      return side < 0 ? 42 - t * 30 : this.w - 42 + t * 30;
    };

    const drawSide = side => {
      ctx.save();
      ctx.beginPath();
      if (side < 0) {
        ctx.moveTo(0, 0);
        ctx.lineTo(sideBoundary(side, 0), 0);
        ctx.lineTo(sideBoundary(side, this.h), this.h);
        ctx.lineTo(0, this.h);
      } else {
        ctx.moveTo(sideBoundary(side, 0), 0);
        ctx.lineTo(this.w, 0);
        ctx.lineTo(this.w, this.h);
        ctx.lineTo(sideBoundary(side, this.h), this.h);
      }
      ctx.closePath();
      ctx.clip();

      const district = ctx.createLinearGradient(0, horizonY, 0, this.h);
      district.addColorStop(0, bossLocked ? 'rgba(5,12,20,.16)' : 'rgba(5,30,44,.18)');
      district.addColorStop(.45, bossLocked ? 'rgba(7,14,22,.52)' : 'rgba(7,34,50,.56)');
      district.addColorStop(1, bossLocked ? 'rgba(8,12,18,.88)' : 'rgba(7,26,38,.9)');
      ctx.fillStyle = district;
      ctx.fillRect(0, 0, this.w, this.h);

      // Large buildings occupy the complete outer wedge and continue to the bottom edge.
      for (let i = 0; i < 7; i += 1) {
        const y = ((i * 162 + scroll * 1.08) % (this.h + 280)) - 140;
        if (y < horizonY - 30) continue;
        const t = clamp((y - horizonY) / (this.h - horizonY), 0, 1);
        const width = 44 + t * 86;
        const height = 110 + t * 210;
        const edge = side < 0 ? 0 : this.w - width;
        const inset = 5 + (i % 3) * 10;
        const x = side < 0 ? edge - inset : edge + inset;
        const top = y - height * .52;

        ctx.globalAlpha = bossLocked ? .48 : .72;
        ctx.fillStyle = 'rgba(2,10,18,.96)';
        ctx.beginPath();
        if (side < 0) {
          ctx.moveTo(x, top + 18);
          ctx.lineTo(x + width * .82, top);
          ctx.lineTo(x + width, y + height * .48);
          ctx.lineTo(x, y + height * .5);
        } else {
          ctx.moveTo(x + width, top + 18);
          ctx.lineTo(x + width * .18, top);
          ctx.lineTo(x, y + height * .48);
          ctx.lineTo(x + width, y + height * .5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = bossLocked ? 'rgba(255,72,96,.72)' : 'rgba(66,232,255,.72)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = bossLocked ? 'rgba(255,72,96,.24)' : 'rgba(115,247,255,.24)';
        for (let row = top + 20; row < y + height * .38; row += 18 + t * 6) {
          const innerX = side < 0 ? x + 8 : x + 12;
          ctx.fillRect(innerX, row, Math.max(12, width - 20), 2);
        }

        // Oversized vertical neon sign facing the route but still clipped outside it.
        const signW = 18 + t * 24;
        const signH = 58 + t * 82;
        const sx = side < 0 ? sideBoundary(side, y) - signW - 5 : sideBoundary(side, y) + 5;
        const sy = y - signH * .45;
        ctx.fillStyle = 'rgba(4,18,28,.92)';
        ctx.fillRect(sx, sy, signW, signH);
        ctx.strokeStyle = bossLocked ? '#ff496d' : '#42e8ff';
        ctx.strokeRect(sx, sy, signW, signH);
        ctx.fillStyle = bossLocked ? 'rgba(255,68,94,.3)' : 'rgba(126,250,255,.34)';
        ctx.fillRect(sx + 4, sy + 5, Math.max(3, signW - 8), signH - 10);
      }

      // Continuous outer guide line from the vanishing point to the bottom.
      ctx.globalAlpha = bossLocked ? .46 : .68;
      ctx.strokeStyle = bossLocked ? '#ff496d' : '#58f3ff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(sideBoundary(side, 0), 0);
      ctx.lineTo(sideBoundary(side, this.h), this.h);
      ctx.stroke();

      if (bossLocked) {
        const pulse = .5 + .5 * Math.sin(this.frame * .08);
        ctx.fillStyle = `rgba(255,42,78,${.035 + pulse * .035})`;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      ctx.restore();
    };

    drawSide(-1);
    drawSide(1);

    // Only a distant silhouette is allowed near the horizon; no object enters the floor-grid corridor.
    ctx.save();
    ctx.globalAlpha = bossLocked ? .14 : .24;
    for (let i = 0; i < 12; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const width = 8 + (i * 5) % 15;
      const height = 20 + (i * 17) % 54;
      const x = side < 0 ? 4 + (i >> 1) * 6 : this.w - 4 - (i >> 1) * 6 - width;
      ctx.fillStyle = 'rgba(2,10,18,.9)';
      ctx.fillRect(x, horizonY - height, width, height);
    }
    ctx.restore();
  }

  drawNeonOutskirtsParticles(ctx) {
    const bossLocked = this.mode === 'bossWarning' || this.enemies.some(enemy => enemy.type === 'boss' && enemy.alive);
    const scroll = this.sceneScroll;
    const horizonY = 88;
    const boundary = (side, y) => {
      const t = clamp((y - horizonY) / (this.h - horizonY), 0, 1);
      return side < 0 ? 42 - t * 30 : this.w - 42 + t * 30;
    };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const y = ((i * 86 + scroll * (.55 + (i % 5) * .12)) % (this.h + 100)) - 50;
      const limit = boundary(side, y);
      const available = side < 0 ? Math.max(4, limit - 5) : Math.max(4, this.w - limit - 5);
      const offset = 4 + ((i * 19) % Math.max(5, Math.floor(available)));
      const x = side < 0 ? limit - offset : limit + offset;
      const alpha = bossLocked ? .045 : .1 + (i % 4) * .018;
      ctx.strokeStyle = `rgba(${i % 3 === 0 ? '126,250,255' : '64,190,255'},${alpha})`;
      ctx.lineWidth = i % 8 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * (bossLocked ? 1 : 8), y + (bossLocked ? 5 : 20));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    if (!this.player) return; const p = this.player;
    if (p.respawnVisible === false) return;
    if (p.shadowTimer > 0) {
      const radius = 90;
      ctx.save();
      const gradient = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,.88)');
      gradient.addColorStop(.7, 'rgba(0,0,0,.76)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      const points = 48;
      for (let i = 0; i <= points; i += 1) {
        const angle = i / points * TAU;
        const wave = Math.sin(angle * 5 + this.frame * .12) * 4 + Math.sin(angle * 9 - this.frame * .08) * 2;
        const r = radius + wave;
        const x = p.x + Math.cos(angle) * r;
        const y = p.y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = .7;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    if (p.shadowTimer > 0) ctx.globalAlpha = .28;
    else if (p.invincible > 0 && Math.floor(this.frame / 4) % 2 === 0) ctx.globalAlpha = .45;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale?.(p.scale || 1, p.scale || 1);
    const craftImage = this.craftImages?.[p.craft.id];
    const spriteVisuals = {
      falcon: {
        size: 64,
        aura: 'rgba(255,49,88,.13)',
        thrusters: [
          { x: -23.5, y: 22, len: 13, spread: 4.2, glowX: 11, glowY: 17 },
          { x: 23.5, y: 22, len: 13, spread: 4.2, glowX: 11, glowY: 17 },
        ],
        flame: {
          glowStops: ['rgba(255,255,230,.95)', 'rgba(255,196,64,.75)', 'rgba(255,76,24,.3)', 'rgba(255,40,10,0)'],
          bodyStops: ['rgba(255,255,235,.98)', 'rgba(255,210,90,.92)', 'rgba(255,88,24,.68)', 'rgba(255,45,12,0)'],
          core: 'rgba(255,252,220,.9)',
        },
      },
      lancer: {
        size: 64,
        aura: 'rgba(66,232,255,.12)',
        thrusters: [
          { x: -30, y: 25, len: 15, spread: 4.4, glowX: 11, glowY: 18 },
          { x: 30, y: 25, len: 15, spread: 4.4, glowX: 11, glowY: 18 },
        ],
        flame: {
          glowStops: ['rgba(230,250,255,.95)', 'rgba(102,228,255,.8)', 'rgba(24,135,255,.34)', 'rgba(18,120,255,0)'],
          bodyStops: ['rgba(240,252,255,.98)', 'rgba(120,236,255,.94)', 'rgba(58,168,255,.7)', 'rgba(22,110,255,0)'],
          core: 'rgba(230,250,255,.92)',
        },
      },
      wasp: {
        size: 64,
        aura: 'rgba(255,209,102,.12)',
        thrusters: [
          { x: -24, y: 26, len: 18, spread: 5.8, glowX: 13, glowY: 21 },
          { x: 24, y: 26, len: 18, spread: 5.8, glowX: 13, glowY: 21 },
        ],
        flame: {
          glowStops: ['rgba(255,245,220,.95)', 'rgba(255,208,96,.8)', 'rgba(255,120,24,.36)', 'rgba(255,96,24,0)'],
          bodyStops: ['rgba(255,250,232,.98)', 'rgba(255,214,96,.94)', 'rgba(255,132,36,.74)', 'rgba(255,84,18,0)'],
          core: 'rgba(255,246,220,.9)',
        },
      },
    };
    const spriteVisual = spriteVisuals[p.craft.id];
    const useCraftSprite = !!(spriteVisual && craftImage?.complete && craftImage.naturalWidth > 0);
    if (useCraftSprite) {
      // Scheme C: the hull is a static transparent sprite; thrust is drawn every frame in Canvas.
      const pulse = .5 + .5 * Math.sin(this.frame * .55);
      const jitter = Math.sin(this.frame * 1.37) * 2 + Math.sin(this.frame * .73) * 1.2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const nozzle of spriteVisual.thrusters) {
        const { x, y, len, spread, glowX, glowY } = nozzle;
        const thrustLength = len + pulse * 7 + jitter;
        const glow = ctx.createRadialGradient(x, y, 1, x, y + 6, glowY - 2 + pulse * 4);
        glow.addColorStop(0, spriteVisual.flame.glowStops[0]);
        glow.addColorStop(.18, spriteVisual.flame.glowStops[1]);
        glow.addColorStop(.55, spriteVisual.flame.glowStops[2]);
        glow.addColorStop(1, spriteVisual.flame.glowStops[3]);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.ellipse(x, y + 7, glowX + pulse * 2, glowY + pulse * 4, 0, 0, TAU); ctx.fill();
        const flame = ctx.createLinearGradient(x, y, x, y + thrustLength);
        flame.addColorStop(0, spriteVisual.flame.bodyStops[0]);
        flame.addColorStop(.22, spriteVisual.flame.bodyStops[1]);
        flame.addColorStop(.58, spriteVisual.flame.bodyStops[2]);
        flame.addColorStop(1, spriteVisual.flame.bodyStops[3]);
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.moveTo(x - spread, y);
        ctx.quadraticCurveTo(x - (spread + 1.3) - pulse * 1.5, y + thrustLength * .45, x + jitter * .18, y + thrustLength);
        ctx.quadraticCurveTo(x + (spread + 1.3) + pulse * 1.5, y + thrustLength * .45, x + spread, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = spriteVisual.flame.core;
        ctx.beginPath();
        ctx.moveTo(x - spread * .38, y + 1);
        ctx.quadraticCurveTo(x - spread * .52, y + thrustLength * .38, x, y + thrustLength * .7);
        ctx.quadraticCurveTo(x + spread * .52, y + thrustLength * .38, x + spread * .38, y + 1);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = spriteVisual.aura;
      ctx.beginPath(); ctx.ellipse(0, 3, 33, 37, 0, 0, TAU); ctx.fill();
      const half = spriteVisual.size / 2;
      ctx.drawImage(craftImage, -half, -half, spriteVisual.size, spriteVisual.size);
    } else {
      ctx.fillStyle='rgba(66,232,255,.16)'; ctx.beginPath(); ctx.ellipse(0,4,30,36,0,0,TAU); ctx.fill();
      ctx.fillStyle=p.craft.color; ctx.beginPath(); ctx.moveTo(0,-27); ctx.lineTo(-13,7); ctx.lineTo(-29,15); ctx.lineTo(-12,20); ctx.lineTo(0,12); ctx.lineTo(12,20); ctx.lineTo(29,15); ctx.lineTo(13,7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#dffcff';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#c9fbff';ctx.fillRect(-4,-17,8,15);ctx.fillStyle=this.frame%6<3?'#ffd166':'#ff5e32';ctx.fillRect(-9,20,5,13);ctx.fillRect(4,20,5,13);
    }
    ctx.restore();
    ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y,p.hitRadius,0,TAU);ctx.fill();
    if(p.shield>0){ctx.strokeStyle='rgba(192,132,252,.9)';ctx.fillStyle='rgba(192,132,252,.08)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,31+Math.sin(this.frame/10)*2,0,TAU);ctx.fill();ctx.stroke();}
    if(p.kungfuShield>0){ctx.strokeStyle='rgba(250,204,21,.95)';ctx.fillStyle='rgba(250,204,21,.09)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,36+Math.sin(this.frame/7)*3,0,TAU);ctx.fill();ctx.stroke();}
    if(p.shadowTimer>0){ctx.strokeStyle='rgba(192,132,252,.9)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,34+Math.sin(this.frame/5)*4,0,TAU);ctx.stroke();}
    if(p.invincible>0){ctx.strokeStyle='rgba(66,232,255,.65)';ctx.beginPath();ctx.arc(p.x,p.y,27+Math.sin(this.frame/8)*3,0,TAU);ctx.stroke();}
  }


  drawSkillGauge(ctx) {
    const p = this.player;
    if (!p) return;
    let ratio = null; let seconds = 0; let label = ''; let active = false; let color = '#67e8f9';
    if (p.pilotId === 'shadow') {
      active = p.shadowTimer > 0;
      ratio = active ? p.shadowTimer / 120 : 1 - clamp(p.shadowCooldown / 360, 0, 1);
      seconds = Math.max(0, (active ? p.shadowTimer : p.shadowCooldown) / 60);
      label = active ? 'PHASE' : 'SHADOW';
      color = active ? '#c084fc' : '#67e8f9';
    } else if (p.pilotId === 'kungfu' && p.build.secondaries?.kiai) {
      const rank = p.build.secondaries.kiai;
      const maxFrames = [0, 720, 660, 600][rank] || 600;
      const remain = Math.max(0, p.secondaryCooldowns.kiai ?? 0);
      ratio = 1 - clamp(remain / maxFrames, 0, 1);
      seconds = remain / 60;
      label = '大喝';
      color = '#fde68a';
    }
    if (ratio === null) return;
    const width = 92; const height = 8;
    const y = p.y < 72 ? p.y + 46 : p.y - 54;
    const x = clamp(p.x - width / 2, 8, this.w - width - 8);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(2,8,18,.92)'; ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color; ctx.fillRect(x, y, width * clamp(ratio, 0, 1), height);
    ctx.font = '900 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#020617'; ctx.lineWidth = 3;
    const text = `${label} ${seconds.toFixed(1)}s`;
    ctx.strokeText(text, x + width / 2, y - 4); ctx.fillText(text, x + width / 2, y - 4);
    ctx.restore();
  }

  drawBossSprite(ctx, enemy) {
    const boss = BOSSES[enemy.bossId] || BOSSES.manta;
    const pulse = Math.sin(this.frame * .08);
    ctx.fillStyle = enemy.color;
    ctx.strokeStyle = boss.accent;
    ctx.lineWidth = 2;

    if (enemy.bossId === 'manta') {
      ctx.beginPath();
      ctx.moveTo(0, -46); ctx.lineTo(-18, -24); ctx.lineTo(-62, -34); ctx.lineTo(-48, -3);
      ctx.lineTo(-68, 24); ctx.lineTo(-28, 15); ctx.lineTo(0, 43);
      ctx.lineTo(28, 15); ctx.lineTo(68, 24); ctx.lineTo(48, -3); ctx.lineTo(62, -34); ctx.lineTo(18, -24);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = .55; ctx.fillStyle = boss.accent;
      ctx.beginPath(); ctx.moveTo(-15, -20); ctx.lineTo(-54, -25); ctx.lineTo(-40, 2); ctx.lineTo(-20, 8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(15, -20); ctx.lineTo(54, -25); ctx.lineTo(40, 2); ctx.lineTo(20, 8); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#07111d'; ctx.beginPath(); ctx.moveTo(0, -35); ctx.lineTo(-15, 18); ctx.lineTo(0, 34); ctx.lineTo(15, 18); ctx.closePath(); ctx.fill();
    } else if (enemy.bossId === 'carrier') {
      ctx.beginPath(); ctx.moveTo(-48, -38); ctx.lineTo(48, -38); ctx.lineTo(62, -17); ctx.lineTo(57, 35); ctx.lineTo(28, 48); ctx.lineTo(-28, 48); ctx.lineTo(-57, 35); ctx.lineTo(-62, -17); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#151321'; ctx.fillRect(-30, -31, 60, 68); ctx.strokeRect(-30, -31, 60, 68);
      ctx.fillStyle = boss.accent; ctx.fillRect(-4, -27, 8, 54); ctx.fillRect(-25, 30, 50, 4);
      for (let side = -1; side <= 1; side += 2) {
        ctx.fillStyle = '#07111d'; ctx.fillRect(side * 48 - 9, -21, 18, 36);
        ctx.fillStyle = boss.accent; ctx.beginPath(); ctx.arc(side * 43, 20, 8 + pulse, 0, TAU); ctx.fill();
        ctx.fillStyle = '#07111d'; ctx.fillRect(side * 43 - 2, 18, 4, 18);
      }
    } else if (enemy.bossId === 'seraph') {
      ctx.globalAlpha = .82;
      for (let side = -1; side <= 1; side += 2) {
        ctx.fillStyle = enemy.color;
        ctx.beginPath(); ctx.moveTo(side * 8, -34); ctx.lineTo(side * 62, -45); ctx.lineTo(side * 36, -3); ctx.lineTo(side * 68, 24); ctx.lineTo(side * 17, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = boss.accent;
        ctx.beginPath(); ctx.moveTo(side * 17, -26); ctx.lineTo(side * 49, -34); ctx.lineTo(side * 29, -6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(side * 23, 3); ctx.lineTo(side * 54, 20); ctx.lineTo(side * 17, 13); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = '#07111d';
      ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(-18, 0); ctx.lineTo(0, 43); ctx.lineTo(18, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (enemy.bossId === 'leviathan') {
      ctx.beginPath(); ctx.ellipse(0, 3, 54, 43, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = boss.accent;
      ctx.beginPath(); ctx.moveTo(-39, -26); ctx.lineTo(-62, -50); ctx.lineTo(-52, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(39, -26); ctx.lineTo(62, -50); ctx.lineTo(52, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7c2d12'; ctx.beginPath(); ctx.ellipse(0, 8, 35, 27, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = boss.accent; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 6, 24 + pulse * 2, 0, TAU); ctx.stroke();
      for (let node = 0; node < 4; node += 1) {
        const angle = node / 4 * TAU + this.frame * .012;
        ctx.fillStyle = boss.accent; ctx.beginPath(); ctx.arc(Math.cos(angle) * 43, 6 + Math.sin(angle) * 33, 5, 0, TAU); ctx.fill();
      }
    } else {
      ctx.fillStyle = enemy.color;
      ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(-15, -38); ctx.lineTo(-42, -46); ctx.lineTo(-34, -20); ctx.lineTo(-54, 3); ctx.lineTo(-39, 42); ctx.lineTo(0, 51); ctx.lineTo(39, 42); ctx.lineTo(54, 3); ctx.lineTo(34, -20); ctx.lineTo(42, -46); ctx.lineTo(15, -38); ctx.closePath(); ctx.fill(); ctx.stroke();
      for (let side = -1; side <= 1; side += 2) {
        ctx.fillStyle = '#211033'; ctx.beginPath(); ctx.arc(side * 51, 10, 17, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = boss.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(side * 51, 10, 10, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = '#07111d'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-28, -6); ctx.lineTo(-19, 30); ctx.lineTo(0, 42); ctx.lineTo(19, 30); ctx.lineTo(28, -6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = boss.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-2, 2); ctx.lineTo(-9, 10); ctx.moveTo(10, -7); ctx.lineTo(2, 2); ctx.lineTo(9, 10); ctx.stroke();
    }

    ctx.fillStyle = '#07111d'; ctx.beginPath(); ctx.arc(0, 3, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = boss.accent; ctx.beginPath(); ctx.arc(0, 3, 7 + pulse * 1.3, 0, TAU); ctx.fill();
    for (let phase = 0; phase < 3; phase += 1) {
      ctx.fillStyle = enemy.phase >= phase ? boss.accent : 'rgba(255,255,255,.16)';
      ctx.fillRect(-13 + phase * 10, 20, 6, 3);
    }
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) { if(!e.alive)continue; ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.arc(0,0,e.radius*1.45,0,TAU);ctx.fill();ctx.fillStyle=e.color;ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1.5;
      if(e.type==='boss')this.drawBossSprite(ctx,e);
      else if(e.type==='midboss'){ctx.rotate(Math.PI/4);ctx.fillRect(-e.radius*.62,-e.radius*.62,e.radius*1.24,e.radius*1.24);ctx.strokeRect(-e.radius*.62,-e.radius*.62,e.radius*1.24,e.radius*1.24);ctx.rotate(-Math.PI/4);ctx.fillStyle='#07111d';ctx.beginPath();ctx.arc(0,0,13,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(-8,-3,16,6);}
      else{ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(-e.radius,-12);ctx.lineTo(-5,-5);ctx.lineTo(0,-e.radius);ctx.lineTo(5,-5);ctx.lineTo(e.radius,-12);ctx.closePath();ctx.fill();ctx.stroke();}
      if((e.type==='midboss'&&!e.orbiting)||(e.type==='boss'&&e.arriving)){ctx.strokeStyle='rgba(66,232,255,.9)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.radius+9+Math.sin(this.frame/7)*2,0,TAU);ctx.stroke();}
      if(e.burnTimer>0||e.chillTimer>0||e.freezeTimer>0||e.acidTimer>0){ctx.globalAlpha=e.acidTimer>0?clamp(.35+e.acidTimer/600,.35,.82):.72;ctx.strokeStyle=e.acidTimer>0?'#a3e635':e.freezeTimer>0?'#dffcff':e.chillTimer>0?'#42e8ff':'#ff8a4c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.radius+5+Math.sin(this.frame/6)*2,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      if(e.kungfuSlowTimer>0){ctx.strokeStyle='rgba(52,211,153,.8)';ctx.lineWidth=3;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(0,0,e.radius+9,0,TAU);ctx.stroke();ctx.setLineDash([]);}
      if(e.kungfuAttackLock>0){ctx.strokeStyle='rgba(251,146,60,.95)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-9,-9);ctx.lineTo(9,9);ctx.moveTo(9,-9);ctx.lineTo(-9,9);ctx.stroke();}
      if(e.statusFlash>0){ctx.globalAlpha=e.statusFlash/14;ctx.strokeStyle=e.statusFlashColor||'#fff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,e.radius+8,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      if(e.hitFlash>0){ctx.globalAlpha=e.hitFlash/8;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.radius+4,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      ctx.restore();
      if(e.type==='boss'||e.type==='elite'||e.type==='midboss'){
        const width=e.type==='boss'?180:e.type==='midboss'?110:55;
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
    for(const b of this.playerBullets){
      if(b.kind==='beam'){
        // Readable aim core + soft edge-faded damage band (does not fully occlude enemies).
        // Visual width tracks hit radius; opacity falls off toward the sides.
        const half = Math.max(2.5, b.radius);
        const top = b.endY;
        const height = Math.max(1, b.y - top);
        ctx.save();
        const band = ctx.createLinearGradient(b.x - half, 0, b.x + half, 0);
        band.addColorStop(0, 'rgba(66,232,255,0)');
        band.addColorStop(.22, 'rgba(66,232,255,.10)');
        band.addColorStop(.5, 'rgba(125,245,255,.26)');
        band.addColorStop(.78, 'rgba(66,232,255,.10)');
        band.addColorStop(1, 'rgba(66,232,255,0)');
        ctx.fillStyle = band;
        ctx.fillRect(b.x - half, top, half * 2, height);
        // Thin bright core for aim clarity (≈35% of damage width).
        ctx.globalAlpha = .92;
        ctx.strokeStyle = '#f0fdff';
        ctx.lineWidth = Math.max(2, half * .35);
        ctx.lineCap = 'round';
        ctx.shadowColor = '#7df5ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, top);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Faint edge guides marking the actual damage bounds.
        ctx.globalAlpha = .18;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#a5f3fc';
        ctx.beginPath();
        ctx.moveTo(b.x - half, b.y); ctx.lineTo(b.x - half, top);
        ctx.moveTo(b.x + half, b.y); ctx.lineTo(b.x + half, top);
        ctx.stroke();
        if (b.statuses?.includes('shock')) {
          // LV3: twin electric filaments + drifting sparks (replaces cheap zigzag).
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#fde68a';
          ctx.lineWidth = 1.35;
          for (const side of [-1, 1]) {
            ctx.globalAlpha = .5;
            ctx.beginPath();
            let started = false;
            for (let y = b.y, step = 0; y >= top; y -= 7, step += 1) {
              const wobble = Math.sin(this.frame * .38 + step * .55 + side * 1.7) * half * .28;
              const x = b.x + side * half * .62 + wobble;
              if (!started) { ctx.moveTo(x, y); started = true; }
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          ctx.fillStyle = '#fff7c2';
          for (let i = 0; i < 6; i += 1) {
            const travel = ((this.frame * 4.2 + i * 41) % height) / height;
            const y = b.y - travel * height;
            const x = b.x + Math.sin(this.frame * .45 + i * 1.3) * half * .55;
            ctx.globalAlpha = .35 + .4 * (0.5 + 0.5 * Math.sin(this.frame * .25 + i));
            ctx.beginPath();
            ctx.arc(x, y, 1.4, 0, TAU);
            ctx.fill();
          }
        }
        ctx.restore();
        continue;
      }
      if(b.kind==='cloudHand'||b.kind==='sixMeridians'){
        const a=Math.atan2(b.vy,b.vx);
        const len=b.trailLength||48;
        const beamHalf=Math.max(2.5,b.radius*.55);
        ctx.save();
        ctx.translate(b.x,b.y);
        ctx.rotate(a);
        ctx.globalCompositeOperation='lighter';
        const glow=ctx.createLinearGradient(-len,0,0,0);
        if(b.kind==='cloudHand'){
          glow.addColorStop(0,'rgba(56,189,248,0)');
          glow.addColorStop(.28,'rgba(56,189,248,.16)');
          glow.addColorStop(.72,'rgba(125,211,252,.5)');
          glow.addColorStop(1,'rgba(240,249,255,.98)');
        }else{
          glow.addColorStop(0,'rgba(125,211,252,0)');
          glow.addColorStop(.24,'rgba(125,211,252,.18)');
          glow.addColorStop(.68,'rgba(196,181,253,.52)');
          glow.addColorStop(1,'rgba(255,255,255,.98)');
        }
        ctx.strokeStyle=glow;
        ctx.lineCap='round';
        ctx.shadowColor=b.kind==='cloudHand' ? '#38bdf8' : '#c4b5fd';
        ctx.shadowBlur=10;
        ctx.lineWidth=beamHalf*2.15;
        ctx.beginPath(); ctx.moveTo(-len,0); ctx.lineTo(0,0); ctx.stroke();
        ctx.shadowBlur=0;
        ctx.strokeStyle=b.kind==='cloudHand' ? 'rgba(255,255,255,.96)' : 'rgba(240,249,255,.98)';
        ctx.lineWidth=Math.max(1.5,beamHalf*.72);
        ctx.beginPath(); ctx.moveTo(-len+4,0); ctx.lineTo(2,0); ctx.stroke();
        ctx.globalAlpha=.45;
        ctx.fillStyle=b.kind==='cloudHand' ? '#7dd3fc' : '#ddd6fe';
        ctx.beginPath(); ctx.ellipse(0,0,beamHalf*1.6,beamHalf*1.2,0,0,TAU); ctx.fill();
        ctx.restore();
        continue;
      }
      if(b.kind==='cluster'){const a=Math.atan2(b.vy,b.vx);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.shadowColor='#f0abfc';ctx.shadowBlur=14;ctx.fillStyle='rgba(240,171,252,.28)';ctx.beginPath();ctx.ellipse(-14,0,20,5,0,0,TAU);ctx.fill();ctx.fillStyle='#f0abfc';ctx.beginPath();ctx.ellipse(0,0,11,3.6,0,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(3,0,5,2,0,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1.5;const tw=this.frame*.5+b.id;ctx.beginPath();ctx.moveTo(-6+Math.sin(tw)*3,-6);ctx.lineTo(-2,0);ctx.lineTo(-6+Math.cos(tw)*3,6);ctx.stroke();ctx.restore();continue;}
      ctx.fillStyle=b.color;ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.5,0,TAU);ctx.fill();ctx.globalAlpha=1;if(b.kind==='rail'){ctx.fillRect(b.x-b.radius/2,b.y-16,b.radius,32);}else{ctx.beginPath();ctx.ellipse(b.x,b.y,b.radius,b.radius*(b.kind==='missile'?1.8:1.4),0,0,TAU);ctx.fill();}const colors={burn:'#ff8a4c',chill:'#42e8ff',shock:'#facc15'};(b.statuses||[]).forEach((status,index)=>{ctx.strokeStyle=colors[status];ctx.lineWidth=2;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*1.8+index*3,0,TAU);ctx.stroke();});ctx.globalAlpha=1;
    }
    for(const b of this.enemyBullets){ctx.fillStyle=b.color;ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.2,0,TAU);ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(b.x-1.5,b.y-1.5,b.radius*.28,0,TAU);ctx.fill();ctx.globalAlpha=1;}
  }

  drawXp(ctx) { for(const o of this.xpOrbs){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(this.frame*.025);ctx.fillStyle=o.glow||'rgba(76,255,155,.18)';ctx.fillRect(-o.radius*1.8,-o.radius*1.8,o.radius*3.6,o.radius*3.6);ctx.fillStyle=o.color||'#4cff9b';ctx.fillRect(-o.radius,-o.radius,o.radius*2,o.radius*2);ctx.fillStyle='#fff';ctx.fillRect(-1,-o.radius,2,o.radius*2);ctx.restore();} }

  drawEffects(ctx) {
    for(const e of this.effects){if(e.type==='arc'||e.type==='prism'){ctx.strokeStyle=e.type==='prism'?'#f0abfc':'#67e8f9';ctx.lineWidth=e.type==='prism'?5:3;ctx.globalAlpha=e.life/e.maxLife;ctx.beginPath();e.points.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x+rand(-3,3),p.y+rand(-3,3));});ctx.stroke();ctx.globalAlpha=1;}
      else if(e.type==='prismSatellite'){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle);ctx.fillStyle='#f0abfc';ctx.shadowColor='#f0abfc';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,0);ctx.lineTo(0,9);ctx.lineTo(-7,0);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(240,171,252,.5)';ctx.beginPath();ctx.arc(0,0,15,0,TAU);ctx.stroke();ctx.restore();}
      else if(e.type==='lanceOrbit'){ctx.save();ctx.strokeStyle='rgba(125,245,255,.92)';ctx.shadowColor='#42e8ff';ctx.shadowBlur=16;ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(e.x,0);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.fillStyle='#dffcff';ctx.beginPath();ctx.arc(e.x,e.y,7,0,TAU);ctx.fill();ctx.restore();}
      else if(e.type==='seekerSatellite'){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle+Math.PI/2);ctx.shadowColor='#ff9f1c';ctx.shadowBlur=12;ctx.fillStyle='#ff9f1c';ctx.strokeStyle='#ffedd5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,7);ctx.lineTo(0,4);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
      else if(e.type==='interceptorPulse'){const progress=1-e.timer/e.maxTimer;ctx.strokeStyle=`rgba(52,211,153,${.3+progress*.65})`;ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(e.x,e.y,24+progress*e.range,0,TAU);ctx.stroke();ctx.setLineDash([]);for(let n=0;n<6;n+=1){const a=this.frame*.13+n/6*TAU;ctx.fillStyle='#34d399';ctx.fillRect(e.x+Math.cos(a)*(28+progress*18)-2,e.y+Math.sin(a)*(18+progress*12)-2,4,4);}}
      else if(e.type==='acidCone'){const t=1-e.life/e.maxLife;ctx.save();ctx.translate(e.x,e.y);const reach=e.range*(.55+t*.45);ctx.globalAlpha=(1-t)*.34;ctx.fillStyle='#a3e635';ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,reach,-Math.PI/2-e.halfAngle,-Math.PI/2+e.halfAngle);ctx.closePath();ctx.fill();ctx.globalAlpha=(1-t)*.55;ctx.fillStyle='rgba(217,249,157,.55)';ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,reach*.72,-Math.PI/2-e.halfAngle*.85,-Math.PI/2+e.halfAngle*.85);ctx.closePath();ctx.fill();ctx.strokeStyle='#ecfccb';ctx.globalAlpha=(1-t)*.7;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,reach,-Math.PI/2-e.halfAngle,-Math.PI/2+e.halfAngle);ctx.stroke();ctx.restore();}
      else if(e.type==='kiai'){const t=1-e.life/e.maxLife;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#fb7185';ctx.lineWidth=6-3*t;for(let n=0;n<3;n+=1){ctx.beginPath();ctx.arc(e.x,e.y,24+t*(this.w*.8)+n*18,0,TAU);ctx.stroke();}ctx.restore();}
      else if(e.type==='jointStrike'){const t=1-e.life/e.maxLife;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#34d399';ctx.lineWidth=7-4*t;ctx.beginPath();ctx.arc(e.x,e.y,e.radius*(.65+t*.5),0,TAU);ctx.stroke();for(let n=0;n<4;n+=1){const a=n/4*TAU+Math.PI/4;ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*18,e.y+Math.sin(a)*18);ctx.lineTo(e.x+Math.cos(a)*e.radius,e.y+Math.sin(a)*e.radius);ctx.stroke();}ctx.restore();}
      else if(e.type==='pushHands'){const t=1-e.life/e.maxLife;ctx.save();ctx.globalAlpha=(1-t)*.75;ctx.fillStyle=e.color||'#38bdf8';ctx.fillRect(e.x-e.width/2,e.y-e.range,e.width,e.range);ctx.strokeStyle=e.strokeColor||'#e0f2fe';ctx.lineWidth=4;for(let n=0;n<3;n+=1){const y=e.y-e.range*(.35+n*.25)-t*14;ctx.beginPath();ctx.moveTo(e.x-e.width/2,y);ctx.lineTo(e.x+e.width/2,y);ctx.stroke();}ctx.restore();}
      else if(e.type==='ironBell'||e.type==='ironBellBreak'){const t=1-e.life/e.maxLife;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#facc15';ctx.lineWidth=6-3*t;ctx.beginPath();ctx.arc(e.x,e.y,22+t*74,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(e.x-16,e.y+8);ctx.quadraticCurveTo(e.x,e.y-26,e.x+16,e.y+8);ctx.stroke();ctx.restore();}
      else if(e.type==='afterimage'){const t=1-e.life/e.maxLife;const strike=e.strike??1;ctx.save();ctx.translate(e.x+(strike-1)*10,e.y-strike*4);ctx.globalAlpha=(1-t)*.42;ctx.fillStyle=e.color||'#c084fc';ctx.beginPath();ctx.moveTo(0,-28);ctx.lineTo(-13,7);ctx.lineTo(-29,15);ctx.lineTo(-12,20);ctx.lineTo(0,12);ctx.lineTo(12,20);ctx.lineTo(29,15);ctx.lineTo(13,7);ctx.closePath();ctx.fill();ctx.strokeStyle='#f3e8ff';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
      else if(e.type==='ironMountain'){const t=1-e.life/e.maxLife;ctx.save();ctx.translate(e.x,e.y);ctx.rotate(t*.5);ctx.globalAlpha=1-t;ctx.strokeStyle='#fb923c';ctx.lineWidth=6-3*t;for(let n=0;n<8;n+=1){const a=n/8*TAU;ctx.beginPath();ctx.moveTo(Math.cos(a)*12,Math.sin(a)*12);ctx.lineTo(Math.cos(a)*(30+t*35),Math.sin(a)*(30+t*35));ctx.stroke();}ctx.restore();}
      else if(e.type==='kungfuDodge'){const t=1-e.life/e.maxLife;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#e0f2fe';ctx.lineWidth=3;for(let n=-1;n<=1;n+=1){ctx.beginPath();ctx.moveTo(e.x-16+n*12-t*28,e.y+20);ctx.quadraticCurveTo(e.x+n*12,e.y-24,e.x+16+n*12+t*28,e.y-4);ctx.stroke();}ctx.restore();}
      else if(e.type==='dodgeMiss'){const t=1-e.life/e.maxLife;ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.vx*.08);ctx.globalAlpha=Math.sin(Math.min(1,t)*Math.PI)*.95;ctx.fillStyle='#e0f2fe';ctx.strokeStyle='rgba(56,189,248,.85)';ctx.lineWidth=3;ctx.font='900 22px monospace';ctx.textAlign='center';ctx.strokeText('MISS',0,0);ctx.fillText('MISS',0,0);ctx.restore();}
      else if(e.type==='criticalHit'){const t=1-e.life/e.maxLife;const scale=1+Math.sin(Math.min(1,t)*Math.PI)*.55;ctx.save();ctx.translate(e.x,e.y);ctx.scale(scale,scale);ctx.globalAlpha=1-t;ctx.fillStyle='#fde047';ctx.strokeStyle='#fff7b2';ctx.lineWidth=3;ctx.font='900 18px monospace';ctx.textAlign='center';ctx.strokeText('CRIT!',0,0);ctx.fillText('CRIT!',0,0);ctx.restore();}

      else if(e.type==='bombard'&&!e.firing){ctx.strokeStyle=`rgba(251,146,60,${.3+Math.sin(this.frame*.3)*.3})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(e.x-e.radius,e.y);ctx.lineTo(e.x+e.radius,e.y);ctx.moveTo(e.x,e.y-e.radius);ctx.lineTo(e.x,e.y+e.radius);ctx.stroke();}
      else if(e.type==='gravity'){const inner=12+Math.sin(this.frame*.18)*5;if(e.blackHole){ctx.save();const halo=ctx.createRadialGradient(e.x,e.y,inner,e.x,e.y,e.radius);halo.addColorStop(0,'rgba(163,230,53,.5)');halo.addColorStop(.55,'rgba(101,163,13,.28)');halo.addColorStop(1,'rgba(63,98,18,.05)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,TAU);ctx.fill();ctx.strokeStyle='rgba(163,230,53,.85)';ctx.lineWidth=2;ctx.setLineDash([6,7]);ctx.beginPath();ctx.arc(e.x,e.y,e.radius*.82,this.frame*.03,this.frame*.03+TAU);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='rgba(217,249,157,.5)';ctx.lineWidth=1.5;ctx.setLineDash([3,9]);ctx.beginPath();ctx.arc(e.x,e.y,e.radius*.55,-this.frame*.05,-this.frame*.05+TAU);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#07111d';ctx.beginPath();ctx.arc(e.x,e.y,inner,0,TAU);ctx.fill();ctx.shadowColor='#a3e635';ctx.shadowBlur=14;ctx.strokeStyle='#bef264';ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,inner,0,TAU);ctx.stroke();ctx.shadowBlur=0;for(let n=0;n<3;n+=1){const a=this.frame*.09+n/3*TAU;ctx.strokeStyle='rgba(217,249,157,.9)';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(e.x,e.y,inner+6,a,a+1.4);ctx.stroke();}for(let n=0;n<5;n+=1){const a=this.frame*.06+n/5*TAU;const dist=e.radius*(.9-((this.frame*.011+n*.2)%.62));ctx.fillStyle='#a3e635';ctx.globalAlpha=.75;ctx.fillRect(e.x+Math.cos(a)*dist-1.5,e.y+Math.sin(a)*dist-1.5,3,3);}ctx.globalAlpha=1;ctx.restore();}else{ctx.fillStyle='rgba(192,132,252,.16)';ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,TAU);ctx.fill();ctx.strokeStyle='#c084fc';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,inner,0,TAU);ctx.stroke();}}
      else if(e.type==='clusterLock'){const t=1-e.life/e.maxLife;ctx.save();ctx.translate(e.x,e.y);ctx.rotate(t*2.4);ctx.globalAlpha=1-t;ctx.strokeStyle='#f0abfc';ctx.lineWidth=2.5;const r=18-t*8;for(let n=0;n<4;n+=1){const a=n/4*TAU;ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a)*(r-6),Math.sin(a)*(r-6));ctx.stroke();}ctx.strokeStyle='rgba(240,171,252,.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();ctx.restore();}
      else if(e.type==='clusterFlash'){const t=1-e.life/e.maxLife;ctx.save();ctx.translate(e.x,e.y);ctx.globalAlpha=1-t;ctx.shadowColor='#f0abfc';ctx.shadowBlur=18;for(let n=0;n<6;n+=1){const a=n/6*TAU+t*1.2;ctx.strokeStyle=n%2?'#fff':'#f0abfc';ctx.lineWidth=3-t*2;ctx.beginPath();ctx.moveTo(Math.cos(a)*4,Math.sin(a)*4);ctx.lineTo(Math.cos(a)*(14+t*26),Math.sin(a)*(14+t*26));ctx.stroke();}ctx.restore();}
      else if(e.type==='hammer'){const t=1-e.life/e.maxLife;const radius=8+(e.maxRadius-8)*t;ctx.save();ctx.strokeStyle=e.color;ctx.globalAlpha=1-t;ctx.lineWidth=5-3*t;ctx.beginPath();ctx.arc(e.x,e.y,radius,0,TAU);ctx.stroke();ctx.strokeStyle='#facc15';ctx.lineWidth=2;for(let n=0;n<4;n+=1){const a=n/4*TAU+Math.PI/4;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(a)*radius,e.y+Math.sin(a)*radius);ctx.stroke();}ctx.restore();}
      else if(e.type==='ring'){const t=1-e.life/e.maxLife;e.radius+=(e.maxRadius-e.radius)*.12;ctx.strokeStyle=e.color;ctx.globalAlpha=1-t;ctx.lineWidth=4;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      else if(e.type==='supply'){const style=this.supplyStyle(e.supply);const color=style.color;const radius=e.radius||16;ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.4;ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,radius+5+Math.sin(this.frame*.16)*2,0,TAU);ctx.stroke();ctx.globalAlpha=1;ctx.shadowColor=color;ctx.shadowBlur=12;ctx.fillStyle=color;ctx.beginPath();ctx.arc(e.x,e.y,radius,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#07111d';ctx.font='bold 17px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(style.label,e.x,e.y+1);ctx.restore();}
      else if(e.type==='ore'){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(this.frame*.04);ctx.shadowColor='#67e8f9';ctx.shadowBlur=10;ctx.fillStyle='#0e7490';ctx.beginPath();ctx.moveTo(0,-e.radius);ctx.lineTo(e.radius*.85,0);ctx.lineTo(0,e.radius);ctx.lineTo(-e.radius*.85,0);ctx.closePath();ctx.fill();ctx.strokeStyle='#67e8f9';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#cffafe';ctx.fillRect(-1.5,-e.radius*.5,3,e.radius);ctx.restore();}
      else if(e.type==='kungfuBeam'){const alpha=clamp(e.life/e.maxLife,0,1);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.shadowColor=e.color;ctx.shadowBlur=14;ctx.strokeStyle=e.color;ctx.lineWidth=e.width;ctx.beginPath();ctx.moveTo(e.x1,e.y1);ctx.lineTo(e.x2,e.y2);ctx.stroke();ctx.shadowBlur=5;ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1.5,e.width*.28);ctx.beginPath();ctx.moveTo(e.x1,e.y1);ctx.lineTo(e.x2,e.y2);ctx.stroke();ctx.restore();}
      else if(e.type==='worldCountdown'){const alpha=Math.sin(Math.PI*clamp(e.life/e.maxLife,0,1));ctx.save();ctx.globalAlpha=.38*alpha;ctx.fillStyle='#e0f2fe';ctx.font='900 92px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.text,e.x,e.y);ctx.globalAlpha=.75*alpha;ctx.strokeStyle='#67e8f9';ctx.lineWidth=2;ctx.strokeText(e.text,e.x,e.y);ctx.restore();}
      else if(e.type==='worldStop'){const alpha=clamp(e.life/e.maxLife,0,1);ctx.save();ctx.globalAlpha=.12*alpha;ctx.fillStyle='#dbeafe';ctx.fillRect(0,0,this.w,this.h);ctx.globalAlpha=.45*alpha;ctx.strokeStyle='#bfdbfe';ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,(1-alpha)*this.w*.55,0,TAU);ctx.stroke();ctx.restore();}
      else if(e.type==='floatingText'){ctx.save();ctx.globalAlpha=clamp(e.life/e.maxLife,0,1);ctx.fillStyle=e.color||'#fff';ctx.font='900 18px monospace';ctx.textAlign='center';ctx.fillText(e.text,e.x,e.y);ctx.restore();}
    }
  }

  drawParticles(ctx) { for(const p of this.particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}ctx.globalAlpha=1; }

  debugState() {
    return { mode:this.mode, frame:this.frame, score:this.score, stage:this.stageIndex+1, wave:this.waveIndex+1, enemies:this.enemies.filter(e=>e.alive).length, boss:this.enemies.find(e=>e.type==='boss'&&e.alive)?.bossId||null, enemyBullets:this.enemyBullets.length, playerBullets:this.playerBullets.length, xpOrbs:this.xpOrbs.length, level:this.player?.level||0, hp:this.player?.hp||0, bombs:this.player?.bombs||0, shield:this.player?.shield||0, kungfuShield:this.player?.kungfuShield||0, kungfuFreezeTimer:this.kungfuFreezeTimer||0, primaryLevel:this.player?.build.primaryLevel||0, overdrive:this.player?.build.overdrive||0, secondaries:this.player?{...this.player.build.secondaries}:{}, passives:this.player?{...this.player.build.passives}:{} };
  }
  debugForceBoss(){if(!this.player)return false;this.enemies=[];this.enemyBullets=[];this.waveIndex=STAGES[this.stageIndex].waves-1;this.mode='playing';this.spawnBoss();return true;}
  debugForceStage(stage){if(!this.player)return false;this.startStage(clamp(Number(stage)-1,0,STAGES.length-1));return true;}
}
