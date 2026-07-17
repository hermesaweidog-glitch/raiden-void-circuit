import { BUILD_LIMITS, FUSIONS, KUNGFU_SECONDARIES, SECONDARIES, PASSIVES, PRIMARY_ICON, STAT_SCALE } from './config.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distanceSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function shouldCullEnemyBullet(bullet, width, height) {
  const radius = bullet.radius || 0;
  return bullet.x + radius < 0
    || bullet.x - radius > width
    || bullet.y + radius < 0
    || bullet.y - radius > height;
}

export function seededShuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function makeUpgradePool(build) {
  const pool = [];
  const kungfu = build.secondarySet === 'kungfu';
  const secondaryCatalog = kungfu ? KUNGFU_SECONDARIES : SECONDARIES;
  if ((build.primaryLevel || 1) < 3) {
    pool.push(kungfu
      ? { id: 'primary', category: 'primary', icon: 'assets/icons/basic-fist.svg', name: '基本拳法', description: '提升基礎撞擊傷害與碰撞範圍。' }
      : { id: 'primary', category: 'primary', icon: PRIMARY_ICON, name: '主武器強化', description: '提升主武器火力與彈道。' });
  }
  const secondaries = build.secondaries || {};
  for (const item of Object.values(secondaryCatalog)) {
    const level = secondaries[item.id] || 0;
    if (level >= item.max) continue;
    if (level > 0 || Object.keys(secondaries).length < (build.secondarySlots || BUILD_LIMITS.secondary)) {
      pool.push({ ...item, category: 'secondary', level });
    }
  }
  const passives = build.passives || {};
  for (const item of Object.values(PASSIVES)) {
    const level = passives[item.id] || 0;
    if (level >= item.max) continue;
    if (level === 0 && item.requiresSecondary && !secondaries[item.requiresSecondary]) continue;
    if (level === 0 && item.requiresPrimaryLevel && (build.primaryLevel || 1) < item.requiresPrimaryLevel) continue;
    if (level > 0 || Object.keys(passives).length < (build.passiveSlots || BUILD_LIMITS.passive)) {
      pool.push({ ...item, category: 'passive', level });
    }
  }
  const fusions = build.fusions || {};
  for (const fusion of kungfu ? [] : Object.values(FUSIONS)) {
    if (!fusions[fusion.id] && fusion.requires.every(id => secondaries[id] >= SECONDARIES[id].max)) pool.push(fusion);
  }
  if (isBuildMaxed(build)) {
    pool.push({ id: 'overdrive-boost', category: 'overdrive', icon: 'assets/icons/overdrive.webp', name: '無限超載', description: `所有攻擊永久增加 10%；目前已累加 ${build.overdrive || 0} 次。` });
  }
  return pool;
}

export function isBuildMaxed(build) {
  const secondaries = build.secondaries || {};
  const passives = build.passives || {};
  const kungfu = build.secondarySet === 'kungfu';
  const secondaryCatalog = kungfu ? KUNGFU_SECONDARIES : SECONDARIES;
  return (build.primaryLevel || 1) >= 3
    && Object.keys(secondaries).length >= (build.secondarySlots || BUILD_LIMITS.secondary)
    && Object.entries(secondaries).every(([id, rank]) => secondaryCatalog[id] && rank >= secondaryCatalog[id].max)
    && Object.keys(passives).length >= (build.passiveSlots || BUILD_LIMITS.passive)
    && Object.entries(passives).every(([id, rank]) => PASSIVES[id] && rank >= PASSIVES[id].max)
    && (kungfu || Object.values(FUSIONS).every(fusion => fusion.requires.some(id => (secondaries[id] || 0) < SECONDARIES[id].max) || build.fusions?.[fusion.id]));
}

export function makeUpgradeChoices(build, random = Math.random) {
  return seededShuffle(makeUpgradePool(build), random).slice(0, 3);
}

export function updateGuidance(missile, enemies, position) {
  if (!missile.guidanceActive) return { ...missile };
  const target = enemies.find(enemy => enemy.id === missile.targetId && enemy.alive !== false && (enemy.hp === undefined || enemy.hp > 0));
  if (!target) return { ...missile, guidanceActive: false };
  const desired = Math.atan2(target.y - position.y, target.x - position.x);
  const current = Math.atan2(missile.vy, missile.vx);
  let delta = desired - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const next = current + clamp(delta, -missile.turn, missile.turn);
  const speed = Math.hypot(missile.vx, missile.vy);
  return { ...missile, vx: Math.cos(next) * speed, vy: Math.sin(next) * speed };
}

export function upgradePower(rank) {
  return [0, 1, 3, 5][clamp(Math.round(rank), 0, 3)];
}

export function xpForLevel(level) {
  return Math.round((16 + level * 5 + level ** 1.18 * 1.6) * STAT_SCALE);
}

export function xpValueForStage(baseValue, stageIndex) {
  return Math.max(STAT_SCALE, Math.round(baseValue * (1 + Math.max(0, stageIndex) * .35) * STAT_SCALE));
}

export function splitXpValue(total) {
  const values = [];
  let remaining = Math.max(0, Math.round(total));
  for (const denomination of [200, 80, 30, 10]) {
    while (remaining >= denomination) {
      values.push(denomination);
      remaining -= denomination;
    }
  }
  return values;
}

export function midbossProgress(stage) {
  return clamp(stage.midbossWave / (stage.waves + 1), 0, 1);
}

export function stageProgress(stage, waveIndex, mode = 'playing') {
  if (mode === 'stageIntro') return 0;
  if (['bossWarning', 'boss', 'stageClear', 'victory'].includes(mode)) return 1;
  return clamp((waveIndex + 1) / (stage.waves + 1), 0, 1);
}

export function stagePressure(stage, waveIndex) {
  return 1 + waveIndex * (0.065 + stage.id * 0.006);
}

export function pickNearestTarget(origin, enemies) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of enemies) {
    if (enemy.alive === false || enemy.hp <= 0) continue;
    const d = distanceSq(origin, enemy);
    if (d < bestDistance) { bestDistance = d; best = enemy; }
  }
  return best;
}
