// Meta progression: persistent currency (源晶礦), upgrades, and unlocks stored in localStorage.
export const META_STORAGE_KEY = 'void-circuit-meta';

export const META_UPGRADES = {
  firepower: { id: 'firepower', name: '火力校準', icon: 'assets/icons/primary-cannon.webp', max: 10, costs: [100, 200, 400, 800, 1500, 2500, 4000, 7000, 12000, 20000], describe: rank => `火力加成 +${rank * 10}%` },
  fuelTank: { id: 'fuelTank', name: '燃料倉', icon: '✚', max: 5, costs: [100, 500, 1000, 2000, 4000], describe: rank => `基礎生命 ${25 + rank * 5}` },
  lives: { id: 'lives', name: '殘機', icon: '♥', max: 1, costs: [12000], describe: rank => `備用機體 ${rank}` },
  bombPants: { id: 'bombPants', name: '炸藥褲', icon: '◈', max: 1, costs: [1000], describe: rank => `出擊炸彈 ${2 + rank}` },
  secondarySlot: { id: 'secondarySlot', name: '副武器槽', icon: '▣', max: 1, costs: [5000], describe: rank => `副武器槽 ${2 + rank}` },
  passiveSlot: { id: 'passiveSlot', name: '被動元件槽', icon: '▤', max: 2, costs: [4000, 20000], describe: rank => `被動槽 ${4 + rank}` },
  oreGain: { id: 'oreGain', name: '採礦強化', icon: '◆', max: 10, costs: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000], describe: rank => `源晶礦基數 +${rank}` },
  xpGain: { id: 'xpGain', name: '經驗增幅', icon: '✦', max: 3, costs: [500, 2000, 5000], describe: rank => `經驗加成 +${rank * 10}%` },
  overdriveBoost: { id: 'overdriveBoost', name: '超頻強化', icon: 'assets/icons/overdrive.webp', max: 5, costs: [2000, 5000, 10000, 18000, 30000], describe: rank => `超頻火力每次 +${5 + rank}%` },
};

export const META_UNLOCKS = {
  lancer: { id: 'lancer', kind: 'craft', name: 'LANCER', cost: 500 },
  wasp: { id: 'wasp', kind: 'craft', name: 'WASP', cost: 2000 },
  rambo: { id: 'rambo', kind: 'pilot', name: '藍波', cost: 500 },
  gemini: { id: 'gemini', kind: 'pilot', name: '雙子星', cost: 2000 },
  shadow: { id: 'shadow', kind: 'pilot', name: '陰影', cost: 2000 },
  joker: { id: 'joker', kind: 'pilot', name: '小丑', cost: 7777 },
  reaper: { id: 'reaper', kind: 'pilot', name: '死神', cost: 30000 },
  kungfu: { id: 'kungfu', kind: 'pilot', name: '功夫', cost: 50000 },
  gambler: { id: 'gambler', kind: 'pilot', name: '賭徒', cost: 100000 },
};

export const FREE_CRAFTS = ['falcon'];
export const FREE_PILOTS = ['imperial'];

export function defaultMetaState() {
  return {
    ore: 0,
    upgrades: Object.fromEntries(Object.keys(META_UPGRADES).map(id => [id, 0])),
    unlocks: [],
    cleared: false,
  };
}

export function maxedMetaState() {
  return {
    ore: 0,
    upgrades: Object.fromEntries(Object.entries(META_UPGRADES).map(([id, def]) => [id, def.max])),
    unlocks: Object.keys(META_UNLOCKS),
    cleared: true,
  };
}

export function normalizeMetaState(raw) {
  const base = defaultMetaState();
  if (!raw || typeof raw !== 'object') return base;
  const ore = Number(raw.ore);
  base.ore = Number.isFinite(ore) && ore > 0 ? Math.floor(ore) : 0;
  for (const [id, def] of Object.entries(META_UPGRADES)) {
    const rank = Number(raw.upgrades?.[id]);
    base.upgrades[id] = Number.isFinite(rank) ? Math.max(0, Math.min(def.max, Math.floor(rank))) : 0;
  }
  base.unlocks = Array.isArray(raw.unlocks) ? [...new Set(raw.unlocks.filter(id => META_UNLOCKS[id]))] : [];
  base.cleared = Boolean(raw.cleared);
  return base;
}

export function loadMetaState(storage = globalThis.localStorage) {
  try {
    return normalizeMetaState(JSON.parse(storage.getItem(META_STORAGE_KEY)));
  } catch {
    return defaultMetaState();
  }
}

export function saveMetaState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(META_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function upgradeCost(id, rank) {
  const def = META_UPGRADES[id];
  if (!def || rank >= def.max) return null;
  return def.costs[rank];
}

export function purchaseUpgrade(state, id) {
  const cost = upgradeCost(id, state.upgrades[id] ?? 0);
  if (cost === null || state.ore < cost) return false;
  state.ore -= cost;
  state.upgrades[id] += 1;
  return true;
}

export function purchaseUnlock(state, id) {
  const def = META_UNLOCKS[id];
  if (!def || state.unlocks.includes(id) || state.ore < def.cost) return false;
  state.ore -= def.cost;
  state.unlocks.push(id);
  return true;
}

export function isCraftUnlocked(state, craftId) {
  return FREE_CRAFTS.includes(craftId) || state.unlocks.includes(craftId);
}

export function isPilotUnlocked(state, pilotId) {
  return FREE_PILOTS.includes(pilotId) || state.unlocks.includes(pilotId);
}

// --- Derived combat values -------------------------------------------------
// Fresh players run at 50% attack; each firepower rank adds 5%, so max rank
// restores today's tuned baseline (100%).
export function metaAttackMultiplier(rank) {
  return .5 + .05 * rank;
}

// Fuel tank: base 25 HP, +5 per rank (max 50). Craft hp bonuses are applied
// separately as flat additions (Falcon +10).
export function metaBaseHp(rank) {
  return 25 + 5 * rank;
}

// Fresh players earn 70% XP; each rank adds 10%, max restores today's 100%.
export function metaXpMultiplier(rank) {
  return .7 + .1 * rank;
}

export function metaFromUpgrades(upgrades) {
  return {
    attackMultiplier: metaAttackMultiplier(upgrades.firepower ?? 0),
    baseHp: metaBaseHp(upgrades.fuelTank ?? 0),
    lives: upgrades.lives ?? 0,
    bombs: 2 + (upgrades.bombPants ?? 0),
    secondarySlots: 2 + (upgrades.secondarySlot ?? 0),
    passiveSlots: 4 + (upgrades.passiveSlot ?? 0),
    oreBonus: upgrades.oreGain ?? 0,
    xpMultiplier: metaXpMultiplier(upgrades.xpGain ?? 0),
    overdriveStep: 5 + (upgrades.overdriveBoost ?? 0),
  };
}

// --- Ore drop economics ----------------------------------------------------
export const ORE_BASE_VALUE = 10;
export const ORE_DROP_CHANCE = .3;
export const ORE_CLEAR_BONUS = 1750;

export function oreDropFor(enemyType, baseValue, random = Math.random) {
  const large = enemyType === 'elite' || enemyType === 'midboss' || enemyType === 'boss';
  if (!large && random() >= ORE_DROP_CHANCE) return 0;
  if (enemyType === 'boss') return baseValue * 10;
  if (enemyType === 'midboss') return baseValue * 5;
  return baseValue;
}
