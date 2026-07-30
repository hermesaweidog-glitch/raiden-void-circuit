export const STAGE_DEFINITIONS = {
  1: {
    id: 1,
    name: 'NEON OUTSKIRTS',
    subtitle: '霓虹外環',
    kind: 'neon-city',
    description: '抽象道路穿過霓虹外環城區；側景為高低錯落的科技建築街廓。',
    palette: {
      fog: 0x03101d,
      body: [0x315f72, 0x275f73, 0x1f697e, 0x1c7487],
      emissive: [0x123d4c, 0x0d5265, 0x08677b, 0x08778d],
      edge: [0x4abbd2, 0x4fcce3, 0x61dff0, 0x72e9ff],
      accent: '#55e8ff',
      warm: '#ffc65a',
      ui: '#55dff5',
      top: '#07162b',
      bottom: '#01050c',
      roadTop: 'rgba(4,18,34,VAR)',
      roadMid: 'rgba(2,11,21,VAR)',
      roadBottom: 'rgba(1,6,12,VAR)',
      grid: '#42e8ff',
      post: '#78f2ff',
    },
    postStyle: 'lamp',
  },
  2: {
    id: 2,
    name: 'ORBITAL FOUNDRY',
    subtitle: '軌道鑄造廠',
    kind: 'foundry',
    description: '軌道工業帶、熔爐、管線、煙囪與裝配吊架；橘紅爐光穿過紫色金屬結構。',
    palette: {
      fog: 0x190817,
      body: [0x48364e, 0x573549, 0x653844, 0x744039],
      emissive: [0x522038, 0x6a2436, 0x812c2d, 0x963520],
      edge: [0xa65488, 0xc65a75, 0xe16b55, 0xff8744],
      accent: '#ff7a45',
      warm: '#ffd166',
      ui: '#ff8a52',
      top: '#241029',
      bottom: '#09030b',
      roadTop: 'rgba(35,10,28,VAR)',
      roadMid: 'rgba(20,7,21,VAR)',
      roadBottom: 'rgba(8,3,10,VAR)',
      grid: '#ff7951',
      post: '#ffb05f',
    },
    postStyle: 'gantry',
  },
  3: {
    id: 3,
    name: 'CRYSTAL TEMPEST',
    subtitle: '水晶風暴',
    kind: 'crystal',
    description: '被風暴切割的水晶峽谷；多面晶柱、碎晶與電弧構成高速冷色地貌。',
    palette: {
      fog: 0x04162e,
      body: [0x2d5e8c, 0x2b71a0, 0x2b84ad, 0x3197ba],
      emissive: [0x153e69, 0x105781, 0x0c7097, 0x0786a7],
      edge: [0x77bfff, 0x77d9ff, 0x90ecff, 0xb4f7ff],
      accent: '#8eeaff',
      warm: '#d8f7ff',
      ui: '#76dfff',
      top: '#071a35',
      bottom: '#020714',
      roadTop: 'rgba(7,25,52,VAR)',
      roadMid: 'rgba(4,17,37,VAR)',
      roadBottom: 'rgba(2,7,18,VAR)',
      grid: '#7bdfff',
      post: '#c1f7ff',
    },
    postStyle: 'crystal',
  },
  4: {
    id: 4,
    name: 'SOLAR CITADEL',
    subtitle: '日冕要塞',
    kind: 'solar-citadel',
    description: '環繞恆星運作的軍事要塞；城牆、日冕塔、散熱翼與能量核心形成重裝側景。',
    palette: {
      fog: 0x260b05,
      body: [0x684529, 0x75502b, 0x845c2e, 0x956b34],
      emissive: [0x6f2d0d, 0x8c3b0c, 0xac4d08, 0xc96505],
      edge: [0xe48b35, 0xf1a43d, 0xffbd4f, 0xffd46b],
      accent: '#ffb33f',
      warm: '#fff0a3',
      ui: '#ffb84a',
      top: '#321009',
      bottom: '#0b0302',
      roadTop: 'rgba(42,12,7,VAR)',
      roadMid: 'rgba(27,8,5,VAR)',
      roadBottom: 'rgba(11,3,2,VAR)',
      grid: '#ffae42',
      post: '#ffd56e',
    },
    postStyle: 'solar',
  },
  5: {
    id: 5,
    name: 'VOID THRONE',
    subtitle: '虛空王座',
    kind: 'void-throne',
    description: '失重的虛空宮殿；黑曜石尖塔、懸浮環與雷霆裂隙在道路兩側形成終局儀式場。',
    palette: {
      fog: 0x090318,
      body: [0x30234b, 0x392354, 0x472461, 0x55276f],
      emissive: [0x29104f, 0x391160, 0x4b1375, 0x61168c],
      edge: [0x8f64d8, 0xa46fe8, 0xbd82f3, 0xd49aff],
      accent: '#bd7cff',
      warm: '#f2d7ff',
      ui: '#bd7cff',
      top: '#100625',
      bottom: '#020105',
      roadTop: 'rgba(15,6,34,VAR)',
      roadMid: 'rgba(9,3,24,VAR)',
      roadBottom: 'rgba(2,1,6,VAR)',
      grid: '#b874ff',
      post: '#d49aff',
    },
    postStyle: 'void',
  },
};

export const STAGE_GEOMETRY_SETTINGS = Object.freeze({
  1: {
    "paused": false,
    "showGrid": true,
    "showPosts": true,
    "showShip": true,
    "showGuides": false,
    "showEdges": true,
    "background": 0.74,
    "speed": 1,
    "posts": {
      "speed": 0.28,
      "count": 3,
      "scale": 0.6
    },
    "exposure": 1.1,
    "fog": 0.017,
    "seed": 7701,
    "camera": {
      "pitch": 35,
      "fov": 34,
      "distance": 57,
      "targetY": -2,
      "targetZ": -21,
      "offsetX": 0
    },
    "city": {
      "roadHalfWidth": 7.6
    },
    "road": {
      "top": 0.29,
      "mid": 0.73,
      "bottom": 0.99,
      "cover": 60,
      "opacity": 0.55
    },
    "far": {
      "count": 12,
      "scale": 0.83,
      "alpha": 0.68,
      "spread": -0.55,
      "y": -0.4,
      "amp": 0.52,
      "frequency": 0.24,
      "minH": 5.8,
      "maxH": 12.6,
      "nearZ": -54,
      "farZ": -96
    },
    "mid": {
      "count": 7,
      "scale": 0.88,
      "alpha": 0.77,
      "spread": -0.65,
      "y": -3,
      "amp": 0.39,
      "frequency": 0.23,
      "minH": 6.5,
      "maxH": 11.5,
      "nearZ": -24,
      "farZ": -66
    },
    "near": {
      "count": 5,
      "scale": 1,
      "alpha": 0.9,
      "spread": 0.55,
      "y": -0.1,
      "amp": 0.4,
      "frequency": 0.56,
      "minH": 5.3,
      "maxH": 13.5,
      "nearZ": -8,
      "farZ": -32
    },
    "closest": {
      "count": 3,
      "scale": 1.12,
      "alpha": 1,
      "spread": 0.4,
      "y": -0.55,
      "amp": 0.35,
      "frequency": 0.64,
      "minH": 6.4,
      "maxH": 15.4,
      "nearZ": 8,
      "farZ": -14
    }
  },
  2: {
    "paused": false,
    "showGrid": true,
    "showPosts": true,
    "showShip": true,
    "showGuides": false,
    "showEdges": true,
    "background": 0.74,
    "speed": 1,
    "posts": {
      "speed": 0.28,
      "count": 3,
      "scale": 0.6
    },
    "exposure": 1.18,
    "fog": 0.011,
    "seed": 8202,
    "camera": {
      "pitch": 39,
      "fov": 36,
      "distance": 65,
      "targetY": -1.6,
      "targetZ": -22,
      "offsetX": 0
    },
    "city": {
      "roadHalfWidth": 7.4
    },
    "road": {
      "top": 0.29,
      "mid": 0.73,
      "bottom": 0.99,
      "cover": 30,
      "opacity": 0.62
    },
    "far": {
      "count": 11,
      "scale": 0.78,
      "alpha": 0.62,
      "spread": -0.2,
      "y": -2.4,
      "amp": 0.16,
      "frequency": 0.18,
      "minH": 5.5,
      "maxH": 10.8,
      "nearZ": -52,
      "farZ": -98
    },
    "mid": {
      "count": 8,
      "scale": 0.9,
      "alpha": 0.78,
      "spread": -1.2,
      "y": -2.55,
      "amp": 0.05,
      "frequency": 0.65,
      "minH": 6.5,
      "maxH": 12.8,
      "nearZ": -29,
      "farZ": -64
    },
    "near": {
      "count": 6,
      "scale": 1.02,
      "alpha": 0.92,
      "spread": 0.8,
      "y": -2,
      "amp": 0.26,
      "frequency": 0.22,
      "minH": 7.2,
      "maxH": 14.8,
      "nearZ": -3,
      "farZ": -50
    },
    "closest": {
      "count": 4,
      "scale": 1.14,
      "alpha": 1,
      "spread": 1.15,
      "y": -2.05,
      "amp": 0.13,
      "frequency": 0.46,
      "minH": 8.5,
      "maxH": 16.2,
      "nearZ": 8,
      "farZ": -16
    }
  },
  3: {
    "paused": false,
    "showGrid": true,
    "showPosts": true,
    "showShip": true,
    "showGuides": false,
    "showEdges": true,
    "background": 0.74,
    "speed": 1,
    "posts": {
      "speed": 0.28,
      "count": 3,
      "scale": 0.6
    },
    "exposure": 1.2,
    "fog": 0.02,
    "seed": 9303,
    "camera": {
      "pitch": 39,
      "fov": 36,
      "distance": 56,
      "targetY": -1.4,
      "targetZ": -23,
      "offsetX": 0
    },
    "city": {
      "roadHalfWidth": 7.7
    },
    "road": {
      "top": 0.29,
      "mid": 0.73,
      "bottom": 0.99,
      "cover": 55,
      "opacity": 0.58
    },
    "far": {
      "count": 14,
      "scale": 0.74,
      "alpha": 0.56,
      "spread": -0.35,
      "y": -0.9,
      "amp": 0.42,
      "frequency": 0.34,
      "minH": 5,
      "maxH": 11.5,
      "nearZ": -54,
      "farZ": -102
    },
    "mid": {
      "count": 9,
      "scale": 1.38,
      "alpha": 0.74,
      "spread": -0.05,
      "y": -0.5,
      "amp": 0.46,
      "frequency": 0.47,
      "minH": 6.2,
      "maxH": 13.4,
      "nearZ": -27,
      "farZ": -66
    },
    "near": {
      "count": 9,
      "scale": 1.56,
      "alpha": 0.9,
      "spread": 0.5,
      "y": -5,
      "amp": 0.3,
      "frequency": 0.59,
      "minH": 7,
      "maxH": 15.2,
      "nearZ": -9,
      "farZ": -35
    },
    "closest": {
      "count": 4,
      "scale": 1.16,
      "alpha": 1,
      "spread": 0.35,
      "y": -0.25,
      "amp": 0.24,
      "frequency": 0.62,
      "minH": 8,
      "maxH": 17,
      "nearZ": 8,
      "farZ": -16
    }
  },
  4: {
    "paused": false,
    "showGrid": true,
    "showPosts": true,
    "showShip": true,
    "showGuides": false,
    "showEdges": true,
    "background": 0.74,
    "speed": 1,
    "posts": {
      "speed": 0.28,
      "count": 3,
      "scale": 0.6
    },
    "exposure": 1.14,
    "fog": 0.012,
    "seed": 10404,
    "camera": {
      "pitch": 38,
      "fov": 34,
      "distance": 67,
      "targetY": -1.8,
      "targetZ": -21,
      "offsetX": 0
    },
    "city": {
      "roadHalfWidth": 7.5
    },
    "road": {
      "top": 0.29,
      "mid": 0.73,
      "bottom": 0.99,
      "cover": 24,
      "opacity": 0.64
    },
    "far": {
      "count": 9,
      "scale": 0.82,
      "alpha": 0.65,
      "spread": -0.15,
      "y": -0.8,
      "amp": 0.12,
      "frequency": 0.16,
      "minH": 6.2,
      "maxH": 12.8,
      "nearZ": -52,
      "farZ": -96
    },
    "mid": {
      "count": 7,
      "scale": 0.94,
      "alpha": 0.8,
      "spread": -0.9,
      "y": -2.3,
      "amp": 0.29,
      "frequency": 0.24,
      "minH": 7.4,
      "maxH": 14.8,
      "nearZ": -35,
      "farZ": -62
    },
    "near": {
      "count": 5,
      "scale": 1.08,
      "alpha": 0.94,
      "spread": 0.45,
      "y": -2.5,
      "amp": 0.32,
      "frequency": 0.36,
      "minH": 8.2,
      "maxH": 16,
      "nearZ": -8,
      "farZ": -32
    },
    "closest": {
      "count": 3,
      "scale": 0.98,
      "alpha": 1,
      "spread": -0.5,
      "y": 3,
      "amp": 0.26,
      "frequency": 0.58,
      "minH": 9.5,
      "maxH": 18.5,
      "nearZ": 2,
      "farZ": -16
    }
  },
  5: {
    "paused": false,
    "showGrid": true,
    "showPosts": true,
    "showShip": true,
    "showGuides": false,
    "showEdges": true,
    "background": 1.4,
    "speed": 1,
    "posts": {
      "speed": 0.26,
      "count": 2,
      "scale": 0.49
    },
    "exposure": 1.19,
    "fog": 0.017,
    "seed": 11505,
    "camera": {
      "pitch": 38,
      "fov": 35,
      "distance": 61,
      "targetY": -1.2,
      "targetZ": -24,
      "offsetX": 0
    },
    "city": {
      "roadHalfWidth": 8
    },
    "road": {
      "top": 0.29,
      "mid": 0.73,
      "bottom": 0.99,
      "cover": 24,
      "opacity": 0.57
    },
    "far": {
      "count": 10,
      "scale": 0.76,
      "alpha": 0.52,
      "spread": -0.45,
      "y": -0.9,
      "amp": 0.48,
      "frequency": 0.2,
      "minH": 5.8,
      "maxH": 12.8,
      "nearZ": -56,
      "farZ": -104
    },
    "mid": {
      "count": 10,
      "scale": 1.12,
      "alpha": 0.72,
      "spread": -0.1,
      "y": -0.6,
      "amp": 0.56,
      "frequency": 0.22,
      "minH": 4.8,
      "maxH": 12.6,
      "nearZ": -24,
      "farZ": -68
    },
    "near": {
      "count": 8,
      "scale": 1.04,
      "alpha": 0.82,
      "spread": -0.55,
      "y": -5,
      "amp": 0.68,
      "frequency": 0.45,
      "minH": 3,
      "maxH": 16.5,
      "nearZ": 3,
      "farZ": -36
    },
    "closest": {
      "count": 5,
      "scale": 1.12,
      "alpha": 1,
      "spread": -1.5,
      "y": -5,
      "amp": 0.67,
      "frequency": 0.56,
      "minH": 9.6,
      "maxH": 16.4,
      "nearZ": -4,
      "farZ": -31
    }
  }
});

// Stage-entry camera mode tags are intentionally separate. Test mode shares the
// standard presentation; endless keeps its own tag so the effect can be changed
// or disabled later without touching normal/test behavior.
export const STAGE_ENTRY_CAMERA_SETTINGS = Object.freeze({
  startDistance: 100,
  durationSeconds: 2,
  easing: 'easeOutCubic',
  tags: Object.freeze({
    standard: Object.freeze({ enabled: true }),
    endless: Object.freeze({ enabled: true }),
  }),
});

export const stageEntryCameraTagForMode = runMode => runMode === 'endless' ? 'endless' : 'standard';
export const cloneSettings = value => JSON.parse(JSON.stringify(value));

// Compatibility export retained for older tests and integrations.
export const STAGE1_GEOMETRY_SETTINGS = STAGE_GEOMETRY_SETTINGS[1];
