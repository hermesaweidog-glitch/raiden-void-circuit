const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const fpsLabel = document.getElementById('fps-label');
const status = document.getElementById('status');

const W = canvas.width;
const H = canvas.height;
const TAU = Math.PI * 2;
const STORAGE_KEY = 'raiden-scene-lab-v72';

const defaults = {
  paused: false,
  showGrid: true,
  showPosts: true,
  showShip: true,
  showGuides: false,
  background: 0.74,
  speed: 1,
  road: { top: 0.26, mid: 0.66, bottom: 0.99 },
  far: { left: 'a', right: 'b', y: 0.155, scale: 1.30, alpha: 1, amp: 5, frequency: 0.35 },
  mid: { left: 'a', right: 'b', y: 0.195, scale: 1.55, alpha: 1, amp: 2, frequency: 0.45 },
  near: { left: 'a', right: 'b', y: 0.245, scale: 1.24, alpha: 1, amp: 2, frequency: 0.30 },
  posts: { speed: 0.25, count: 3, scale: 0.6 },
};

const deepClone = value => JSON.parse(JSON.stringify(value));
const state = deepClone(defaults);
let elapsed = 0;
let lastTime = performance.now();
let fpsSamples = [];

const assetPaths = {
  far: {
    a: './assets/scenes/neon-outskirts/modular/far-a.webp',
    b: './assets/scenes/neon-outskirts/modular/far-b.webp',
  },
  mid: {
    a: './assets/scenes/neon-outskirts/modular/mid-a.webp',
    b: './assets/scenes/neon-outskirts/modular/mid-b.webp',
  },
  near: {
    a: './assets/scenes/neon-outskirts/modular/near-a.webp',
    b: './assets/scenes/neon-outskirts/modular/near-b.webp',
  },
};

const assets = {};
let loadedCount = 0;
const totalAssets = 6;
for (const [layer, variants] of Object.entries(assetPaths)) {
  assets[layer] = {};
  for (const [variant, src] of Object.entries(variants)) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      loadedCount += 1;
      status.textContent = loadedCount === totalAssets
        ? '6 張正式側景素材已載入。調整結果會自動儲存。'
        : `載入素材 ${loadedCount} / ${totalAssets}…`;
    };
    image.onerror = () => { status.textContent = `素材載入失敗：${src}`; };
    image.src = src;
    assets[layer][variant] = image;
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function mergeState(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      mergeState(target[key], value);
    } else if (key in target) {
      target[key] = value;
    }
  }
}

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved) mergeState(state, saved);
} catch {
  status.textContent = '無法讀取先前參數，已載入預設值。';
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

const controlMap = {
  paused: ['paused', 'checked', value => Boolean(value)],
  'show-grid': ['showGrid', 'checked', value => Boolean(value)],
  'show-posts': ['showPosts', 'checked', value => Boolean(value)],
  'show-ship': ['showShip', 'checked', value => Boolean(value)],
  'show-guides': ['showGuides', 'checked', value => Boolean(value)],
  background: ['background', 'value', Number],
  speed: ['speed', 'value', Number],
  'road-top': ['road.top', 'value', Number],
  'road-mid': ['road.mid', 'value', Number],
  'road-bottom': ['road.bottom', 'value', Number],
  'post-speed': ['posts.speed', 'value', Number],
  'post-count': ['posts.count', 'value', Number],
  'post-scale': ['posts.scale', 'value', Number],
};

for (const layer of ['far', 'mid', 'near']) {
  controlMap[`${layer}-left`] = [`${layer}.left`, 'value', String];
  controlMap[`${layer}-right`] = [`${layer}.right`, 'value', String];
  controlMap[`${layer}-y`] = [`${layer}.y`, 'value', Number];
  controlMap[`${layer}-scale`] = [`${layer}.scale`, 'value', Number];
  controlMap[`${layer}-alpha`] = [`${layer}.alpha`, 'value', Number];
  controlMap[`${layer}-amp`] = [`${layer}.amp`, 'value', Number];
  controlMap[`${layer}-frequency`] = [`${layer}.frequency`, 'value', Number];
}

function getPath(path) {
  return path.split('.').reduce((value, key) => value[key], state);
}

function setPath(path, value) {
  const keys = path.split('.');
  const leaf = keys.pop();
  const parent = keys.reduce((value, key) => value[key], state);
  parent[leaf] = value;
}

function formatValue(id, value) {
  if (id.endsWith('-y') || id.startsWith('road-')) return `${Math.round(value * 100)}%`;
  if (id.endsWith('-amp')) return `${Math.round(value)} px`;
  if (id.includes('frequency')) return `${Number(value).toFixed(2)}×`;
  if (id === 'post-count') return `${Math.round(value)}`;
  if (id.includes('alpha')) return `${Math.round(value * 100)}%`;
  return `${Number(value).toFixed(2)}×`;
}

function syncControls() {
  for (const [id, [path, property]] of Object.entries(controlMap)) {
    const element = document.getElementById(id);
    if (!element) continue;
    element[property] = getPath(path);
    const output = document.getElementById(`${id}-output`);
    if (output) output.textContent = formatValue(id, getPath(path));
  }
}

for (const [id, [path, property, parser]] of Object.entries(controlMap)) {
  const element = document.getElementById(id);
  if (!element) continue;
  element.addEventListener('input', () => {
    setPath(path, parser(element[property]));
    const output = document.getElementById(`${id}-output`);
    if (output) output.textContent = formatValue(id, getPath(path));
    saveState();
  });
}

syncControls();

document.getElementById('reset-button').addEventListener('click', () => {
  mergeState(state, deepClone(defaults));
  syncControls();
  saveState();
  status.textContent = '已恢復預設場景參數。';
});

document.getElementById('copy-button').addEventListener('click', async () => {
  const text = JSON.stringify(state, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = '參數 JSON 已複製。';
  } catch {
    window.prompt('複製以下參數：', text);
  }
});

document.getElementById('download-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'stage1-scene-settings.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  status.textContent = '參數檔已下載。';
});

function leftInner(y) {
  const yTop = H * .12;
  const yMid = H * .56;
  const topSide = W * (1 - state.road.top) / 2;
  const midSide = W * (1 - state.road.mid) / 2;
  const bottomSide = W * (1 - state.road.bottom) / 2;
  if (y <= yTop) return lerp(topSide, lerp(topSide, midSide, .22), y / Math.max(1, yTop));
  if (y <= yMid) return lerp(lerp(topSide, midSide, .22), midSide, (y - yTop) / Math.max(1, yMid - yTop));
  return lerp(midSide, bottomSide, (y - yMid) / Math.max(1, H - yMid));
}

function innerAt(side, y) {
  const left = leftInner(clamp(y, 0, H));
  return side < 0 ? left : W - left;
}

function sidePath(side) {
  const samples = 28;
  ctx.beginPath();
  if (side < 0) ctx.moveTo(0, 0);
  else ctx.moveTo(W, 0);
  ctx.lineTo(innerAt(side, 0), 0);
  for (let i = 1; i <= samples; i += 1) {
    const y = H * i / samples;
    ctx.lineTo(innerAt(side, y), y);
  }
  if (side < 0) ctx.lineTo(0, H);
  else ctx.lineTo(W, H);
  ctx.closePath();
}

function drawBase() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#061225');
  gradient.addColorStop(.56, '#03101d');
  gradient.addColorStop(1, '#01050c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = state.background;
  const horizon = ctx.createRadialGradient(W / 2, H * .08, 0, W / 2, H * .08, W * .72);
  horizon.addColorStop(0, 'rgba(79,220,255,.19)');
  horizon.addColorStop(.42, 'rgba(42,95,151,.08)');
  horizon.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawGrid(time) {
  if (!state.showGrid) return;
  const scroll = (time * 86 * state.speed) % 80;
  ctx.save();
  ctx.globalAlpha = .22;
  ctx.strokeStyle = '#42e8ff';
  ctx.lineWidth = 1;
  for (let y = -80 + scroll; y < H + 80; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + (x - W / 2) * .25, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAsset(image, side, layerName, time, phase) {
  if (!image?.complete || !image.naturalWidth) return;
  const layer = state[layerName];
  const wave = Math.sin(time * layer.frequency * TAU + phase) * layer.amp;
  const baseline = H * layer.y + wave;
  const inner = innerAt(side, baseline);

  // Use vertical occupancy as the primary scale. The old width-based sizing made
  // the 1280px-wide strips look like tiny skyline stickers on a tall playfield.
  const baseHeight = layerName === 'far' ? .245 : layerName === 'mid' ? .255 : .325;
  const dh = Math.max(150, H * baseHeight * layer.scale);
  const dw = image.naturalWidth * (dh / image.naturalHeight);
  const inwardOverlap = layerName === 'far' ? 42 : layerName === 'mid' ? 34 : 26;
  const x = side < 0 ? inner - dw + inwardOverlap : inner - inwardOverlap;
  const y = baseline - dh * .72;

  ctx.save();
  sidePath(side);
  ctx.clip();

  // Mid and near layers receive an opaque atmospheric skirt behind the artwork.
  // It follows that layer's wave and hides the exposed lower edge of every layer
  // behind it, while the asset itself keeps an irregular building silhouette.
  if (layerName !== 'far') {
    const skirtTop = baseline - dh * (layerName === 'near' ? .17 : .11);
    const skirt = ctx.createLinearGradient(0, skirtTop - 44, 0, skirtTop + 34);
    if (layerName === 'near') {
      skirt.addColorStop(0, 'rgba(2,8,15,0)');
      skirt.addColorStop(.56, 'rgba(3,10,18,.88)');
      skirt.addColorStop(1, 'rgba(2,7,13,.985)');
    } else {
      skirt.addColorStop(0, 'rgba(5,14,24,0)');
      skirt.addColorStop(.60, 'rgba(6,17,28,.68)');
      skirt.addColorStop(1, 'rgba(4,12,21,.90)');
    }
    ctx.fillStyle = skirt;
    ctx.fillRect(0, skirtTop - 44, W, H - skirtTop + 44);
  }

  ctx.globalAlpha = layer.alpha;
  if (side > 0) {
    ctx.translate(x + dw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, y, dw, dh);
  } else {
    ctx.drawImage(image, x, y, dw, dh);
  }
  ctx.restore();
}

function drawSideAtmosphere(side) {
  ctx.save();
  sidePath(side);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(32,120,170,.10)');
  g.addColorStop(.5, 'rgba(12,66,88,.05)');
  g.addColorStop(1, 'rgba(1,7,13,.04)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawRoadPosts(side, time) {
  if (!state.showPosts) return;
  const count = Math.round(state.posts.count);
  const offset = side < 0 ? 0 : .37;
  for (let i = 0; i < count; i += 1) {
    const progress = ((time * 4.2 * state.speed * state.posts.speed) + offset + i / count) % 1;
    const eased = Math.pow(progress, .72);
    const y = lerp(H * .14, H * 1.12, eased);
    const inner = innerAt(side, y);
    const gap = lerp(14, 3, eased) * state.posts.scale;
    const x = side < 0 ? inner - gap : inner + gap;
    const poleH = lerp(14, 76, eased) * state.posts.scale;
    const poleTilt = lerp(2, 11, eased) * state.posts.scale;
    const arm = lerp(5, 18, eased) * state.posts.scale;
    const glowR = lerp(2, 10, eased) * state.posts.scale;
    const alpha = .28 + eased * .34;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(120,242,255,.78)';
    ctx.lineWidth = lerp(1, 3.2, eased) * state.posts.scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * poleTilt, y - poleH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + side * poleTilt, y - poleH);
    ctx.lineTo(x + side * (poleTilt + arm), y - poleH + 1.5);
    ctx.stroke();
    const glowX = x + side * (poleTilt + arm);
    const glowY = y - poleH + 1.5;
    ctx.fillStyle = 'rgba(174,252,255,.94)';
    ctx.beginPath();
    ctx.arc(glowX, glowY, glowR, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowR * 3.2);
    g.addColorStop(0, 'rgba(120,242,255,.38)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(glowX, glowY, glowR * 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawShip() {
  if (!state.showShip) return;
  const x = W / 2;
  const y = H * .86;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = '#62e9ff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#e5fbff';
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(12, 8);
  ctx.lineTo(28, 16);
  ctx.lineTo(11, 18);
  ctx.lineTo(0, 10);
  ctx.lineTo(-11, 18);
  ctx.lineTo(-28, 16);
  ctx.lineTo(-12, 8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#55dff5';
  ctx.fillRect(-12, 18, 7, 19);
  ctx.fillRect(5, 18, 7, 19);
  ctx.restore();
}

function drawGuides() {
  if (!state.showGuides) return;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(255,215,92,.8)';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 30; i += 1) {
      const y = H * i / 30;
      const x = innerAt(side, y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function render(time) {
  drawBase();
  drawGrid(time);
  for (const side of [-1, 1]) drawSideAtmosphere(side);

  for (const side of [-1, 1]) {
    const sideKey = side < 0 ? 'left' : 'right';
    drawAsset(assets.far[state.far[sideKey]], side, 'far', time, side < 0 ? .1 : 1.4);
    drawAsset(assets.mid[state.mid[sideKey]], side, 'mid', time, side < 0 ? 1.2 : 2.5);
    drawAsset(assets.near[state.near[sideKey]], side, 'near', time, side < 0 ? 2.2 : 3.7);
  }

  for (const side of [-1, 1]) drawRoadPosts(side, time);
  drawGuides();
  drawShip();

  const vignette = ctx.createRadialGradient(W / 2, H * .48, H * .16, W / 2, H * .48, H * .70);
  vignette.addColorStop(.58, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function frame(now) {
  const delta = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (!state.paused) elapsed += delta;
  render(elapsed);

  if (delta > 0) {
    fpsSamples.push(1 / delta);
    if (fpsSamples.length > 30) fpsSamples.shift();
    const fps = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
    fpsLabel.textContent = `${Math.round(fps)} FPS`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
