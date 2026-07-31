export const ENEMY_CLASSES = {
  // targetWidth / targetHeight are the resting model's intended on-screen bounds
  // at modelScale = 1. The geometry builders already encode class-to-class size,
  // so a second large fixed multiplier would make the preview dramatically oversized.
  scout: { id: 'scout', label: 'SCOUT', zh: '偵察小怪', radius: 14, targetWidth: 34, targetHeight: 44, screenY: 315 },
  striker: { id: 'striker', label: 'STRIKER', zh: '突擊小怪', radius: 17, targetWidth: 43, targetHeight: 54, screenY: 310 },
  gunship: { id: 'gunship', label: 'GUNSHIP', zh: '重型小怪', radius: 21, targetWidth: 55, targetHeight: 68, screenY: 302 },
  elite: { id: 'elite', label: 'ELITE', zh: '精英', radius: 27, targetWidth: 72, targetHeight: 90, screenY: 292 },
  midboss: { id: 'midboss', label: 'MIDBOSS', zh: '中 Boss', radius: 34, targetWidth: 100, targetHeight: 126, screenY: 276 },
  boss: { id: 'boss', label: 'BOSS', zh: '關卡 Boss', radius: 54, targetWidth: 168, targetHeight: 188, screenY: 255 },
};

export const BOSS_INFO = {
  1: { id: 'manta', name: 'IRON MANTA', title: '鋼鐵魟王', phases: ['fan', 'cross', 'laser'] },
  2: { id: 'carrier', name: 'SIEGE CARRIER', title: '攻城航母', phases: ['turrets', 'mines', 'summon'] },
  3: { id: 'seraph', name: 'MIRROR SERAPH', title: '鏡像熾天使', phases: ['mirror', 'spiral', 'lance'] },
  4: { id: 'leviathan', name: 'SOLAR LEVIATHAN', title: '太陽巨獸', phases: ['orbits', 'flares', 'nova'] },
  5: { id: 'raijin', name: 'VOID RAIJIN', title: '虛空雷神', phases: ['gates', 'storm', 'judgement'] },
};

export const STAGE_ENEMY_THEMES = {
  1: {
    stageId: 1,
    faction: 'ABYSSAL RECON／深海相位偵察群',
    concept: '三維深海飛行生物經由霓虹海面裂層躍入二維世界；輪廓扁平但具有明顯厚度、腹部核心與可扭動翼膜。',
    entrance: 'IRON MANTA 先以水下陰影掠過，海面抬升後破水躍出，帶出環形浪牆與發光水滴，再翻正進入戰鬥平面。',
    units: {
      scout: 'SKIMMER RAY／掠波魟：小型菱翼偵察體，翼尖上下拍動。',
      striker: 'NEEDLE RAY／針翼魟：前端長槍與雙裂翼，突進時收翼。',
      gunship: 'LANTERN RAY／燈籠魟艇：腹部雙砲與大型發光囊。',
      elite: 'REEF HUNTER／礁獵者：四翼獵食型，核心會張開鎖定。',
      midboss: 'RIFT SKATE／裂隙鰩：厚重多層翼膜，可借用魟王第一階扇形彈。',
      boss: 'IRON MANTA／鋼鐵魟王：大型多層魟翼與尾刃。',
    },
  },
  2: {
    stageId: 2,
    faction: 'FORGE LEGION／鑄造軍團',
    concept: '敵人是軌道鑄造廠即時壓製出的工業構造體；裝甲像模具、夾爪與活塞，熱核心沿接縫發光。',
    entrance: 'SIEGE CARRIER 的艦體分成數個大型模組，由左右裝配臂推入、焊接、鎖扣；最後吊架鬆脫，整艦下沉至戰鬥位置。',
    units: {
      scout: 'RIVET DRONE／鉚釘蜂：三爪焊接無人機。',
      striker: 'CUTTER FRAME／切割機架：前置熱刃與收放夾臂。',
      gunship: 'CRUCIBLE GUNSHIP／坩堝砲艇：熔爐核心與雙重砲座。',
      elite: 'FORGE SENTINEL／鍛爐哨衛：四活塞裝甲與旋轉壓印盤。',
      midboss: 'PRESS WARDEN／重壓監工：巨大夾模構造，砲口藏在壓床中央。',
      boss: 'SIEGE CARRIER／攻城航母：可展開甲板、砲塔與投放艙。',
    },
  },
  3: {
    stageId: 3,
    faction: 'PRISMATIC SWARM／稜晶群體',
    concept: '敵人不是機械，而是會自行生長、鏡射與分裂的三維晶體生命；旋轉時每一晶面都改變亮度與輪廓。',
    entrance: 'MIRROR SERAPH 先以大量碎晶在風暴中聚集，核心成形後左右晶翼分段吸附，最後一次鏡面閃光將所有部件鎖定。',
    units: {
      scout: 'SHARDLING／碎晶幼體：三尖晶片，飛行時連續翻面。',
      striker: 'PRISM LANCER／稜鏡槍晶：細長晶矛與折射副翼。',
      gunship: 'FACET CLUSTER／晶面砲簇：多核心晶簇，砲擊前面向重排。',
      elite: 'MIRROR TETRA／鏡像四面體：外層鏡片環繞核心公轉。',
      midboss: 'LATTICE HYDRA／晶格多首體：三組晶矛由同一核心延伸。',
      boss: 'MIRROR SERAPH／鏡像熾天使：多層晶翼與長槍核心。',
    },
  },
  4: {
    stageId: 4,
    faction: 'HELIOPHALANX／日輪方陣',
    concept: '三維世界的正規軍；高度對稱、厚重、具有盾面、散熱翼與日冕能源環，像會飛行的立體堡壘。',
    entrance: 'SOLAR LEVIATHAN 先遮住背景恆星形成日蝕，巨大的角與背甲從日冕中浮現；日輪爆發後整體翻身壓入戰鬥平面。',
    units: {
      scout: 'SUN DISC／日輪碟：小型盾碟與後方光帆。',
      striker: 'FLARE LANCER／耀斑槍騎：長槍前端聚熱。',
      gunship: 'CORONA BASTION／日冕砲堡：雙盾與旋轉能源環。',
      elite: 'HELIO GUARD／赫利歐衛士：六角盾陣與重砲核心。',
      midboss: 'SOLAR RAM／太陽攻城槌：厚甲巨角構造，衝擊前展開日輪。',
      boss: 'SOLAR LEVIATHAN／太陽巨獸：巨型甲殼、雙角與環形日冕節點。',
    },
  },
  5: {
    stageId: 5,
    faction: 'THRONE MANIFOLD／王座多重體',
    concept: '敵人的部件沒有物理連接，仍能同步運作；前後關係不穩定，會變成線框、穿插、瞬移或重新組合。',
    entrance: 'VOID RAIJIN 先開啟左右雷門，裝甲、手臂與雷鼓分別從不同深度穿出；王冠最後下降，雷擊將全部部件固定於同一平面。',
    units: {
      scout: 'NULL GLYPH／零式符體：三片不相連的黑色薄片。',
      striker: 'PHASE SPEAR／相位槍：長槍與環形座標框錯位滑動。',
      gunship: 'THRONE FRAGMENT／王座碎艦：懸浮座塊與雙雷鼓。',
      elite: 'GATE WARDEN／門界守衛：左右門框與核心交換前後位置。',
      midboss: 'ABYSS HERALD／深淵先觸：多環祭儀體，部件週期性消失。',
      boss: 'VOID RAIJIN／虛空雷神：王冠、雷鼓、浮動裝甲與核心彼此分離。',
    },
  },
};


export const ENEMY_ROLE_PALETTES = {
  1: {
    scout: { body: 0x174e5f, secondary: 0x77e9f4, glow: '#c9ffff', warm: '#52f1ff' },
    striker: { body: 0x33235f, secondary: 0xb550d8, glow: '#ff8df4', warm: '#8fa8ff' },
    gunship: { body: 0x17324a, secondary: 0x9a5528, glow: '#ffb55e', warm: '#63d8ff' },
    elite: { body: 0x142a29, secondary: 0x2f8a58, glow: '#8dff95', warm: '#e8ff70' },
    midboss: { body: 0x4a515b, secondary: 0x7e2028, glow: '#ff6677', warm: '#d9f8ff' },
  },
  2: {
    scout: { body: 0x4e4a46, secondary: 0xc29a54, glow: '#ffd36e', warm: '#fff1b0' },
    striker: { body: 0x4b2933, secondary: 0xa93631, glow: '#ff5c42', warm: '#ffb15c' },
    gunship: { body: 0x3b3035, secondary: 0x7a4d2c, glow: '#ff8b45', warm: '#ffe08a' },
    elite: { body: 0x30363b, secondary: 0x8a7b3b, glow: '#f7ea55', warm: '#ff9b35' },
    midboss: { body: 0x5a3734, secondary: 0x8f1f1f, glow: '#ff4d39', warm: '#ffd26a' },
  },
  3: {
    scout: { body: 0x3f83b5, secondary: 0x9eeeff, glow: '#d7fbff', warm: '#7ddcff' },
    striker: { body: 0x5d3fa6, secondary: 0xd9a6ff, glow: '#f2c6ff', warm: '#8ad9ff' },
    gunship: { body: 0x326f93, secondary: 0x72d5b4, glow: '#9dffe0', warm: '#d5ffff' },
    elite: { body: 0x6f4b8d, secondary: 0xff8bc5, glow: '#ffb7e0', warm: '#b8f6ff' },
    midboss: { body: 0x294f7d, secondary: 0x9b4cb5, glow: '#d77cff', warm: '#9eeeff' },
  },
  4: {
    scout: { body: 0x6d5f40, secondary: 0xefe2a0, glow: '#fff3a2', warm: '#ffd55c' },
    striker: { body: 0x754228, secondary: 0xd76a2b, glow: '#ff9c42', warm: '#fff0a3' },
    gunship: { body: 0x4c4539, secondary: 0x9b772e, glow: '#ffc94d', warm: '#fff4b6' },
    elite: { body: 0x6b2f2f, secondary: 0xd8a343, glow: '#ffda64', warm: '#ff7661' },
    midboss: { body: 0x49362f, secondary: 0x9c3d24, glow: '#ff663c', warm: '#ffd55c' },
  },
  5: {
    scout: { body: 0x090b18, secondary: 0x375da8, glow: '#68a8ff', warm: '#c6ddff' },
    striker: { body: 0x1a0b29, secondary: 0x7d31a9, glow: '#d06bff', warm: '#8ca7ff' },
    gunship: { body: 0x16101f, secondary: 0x7f224e, glow: '#ff5796', warm: '#b277ff' },
    elite: { body: 0x07191d, secondary: 0x267b73, glow: '#4dffd7', warm: '#b788ff' },
    midboss: { body: 0x1e0a13, secondary: 0x922a30, glow: '#ff4a57', warm: '#d89aff' },
  },
};

export const PROJECTILE_STYLES = {
  1: { id: 'neon-orb', base: '#5eeaff', warm: '#ff8df4', rim: '#c9ffff', shadow: '#092e46' },
  2: { id: 'forge-orb', base: '#ff8b45', warm: '#ffd36e', rim: '#fff0b0', shadow: '#4a160d' },
  3: { id: 'prism-orb', base: '#9eeeff', warm: '#e3a8ff', rim: '#ffffff', shadow: '#244d83' },
  4: { id: 'solar-orb', base: '#ffd55c', warm: '#ff8145', rim: '#fff8c5', shadow: '#6a2d08' },
  5: { id: 'void-orb', base: '#d06bff', warm: '#ff5796', rim: '#f0cbff', shadow: '#170626' },
};

export const ACTIONS = {
  entrance: { id: 'entrance', label: '特殊出場' },
  idle: { id: 'idle', label: '待機' },
  attack: { id: 'attack', label: '舊攻擊預覽' },
  hit: { id: 'hit', label: '受擊' },
  phase: { id: 'phase', label: '階段展開' },
  death: { id: 'death', label: '死亡／解體' },
};

export const ENEMY_LAB_DEFAULTS = {
  stageId: 1,
  enemyClass: 'boss',
  action: 'entrance',
  playbackSpeed: 1,
  loop: true,
  showBackground: true,
  showRoad: true,
  showCollision: true,
  showMuzzles: true,
  showBulletBounds: true,
  showLabels: true,
  modelScale: 1,
  screenX: 240,
  screenY: 255,
  combatY: 7.5,
};

export const cloneEnemySettings = value => JSON.parse(JSON.stringify(value));
