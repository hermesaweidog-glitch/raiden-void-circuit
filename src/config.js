export const WORLD = {
  width: 480,
  height: 800,
  maxPlayerBullets: 220,
  maxEnemyBullets: 260,
  maxEnemies: 40,
  maxParticles: 260,
  maxXp: 100,
  maxEffects: 40,
  maxLevel: 22,
  maxUpgradeRank: 3,
};

export const BUILD_LIMITS = { secondary: 3, passive: 6 };

export const AIRCRAFT = {
  falcon: { id: 'falcon', name: 'FALCON', subtitle: '散射突擊機', color: '#ff3158', speed: 5.8, hp: 4, primary: 'vulcan', mastery: '熔蝕彈', description: '寬角火力與高機動；滿級追加火焰持續傷害。' },
  lancer: { id: 'lancer', name: 'LANCER', subtitle: '貫通雷射機', color: '#42e8ff', speed: 5.1, hp: 4, primary: 'laser', mastery: '連鎖電擊', description: '連續貫通射線；滿級後命中會跳躍電擊。' },
  wasp: { id: 'wasp', name: 'WASP', subtitle: '重型爆破機', color: '#ffd166', speed: 4.5, hp: 5, primary: 'cannon', mastery: '雷神之鎚', description: '慢速爆破彈；滿級後擊殺會引發範圍雷爆。' },
};

export const SECONDARIES = {
  homing: { id: 'homing', name: '追蹤飛彈', max: 3, color: '#ffb703', description: '鎖定單一目標；目標死亡後停止導引。' },
  drone: { id: 'drone', name: '軌道無人機', max: 3, color: '#8b5cf6', description: '環繞機體並定期射擊。' },
  chain: { id: 'chain', name: '連鎖電弧', max: 3, color: '#67e8f9', description: '定時對附近敵人造成跳躍電擊。' },
  mines: { id: 'mines', name: '磁暴地雷', max: 3, color: '#fb7185', description: '在後方留下延遲爆炸地雷。' },
  rail: { id: 'rail', name: '磁軌爆發', max: 3, color: '#f8fafc', description: '定時發射高傷害貫通彈。' },
  bombard: { id: 'bombard', name: '轟炸莢艙', max: 3, color: '#fb923c', description: '標記敵群位置後進行範圍轟炸。' },
  gravity: { id: 'gravity', name: '微型重力井', max: 3, color: '#c084fc', description: '週期性生成奇點，牽引並持續傷害敵群。' },
  prism: { id: 'prism', name: '稜鏡衛星', max: 3, color: '#f0abfc', description: '折射光束同時貫穿多個目標。' },
  interceptor: { id: 'interceptor', name: '攔截蜂群', max: 3, color: '#34d399', description: '自動攔截鄰近敵彈並轉化為反擊脈衝。' },
};

export const PASSIVES = {
  magnet: { id: 'magnet', name: '磁力核心', max: 3, description: '增加經驗吸附範圍與速度。' },
  overclock: { id: 'overclock', name: '超頻模組', max: 3, description: '提高射速。' },
  armor: { id: 'armor', name: '反應裝甲', max: 3, description: '提升最大生命與受傷無敵時間。' },
  critical: { id: 'critical', name: '暴擊矩陣', max: 3, description: '增加暴擊機率與傷害。' },
  salvage: { id: 'salvage', name: '戰場回收', max: 3, description: '提升補給與治療機率。' },
  guidance: { id: 'guidance', name: '導引電腦', max: 3, requiresSecondary: 'homing', description: '提升追蹤轉向；滿級允許一次重新鎖定。' },
  bombcap: { id: 'bombcap', name: '炸彈電容', max: 3, description: '增加炸彈上限與爆炸傷害。' },
  engine: { id: 'engine', name: '引擎調校', max: 3, description: '提升移動速度。' },
};

export const STAGES = [
  { id: 1, name: 'NEON OUTSKIRTS', subtitle: '霓虹外環', theme: ['#031525', '#062d3a'], enemySpeed: 0.85, bulletSpeed: 0.90, bulletCount: 0.65, fireRate: 0.58, enemyHp: 1.00, bossHp: 1.00, waves: 8, midbossWave: 4, boss: 'manta' },
  { id: 2, name: 'ORBITAL FOUNDRY', subtitle: '軌道鑄造廠', theme: ['#1b102a', '#42153f'], enemySpeed: 0.95, bulletSpeed: 1.00, bulletCount: 0.82, fireRate: 0.72, enemyHp: 1.25, bossHp: 1.45, waves: 9, midbossWave: 4, boss: 'carrier' },
  { id: 3, name: 'CRYSTAL TEMPEST', subtitle: '水晶風暴', theme: ['#071a35', '#123f63'], enemySpeed: 1.08, bulletSpeed: 1.12, bulletCount: 1.00, fireRate: 0.90, enemyHp: 1.55, bossHp: 2.00, waves: 10, midbossWave: 5, boss: 'seraph' },
  { id: 4, name: 'SOLAR CITADEL', subtitle: '日冕要塞', theme: ['#2a0c07', '#6c2510'], enemySpeed: 1.22, bulletSpeed: 1.25, bulletCount: 1.22, fireRate: 1.10, enemyHp: 1.90, bossHp: 2.70, waves: 11, midbossWave: 5, boss: 'leviathan' },
  { id: 5, name: 'VOID THRONE', subtitle: '虛空王座', theme: ['#09051b', '#26094b'], enemySpeed: 1.38, bulletSpeed: 1.40, bulletCount: 1.48, fireRate: 1.34, enemyHp: 2.35, bossHp: 3.60, waves: 12, midbossWave: 6, boss: 'raijin' },
];

export const BOSSES = {
  manta: { id: 'manta', name: 'IRON MANTA', title: '鋼鐵魟王', baseHp: 420, color: '#ff3158', phases: ['fan', 'cross', 'laser'] },
  carrier: { id: 'carrier', name: 'SIEGE CARRIER', title: '攻城航母', baseHp: 480, color: '#f97316', phases: ['turrets', 'mines', 'summon'] },
  seraph: { id: 'seraph', name: 'MIRROR SERAPH', title: '鏡像熾天使', baseHp: 530, color: '#38bdf8', phases: ['mirror', 'spiral', 'lance'] },
  leviathan: { id: 'leviathan', name: 'SOLAR LEVIATHAN', title: '太陽巨獸', baseHp: 600, color: '#facc15', phases: ['orbits', 'flares', 'nova'] },
  raijin: { id: 'raijin', name: 'VOID RAIJIN', title: '虛空雷神', baseHp: 700, color: '#c084fc', phases: ['gates', 'storm', 'judgement'] },
};

export const ENEMY_TYPES = {
  scout: { hp: 8, speed: 1.7, radius: 14, score: 100, xp: 4, color: '#ff4d6d' },
  striker: { hp: 14, speed: 1.35, radius: 17, score: 180, xp: 7, color: '#fb923c' },
  gunship: { hp: 24, speed: 0.9, radius: 21, score: 300, xp: 11, color: '#a78bfa' },
  elite: { hp: 62, speed: 0.72, radius: 27, score: 800, xp: 28, color: '#facc15' },
  midboss: { hp: 78, speed: 0.62, radius: 34, score: 1800, xp: 40, color: '#22d3ee' },
};
