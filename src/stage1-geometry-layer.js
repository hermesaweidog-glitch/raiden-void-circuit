import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js';
import { STAGE_DEFINITIONS, cloneSettings } from './stage1-geometry-settings.js';
import { EnemyVisualLayer } from './enemy-visual-layer.js';

const LAYERS = ['far', 'mid', 'near', 'closest'];
const PHASES = { far: 0.2, mid: 1.1, near: 2.0, closest: 2.9 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;


function graphicsProfile() {
  const nav = globalThis.navigator || {};
  const cores = Number(nav.hardwareConcurrency || 8);
  const memory = Number(nav.deviceMemory || 8);
  const coarse = Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
  const lowEnd = cores <= 4 || memory <= 4 || coarse;
  const deviceRatio = Number(globalThis.devicePixelRatio || 1);
  return {
    lowEnd, coarse,
    antialias: !lowEnd,
    pixelRatio: coarse ? 1 : lowEnd ? 1 : Math.min(deviceRatio, 1.2),
    powerPreference: lowEnd ? 'low-power' : 'high-performance',
    backgroundCadence: lowEnd ? 2 : 1,
    enemyCadence: 1,
  };
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function randomRange(rng, min, max) {
  return min + (max - min) * rng();
}

export class SceneGeometryLayer {
  constructor({ canvas, width = 480, height = 800, stageId = 1, settings }) {
    if (!canvas) throw new Error('SceneGeometryLayer requires a canvas.');
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.stageId = Number(stageId) || 1;
    this.profile = STAGE_DEFINITIONS[this.stageId] || STAGE_DEFINITIONS[1];
    this.settings = cloneSettings(settings);
    this.cameraDistanceOverride = null;
    this.cityGroups = {};
    this.edgeLines = [];
    this.materials = [];
    this.geometries = [];
    this.animatedObjects = [];
    this.graphicsProfile = graphicsProfile();
    this.backgroundCadence = this.graphicsProfile.backgroundCadence;
    this.enemyCadence = this.graphicsProfile.enemyCadence;
    this.backgroundRenderTick = 0;
    this.enemyRenderTick = 0;
    const makeCache = () => {
      const cache = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
      cache.width = width; cache.height = height;
      return cache;
    };
    this.backgroundCache = makeCache();
    this.enemyCache = makeCache();
    this.backgroundCacheContext = this.backgroundCache.getContext('2d', { alpha:true });
    this.enemyCacheContext = this.enemyCache.getContext('2d', { alpha:true });
    this.lastRenderLayer = 'background';

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.graphicsProfile.antialias,
      alpha: true,
      powerPreference: this.graphicsProfile.powerPreference,
      preserveDrawingBuffer: false,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(this.graphicsProfile.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMappingExposure = this.settings.exposure;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(this.profile.palette.fog, this.settings.fog);

    this.camera = new THREE.PerspectiveCamera(this.settings.camera.fov, width / height, 0.1, 280);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.hemi = new THREE.HemisphereLight(0x75dfff, 0x020611, 1.25);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xdafcff, 2.15);
    this.key.position.set(-16, 30, 18);
    this.scene.add(this.key);
    this.leftRim = new THREE.PointLight(0x34e7ff, 26, 90, 2);
    this.leftRim.position.set(-12, 12, -14);
    this.scene.add(this.leftRim);
    this.rightRim = new THREE.PointLight(0x4c8cff, 24, 90, 2);
    this.rightRim.position.set(12, 12, -24);
    this.scene.add(this.rightRim);

    this.applyStageLighting();
    this.rebuild();
    this.updateCamera();
    this.enemyVisuals = new EnemyVisualLayer({
      camera: this.camera,
      width: this.width,
      height: this.height,
      stageId: this.stageId,
      settings: this.settings,
    });
  }

  precompile() {
    try {
      this.renderer.compile(this.scene, this.camera);
      if (this.enemyVisuals?.scene) this.renderer.compile(this.enemyVisuals.scene, this.camera);
    } catch {
      // Shader precompile is an optimization only; normal rendering remains available.
    }
  }

  setStage(stageId, settings) {
    this.stageId = Number(stageId) || 1;
    this.profile = STAGE_DEFINITIONS[this.stageId] || STAGE_DEFINITIONS[1];
    this.settings = cloneSettings(settings);
    this.cameraDistanceOverride = null;
    this.applyStageLighting();
    this.scene.fog.color.setHex(this.profile.palette.fog);
    this.scene.fog.density = this.settings.fog;
    this.renderer.toneMappingExposure = this.settings.exposure;
    this.updateCamera();
    this.rebuild();
    this.enemyVisuals?.setStage(this.stageId, this.settings);
  }

  setSettings(settings, { rebuild = false } = {}) {
    this.settings = cloneSettings(settings);
    this.scene.fog.density = this.settings.fog;
    this.renderer.toneMappingExposure = this.settings.exposure;
    this.updateCamera();
    if (rebuild) this.rebuild();
    this.setEdgesVisible(this.settings.showEdges);
  }

  applyStageLighting() {
    const palette = this.profile.palette;
    const accent = new THREE.Color(palette.accent);
    const warm = new THREE.Color(palette.warm);
    this.hemi.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.24);
    this.hemi.groundColor.setHex(this.profile.kind === 'solar-citadel' ? 0x160300 : 0x020611);
    this.key.color.copy(warm).lerp(new THREE.Color(0xffffff), 0.45);
    this.leftRim.color.copy(accent);
    this.rightRim.color.copy(warm).lerp(accent, 0.42);
    this.leftRim.intensity = this.profile.kind === 'void-throne' ? 32 : 26;
    this.rightRim.intensity = this.profile.kind === 'solar-citadel' ? 32 : 24;
  }

  setCameraDistance(distance = null) {
    this.cameraDistanceOverride = Number.isFinite(distance) ? Number(distance) : null;
    this.updateCamera();
  }

  updateCamera() {
    const config = this.settings.camera;
    const pitch = THREE.MathUtils.degToRad(clamp(config.pitch, 25, 88));
    const distance = Math.max(10, this.cameraDistanceOverride ?? config.distance);
    const target = new THREE.Vector3(0, config.targetY, config.targetZ);
    this.camera.fov = config.fov;
    this.camera.aspect = this.width / this.height;
    this.camera.position.set(
      config.offsetX || 0,
      config.targetY + Math.sin(pitch) * distance,
      config.targetZ + Math.cos(pitch) * distance,
    );
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.enemyVisuals) {
      this.enemyVisuals.width = width;
      this.enemyVisuals.height = height;
    }
  }

  trackGeometry(geometry) {
    this.geometries.push(geometry);
    return geometry;
  }

  trackMaterial(material) {
    this.materials.push(material);
    return material;
  }

  disposeGenerated() {
    for (const child of [...this.world.children]) this.world.remove(child);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.edgeLines.length = 0;
    this.animatedObjects.length = 0;
    this.cityGroups = {};
  }

  bandIndex(layer) {
    return LAYERS.indexOf(layer);
  }

  makeMaterial(layer, rng, options = {}) {
    const index = this.bandIndex(layer);
    const palette = this.profile.palette;
    const base = options.color ?? palette.body[index];
    const emissive = options.emissive ?? palette.emissive[index];
    const color = new THREE.Color(base).offsetHSL(0, 0, rng() * 0.07 - 0.025);
    const alpha = options.alpha ?? this.settings[layer].alpha;
    return this.trackMaterial(new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(emissive),
      emissiveIntensity: options.emissiveIntensity ?? (0.3 + index * 0.07),
      metalness: options.metalness ?? 0.74,
      roughness: options.roughness ?? 0.36,
      transparent: alpha < 0.995,
      opacity: alpha,
      depthWrite: alpha > 0.76,
      side: options.side ?? THREE.FrontSide,
    }));
  }

  makeGlow(layer, rng, warmChance = 0.16) {
    const color = rng() < warmChance ? this.profile.palette.warm : this.profile.palette.accent;
    return this.trackMaterial(new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, this.settings[layer].alpha * 0.9),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
  }

  addMesh(parent, geometry, material, position = new THREE.Vector3(), rotation = null) {
    const mesh = new THREE.Mesh(this.trackGeometry(geometry), material);
    mesh.position.copy(position);
    if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    parent.add(mesh);
    return mesh;
  }

  addBox(parent, size, position, material, rotation = null) {
    return this.addMesh(parent, new THREE.BoxGeometry(size.x, size.y, size.z), material, position, rotation);
  }

  addCylinder(parent, radiusTop, radiusBottom, height, segments, position, material, rotation = null) {
    return this.addMesh(parent, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, position, rotation);
  }

  addEdges(parent, mesh, layer, opacityScale = 1) {
    const index = this.bandIndex(layer);
    const geometry = this.trackGeometry(new THREE.EdgesGeometry(mesh.geometry, 24));
    const material = this.trackMaterial(new THREE.LineBasicMaterial({
      color: this.profile.palette.edge[index],
      transparent: true,
      opacity: (layer === 'far' ? 0.16 : 0.3) * opacityScale,
    }));
    const edges = new THREE.LineSegments(geometry, material);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    edges.scale.copy(mesh.scale);
    parent.add(edges);
    this.edgeLines.push(edges);
  }

  placeGroup(group, layer, side, width, z, rowOffset = 0) {
    const config = this.settings[layer];
    const roadEdge = this.settings.city.roadHalfWidth + config.spread + rowOffset;
    group.position.set(side * (roadEdge + width / 2), 0, z);
    return group;
  }

  createNeonCity(layer, side, rng, z, rowOffset = 0) {
    const config = this.settings[layer];
    const group = new THREE.Group();
    const scale = config.scale;
    const width = randomRange(rng, 2.2, 4.0) * scale;
    const depth = randomRange(rng, 3.0, 5.8) * scale;
    const height = randomRange(rng, config.minH, config.maxH) * scale;
    this.placeGroup(group, layer, side, width, z, rowOffset);

    const mainMaterial = this.makeMaterial(layer, rng);
    const darkMaterial = this.makeMaterial(layer, rng, { color: 0x07131c, emissive: 0x062b36, emissiveIntensity: 0.24, roughness: 0.42 });
    const glowMaterial = this.makeGlow(layer, rng);

    const body = this.addBox(group, new THREE.Vector3(width, height, depth), new THREE.Vector3(0, height / 2, 0), mainMaterial);
    this.addEdges(group, body, layer);
    const upperH = height * randomRange(rng, 0.18, 0.38);
    const upperW = width * randomRange(rng, 0.46, 0.76);
    const upperD = depth * randomRange(rng, 0.52, 0.8);
    const upper = this.addBox(group, new THREE.Vector3(upperW, upperH, upperD), new THREE.Vector3(0, height + upperH / 2, randomRange(rng, -0.3, 0.3)), darkMaterial);
    this.addEdges(group, upper, layer);
    if (rng() > 0.28) {
      const capH = height * randomRange(rng, 0.07, 0.16);
      const cap = this.addBox(group, new THREE.Vector3(upperW * 0.62, capH, upperD * 0.58), new THREE.Vector3(0, height + upperH + capH / 2, 0), mainMaterial);
      this.addEdges(group, cap, layer);
    }
    const roadFaceX = -side * (width / 2 + 0.026);
    const bands = Math.max(2, Math.floor(height / 2.7));
    for (let index = 0; index < bands; index += 1) {
      if (rng() < 0.26) continue;
      const bandY = height * (0.14 + 0.72 * (index + 0.5) / bands);
      this.addBox(group, new THREE.Vector3(0.05, randomRange(rng, 0.04, 0.12) * scale, depth * randomRange(rng, 0.42, 0.78)), new THREE.Vector3(roadFaceX, bandY, randomRange(rng, -0.14, 0.14)), glowMaterial);
    }
    const modules = 2 + Math.floor(rng() * 3);
    for (let index = 0; index < modules; index += 1) {
      const moduleH = height * randomRange(rng, 0.09, 0.22);
      const moduleW = width * randomRange(rng, 0.08, 0.19);
      const moduleD = depth * randomRange(rng, 0.24, 0.54);
      const module = this.addBox(group, new THREE.Vector3(moduleW, moduleH, moduleD), new THREE.Vector3(roadFaceX + side * moduleW * 0.54, randomRange(rng, moduleH / 2, height - moduleH / 2), randomRange(rng, -depth * 0.28, depth * 0.28)), darkMaterial);
      this.addEdges(group, module, layer);
    }
    return group;
  }

  createFoundry(layer, side, rng, z, rowOffset = 0) {
    const config = this.settings[layer];
    const group = new THREE.Group();
    const scale = config.scale;
    const width = randomRange(rng, 3.0, 5.2) * scale;
    const depth = randomRange(rng, 3.8, 6.6) * scale;
    const height = randomRange(rng, config.minH, config.maxH) * scale;
    this.placeGroup(group, layer, side, width, z, rowOffset);

    const metal = this.makeMaterial(layer, rng, { roughness: 0.48, metalness: 0.86 });
    const dark = this.makeMaterial(layer, rng, { color: 0x160d17, emissive: 0x3b1016, emissiveIntensity: 0.34, roughness: 0.55 });
    const glow = this.makeGlow(layer, rng, 0.86);
    const bodyH = height * randomRange(rng, 0.58, 0.75);
    const body = this.addBox(group, new THREE.Vector3(width, bodyH, depth), new THREE.Vector3(0, bodyH / 2, 0), metal);
    this.addEdges(group, body, layer);

    const roofH = height * 0.16;
    const roof = this.addBox(group, new THREE.Vector3(width * 0.72, roofH, depth * 0.72), new THREE.Vector3(side * width * 0.04, bodyH + roofH / 2, -depth * 0.04), dark);
    this.addEdges(group, roof, layer);

    const chimneyCount = layer === 'far' ? 1 : 2;
    for (let index = 0; index < chimneyCount; index += 1) {
      const chimneyH = height * randomRange(rng, 0.35, 0.62);
      const radius = width * randomRange(rng, 0.08, 0.13);
      const chimney = this.addCylinder(group, radius * 0.74, radius, chimneyH, 10, new THREE.Vector3((index ? 1 : -1) * width * 0.23, bodyH + chimneyH / 2, depth * 0.08), dark);
      this.addEdges(group, chimney, layer);
      const cap = this.addCylinder(group, radius * 1.2, radius * 1.2, radius * 0.3, 10, new THREE.Vector3(chimney.position.x, bodyH + chimneyH + radius * 0.15, chimney.position.z), glow);
      this.addEdges(group, cap, layer, 0.7);
    }

    const roadFaceX = -side * (width / 2 + 0.035);
    const furnaceH = bodyH * randomRange(rng, 0.34, 0.52);
    this.addBox(group, new THREE.Vector3(0.07, furnaceH, depth * 0.52), new THREE.Vector3(roadFaceX, bodyH * 0.48, 0), glow);

    const pipeRadius = width * 0.055;
    const pipe = this.addCylinder(group, pipeRadius, pipeRadius, depth * 1.05, 10, new THREE.Vector3(roadFaceX + side * pipeRadius * 1.4, bodyH * 0.78, 0), dark, new THREE.Vector3(Math.PI / 2, 0, 0));
    this.addEdges(group, pipe, layer);

    if (layer !== 'far') {
      const postH = bodyH * 0.9;
      const beamW = width * 0.15;
      for (const sign of [-1, 1]) {
        const post = this.addBox(group, new THREE.Vector3(beamW, postH, beamW), new THREE.Vector3(sign * width * 0.36, postH / 2, -depth * 0.58), dark);
        this.addEdges(group, post, layer);
      }
      const gantry = this.addBox(group, new THREE.Vector3(width * 0.9, beamW, beamW), new THREE.Vector3(0, postH, -depth * 0.58), metal);
      this.addEdges(group, gantry, layer);
    }
    return group;
  }

  createCrystal(layer, side, rng, z, rowOffset = 0) {
    const config = this.settings[layer];
    const group = new THREE.Group();
    const scale = config.scale;
    const width = randomRange(rng, 2.8, 4.8) * scale;
    const depth = randomRange(rng, 3.2, 5.5) * scale;
    const height = randomRange(rng, config.minH, config.maxH) * scale;
    this.placeGroup(group, layer, side, width, z, rowOffset);

    const crystal = this.makeMaterial(layer, rng, { metalness: 0.28, roughness: 0.2, emissiveIntensity: 0.52 });
    const dark = this.makeMaterial(layer, rng, { color: 0x07182c, emissive: 0x082f50, emissiveIntensity: 0.34, roughness: 0.42 });
    const glow = this.makeGlow(layer, rng, 0.05);
    const base = this.addBox(group, new THREE.Vector3(width * 0.95, height * 0.12, depth * 0.88), new THREE.Vector3(0, height * 0.06, 0), dark);
    this.addEdges(group, base, layer);

    const shardCount = layer === 'far' ? 4 : 3 + Math.floor(rng() * 3);
    for (let index = 0; index < shardCount; index += 1) {
      const shardH = height * randomRange(rng, 0.42, index === 0 ? 1 : 0.86);
      const radius = width * randomRange(rng, 0.1, 0.22);
      const x = randomRange(rng, -width * 0.34, width * 0.34);
      const shardZ = randomRange(rng, -depth * 0.32, depth * 0.32);
      const shard = this.addCylinder(group, 0, radius, shardH, 5 + Math.floor(rng() * 2), new THREE.Vector3(x, height * 0.1 + shardH / 2, shardZ), crystal, new THREE.Vector3(randomRange(rng, -0.08, 0.08), randomRange(rng, 0, Math.PI), randomRange(rng, -0.08, 0.08)));
      this.addEdges(group, shard, layer, 1.25);
      if (index === 0 || rng() > 0.55) {
        const coreH = shardH * 0.62;
        this.addCylinder(group, 0, radius * 0.35, coreH, 5, new THREE.Vector3(x - side * radius * 0.2, height * 0.1 + coreH / 2, shardZ - depth * 0.02), glow, shard.rotation);
      }
    }
    return group;
  }

  createSolarCitadel(layer, side, rng, z, rowOffset = 0) {
    const config = this.settings[layer];
    const group = new THREE.Group();
    const scale = config.scale;
    const width = randomRange(rng, 3.2, 5.4) * scale;
    const depth = randomRange(rng, 3.6, 6.2) * scale;
    const height = randomRange(rng, config.minH, config.maxH) * scale;
    this.placeGroup(group, layer, side, width, z, rowOffset);

    const stone = this.makeMaterial(layer, rng, { roughness: 0.46, metalness: 0.7 });
    const dark = this.makeMaterial(layer, rng, { color: 0x241108, emissive: 0x5d2107, emissiveIntensity: 0.3, roughness: 0.52 });
    const glow = this.makeGlow(layer, rng, 1);
    const baseH = height * 0.24;
    const base = this.addBox(group, new THREE.Vector3(width, baseH, depth), new THREE.Vector3(0, baseH / 2, 0), dark);
    this.addEdges(group, base, layer);

    const towerW = width * randomRange(rng, 0.46, 0.66);
    const towerH = height * 0.74;
    const tower = this.addBox(group, new THREE.Vector3(towerW, towerH, depth * 0.72), new THREE.Vector3(0, baseH + towerH / 2, 0), stone);
    this.addEdges(group, tower, layer);

    const crownH = height * 0.14;
    const crown = this.addCylinder(group, towerW * 0.28, towerW * 0.43, crownH, 8, new THREE.Vector3(0, baseH + towerH + crownH / 2, 0), dark);
    this.addEdges(group, crown, layer);

    const roadFaceX = -side * (towerW / 2 + 0.035);
    this.addBox(group, new THREE.Vector3(0.07, towerH * 0.68, depth * 0.24), new THREE.Vector3(roadFaceX, baseH + towerH * 0.5, 0), glow);

    const buttressW = width * 0.18;
    for (const sign of [-1, 1]) {
      const buttress = this.addBox(group, new THREE.Vector3(buttressW, height * 0.46, depth * 0.84), new THREE.Vector3(sign * width * 0.38, baseH + height * 0.23, 0), dark);
      this.addEdges(group, buttress, layer);
      if (layer !== 'far') {
        const fin = this.addBox(group, new THREE.Vector3(width * 0.08, height * 0.42, depth * 0.62), new THREE.Vector3(sign * width * 0.52, baseH + height * 0.48, 0), stone, new THREE.Vector3(0, 0, sign * 0.35));
        this.addEdges(group, fin, layer);
      }
    }

    if (layer === 'near' || layer === 'closest') {
      const ring = this.addMesh(group, new THREE.TorusGeometry(width * 0.3, width * 0.035, 8, 28), glow, new THREE.Vector3(0, baseH + towerH * 0.72, -depth * 0.39), new THREE.Vector3(0, 0, 0));
      this.animatedObjects.push({ object: ring, axis: 'z', speed: side * randomRange(rng, 0.08, 0.14) });
    }
    return group;
  }

  createVoidThrone(layer, side, rng, z, rowOffset = 0) {
    const config = this.settings[layer];
    const group = new THREE.Group();
    const scale = config.scale;
    const width = randomRange(rng, 2.8, 4.8) * scale;
    const depth = randomRange(rng, 3.2, 5.8) * scale;
    const height = randomRange(rng, config.minH, config.maxH) * scale;
    this.placeGroup(group, layer, side, width, z, rowOffset);

    const obsidian = this.makeMaterial(layer, rng, { color: 0x0b0713, emissiveIntensity: 0.3, metalness: 0.82, roughness: 0.28 });
    const violet = this.makeMaterial(layer, rng, { roughness: 0.3, metalness: 0.72, emissiveIntensity: 0.58 });
    const glow = this.makeGlow(layer, rng, 0.03);
    const baseH = height * 0.18;
    const base = this.addCylinder(group, width * 0.34, width * 0.52, baseH, 6, new THREE.Vector3(0, baseH / 2, 0), obsidian);
    this.addEdges(group, base, layer);

    const pylonH = height * 0.72;
    const pylon = this.addCylinder(group, width * 0.12, width * 0.31, pylonH, 6, new THREE.Vector3(0, baseH + pylonH / 2, 0), violet, new THREE.Vector3(0, Math.PI / 6, 0));
    this.addEdges(group, pylon, layer, 1.2);
    const spireH = height * 0.28;
    const spire = this.addCylinder(group, 0, width * 0.13, spireH, 6, new THREE.Vector3(0, baseH + pylonH + spireH / 2, 0), glow);
    this.addEdges(group, spire, layer);

    const slabCount = layer === 'far' ? 1 : 2;
    for (let index = 0; index < slabCount; index += 1) {
      const slab = this.addBox(group, new THREE.Vector3(width * (0.72 - index * 0.16), height * 0.055, depth * (0.58 - index * 0.1)), new THREE.Vector3(0, baseH + pylonH * (0.45 + index * 0.28), 0), obsidian, new THREE.Vector3(0, index * 0.45, side * randomRange(rng, -0.16, 0.16)));
      this.addEdges(group, slab, layer);
      this.animatedObjects.push({ object: slab, axis: 'y', speed: side * randomRange(rng, 0.08, 0.16) });
    }

    if (layer !== 'far') {
      const ring = this.addMesh(group, new THREE.TorusGeometry(width * 0.34, width * 0.035, 8, 32), glow, new THREE.Vector3(0, baseH + pylonH * 0.76, 0), new THREE.Vector3(Math.PI / 2, 0, 0));
      this.animatedObjects.push({ object: ring, axis: 'z', speed: side * randomRange(rng, 0.22, 0.38) });
    }
    return group;
  }

  createScenery(layer, side, rng, z, rowOffset = 0) {
    switch (this.profile.kind) {
      case 'foundry': return this.createFoundry(layer, side, rng, z, rowOffset);
      case 'crystal': return this.createCrystal(layer, side, rng, z, rowOffset);
      case 'solar-citadel': return this.createSolarCitadel(layer, side, rng, z, rowOffset);
      case 'void-throne': return this.createVoidThrone(layer, side, rng, z, rowOffset);
      default: return this.createNeonCity(layer, side, rng, z, rowOffset);
    }
  }

  rebuild() {
    this.disposeGenerated();
    for (const layer of LAYERS) {
      this.cityGroups[layer] = {};
      const config = this.settings[layer];
      for (const side of [-1, 1]) {
        const sideName = side < 0 ? 'left' : 'right';
        const group = new THREE.Group();
        group.userData.phase = PHASES[layer] + (side > 0 ? 0.55 : 0);
        const rng = seeded(this.settings.seed + this.stageId * 100003 + LAYERS.indexOf(layer) * 1009 + (side < 0 ? 17 : 41));
        const count = Math.max(1, Math.round(config.count));
        for (let index = 0; index < count; index += 1) {
          const t = count === 1 ? 0 : index / (count - 1);
          const z = lerp(config.nearZ, config.farZ, t) + randomRange(rng, -1.1, 1.1);
          group.add(this.createScenery(layer, side, rng, z, 0));
          if (layer === 'far' && index % 3 === 1) {
            const rear = this.createScenery(layer, side, rng, z - randomRange(rng, 1.8, 3.8), randomRange(rng, 2.2, 4.2));
            rear.scale.multiplyScalar(randomRange(rng, 0.7, 0.86));
            group.add(rear);
          }
        }
        this.world.add(group);
        this.cityGroups[layer][sideName] = group;
      }
    }
    this.setEdgesVisible(this.settings.showEdges);
  }

  setEdgesVisible(visible) {
    for (const line of this.edgeLines) line.visible = visible;
  }

  setRenderCadence({ background = this.backgroundCadence, enemies = this.enemyCadence } = {}) {
    this.backgroundCadence = Math.max(1, Math.round(background || 1));
    this.enemyCadence = Math.max(1, Math.round(enemies || 1));
  }

  cacheCurrentFrame(context) {
    if (!context) return;
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(this.canvas, 0, 0, this.width, this.height);
  }

  update(timeSeconds) {
    for (const layer of LAYERS) {
      const config = this.settings[layer];
      for (const sideName of ['left', 'right']) {
        const group = this.cityGroups[layer]?.[sideName];
        if (!group) continue;
        group.position.y = config.y + Math.sin(timeSeconds * config.frequency * Math.PI * 2 + group.userData.phase) * config.amp;
      }
    }
    for (const entry of this.animatedObjects) {
      if (!Number.isFinite(entry.baseRotation)) entry.baseRotation = entry.object.rotation[entry.axis];
      entry.object.rotation[entry.axis] = entry.baseRotation + timeSeconds * entry.speed;
    }
    const shouldRender = this.backgroundRenderTick++ % this.backgroundCadence === 0;
    if (shouldRender) {
      this.renderer.render(this.scene, this.camera);
      this.cacheCurrentFrame(this.backgroundCacheContext);
    }
    this.lastRenderLayer = 'background';
    return true;
  }

  updateEnemies(enemies, timeSeconds, options = {}) {
    if (!this.enemyVisuals) return false;
    const shouldRender = this.enemyRenderTick++ % this.enemyCadence === 0;
    if (shouldRender) {
      this.enemyVisuals.sync(enemies, timeSeconds, options);
      const previousExposure = this.renderer.toneMappingExposure;
      this.renderer.toneMappingExposure = Math.max(1.1, this.settings.exposure + 0.04);
      this.renderer.render(this.enemyVisuals.scene, this.camera);
      this.renderer.toneMappingExposure = previousExposure;
      this.cacheCurrentFrame(this.enemyCacheContext);
    }
    this.lastRenderLayer = 'enemy';
    return true;
  }

  drawTo(context, x = 0, y = 0, width = this.width, height = this.height) {
    if (!context?.drawImage) throw new Error('drawTo requires a 2D canvas context.');
    const source = this.lastRenderLayer === 'enemy' ? this.enemyCache : this.backgroundCache;
    context.drawImage(source, x, y, width, height);
  }

  dispose() {
    this.enemyVisuals?.dispose();
    this.enemyVisuals = null;
    this.disposeGenerated();
    this.renderer.dispose();
    this.backgroundCache = null; this.enemyCache = null;
    this.backgroundCacheContext = null; this.enemyCacheContext = null;
  }
}

// 保留舊整合名稱，第一關本體可不改 import 即直接替換檔案。
export class Stage1GeometryLayer extends SceneGeometryLayer {
  constructor(options) {
    super({ ...options, stageId: 1 });
  }
}
