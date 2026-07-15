import { SECONDARIES, PASSIVES } from './config.js';

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
  if ((build.primaryLevel || 1) < 3) {
    pool.push({ id: 'primary', category: 'primary', name: '主武器強化', description: '提升主武器火力與彈道。' });
  }
  const secondaries = build.secondaries || {};
  for (const item of Object.values(SECONDARIES)) {
    const level = secondaries[item.id] || 0;
    if (level >= item.max) continue;
    if (level > 0 || Object.keys(secondaries).length < (build.secondarySlots || 2)) {
      pool.push({ ...item, category: 'secondary', level });
    }
  }
  const passives = build.passives || {};
  for (const item of Object.values(PASSIVES)) {
    const level = passives[item.id] || 0;
    if (level >= item.max) continue;
    if (level > 0 || Object.keys(passives).length < (build.passiveSlots || 4)) {
      pool.push({ ...item, category: 'passive', level });
    }
  }
  return pool;
}

export function makeUpgradeChoices(build, random = Math.random) {
  const choices = seededShuffle(makeUpgradePool(build), random).slice(0, 3);
  const fallbacks = [
    { id: 'repair', category: 'supply', name: '緊急維修', description: '恢復 2 點生命。' },
    { id: 'bomb', category: 'supply', name: '炸彈補給', description: '補充 1 枚炸彈。' },
    { id: 'score', category: 'supply', name: '戰術資料', description: '獲得 2500 分。' },
  ];
  for (const item of fallbacks) {
    if (choices.length >= 3) break;
    if (!choices.some(choice => choice.id === item.id)) choices.push(item);
  }
  return choices.slice(0, 3);
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
  return Math.round(20 + level * 9 + level ** 1.28 * 3);
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
