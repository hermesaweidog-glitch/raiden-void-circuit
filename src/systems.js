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

export function fusionConsumedSets(fusions) {
  const consumedSecondaries = new Set();
  const consumedPassives = new Set();
  for (const id of Object.keys(fusions || {})) {
    const fusion = FUSIONS[id];
    if (!fusion) continue;
    for (const sid of fusion.requires || []) consumedSecondaries.add(sid);
    for (const sid of fusion.consumesSecondaries || []) consumedSecondaries.add(sid);
    for (const pid of fusion.requiresPassives || []) consumedPassives.add(pid);
  }
  return { consumedSecondaries, consumedPassives };
}

function selectedExclusiveGroup(build, group, allowed = []) {
  if (!group) return false;
  const allow = new Set(allowed);
  const passives = build.passives || {};
  const fusions = build.fusions || {};
  return Object.keys(passives).some(id => !allow.has(id) && PASSIVES[id]?.exclusiveGroup === group)
    || Object.keys(fusions).some(id => !allow.has(id) && FUSIONS[id]?.exclusiveGroup === group);
}

export function fusionEligible(fusion, build) {
  const secondaries = build.secondaries || {};
  const passives = build.passives || {};
  const fusions = build.fusions || {};
  if (fusions[fusion.id]) return false;
  if (fusion.exclusiveGroup && selectedExclusiveGroup(build, fusion.exclusiveGroup, fusion.requiresPassives || [])) return false;
  if (fusion.requiresFusion && !fusions[fusion.requiresFusion]) return false;
  const allSecondaries = { ...SECONDARIES, ...KUNGFU_SECONDARIES };
  if (!(fusion.requires || []).every(id => allSecondaries[id] && (secondaries[id] || 0) >= allSecondaries[id].max)) return false;
  if (!(fusion.requiresPassives || []).every(id => PASSIVES[id] && (passives[id] || 0) >= PASSIVES[id].max)) return false;
  return true;
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
  const fusions = build.fusions || {};
  const fusionCatalog = Object.values(FUSIONS);
  const { consumedSecondaries, consumedPassives } = fusionConsumedSets(fusions);
  const secondaryFusionCount = Object.keys(fusions).filter(id => FUSIONS[id] && FUSIONS[id].kind !== 'passive').length;
  const passiveFusionCount = Object.keys(fusions).filter(id => FUSIONS[id]?.kind === 'passive').length;
  const occupiedSecondarySlots = Object.keys(secondaries).length + secondaryFusionCount;
  for (const item of Object.values(secondaryCatalog)) {
    const level = secondaries[item.id] || 0;
    if (level >= item.max) continue;
    if (consumedSecondaries.has(item.id)) continue;
    if (level > 0 || occupiedSecondarySlots < (build.secondarySlots || BUILD_LIMITS.secondary)) {
      pool.push({ ...item, category: 'secondary', level });
    }
  }
  const passives = build.passives || {};
  for (const item of Object.values(PASSIVES)) {
    const level = passives[item.id] || 0;
    if (level >= item.max) continue;
    if (consumedPassives.has(item.id)) continue;
    if (level === 0 && item.exclusiveGroup && selectedExclusiveGroup(build, item.exclusiveGroup)) continue;
    const inheritedByFusion = item.requiresSecondary && Object.keys(fusions).some(id => FUSIONS[id]?.requires.includes(item.requiresSecondary));
    if (level === 0 && item.requiresSecondary && !secondaries[item.requiresSecondary] && !inheritedByFusion) continue;
    if (level === 0 && item.requiresPrimaryLevel && (build.primaryLevel || 1) < item.requiresPrimaryLevel) continue;
    if (level > 0 || Object.keys(passives).length + passiveFusionCount < (build.passiveSlots || BUILD_LIMITS.passive)) {
      pool.push({ ...item, category: 'passive', level });
    }
  }
  for (const fusion of fusionCatalog) {
    if (fusionEligible(fusion, build)) pool.push(fusion);
  }
  if (isBuildMaxed(build)) {
    pool.push({ id: 'overdrive-boost', category: 'overdrive', icon: 'assets/icons/overdrive.webp', name: '超頻：火力', description: `所有攻擊永久增加 ${build.overdriveStep ?? 1}%；目前總加成 +${(build.overdrive || 0) * (build.overdriveStep ?? 1)}%。` });
    if (kungfu && (build.evasion ?? 10) < 20) {
      const current = build.evasion ?? 10;
      pool.push({ id: 'evasion-boost', category: 'evasion', icon: 'assets/icons/swift-defense.svg', name: '唯快不破', description: `迴避機率由 ${current}% 提升至 ${Math.min(20, current + 2)}%；最高 20%。` });
    }
    if (build.pilotId === 'reaper' && (build.soulTaker || 1) < 5) {
      const current = build.soulTaker || 1;
      pool.push({ id: 'soul-taker-boost', category: 'soulTaker', icon: 'assets/icons/soul-taker.svg', name: '超頻：奪魂者', description: `主武器即死機率由 ${current}% 提升至 ${Math.min(5, current + .5)}%；最高 5%。` });
    }
    if (build.pilotId === 'imperial') {
      const current = build.battlefieldCleanup || 0;
      pool.push({ id: 'battlefield-cleanup-boost', category: 'battlefieldCleanup', icon: 'assets/icons/battlefield-cleanup.svg', name: '超頻：戰場清理', description: `源晶礦結算獲取量由 +${current}% 提升至 +${current + 1}%；無上限，並套用於一般模式通關獎勵。` });
    }
  }
  return pool;
}

export function isBuildMaxed(build) {
  const secondaries = build.secondaries || {};
  const passives = build.passives || {};
  const fusions = build.fusions || {};
  const kungfu = build.secondarySet === 'kungfu';
  const secondaryCatalog = kungfu ? KUNGFU_SECONDARIES : SECONDARIES;
  const fusionCatalog = Object.values(FUSIONS);
  const secondaryFusionCount = Object.keys(fusions).filter(id => FUSIONS[id] && FUSIONS[id].kind !== 'passive').length;
  const passiveFusionCount = Object.keys(fusions).filter(id => FUSIONS[id]?.kind === 'passive').length;
  return (build.primaryLevel || 1) >= 3
    && Object.keys(secondaries).length + secondaryFusionCount >= (build.secondarySlots || BUILD_LIMITS.secondary)
    && Object.entries(secondaries).every(([id, rank]) => secondaryCatalog[id] && rank >= secondaryCatalog[id].max)
    && Object.keys(passives).length + passiveFusionCount >= (build.passiveSlots || BUILD_LIMITS.passive)
    && Object.entries(passives).every(([id, rank]) => PASSIVES[id] && rank >= PASSIVES[id].max)
    && fusionCatalog.every(fusion => build.fusions?.[fusion.id] || !fusionEligible(fusion, build));
}

export function makeUpgradeChoices(build, random = Math.random, count = 3) {
  return seededShuffle(makeUpgradePool(build), random).slice(0, count);
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
  const index = Math.max(0, stageIndex);
  const campaignGrowth = Math.min(index, 4) * .35;
  const endlessGrowth = Math.max(0, index - 4) * .15;
  return Math.max(STAT_SCALE, Math.round(baseValue * (1 + campaignGrowth + endlessGrowth) * STAT_SCALE));
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
