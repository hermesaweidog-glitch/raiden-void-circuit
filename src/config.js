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
export const STAT_SCALE = 10;
export const PRIMARY_ICON = 'assets/icons/primary-cannon.webp';

export const AIRCRAFT = {
  falcon: { id: 'falcon', name: 'FALCON', subtitle: '散射突擊機', art: 'assets/aircraft/falcon.webp', color: '#ff3158', speed: 5.8, hp: 4, hpBonus: 10, primary: 'vulcan', mastery: '熔蝕彈', description: '寬角火力與高機動；機體裝甲 +10；滿級追加火焰持續傷害。' },
  lancer: { id: 'lancer', name: 'LANCER', subtitle: '貫通雷射機', art: 'assets/aircraft/lancer.webp', color: '#42e8ff', speed: 5.1, hp: 4, secondaryBoost: .1, primary: 'laser', mastery: '連鎖電擊', description: '連續貫通射線；副武器傷害 +10%；滿級後命中會跳躍電擊。' },
  wasp: { id: 'wasp', name: 'WASP', subtitle: '重型爆破機', art: 'assets/aircraft/wasp.webp', color: '#ffd166', speed: 4.5, hp: 5, bombCapBonus: 1, passiveSlotBonus: 1, primary: 'cannon', mastery: '雷神之鎚', description: '慢速爆破彈；炸彈上限 +1、被動槽 +1；滿級後擊中引發範圍雷爆。' },
};

export const PILOTS = {
  imperial: { id: 'imperial', name: '帝國兵', icon: '◇', art: 'assets/pilots/imperial.webp', subtitle: '戰場清理', ability: '所有資源效率可透過超頻每次 +1%，無上限。' },
  rambo: { id: 'rambo', name: '藍波', icon: '✚', art: 'assets/pilots/rambo.webp', subtitle: '生存專家', ability: '生命與炸彈上限增加1階段；擊倒 BOSS 補滿炸彈，炸彈對大型目標傷害 +50%。' },
  gemini: { id: 'gemini', name: '雙子星', icon: 'Ⅱ', art: 'assets/pilots/gemini.webp', subtitle: '雙重火控', ability: '機體放大 20%；主武器與副武器每次發射數量 +1。' },
  shadow: { id: 'shadow', name: '陰影', icon: '◐', art: 'assets/pilots/shadow.webp', subtitle: '相位潛行', ability: '每 6 秒潛入陰影 2 秒；受傷後獲得 2 秒無敵，並以主武器 2 秒 DPS 對周圍造成相位反擊。' },
  joker: { id: 'joker', name: '小丑', icon: '♢', art: 'assets/pilots/joker.webp', subtitle: '混沌選牌', ability: '副武器與被動技能裝備上限各 +1；自動選擇升級項目，並有 20% 機率額外再獲得一次升級項目。' },
  reaper: { id: 'reaper', name: '死神', icon: '☠', art: 'assets/pilots/reaper.webp', subtitle: '致命契約', ability: '初始最大生命 -20 HP；所有傷害 +50%；主武器有 1% 機率直接擊殺，可超頻至 5%。' },
  kungfu: { id: 'kungfu', name: '功夫', icon: '拳', art: 'assets/pilots/kungfu.webp', subtitle: '鐵身宗師', ability: '無法射擊；生命與生命提升、恢復效果加倍，以無傷碰撞攻擊敵人。' },
  gambler: { id: 'gambler', name: '賭徒', icon: '◆', art: 'assets/pilots/gambler.webp', subtitle: '極限擦彈', ability: '核心判定縮小；敵彈接觸機身即使狂熱 +1% 傷害，被擊中重置；初始生命減半。' },
};

export const SECONDARIES = {
  homing: { id: 'homing', icon: 'assets/icons/homing.webp', name: '追蹤飛彈', max: 3, color: '#ffb703', description: '鎖定單一目標；目標死亡後停止導引。' },
  drone: { id: 'drone', icon: 'assets/icons/drone.webp', name: '軌道無人機', max: 3, color: '#8b5cf6', description: '環繞機體並定期射擊。' },
  chain: { id: 'chain', icon: 'assets/icons/chain.webp', name: '連鎖電弧', max: 3, color: '#67e8f9', description: '定時由機體跳電，瞬間連鎖附近敵人。' },
  acid: { id: 'acid', icon: 'assets/icons/acid.svg', name: '酸性噴霧', max: 3, color: '#a3e635', description: '向前扇形噴射酸霧；使目標 5 秒內承受傷害 +20%／30%／40%。' },
  rail: { id: 'rail', icon: 'assets/icons/rail.webp', name: '磁軌爆發', max: 3, color: '#f8fafc', description: '定時發射高傷害貫通彈。' },
  bombard: { id: 'bombard', icon: 'assets/icons/bombard.webp', name: '轟炸莢艙', max: 3, color: '#fb923c', description: '標記敵群位置後進行範圍轟炸。' },
  gravity: { id: 'gravity', icon: 'assets/icons/gravity.webp', name: '微型重力井', max: 3, color: '#c084fc', description: '週期性生成奇點，牽引並持續傷害敵群。' },
  prism: { id: 'prism', icon: 'assets/icons/prism.webp', name: '稜鏡衛星', max: 3, color: '#f0abfc', description: '召喚繞行衛星，持續發射垂直貫通光束。' },
  interceptor: { id: 'interceptor', icon: 'assets/icons/interceptor.webp', name: '攔截蜂群', max: 3, color: '#34d399', description: '蓄能後派出蜂群，定期清除鄰近敵彈。' },
};

export const KUNGFU_SECONDARIES = {
  kiai: { id: 'kiai', icon: 'assets/icons/kiai.svg', name: '大喝爆音', max: 3, color: '#fde68a', description: '消滅全場敵彈；敵方行動暫停 0.3／0.7／1.2 秒。' },
  jointStrike: { id: 'jointStrike', icon: 'assets/icons/joint-strike.svg', name: '關節打擊', max: 3, color: '#fb7185', description: '極短距離環形攻擊，使目標速度下降 20%／30%／40%。' },
  pushHands: { id: 'pushHands', icon: 'assets/icons/push-hands.svg', name: '推手', max: 3, color: '#67e8f9', description: '持續向前打出極短距離的橫向掌風。' },
  ironBell: { id: 'ironBell', icon: 'assets/icons/iron-bell.svg', name: '金鐘罩', max: 3, color: '#facc15', description: '週期性恢復一層有時限、可抵擋一次攻擊的護罩。' },
  afterimage: { id: 'afterimage', icon: 'assets/icons/afterimage.svg', name: '殘影', max: 3, color: '#c084fc', description: '每秒在中距離內 1／2／3 名敵人身上留下撞擊殘影。' },
  ironMountain: { id: 'ironMountain', icon: 'assets/icons/iron-mountain.svg', name: '鐵山靠', max: 3, color: '#fb923c', description: '提高撞擊傷害；每 5 秒可使目標停止攻擊 0.8／1／1.5 秒。' },
};

export const PASSIVES = {
  magnet: { id: 'magnet', icon: 'assets/icons/magnet.webp', name: '磁力核心', max: 3, description: '增加經驗與場地道具的吸附範圍及速度。' },
  overclock: { id: 'overclock', icon: 'assets/icons/overclock.webp', name: '超頻模組', max: 3, description: '提高射速。' },
  armor: { id: 'armor', icon: 'assets/icons/armor.webp', name: '反應裝甲', max: 3, description: '提升最大生命與受傷無敵時間。' },
  critical: { id: 'critical', icon: 'assets/icons/critical.webp', name: '暴擊矩陣', max: 3, description: '增加暴擊機率與傷害。' },
  salvage: { id: 'salvage', icon: 'assets/icons/salvage.webp', name: '戰場回收', max: 3, description: '提升護盾、炸彈與治療補給機率。' },
  guidance: { id: 'guidance', icon: 'assets/icons/guidance.webp', name: '導引電腦', max: 3, requiresSecondary: 'homing', description: '提升追蹤轉向；滿級允許一次重新鎖定。' },
  bombcap: { id: 'bombcap', icon: 'assets/icons/bombcap.webp', name: '炸彈電容', max: 3, description: '增加炸彈上限與爆炸傷害。' },
  support: { id: 'support', icon: 'assets/icons/support.svg', name: '支援協定', max: 3, description: '2%／3%／4% 機率使本次傷害成為 1.5／2／3 倍。' },
  capacitor: { id: 'capacitor', icon: 'assets/icons/capacitor.webp', name: '戰術電容', max: 3, description: '縮短所有副武器的冷卻時間。' },
  payload: { id: 'payload', icon: 'assets/icons/payload.webp', name: '聚能彈頭', max: 3, description: '提高爆炸與範圍攻擊傷害；功夫範圍技亦會擴大判定。' },
  flux: { id: 'flux', icon: 'assets/icons/flux.webp', name: '相位穩流', max: 3, description: '延長一次性護盾觸發後的無敵時間。' },
  harvester: { id: 'harvester', icon: 'assets/icons/harvester.webp', name: '經驗收割器', max: 3, description: '提高所有經驗值取得量。' },
};

export const FUSIONS = {
  seekerOrbit: { id: 'seekerOrbit', icon: 'assets/icons/seeker-orbit.svg', name: '追獵軌道', category: 'fusion', set: 'standard', requires: ['drone', 'homing'], description: '每個軌道衛星發射滿級數量的橘色追蹤導彈。' },
  seekerOrbitPlus: { id: 'seekerOrbitPlus', icon: 'assets/icons/seeker-orbit-plus.svg', name: '追獵軌道+', category: 'fusion', set: 'standard', requires: [], requiresPassives: ['guidance'], requiresFusion: 'seekerOrbit', consumesSecondaries: ['drone', 'homing'], description: '追獵軌道內建滿級導引電腦（含重新鎖定），並移除導引電腦。' },
  lanceOrbit: { id: 'lanceOrbit', icon: 'assets/icons/lance-orbit.svg', name: '貫通光環', category: 'fusion', set: 'standard', requires: ['rail', 'prism'], description: '磁軌與稜鏡合成繞機貫通雷射，傷害等同一級 Lancer。' },
  clusterStars: { id: 'clusterStars', icon: 'assets/icons/cluster-stars.svg', name: '群星', category: 'fusion', set: 'standard', requires: ['bombard', 'prism'], description: '鎖定多個目標，朝各目標方向發射一發高速直線貫通射線。' },
  blackHole: { id: 'blackHole', icon: 'assets/icons/black-hole.svg', name: '黑洞', category: 'fusion', set: 'standard', requires: ['acid', 'gravity'], description: '重力井合併酸蝕增傷效果，牽引範圍稍微擴大。' },
  langinus: { id: 'langinus', icon: 'assets/icons/langeinus.svg', name: '朗基努斯之槍', category: 'fusion', kind: 'passive', set: 'standard', requires: [], requiresPassives: ['critical', 'support'], description: '暴擊矩陣與支援協定效果合併，恆為滿級。' },
  suicideSquad: { id: 'suicideSquad', icon: 'assets/icons/suicide-assault.svg', name: '自殺突擊隊', category: 'fusion', kind: 'passive', set: 'standard', requires: [], requiresPassives: ['bombcap', 'payload'], description: '炸彈電容與聚能彈頭效果合併；被擊中時自動觸發炸彈效果並消耗 1 枚炸彈（無庫存不觸發）。' },
  luckyStar: { id: 'luckyStar', icon: 'assets/icons/lucky-star.svg', name: '幸運星', category: 'fusion', kind: 'passive', set: 'standard', requires: [], requiresPassives: ['salvage', 'magnet', 'harvester'], description: '戰場回收、磁力核心與經驗收割器效果合併；所有受機率影響的效果，機率額外 +2%。' },
  taijiMaster: { id: 'taijiMaster', icon: 'assets/icons/taiji-master.svg', name: '太極宗', category: 'fusion', set: 'kungfu', requires: ['pushHands', 'ironMountain'], description: '異色推手可清除範圍內敵彈，並具備滿級鐵山靠效果。' },
  sixHarmony: { id: 'sixHarmony', icon: 'assets/icons/six-harmony.svg', name: '六合拳', category: 'fusion', set: 'kungfu', requires: ['afterimage', 'jointStrike'], description: '殘影優先分散攻擊；單一目標承受全部殘影，並附帶關節緩速。' },
};

export const STAGES = [
  { id: 1, name: 'NEON OUTSKIRTS', subtitle: '霓虹外環', theme: ['#031525', '#062d3a'], enemySpeed: 0.80, bulletSpeed: 0.85, bulletCount: 0.55, fireRate: 0.50, enemyHp: 0.70, bossHp: 0.70, waves: 8, midbossWave: 4, boss: 'manta' },
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
