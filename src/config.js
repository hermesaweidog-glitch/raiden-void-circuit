export const WORLD = {
  width: 480,
  height: 800,
  maxPlayerBullets: 220,
  maxEnemyBullets: 260,
  maxEnemies: 40,
  maxParticles: 260,
  maxXp: 100,
  maxEffects: 40,
  maxLevel: 999,
  maxUpgradeRank: 3,
};

export const BUILD_LIMITS = { secondary: 3, passive: 6 };
export const PRIMARY_ICON = 'assets/icons/primary-cannon.webp';

export const AIRCRAFT = {
  falcon: { id: 'falcon', name: 'FALCON', subtitle: '散射突擊機', art: 'assets/aircraft/falcon.webp', color: '#ff3158', speed: 5.8, hp: 4, primary: 'vulcan', mastery: '熔蝕彈', description: '寬角火力與高機動；滿級追加火焰持續傷害。' },
  lancer: { id: 'lancer', name: 'LANCER', subtitle: '貫通雷射機', art: 'assets/aircraft/lancer.webp', color: '#42e8ff', speed: 5.1, hp: 4, primary: 'laser', mastery: '連鎖電擊', description: '連續貫通射線；滿級後命中會跳躍電擊。' },
  wasp: { id: 'wasp', name: 'WASP', subtitle: '重型爆破機', art: 'assets/aircraft/wasp.webp', color: '#ffd166', speed: 4.5, hp: 5, primary: 'cannon', mastery: '雷神之鎚', description: '慢速爆破彈；滿級後擊殺會引發範圍雷爆。' },
};

export const PILOTS = {
  imperial: { id: 'imperial', name: '帝國兵', icon: '◇', subtitle: '標準駕駛', ability: '無特殊效果。' },
  rambo: { id: 'rambo', name: '藍波', icon: '✚', subtitle: '生存專家', ability: '初始生命與炸彈、生命與炸彈上限各 +1。' },
  gemini: { id: 'gemini', name: '雙子星', icon: 'Ⅱ', subtitle: '雙重火控', ability: '機體放大 20%；主武器與副武器每次發射數量 +1。' },
  shadow: { id: 'shadow', name: '陰影', icon: '◐', subtitle: '相位潛行', ability: '每 12 秒潛入陰影 2 秒，期間完全無敵。' },
};

export const SECONDARIES = {
  homing: { id: 'homing', icon: 'assets/icons/homing.webp', name: '追蹤飛彈', max: 3, color: '#ffb703', description: '鎖定單一目標；目標死亡後停止導引。' },
  drone: { id: 'drone', icon: 'assets/icons/drone.webp', name: '軌道無人機', max: 3, color: '#8b5cf6', description: '環繞機體並定期射擊。' },
  chain: { id: 'chain', icon: 'assets/icons/chain.webp', name: '連鎖電弧', max: 3, color: '#67e8f9', description: '定時由機體跳電，瞬間連鎖附近敵人。' },
  mines: { id: 'mines', icon: 'assets/icons/mines.webp', name: '磁暴地雷', max: 3, color: '#fb7185', description: '在後方留下延遲爆炸地雷。' },
  rail: { id: 'rail', icon: 'assets/icons/rail.webp', name: '磁軌爆發', max: 3, color: '#f8fafc', description: '定時發射高傷害貫通彈。' },
  bombard: { id: 'bombard', icon: 'assets/icons/bombard.webp', name: '轟炸莢艙', max: 3, color: '#fb923c', description: '標記敵群位置後進行範圍轟炸。' },
  gravity: { id: 'gravity', icon: 'assets/icons/gravity.webp', name: '微型重力井', max: 3, color: '#c084fc', description: '週期性生成奇點，牽引並持續傷害敵群。' },
  prism: { id: 'prism', icon: 'assets/icons/prism.webp', name: '稜鏡衛星', max: 3, color: '#f0abfc', description: '召喚繞行衛星，持續發射垂直貫通光束。' },
  interceptor: { id: 'interceptor', icon: 'assets/icons/interceptor.webp', name: '攔截蜂群', max: 3, color: '#34d399', description: '蓄能後派出蜂群，定期清除鄰近敵彈。' },
};

export const PASSIVES = {
  magnet: { id: 'magnet', icon: 'assets/icons/magnet.webp', name: '磁力核心', max: 3, description: '增加經驗與場地道具的吸附範圍及速度。' },
  overclock: { id: 'overclock', icon: 'assets/icons/overclock.webp', name: '超頻模組', max: 3, description: '提高射速。' },
  armor: { id: 'armor', icon: 'assets/icons/armor.webp', name: '反應裝甲', max: 3, description: '提升最大生命與受傷無敵時間。' },
  critical: { id: 'critical', icon: 'assets/icons/critical.webp', name: '暴擊矩陣', max: 3, description: '增加暴擊機率與傷害。' },
  salvage: { id: 'salvage', icon: 'assets/icons/salvage.webp', name: '戰場回收', max: 3, description: '提升護盾、炸彈與治療補給機率。' },
  guidance: { id: 'guidance', icon: 'assets/icons/guidance.webp', name: '導引電腦', max: 3, requiresSecondary: 'homing', description: '提升追蹤轉向；滿級允許一次重新鎖定。' },
  bombcap: { id: 'bombcap', icon: 'assets/icons/bombcap.webp', name: '炸彈電容', max: 3, description: '增加炸彈上限與爆炸傷害。' },
  engine: { id: 'engine', icon: 'assets/icons/engine.webp', name: '引擎調校', max: 3, description: '提升移動速度。' },
  capacitor: { id: 'capacitor', icon: 'assets/icons/capacitor.webp', name: '戰術電容', max: 3, description: '縮短所有副武器的冷卻時間。' },
  payload: { id: 'payload', icon: 'assets/icons/payload.webp', name: '聚能彈頭', max: 3, description: '提高爆炸與範圍攻擊傷害。' },
  flux: { id: 'flux', icon: 'assets/icons/flux.webp', name: '相位穩流', max: 3, description: '延長一次性護盾觸發後的無敵時間。' },
  harvester: { id: 'harvester', icon: 'assets/icons/harvester.webp', name: '經驗收割器', max: 3, description: '提高所有經驗值取得量。' },
};

export const STAGES = [
  { id: 1, name: 'NEON OUTSKIRTS', subtitle: '霓虹外環', theme: ['#031525', '#062d3a'], enemySpeed: 0.85, bulletSpeed: 0.90, bulletCount: 0.65, fireRate: 0.58, enemyHp: 1.00, bossHp: 1.00, waves: 8, midbossWave: 4, boss: 'manta' },
  { id: 2, name: 'ORBITAL FOUNDRY', subtitle: '軌道鑄造廠', theme: ['#1b102a', '#42153f'], enemySpeed: 0.95, bulletSpeed: 1.00, bulletCount: 0.82, fireRate: 0.72, enemyHp: 1.25, bossHp: 1.45, waves: 9, midbossWave: 4, boss: 'carrier' },
  { id: 3, name: 'CRYSTAL TEMPEST', subtitle: '水晶風暴', theme: ['#071a35', '#123f63'], enemySpeed: 1.08, bulletSpeed: 1.12, bulletCount: 1.00, fireRate: 0.90, enemyHp: 1.55, bossHp: 2.00, waves: 10, midbossWave: 5, boss: 'seraph' },
  { id: 4, name: 'SOLAR CITADEL', subtitle: '日冕要塞', theme: ['#2a0c07', '#6c2510'], enemySpeed: 1.22, bulletSpeed: 1.25, bulletCount: 1.22, fireRate: 1.10, enemyHp: 1.90, bossHp: 2.70, waves: 11, midbossWave: 5, boss: 'leviathan' },
  { id: 5, name: 'VOID THRONE', subtitle: '虛空王座', theme: ['#09051b', '#26094b'], enemySpeed: 1.38, bulletSpeed: 1.40, bulletCount: 1.48, fireRate: 1.34, enemyHp: 2.35, bossHp: 3.60, waves: 12, midbossWave: 6, boss: 'raijin' },
];

export const BOSSES = {
  manta: { id: 'manta', name: 'IRON MANTA', title: '鋼鐵魟王', baseHp: 420, color: '#ff3158', accent: '#ffb4c2', sprite: 'manta-wings', phases: ['fan', 'cross', 'laser'] },
  carrier: { id: 'carrier', name: 'SIEGE CARRIER', title: '攻城航母', baseHp: 480, color: '#f97316', accent: '#ffd0a8', sprite: 'carrier-deck', phases: ['turrets', 'mines', 'summon'] },
  seraph: { id: 'seraph', name: 'MIRROR SERAPH', title: '鏡像熾天使', baseHp: 530, color: '#38bdf8', accent: '#dffcff', sprite: 'crystal-wings', phases: ['mirror', 'spiral', 'lance'] },
  leviathan: { id: 'leviathan', name: 'SOLAR LEVIATHAN', title: '太陽巨獸', baseHp: 600, color: '#facc15', accent: '#fff3a3', sprite: 'solar-horns', phases: ['orbits', 'flares', 'nova'] },
  raijin: { id: 'raijin', name: 'VOID RAIJIN', title: '虛空雷神', baseHp: 700, color: '#c084fc', accent: '#f0d0ff', sprite: 'thunder-crown', phases: ['gates', 'storm', 'judgement'] },
};

export const ENEMY_TYPES = {
  scout: { hp: 8, speed: 1.7, radius: 14, score: 100, xp: 5, color: '#ff4d6d' },
  striker: { hp: 14, speed: 1.35, radius: 17, score: 180, xp: 9, color: '#fb923c' },
  gunship: { hp: 24, speed: 0.9, radius: 21, score: 300, xp: 14, color: '#a78bfa' },
  elite: { hp: 62, speed: 0.72, radius: 27, score: 800, xp: 36, color: '#facc15' },
  midboss: { hp: 138, speed: 0.62, radius: 34, score: 1800, xp: 55, color: '#22d3ee' },
};
