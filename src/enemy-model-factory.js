import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js';
import { STAGE_DEFINITIONS, cloneSettings } from './stage1-geometry-settings.js';
import { BOSS_INFO, ENEMY_CLASSES, ENEMY_ROLE_PALETTES } from './enemy-geometry-settings.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => t * t * (3 - 2 * t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const elasticOut = t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function range(rng, min, max) {
  return min + (max - min) * rng();
}

function polygonPrismGeometry(points, thickness = 0.5) {
  const topY = thickness / 2;
  const bottomY = -thickness / 2;
  const positions = [];
  const indices = [];
  for (const [x, z] of points) positions.push(x, topY, z);
  for (const [x, z] of points) positions.push(x, bottomY, z);
  const count = points.length;
  for (let i = 1; i < count - 1; i += 1) indices.push(0, i, i + 1);
  for (let i = 1; i < count - 1; i += 1) indices.push(count, count + i + 1, count + i);
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    indices.push(i, count + i, count + next, i, count + next, next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function setOpacity(root, value) {
  root.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.transparent = value < 0.999 || material.userData.baseTransparent;
      material.opacity = (material.userData.baseOpacity ?? 1) * value;
      material.depthWrite = value > 0.82;
    }
  });
}

export class EnemyGeometryLayer {
  constructor({ canvas, width = 480, height = 800, stageId = 1, stageSettings, labSettings }) {
    if (!canvas) throw new Error('EnemyGeometryLayer requires a canvas.');
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.stageId = Number(stageId) || 1;
    this.profile = STAGE_DEFINITIONS[this.stageId] || STAGE_DEFINITIONS[1];
    this.stageSettings = cloneSettings(stageSettings);
    this.labSettings = { ...labSettings };
    this.enemyClass = labSettings.enemyClass || 'boss';
    this.action = labSettings.action || 'entrance';
    this.actionElapsed = 0;
    this.actionDuration = 4;
    this.loop = Boolean(labSettings.loop);
    this.shotQueue = [];
    this.firedMarkers = new Set();
    this.materials = [];
    this.geometries = [];
    this.pose = [];
    this.modelData = {};

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMappingExposure = Math.max(1.12, this.stageSettings.exposure + 0.06);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.stageSettings.camera.fov, width / height, 0.1, 300);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.hemi = new THREE.HemisphereLight(0xdafcff, 0x03040a, 1.5);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 3.2);
    this.key.position.set(-12, 28, 22);
    this.scene.add(this.key);
    this.rim = new THREE.PointLight(this.profile.palette.accent, 36, 90, 2);
    this.rim.position.set(12, 16, -10);
    this.scene.add(this.rim);
    this.warm = new THREE.PointLight(this.profile.palette.warm, 24, 80, 2);
    this.warm.position.set(-12, 9, 10);
    this.scene.add(this.warm);

    this.updateCamera();
    this.rebuild();
    this.playAction(this.action);
  }

  trackGeometry(geometry) {
    this.geometries.push(geometry);
    return geometry;
  }

  trackMaterial(material) {
    material.userData.baseOpacity = material.opacity;
    material.userData.baseTransparent = material.transparent;
    this.materials.push(material);
    return material;
  }

  bodyMaterial({ color, emissive, metalness = 0.72, roughness = 0.3, emissiveIntensity = 0.48, opacity = 1 } = {}) {
    const palette = this.profile.palette;
    return this.trackMaterial(new THREE.MeshStandardMaterial({
      color: color ?? palette.body[2],
      emissive: emissive ?? palette.emissive[2],
      emissiveIntensity,
      metalness,
      roughness,
      transparent: opacity < 0.999,
      opacity,
      side: THREE.DoubleSide,
    }));
  }

  glowMaterial(color = this.profile.palette.accent, opacity = 1) {
    return this.trackMaterial(new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 0.999,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
  }

  darkMaterial(opacity = 1) {
    return this.bodyMaterial({ color: 0x060912, emissive: 0x020306, metalness: 0.85, roughness: 0.22, emissiveIntensity: 0.12, opacity });
  }

  addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    this.trackGeometry(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }

  addEdges(parent, mesh, color = this.profile.palette.edge[2], opacity = 0.72, threshold = 18) {
    const geometry = this.trackGeometry(new THREE.EdgesGeometry(mesh.geometry, threshold));
    const material = this.trackMaterial(new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    const line = new THREE.LineSegments(geometry, material);
    line.position.copy(mesh.position);
    line.rotation.copy(mesh.rotation);
    line.scale.copy(mesh.scale);
    parent.add(line);
    return line;
  }

  addPrism(parent, points, thickness, material, position = [0, 0, 0], rotation = [0, 0, 0], edge = true) {
    const mesh = this.addMesh(parent, polygonPrismGeometry(points, thickness), material, position, rotation);
    if (edge) this.addEdges(parent, mesh);
    return mesh;
  }

  addBox(parent, size, material, position = [0, 0, 0], rotation = [0, 0, 0], edge = true) {
    const mesh = this.addMesh(parent, new THREE.BoxGeometry(...size), material, position, rotation);
    if (edge) this.addEdges(parent, mesh);
    return mesh;
  }

  addCylinder(parent, radiusTop, radiusBottom, height, segments, material, position = [0, 0, 0], rotation = [0, 0, 0], edge = true) {
    const mesh = this.addMesh(parent, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, position, rotation);
    if (edge) this.addEdges(parent, mesh);
    return mesh;
  }

  addTorus(parent, radius, tube, material, position = [0, 0, 0], rotation = [Math.PI / 2, 0, 0], edge = false) {
    const mesh = this.addMesh(parent, new THREE.TorusGeometry(radius, tube, 8, 40), material, position, rotation);
    if (edge) this.addEdges(parent, mesh);
    return mesh;
  }

  addMuzzle(parent, position) {
    const point = new THREE.Object3D();
    point.position.set(...position);
    point.userData.muzzle = true;
    parent.add(point);
    this.modelData.muzzles.push(point);
    return point;
  }

  updateCamera() {
    const config = this.stageSettings.camera;
    const pitch = THREE.MathUtils.degToRad(clamp(config.pitch, 25, 88));
    const distance = Math.max(10, config.distance);
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

  screenToWorld(px, py, planeY) {
    const ndc = new THREE.Vector3((px / this.width) * 2 - 1, 1 - (py / this.height) * 2, 0.2);
    ndc.unproject(this.camera);
    const direction = ndc.sub(this.camera.position).normalize();
    const denominator = direction.y;
    if (Math.abs(denominator) < 1e-5) return new THREE.Vector3(0, planeY, this.stageSettings.camera.targetZ);
    const distance = (planeY - this.camera.position.y) / denominator;
    return this.camera.position.clone().add(direction.multiplyScalar(distance));
  }

  projectWorld(object, local = null) {
    const point = local ? object.localToWorld(local.clone()) : object.getWorldPosition(new THREE.Vector3());
    point.project(this.camera);
    return {
      x: (point.x * 0.5 + 0.5) * this.width,
      y: (-point.y * 0.5 + 0.5) * this.height,
      visible: point.z > -1 && point.z < 1,
    };
  }

  disposeGenerated() {
    for (const child of [...this.world.children]) this.world.remove(child);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.pose.length = 0;
    this.modelData = {};
  }

  baseModelData() {
    return {
      core: null,
      wings: [],
      rings: [],
      turrets: [],
      assemblyParts: [],
      floatingParts: [],
      muzzles: [],
      crown: null,
      effectRing: null,
      effectRing2: null,
      effectGateLeft: null,
      effectGateRight: null,
      effectParticles: [],
    };
  }

  roleMaterials(type) {
    const palette = ENEMY_ROLE_PALETTES[this.stageId]?.[type] || ENEMY_ROLE_PALETTES[1].scout;
    const body = this.bodyMaterial({ color: palette.body, emissive: palette.secondary, emissiveIntensity: 0.5, metalness: 0.68, roughness: 0.26 });
    const secondary = this.bodyMaterial({ color: palette.secondary, emissive: palette.secondary, emissiveIntensity: 0.7, metalness: 0.48, roughness: 0.18, opacity: 0.92 });
    const glow = this.glowMaterial(palette.glow, 0.96);
    const warm = this.glowMaterial(palette.warm, 0.92);
    this.modelData.projectileColor = palette.glow;
    this.modelData.projectileWarm = palette.warm;
    return { palette, body, secondary, glow, warm, dark: this.darkMaterial() };
  }

  createStage1Unit(type) {
    const group = new THREE.Group();
    const { body, secondary, glow, warm, dark } = this.roleMaterials(type);
    if (type === 'scout') {
      const hull = this.addPrism(group, [[0, 2.1], [-1.25, .15], [0, -1.25], [1.25, .15]], .42, body);
      const spine = this.addPrism(group, [[0, 1.65], [-.24, -.45], [0, -1.2], [.24, -.45]], .7, dark, [0, -.04, 0]);
      const core = this.addCylinder(group, .32, .32, .55, 14, glow, [0, .34, .05]);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(hull, spine, core);
      this.modelData.wings.push(hull);
      this.addMuzzle(core, [0, 0, .35]);
    } else if (type === 'striker') {
      const needle = this.addMesh(group, new THREE.ConeGeometry(.28, 4.8, 5), warm, [0, .18, 1.15], [Math.PI / 2, 0, 0]);
      const center = this.addPrism(group, [[0, 1.4], [-.55, .15], [-.32, -1.25], [.32, -1.25], [.55, .15]], .55, body);
      const left = this.addPrism(group, [[-.25, .75], [-2.4, -.05], [-1.15, -1.0], [-.15, -.35]], .24, secondary, [0, .12, 0]);
      const right = this.addPrism(group, [[.25, .75], [2.4, -.05], [1.15, -1.0], [.15, -.35]], .24, secondary, [0, .12, 0]);
      this.modelData.core = center;
      this.modelData.turrets.push(needle);
      this.modelData.wings.push(left, right);
      this.modelData.assemblyParts.push(needle, center, left, right);
      this.addMuzzle(needle, [0, -2.55, 0]);
    } else if (type === 'gunship') {
      const hull = this.addPrism(group, [[-2.5, 1.05], [-2.8, -.75], [-1.55, -1.45], [1.55, -1.45], [2.8, -.75], [2.5, 1.05]], .95, body);
      const belly = this.addCylinder(group, .82, .95, .92, 16, dark, [0, .26, -.1]);
      const core = this.addCylinder(group, .48, .48, 1.02, 18, warm, [0, .78, -.1]);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(hull, belly, core);
      for (const side of [-1, 1]) {
        const pod = this.addBox(group, [.72, .72, 2.4], secondary, [side * 1.75, .24, -.15]);
        const barrel = this.addCylinder(pod, .2, .28, 1.2, 8, glow, [0, 0, .95], [Math.PI / 2, 0, 0], false);
        this.modelData.turrets.push(pod);
        this.addMuzzle(barrel, [0, -.72, 0]);
      }
    } else if (type === 'elite') {
      const core = this.addMesh(group, new THREE.OctahedronGeometry(.92, 0), secondary, [0, .18, 0], [0, Math.PI / 4, 0]);
      this.addEdges(group, core, '#d6ffe6', .9);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(core);
      for (let i = 0; i < 4; i += 1) {
        const angle = Math.PI / 4 + i * Math.PI / 2;
        const wing = this.addPrism(group, [[-.22, 1.9], [-.55, .2], [0, -.7], [.55, .2], [.22, 1.9]], .26, body, [Math.cos(angle) * 1.25, .08, Math.sin(angle) * 1.25], [0, -angle, 0]);
        this.modelData.wings.push(wing);
        this.modelData.assemblyParts.push(wing);
      }
      const ring = this.addTorus(group, 2.15, .1, glow, [0, .48, 0]);
      this.modelData.rings.push(ring);
      this.addMuzzle(core, [0, 0, 1.05]);
    } else {
      const main = this.addPrism(group, [[0, 2.8], [-1.1, 1.7], [-3.25, 1.0], [-2.35, -.2], [-3.0, -1.8], [-.65, -1.15], [0, -2.4], [.65, -1.15], [2.45, -.45], [2.9, 1.25], [1.1, 1.7]], 1.05, body);
      const leftLayer = this.addPrism(group, [[-.4, 1.8], [-3.8, .55], [-2.15, -1.3], [-.45, -.55]], .34, secondary, [-.15, .45, .05], [0, .08, 0]);
      const rightLayer = this.addPrism(group, [[.35, 1.45], [3.35, .85], [2.65, -1.65], [.45, -.45]], .28, dark, [.2, .62, -.05], [0, -.13, 0]);
      const core = this.addCylinder(group, .76, .76, 1.15, 20, warm, [-.3, .95, .05]);
      this.modelData.core = core;
      this.modelData.wings.push(leftLayer, rightLayer);
      this.modelData.assemblyParts.push(main, leftLayer, rightLayer, core);
      for (const [x, z] of [[-1.75, .15], [1.4, -.25], [0, 1.25]]) {
        const turret = this.addCylinder(group, .28, .36, .72, 8, dark, [x, .9, z]);
        this.modelData.turrets.push(turret);
        this.addMuzzle(turret, [0, .05, .48]);
      }
    }
    return group;
  }

  createStage2Unit(type) {
    const group = new THREE.Group();
    const { body, secondary, glow, warm, dark } = this.roleMaterials(type);
    if (type === 'scout') {
      const core = this.addCylinder(group, .68, .78, .66, 10, body, [0, .22, 0]);
      const eye = this.addCylinder(group, .3, .3, .72, 14, glow, [0, .62, 0]);
      this.modelData.core = eye;
      for (let i = 0; i < 3; i += 1) {
        const angle = i * TAU / 3;
        const arm = this.addBox(group, [.38, .32, 1.75], secondary, [Math.sin(angle) * 1.1, .18, Math.cos(angle) * 1.1], [0, angle, 0]);
        const tip = this.addCylinder(group, .18, .28, .46, 8, warm, [Math.sin(angle) * 1.85, .25, Math.cos(angle) * 1.85]);
        this.modelData.wings.push(arm);
        this.modelData.assemblyParts.push(arm, tip);
      }
      this.modelData.assemblyParts.push(core, eye);
      this.addMuzzle(eye, [0, 0, .42]);
    } else if (type === 'striker') {
      const cross = this.addBox(group, [3.9, .64, .7], body, [0, .18, -.2]);
      const rails = this.addBox(group, [.78, .74, 3.7], dark, [0, .12, -.15]);
      const blade = this.addPrism(group, [[0, 2.45], [-.48, .15], [0, -.65], [.48, .15]], .24, warm, [0, .56, 1.15]);
      this.modelData.core = rails;
      this.modelData.wings.push(cross);
      this.modelData.turrets.push(blade);
      this.modelData.assemblyParts.push(cross, rails, blade);
      this.addMuzzle(blade, [0, 0, 1.65]);
    } else if (type === 'gunship') {
      const vat = this.addCylinder(group, 1.42, 1.55, 1.15, 12, body, [0, .18, -.2]);
      const core = this.addCylinder(group, .72, .72, 1.3, 18, warm, [0, .82, -.2]);
      const frame = this.addBox(group, [5.0, .68, 2.7], dark, [0, .05, -.15]);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(vat, core, frame);
      for (const side of [-1, 1]) {
        const turret = this.addCylinder(group, .48, .62, .72, 8, secondary, [side * 1.85, .7, .2]);
        const barrel = this.addBox(turret, [.24, .24, 1.55], glow, [0, .1, .85], [0, 0, 0], false);
        this.modelData.turrets.push(turret);
        this.addMuzzle(barrel, [0, 0, .92]);
      }
    } else if (type === 'elite') {
      const core = this.addCylinder(group, .82, .82, .8, 12, dark, [0, .26, 0]);
      const eye = this.addCylinder(group, .4, .4, .88, 16, glow, [0, .72, 0]);
      this.modelData.core = eye;
      const ring = this.addTorus(group, 2.25, .22, warm, [0, .4, 0]);
      this.modelData.rings.push(ring);
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI / 2;
        const press = this.addBox(group, [.8, .58, 2.3], body, [Math.sin(angle) * 1.5, .24, Math.cos(angle) * 1.5], [0, angle, 0]);
        this.modelData.wings.push(press);
        this.modelData.assemblyParts.push(press);
      }
      this.modelData.assemblyParts.push(core, eye, ring);
      this.addMuzzle(eye, [0, 0, .55]);
    } else {
      const left = this.addBox(group, [1.35, 1.35, 5.1], body, [-2.15, .35, 0]);
      const right = this.addBox(group, [1.35, 1.35, 5.1], body, [2.15, .35, 0]);
      const bridge = this.addBox(group, [5.55, .78, 1.05], dark, [0, .08, -1.55]);
      const press = this.addBox(group, [3.3, .48, 1.2], secondary, [0, 1.05, .55]);
      const core = this.addCylinder(group, .9, 1.1, 1.35, 12, warm, [0, .62, -.05]);
      this.modelData.core = core;
      this.modelData.wings.push(left, right);
      this.modelData.rings.push(press);
      this.modelData.assemblyParts.push(left, right, bridge, press, core);
      for (const side of [-1, 1]) {
        const turret = this.addCylinder(group, .44, .56, .72, 8, dark, [side * 1.2, 1.0, .7]);
        this.modelData.turrets.push(turret);
        this.addMuzzle(turret, [0, .05, .5]);
      }
    }
    return group;
  }

  createStage3Unit(type) {
    const group = new THREE.Group();
    const { body, secondary, glow, warm } = this.roleMaterials(type);
    const addCrystal = (geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
      const mesh = this.addMesh(group, geometry, material, position, rotation, scale);
      this.addEdges(group, mesh, '#e8fbff', .78);
      return mesh;
    };
    if (type === 'scout') {
      const core = addCrystal(new THREE.TetrahedronGeometry(.65), body, [0, 0, 0], [0, .4, 0]);
      this.modelData.core = core;
      for (let i = 0; i < 3; i += 1) {
        const angle = i * TAU / 3;
        const shard = addCrystal(new THREE.TetrahedronGeometry(.52), i === 0 ? secondary : body, [Math.sin(angle) * 1.25, .05, Math.cos(angle) * 1.25], [angle, angle * .5, 0], [.65, .55, 1.4]);
        this.modelData.floatingParts.push(shard);
        this.modelData.assemblyParts.push(shard);
      }
      this.modelData.assemblyParts.push(core);
      this.addMuzzle(core, [0, 0, .72]);
    } else if (type === 'striker') {
      const lance = addCrystal(new THREE.ConeGeometry(.34, 5.6, 5), glow, [0, 0, 1.25], [Math.PI / 2, 0, 0]);
      const core = addCrystal(new THREE.OctahedronGeometry(.74), secondary, [0, .12, -.45], [0, .45, 0], [.8, .7, 1.15]);
      this.modelData.core = core;
      this.modelData.turrets.push(lance);
      for (const side of [-1, 1]) {
        const fin = addCrystal(new THREE.ConeGeometry(.48, 2.8, 4), body, [side * 1.35, .08, -.15], [Math.PI / 2, 0, side * .55], [.75, .65, 1]);
        this.modelData.wings.push(fin);
      }
      this.addMuzzle(lance, [0, -3.0, 0]);
    } else if (type === 'gunship') {
      const positions = [[0, 0, 0], [-1.3, .1, .15], [1.3, .1, .15], [-.72, -.05, -1.15], [.72, -.05, -1.15]];
      positions.forEach((position, index) => {
        const crystal = addCrystal(new THREE.OctahedronGeometry(index ? .72 : 1.0), index % 2 ? secondary : body, position, [0, index * .45, 0], [1, .72, index ? 1.25 : 1.5]);
        this.modelData.assemblyParts.push(crystal);
        if (index === 0) this.modelData.core = crystal;
        if (index === 1 || index === 2) {
          this.modelData.turrets.push(crystal);
          this.addMuzzle(crystal, [0, 0, .85]);
        }
      });
    } else if (type === 'elite') {
      const core = addCrystal(new THREE.TetrahedronGeometry(1.0), secondary, [0, .1, 0], [0, .5, 0]);
      this.modelData.core = core;
      const ring = this.addTorus(group, 2.1, .09, glow, [0, .25, 0]);
      this.modelData.rings.push(ring);
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI / 2 + Math.PI / 4;
        const mirror = addCrystal(new THREE.BoxGeometry(.35, .22, 1.55), i % 2 ? warm : body, [Math.cos(angle) * 1.65, .2, Math.sin(angle) * 1.65], [0, -angle, .4]);
        this.modelData.floatingParts.push(mirror);
        this.modelData.assemblyParts.push(mirror);
      }
      this.modelData.assemblyParts.push(core);
      this.addMuzzle(core, [0, 0, 1.05]);
    } else {
      const core = addCrystal(new THREE.OctahedronGeometry(1.15), body, [0, .05, -.55], [0, .35, 0], [1, .8, 1.35]);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(core);
      for (let i = -1; i <= 1; i += 1) {
        const neck = addCrystal(new THREE.ConeGeometry(.48, 4.4, 5), i === 0 ? warm : secondary, [i * 1.75, .1, 1.15 - Math.abs(i) * .45], [Math.PI / 2, 0, i * .18]);
        this.modelData.turrets.push(neck);
        this.modelData.assemblyParts.push(neck);
        this.addMuzzle(neck, [0, -2.4, 0]);
      }
      for (const side of [-1, 1]) {
        const wing = addCrystal(new THREE.ConeGeometry(.72, 3.2, 4), body, [side * 2.5, .05, -.45], [Math.PI / 2, 0, side * .55]);
        this.modelData.wings.push(wing);
      }
    }
    return group;
  }

  createStage4Unit(type) {
    const group = new THREE.Group();
    const { body, secondary, glow, warm, dark } = this.roleMaterials(type);
    if (type === 'scout') {
      const disc = this.addCylinder(group, 1.28, 1.28, .42, 18, body, [0, .2, 0]);
      const core = this.addCylinder(group, .42, .42, .52, 14, glow, [0, .5, 0]);
      const sail = this.addPrism(group, [[0, 2.2], [-1.4, -.8], [1.4, -.8]], .18, secondary, [0, .05, -1.0]);
      this.modelData.core = core;
      this.modelData.wings.push(sail);
      this.modelData.assemblyParts.push(disc, core, sail);
      this.addMuzzle(core, [0, 0, .5]);
    } else if (type === 'striker') {
      const spear = this.addMesh(group, new THREE.ConeGeometry(.34, 5.7, 6), warm, [0, .15, 1.3], [Math.PI / 2, 0, 0]);
      const center = this.addPrism(group, [[0, 1.4], [-.68, .1], [-.45, -1.35], [.45, -1.35], [.68, .1]], .62, body);
      this.modelData.core = center;
      this.modelData.turrets.push(spear);
      for (const side of [-1, 1]) {
        const fin = this.addPrism(group, [[side * .2, .8], [side * 2.15, -.2], [side * 1.25, -1.25], [side * .15, -.35]], .25, secondary, [0, .12, 0]);
        this.modelData.wings.push(fin);
      }
      this.addMuzzle(spear, [0, -3.05, 0]);
    } else if (type === 'gunship') {
      const hull = this.addBox(group, [4.8, 1.0, 3.2], body, [0, .15, -.15]);
      const core = this.addCylinder(group, .72, .72, 1.05, 16, glow, [0, .82, .1]);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(hull, core);
      for (const side of [-1, 1]) {
        const shield = this.addPrism(group, [[0, 1.55], [side * 1.25, .75], [side * 1.25, -1.3], [0, -1.55]], .45, dark, [side * 2.35, .42, -.1]);
        this.modelData.wings.push(shield);
        const turret = this.addCylinder(group, .42, .52, .78, 8, secondary, [side * 1.25, .9, .65]);
        this.modelData.turrets.push(turret);
        this.addMuzzle(turret, [0, .05, .55]);
      }
      const ring = this.addTorus(group, 1.15, .1, warm, [0, .55, -.35]);
      this.modelData.rings.push(ring);
    } else if (type === 'elite') {
      const core = this.addCylinder(group, .72, .72, .86, 6, secondary, [0, .3, 0]);
      this.modelData.core = core;
      const ring = this.addTorus(group, 2.35, .14, glow, [0, .38, 0]);
      this.modelData.rings.push(ring);
      for (let i = 0; i < 6; i += 1) {
        const angle = i * TAU / 6;
        const shield = this.addCylinder(group, .42, .52, .42, 6, i % 2 ? warm : body, [Math.cos(angle) * 2.0, .38, Math.sin(angle) * 2.0]);
        shield.rotation.y = angle;
        this.modelData.floatingParts.push(shield);
        this.modelData.assemblyParts.push(shield);
      }
      this.addMuzzle(core, [0, 0, .72]);
    } else {
      const hull = this.addPrism(group, [[0, 2.4], [-2.2, 1.45], [-3.2, -.4], [-1.75, -2.1], [0, -2.7], [1.75, -2.1], [3.2, -.4], [2.2, 1.45]], 1.25, body);
      const core = this.addCylinder(group, .95, 1.05, 1.2, 16, glow, [0, .8, -.25]);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(hull, core);
      for (const side of [-1, 1]) {
        const horn = this.addMesh(group, new THREE.ConeGeometry(.55, 4.1, 6), side < 0 ? secondary : warm, [side * 1.7, .5, 1.5], [Math.PI / 2, 0, -side * .25]);
        const plate = this.addPrism(group, [[0, 1.7], [side * 1.7, .7], [side * 1.4, -1.55], [0, -1.1]], .42, dark, [side * 1.7, .5, -.35]);
        this.modelData.turrets.push(horn);
        this.modelData.wings.push(plate);
        this.addMuzzle(horn, [0, -2.25, 0]);
      }
      const ring = this.addTorus(group, 2.0, .13, warm, [0, .65, -.45]);
      this.modelData.rings.push(ring);
    }
    return group;
  }

  createStage5Unit(type) {
    const group = new THREE.Group();
    const { body, secondary, glow, warm, dark } = this.roleMaterials(type);
    if (type === 'scout') {
      const positions = [[0, 0, 1.0], [-1.05, .08, -.45], [1.05, -.08, -.45]];
      positions.forEach((position, index) => {
        const plate = this.addPrism(group, [[0, 1.15], [-.42, .35], [-.25, -1.0], [.25, -1.0], [.42, .35]], .2, index === 0 ? secondary : body, position, [0, index ? (index === 1 ? .5 : -.5) : 0, 0]);
        this.modelData.floatingParts.push(plate);
        this.modelData.assemblyParts.push(plate);
        if (index === 0) this.modelData.core = plate;
      });
      this.addMuzzle(this.modelData.core, [0, 0, .8]);
    } else if (type === 'striker') {
      const spear = this.addMesh(group, new THREE.ConeGeometry(.3, 5.8, 5), glow, [.5, .15, 1.1], [Math.PI / 2, 0, 0]);
      const core = this.addMesh(group, new THREE.IcosahedronGeometry(.72, 0), secondary, [-.35, .2, -.45]);
      this.addEdges(group, core, '#e7c5ff', .86);
      const ring = this.addTorus(group, 1.4, .09, warm, [-.55, .28, -.3]);
      ring.rotation.z = .42;
      this.modelData.core = core;
      this.modelData.turrets.push(spear);
      this.modelData.rings.push(ring);
      this.modelData.assemblyParts.push(spear, core, ring);
      for (const side of [-1, 1]) {
        const plate = this.addPrism(group, [[0, 1.2], [side * .65, .35], [side * .45, -1.1], [0, -.55]], .22, body, [side * 1.25, .05, -.5], [0, side * .35, 0]);
        this.modelData.floatingParts.push(plate);
      }
      this.addMuzzle(spear, [0, -3.1, 0]);
    } else if (type === 'gunship') {
      const platform = this.addBox(group, [4.6, .72, 2.9], dark, [0, .05, -.25]);
      const throne = this.addPrism(group, [[0, 1.65], [-1.05, .55], [-.8, -1.3], [.8, -1.3], [1.05, .55]], .72, body, [0, .48, -.25]);
      const core = this.addMesh(group, new THREE.IcosahedronGeometry(.7, 0), secondary, [0, .82, .3]);
      this.addEdges(group, core, '#ffd1ed', .85);
      this.modelData.core = core;
      this.modelData.assemblyParts.push(platform, throne, core);
      for (const side of [-1, 1]) {
        const drum = this.addTorus(group, .72, .2, side < 0 ? glow : warm, [side * 1.62, .5, .15]);
        this.modelData.rings.push(drum);
        this.addMuzzle(drum, [0, 0, .72]);
      }
    } else if (type === 'elite') {
      const core = this.addMesh(group, new THREE.OctahedronGeometry(.82, 0), secondary, [0, .25, 0]);
      this.addEdges(group, core, '#bafff1', .9);
      this.modelData.core = core;
      for (const side of [-1, 1]) {
        const gate = this.addTorus(group, 1.35, .13, side < 0 ? glow : warm, [side * 1.7, .25, 0]);
        gate.scale.y = 1.45;
        this.modelData.rings.push(gate);
        const frame = this.addBox(group, [.22, .34, 3.2], body, [side * 1.7, .18, 0], [0, 0, side * .08]);
        this.modelData.floatingParts.push(frame);
      }
      this.addMuzzle(core, [0, 0, .95]);
    } else {
      const core = this.addMesh(group, new THREE.IcosahedronGeometry(1.05, 0), secondary, [0, .28, 0]);
      this.addEdges(group, core, '#ffd0d5', .9);
      this.modelData.core = core;
      const radii = [1.45, 2.15, 2.8];
      radii.forEach((radius, index) => {
        const ring = this.addTorus(group, radius, .11 + index * .025, index === 1 ? warm : glow, [0, .25 + index * .08, 0]);
        ring.rotation.z = index * .45;
        this.modelData.rings.push(ring);
      });
      for (let i = 0; i < 5; i += 1) {
        const angle = i * TAU / 5;
        const obelisk = this.addPrism(group, [[0, 1.55], [-.38, .35], [-.25, -1.25], [.25, -1.25], [.38, .35]], .32, i % 2 ? body : dark, [Math.cos(angle) * 2.35, .1, Math.sin(angle) * 2.35], [0, -angle, 0]);
        this.modelData.floatingParts.push(obelisk);
        this.modelData.assemblyParts.push(obelisk);
      }
      this.addMuzzle(core, [0, 0, 1.15]);
    }
    return group;
  }

  createStage1(type) {
    if (type !== 'boss') return this.createStage1Unit(type);
    const group = new THREE.Group();
    const body = this.bodyMaterial({ color: type === 'boss' ? 0x6d132c : 0x204d62, emissive: type === 'boss' ? 0x4d0718 : 0x0b5265, emissiveIntensity: 0.55 });
    const dark = this.darkMaterial();
    const glow = this.glowMaterial(type === 'boss' ? '#ff5474' : '#5eeaff');
    const factor = { scout: 0.75, striker: 0.9, gunship: 1.08, elite: 1.3, midboss: 1.55, boss: 2.45 }[type];
    const width = 3.2 * factor;
    const length = 3.5 * factor;
    const points = type === 'boss'
      ? [[0, length * .75], [-width * .28, length * .33], [-width, length * .45], [-width * .76, 0], [-width * 1.12, -length * .4], [-width * .42, -length * .23], [0, -length * .78], [width * .42, -length * .23], [width * 1.12, -length * .4], [width * .76, 0], [width, length * .45], [width * .28, length * .33]]
      : [[0, length * .78], [-width * .25, length * .28], [-width, length * .18], [-width * .55, -length * .22], [0, -length * .68], [width * .55, -length * .22], [width, length * .18], [width * .25, length * .28]];
    const shell = this.addPrism(group, points, 0.52 * factor, body, [0, 0, 0]);
    this.modelData.assemblyParts.push(shell);
    const belly = this.addPrism(group, [[0, length * .48], [-width * .18, -length * .25], [0, -length * .58], [width * .18, -length * .25]], 0.7 * factor, dark, [0, -0.08 * factor, 0]);
    this.modelData.assemblyParts.push(belly);
    const core = this.addCylinder(group, 0.52 * factor, 0.52 * factor, 0.7 * factor, 20, glow, [0, 0.42 * factor, -length * .03]);
    this.modelData.core = core;
    for (const side of [-1, 1]) {
      const wing = this.addPrism(group, [[0, length * .35], [side * width * .98, length * .18], [side * width * .65, -length * .18], [0, -length * .04]], 0.18 * factor, this.bodyMaterial({ color: 0x2b7890, emissive: 0x0c6d83, emissiveIntensity: 0.42, opacity: 0.88 }), [0, 0.25 * factor, 0]);
      this.modelData.wings.push(wing);
      if (type === 'striker' || type === 'elite' || type === 'midboss' || type === 'boss') {
        const blade = this.addBox(group, [0.16 * factor, 0.22 * factor, length * 0.85], glow, [side * width * .74, 0.3 * factor, 0], [0, side * .22, 0], false);
        this.modelData.wings.push(blade);
      }
      if (type === 'gunship' || type === 'elite' || type === 'midboss' || type === 'boss') {
        const pod = this.addCylinder(group, 0.28 * factor, 0.36 * factor, 1.15 * factor, 8, dark, [side * width * .48, 0, -length * .12], [Math.PI / 2, 0, 0]);
        this.modelData.turrets.push(pod);
        this.addMuzzle(pod, [0, -0.7 * factor, 0]);
      }
    }
    if (type === 'boss') {
      const tail = this.addBox(group, [0.22 * factor, 0.25 * factor, length * 1.05], dark, [0, -0.18, -length * .9], [0, 0, 0]);
      this.modelData.assemblyParts.push(tail);
      for (let i = 0; i < 10; i += 1) {
        const particle = this.addMesh(group, new THREE.TetrahedronGeometry(0.12 + (i % 3) * 0.04), this.glowMaterial('#7ef4ff', 0.75), [0, 0, 0]);
        particle.visible = false;
        particle.userData.index = i;
        this.modelData.effectParticles.push(particle);
      }
      const ring = this.addTorus(group, width * 1.25, 0.08 * factor, this.glowMaterial('#56eaff', 0.8), [0, -0.9 * factor, 0]);
      ring.visible = false;
      this.modelData.effectRing = ring;
    }
    if (!this.modelData.muzzles.length) this.addMuzzle(core, [0, 0, 0.15]);
    return group;
  }

  createStage2(type) {
    if (type !== 'boss') return this.createStage2Unit(type);
    const group = new THREE.Group();
    const factor = { scout: 0.72, striker: 0.9, gunship: 1.1, elite: 1.32, midboss: 1.65, boss: 2.3 }[type];
    const body = this.bodyMaterial({ color: 0x4e3448, emissive: 0x5d1c2c, emissiveIntensity: 0.45 });
    const armor = this.bodyMaterial({ color: 0x71503d, emissive: 0x6f281b, emissiveIntensity: 0.36 });
    const dark = this.darkMaterial();
    const hot = this.glowMaterial('#ff8b45');
    const w = 2.8 * factor;
    const l = 3.7 * factor;
    const hull = this.addPrism(group, [[-w * .7, l * .58], [-w, l * .2], [-w * .78, -l * .6], [w * .78, -l * .6], [w, l * .2], [w * .7, l * .58]], 0.82 * factor, body);
    this.modelData.assemblyParts.push(hull);
    const furnace = this.addCylinder(group, 0.72 * factor, 0.9 * factor, 0.95 * factor, 12, dark, [0, 0.3 * factor, 0]);
    const core = this.addCylinder(group, 0.42 * factor, 0.42 * factor, 1.02 * factor, 18, hot, [0, 0.82 * factor, 0]);
    this.modelData.core = core;
    this.modelData.assemblyParts.push(furnace, core);
    for (const side of [-1, 1]) {
      const clampArm = this.addBox(group, [0.58 * factor, 0.52 * factor, l * .92], armor, [side * w * .83, 0, -l * .05], [0, 0, side * .08]);
      this.modelData.wings.push(clampArm);
      const piston = this.addCylinder(group, 0.18 * factor, 0.18 * factor, 1.45 * factor, 10, hot, [side * w * .72, 0.48 * factor, l * .12], [Math.PI / 2, 0, 0], false);
      this.modelData.assemblyParts.push(piston);
      if (type !== 'scout') {
        const turret = this.addCylinder(group, 0.38 * factor, 0.48 * factor, 0.62 * factor, 8, dark, [side * w * .48, 0.74 * factor, l * .1]);
        const barrel = this.addBox(turret, [0.2 * factor, 0.2 * factor, 1.4 * factor], hot, [0, 0.1 * factor, 0.7 * factor], [0, 0, 0], false);
        this.modelData.turrets.push(turret);
        this.addMuzzle(barrel, [0, 0, 0.78 * factor]);
      }
    }
    if (type === 'elite' || type === 'midboss' || type === 'boss') {
      const press = this.addBox(group, [w * 1.15, 0.28 * factor, 0.52 * factor], hot, [0, 0.9 * factor, -l * .26], [0, 0, 0], false);
      this.modelData.rings.push(press);
    }
    if (type === 'boss') {
      for (let i = -2; i <= 2; i += 1) {
        const deck = this.addBox(group, [w * .38, 0.18 * factor, l * .72], i === 0 ? hot : armor, [i * w * .34, 0.72 * factor, -l * .1]);
        this.modelData.assemblyParts.push(deck);
      }
      const gantryLeft = this.addBox(group, [0.28 * factor, 0.3 * factor, l * 1.1], hot, [-w * 1.25, 1.1 * factor, 0], [0, 0, 0], false);
      const gantryRight = this.addBox(group, [0.28 * factor, 0.3 * factor, l * 1.1], hot, [w * 1.25, 1.1 * factor, 0], [0, 0, 0], false);
      gantryLeft.visible = false;
      gantryRight.visible = false;
      this.modelData.effectGateLeft = gantryLeft;
      this.modelData.effectGateRight = gantryRight;
      for (let i = 0; i < 14; i += 1) {
        const spark = this.addMesh(group, new THREE.TetrahedronGeometry(0.09 * factor), this.glowMaterial('#ffd36e', 0.9), [0, 0, 0]);
        spark.visible = false;
        spark.userData.index = i;
        this.modelData.effectParticles.push(spark);
      }
    }
    if (!this.modelData.muzzles.length) this.addMuzzle(core, [0, 0, 0.1]);
    return group;
  }

  createStage3(type) {
    if (type !== 'boss') return this.createStage3Unit(type);
    const group = new THREE.Group();
    const factor = { scout: 0.68, striker: 0.86, gunship: 1.05, elite: 1.32, midboss: 1.62, boss: 2.2 }[type];
    const crystal = this.bodyMaterial({ color: 0x3e8fbc, emissive: 0x0d638e, metalness: 0.25, roughness: 0.12, emissiveIntensity: 0.72, opacity: 0.9 });
    const mirror = this.bodyMaterial({ color: 0x9be6ff, emissive: 0x1b87ad, metalness: 0.55, roughness: 0.05, emissiveIntensity: 0.7, opacity: 0.62 });
    const glow = this.glowMaterial('#b8f6ff');
    const length = 3.8 * factor;
    const core = this.addMesh(group, new THREE.OctahedronGeometry(0.9 * factor, 0), crystal, [0, 0, 0], [0, Math.PI / 4, 0], [0.82, 0.7, 1.4]);
    this.addEdges(group, core, '#c9f7ff', 0.84);
    this.modelData.core = core;
    this.modelData.assemblyParts.push(core);
    const shardCount = type === 'boss' ? 10 : type === 'midboss' ? 7 : type === 'elite' ? 6 : type === 'gunship' ? 5 : 3;
    for (let i = 0; i < shardCount; i += 1) {
      const side = i % 2 ? 1 : -1;
      const band = Math.floor(i / 2);
      const shard = this.addMesh(group, new THREE.ConeGeometry((0.42 + band * .05) * factor, (2.5 - band * .12) * factor, 4), i % 3 === 0 ? mirror : crystal,
        [side * (1.05 + band * .48) * factor, 0, (0.7 - band * .65) * factor], [Math.PI / 2, 0, side * (0.24 + band * .07)]);
      this.addEdges(group, shard, '#a6efff', 0.75);
      this.modelData.wings.push(shard);
      this.modelData.assemblyParts.push(shard);
    }
    if (type === 'striker' || type === 'elite' || type === 'midboss' || type === 'boss') {
      const lance = this.addMesh(group, new THREE.ConeGeometry(0.28 * factor, length * 1.15, 5), glow, [0, 0.05, length * .15], [Math.PI / 2, 0, 0]);
      this.modelData.turrets.push(lance);
      this.addMuzzle(lance, [0, -length * .6, 0]);
    }
    if (type === 'gunship' || type === 'elite' || type === 'midboss' || type === 'boss') {
      const ring = this.addTorus(group, 1.45 * factor, 0.08 * factor, glow, [0, 0.15 * factor, -0.3 * factor]);
      this.modelData.rings.push(ring);
    }
    if (type === 'boss') {
      for (let i = 0; i < 18; i += 1) {
        const shard = this.addMesh(group, new THREE.TetrahedronGeometry((0.12 + (i % 4) * 0.04) * factor), i % 2 ? mirror : glow, [0, 0, 0]);
        shard.visible = false;
        shard.userData.index = i;
        this.modelData.effectParticles.push(shard);
      }
      const halo = this.addTorus(group, 2.6 * factor, 0.07 * factor, glow, [0, 0.1, -0.4 * factor]);
      halo.visible = false;
      this.modelData.effectRing = halo;
    }
    if (!this.modelData.muzzles.length) this.addMuzzle(core, [0, 0, 1.0 * factor]);
    return group;
  }

  createStage4(type) {
    if (type !== 'boss') return this.createStage4Unit(type);
    const group = new THREE.Group();
    const factor = { scout: 0.7, striker: 0.88, gunship: 1.1, elite: 1.36, midboss: 1.7, boss: 2.25 }[type];
    const armor = this.bodyMaterial({ color: 0x80532c, emissive: 0x71310c, emissiveIntensity: 0.48, metalness: 0.78, roughness: 0.3 });
    const dark = this.bodyMaterial({ color: 0x30180c, emissive: 0x511900, emissiveIntensity: 0.28, metalness: 0.86, roughness: 0.22 });
    const sun = this.glowMaterial('#ffd55c');
    const w = 2.8 * factor;
    const l = 3.4 * factor;
    const hull = this.addPrism(group, [[0, l * .78], [-w * .72, l * .35], [-w, -l * .18], [-w * .55, -l * .58], [0, -l * .72], [w * .55, -l * .58], [w, -l * .18], [w * .72, l * .35]], 0.9 * factor, armor);
    this.modelData.assemblyParts.push(hull);
    const core = this.addCylinder(group, 0.58 * factor, 0.68 * factor, 0.94 * factor, 16, sun, [0, 0.55 * factor, -0.08 * factor]);
    this.modelData.core = core;
    const ring = this.addTorus(group, 1.18 * factor, 0.11 * factor, sun, [0, 0.68 * factor, -0.1 * factor]);
    this.modelData.rings.push(ring);
    for (const side of [-1, 1]) {
      const shield = this.addPrism(group, [[side * .22 * w, l * .42], [side * w, l * .18], [side * .88 * w, -l * .46], [side * .26 * w, -l * .25]], 0.35 * factor, dark, [0, 0.22 * factor, 0]);
      this.modelData.wings.push(shield);
      if (type !== 'scout') {
        const horn = this.addMesh(group, new THREE.ConeGeometry(0.28 * factor, 2.2 * factor, 5), armor, [side * w * .56, 0.2 * factor, l * .48], [Math.PI / 2, 0, -side * .2]);
        this.modelData.turrets.push(horn);
        this.addMuzzle(horn, [0, -1.2 * factor, 0]);
      }
    }
    if (type === 'elite' || type === 'midboss' || type === 'boss') {
      for (let i = 0; i < 6; i += 1) {
        const angle = i / 6 * TAU;
        const node = this.addCylinder(group, 0.18 * factor, 0.23 * factor, 0.42 * factor, 8, sun, [Math.cos(angle) * 1.65 * factor, 0.6 * factor, -0.1 * factor + Math.sin(angle) * 1.65 * factor]);
        this.modelData.floatingParts.push(node);
      }
    }
    if (type === 'boss') {
      const eclipse = this.addTorus(group, 3.2 * factor, 0.18 * factor, sun, [0, -0.25 * factor, 0]);
      eclipse.visible = false;
      this.modelData.effectRing = eclipse;
      const disc = this.addCylinder(group, 2.7 * factor, 2.7 * factor, 0.18 * factor, 48, this.glowMaterial('#ffb42d', 0.42), [0, -0.5 * factor, 0]);
      disc.visible = false;
      this.modelData.effectRing2 = disc;
    }
    if (!this.modelData.muzzles.length) this.addMuzzle(core, [0, 0, 0.45 * factor]);
    return group;
  }

  createStage5(type) {
    if (type !== 'boss') return this.createStage5Unit(type);
    const group = new THREE.Group();
    const factor = { scout: 0.7, striker: 0.88, gunship: 1.1, elite: 1.38, midboss: 1.72, boss: 2.2 }[type];
    const obsidian = this.bodyMaterial({ color: 0x120a21, emissive: 0x2e0d55, emissiveIntensity: 0.5, metalness: 0.82, roughness: 0.18 });
    const violet = this.bodyMaterial({ color: 0x4b246b, emissive: 0x5b168b, emissiveIntensity: 0.72, metalness: 0.55, roughness: 0.2 });
    const lightning = this.glowMaterial('#d89aff');
    const w = 2.9 * factor;
    const l = 3.6 * factor;
    const core = this.addMesh(group, new THREE.IcosahedronGeometry(0.72 * factor, 0), violet, [0, 0.2 * factor, 0]);
    this.addEdges(group, core, '#e4b5ff', 0.88);
    this.modelData.core = core;
    this.modelData.assemblyParts.push(core);
    const plateCount = type === 'boss' ? 8 : type === 'midboss' ? 6 : type === 'elite' ? 5 : type === 'gunship' ? 4 : 3;
    for (let i = 0; i < plateCount; i += 1) {
      const angle = (i / plateCount) * TAU + Math.PI / 2;
      const radius = (1.1 + (i % 2) * .45) * factor;
      const plate = this.addPrism(group, [[-0.42 * factor, 0.7 * factor], [0, 1.15 * factor], [0.42 * factor, 0.7 * factor], [0.32 * factor, -0.72 * factor], [-0.32 * factor, -0.72 * factor]], 0.28 * factor, i % 2 ? obsidian : violet,
        [Math.cos(angle) * radius, (i % 3 - 1) * 0.18 * factor, Math.sin(angle) * radius], [0, -angle + Math.PI / 2, 0]);
      this.modelData.floatingParts.push(plate);
      this.modelData.assemblyParts.push(plate);
    }
    const ring = this.addTorus(group, 1.55 * factor, 0.08 * factor, lightning, [0, 0.08 * factor, 0]);
    this.modelData.rings.push(ring);
    if (type === 'striker' || type === 'elite' || type === 'midboss' || type === 'boss') {
      const spear = this.addMesh(group, new THREE.ConeGeometry(0.23 * factor, l * 1.12, 5), lightning, [0, 0.15 * factor, l * .17], [Math.PI / 2, 0, 0]);
      this.modelData.turrets.push(spear);
      this.addMuzzle(spear, [0, -l * .6, 0]);
    }
    if (type === 'gunship' || type === 'elite' || type === 'midboss' || type === 'boss') {
      for (const side of [-1, 1]) {
        const drum = this.addTorus(group, 0.62 * factor, 0.18 * factor, lightning, [side * w * .72, 0.18 * factor, -0.2 * factor]);
        this.modelData.rings.push(drum);
        if (type === 'boss') this.addMuzzle(drum, [0, 0, 0.65 * factor]);
      }
    }
    if (type === 'boss') {
      const crown = new THREE.Group();
      for (let i = -2; i <= 2; i += 1) {
        const spike = this.addMesh(crown, new THREE.ConeGeometry(0.18 * factor, (1.4 + Math.abs(i) * .18) * factor, 5), i === 0 ? lightning : violet, [i * .48 * factor, 0, -Math.abs(i) * .12 * factor], [Math.PI / 2, 0, 0]);
        this.modelData.assemblyParts.push(spike);
      }
      crown.position.set(0, 0.6 * factor, -l * .62);
      group.add(crown);
      this.modelData.crown = crown;
      this.modelData.assemblyParts.push(crown);
      const gateLeft = this.addTorus(group, 2.2 * factor, 0.12 * factor, lightning, [-w * 1.25, 0, 0], [Math.PI / 2, 0, 0]);
      const gateRight = this.addTorus(group, 2.2 * factor, 0.12 * factor, lightning, [w * 1.25, 0, 0], [Math.PI / 2, 0, 0]);
      gateLeft.visible = false;
      gateRight.visible = false;
      this.modelData.effectGateLeft = gateLeft;
      this.modelData.effectGateRight = gateRight;
      for (let i = 0; i < 12; i += 1) {
        const bolt = this.addBox(group, [0.08 * factor, 0.08 * factor, (0.5 + (i % 3) * .25) * factor], lightning, [0, 0, 0], [0, 0, 0], false);
        bolt.visible = false;
        bolt.userData.index = i;
        this.modelData.effectParticles.push(bolt);
      }
    }
    if (!this.modelData.muzzles.length) this.addMuzzle(core, [0, 0, 0.7 * factor]);
    return group;
  }

  buildModel() {
    this.modelData = this.baseModelData();
    switch (this.stageId) {
      case 2: return this.createStage2(this.enemyClass);
      case 3: return this.createStage3(this.enemyClass);
      case 4: return this.createStage4(this.enemyClass);
      case 5: return this.createStage5(this.enemyClass);
      default: return this.createStage1(this.enemyClass);
    }
  }

  snapshotPose() {
    this.pose.length = 0;
    this.modelGroup.traverse(object => {
      if (object === this.modelGroup) return;
      this.pose.push({
        object,
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
        visible: object.visible,
      });
    });
  }

  restorePose() {
    for (const entry of this.pose) {
      entry.object.position.copy(entry.position);
      entry.object.rotation.copy(entry.rotation);
      entry.object.scale.copy(entry.scale);
      entry.object.visible = entry.visible;
    }
    this.modelGroup.position.set(0, 0, 0);
    this.modelGroup.rotation.set(0, 0, 0);
    this.modelGroup.scale.set(1, 1, 1);
    setOpacity(this.modelGroup, 1);
  }

  captureBaseBounds() {
    this.modelGroup.updateMatrixWorld(true);
    const inverseRoot = this.modelGroup.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    let found = false;

    this.modelGroup.traverse(object => {
      if (!object.visible || !object.geometry) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (!object.geometry.boundingBox) return;
      const box = object.geometry.boundingBox.clone();
      const toModel = inverseRoot.clone().multiply(object.matrixWorld);
      box.applyMatrix4(toModel);
      bounds.union(box);
      found = true;
    });

    this.baseBounds = found ? bounds : new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1),
    );
  }

  projectedBaseSize() {
    if (!this.baseBounds || this.baseBounds.isEmpty()) return { width: 1, height: 1 };
    this.root.updateMatrixWorld(true);
    const { min, max } = this.baseBounds;
    const corners = [
      [min.x, min.y, min.z], [min.x, min.y, max.z],
      [min.x, max.y, min.z], [min.x, max.y, max.z],
      [max.x, min.y, min.z], [max.x, min.y, max.z],
      [max.x, max.y, min.z], [max.x, max.y, max.z],
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      const point = new THREE.Vector3(...corner).applyMatrix4(this.root.matrixWorld).project(this.camera);
      const x = (point.x * 0.5 + 0.5) * this.width;
      const y = (-point.y * 0.5 + 0.5) * this.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return {
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  rebuild() {
    this.disposeGenerated();
    this.root = new THREE.Group();
    this.modelGroup = this.buildModel();
    this.root.add(this.modelGroup);
    this.world.add(this.root);
    this.snapshotPose();
    this.captureBaseBounds();
    this.updatePlacement();
  }

  updatePlacement() {
    const enemy = ENEMY_CLASSES[this.enemyClass] || ENEMY_CLASSES.boss;
    const px = Number(this.labSettings.screenX ?? 240);
    const py = Number(this.labSettings.screenY ?? enemy.screenY);
    const planeY = Number(this.labSettings.combatY ?? 7.5);
    const worldPoint = this.screenToWorld(px, py, planeY);
    this.root.position.copy(worldPoint);
    this.root.scale.setScalar(1);
    const projected = this.projectedBaseSize();
    const widthFit = Number(enemy.targetWidth || 80) / projected.width;
    const heightFit = Number(enemy.targetHeight || 100) / projected.height;
    const fitScale = Math.min(widthFit, heightFit);
    const userScale = Number(this.labSettings.modelScale ?? 1);
    this.root.scale.setScalar(fitScale * userScale);
  }

  setStage(stageId, stageSettings) {
    this.stageId = Number(stageId) || 1;
    this.profile = STAGE_DEFINITIONS[this.stageId] || STAGE_DEFINITIONS[1];
    this.stageSettings = cloneSettings(stageSettings);
    this.renderer.toneMappingExposure = Math.max(1.12, this.stageSettings.exposure + 0.06);
    this.rim.color.set(this.profile.palette.accent);
    this.warm.color.set(this.profile.palette.warm);
    this.updateCamera();
    this.rebuild();
    this.playAction(this.action);
  }

  setEnemyClass(enemyClass) {
    if (!ENEMY_CLASSES[enemyClass]) return;
    this.enemyClass = enemyClass;
    this.labSettings.enemyClass = enemyClass;
    this.labSettings.screenY = ENEMY_CLASSES[enemyClass].screenY;
    this.rebuild();
    this.playAction(this.action);
  }

  setLabSettings(settings) {
    this.labSettings = { ...this.labSettings, ...settings };
    this.loop = Boolean(this.labSettings.loop);
    this.updatePlacement();
  }

  durationFor(action) {
    if (action === 'entrance') {
      if (this.enemyClass === 'boss') return [0, 4.6, 4.5, 4.8, 4.7, 5][this.stageId];
      if (this.enemyClass === 'midboss') return 2.4;
      if (this.enemyClass === 'elite') return 2;
      return 1.55;
    }
    return { idle: 3.2, attack: 3.1, hit: 0.75, phase: 2.25, death: 2.1 }[action] || 3;
  }

  playAction(action) {
    this.action = action;
    this.labSettings.action = action;
    this.actionElapsed = 0;
    this.actionDuration = this.durationFor(action);
    this.firedMarkers.clear();
    this.shotQueue.length = 0;
    this.restorePose();
  }

  queueAttack(pattern = null) {
    this.shotQueue.push({
      stageId: this.stageId,
      enemyClass: this.enemyClass,
      pattern: pattern || this.attackPattern(),
      muzzles: this.getMuzzleScreenPositions(),
      color: this.modelData.projectileColor || this.profile.palette.accent,
      warm: this.modelData.projectileWarm || this.profile.palette.warm,
    });
  }

  attackPattern() {
    if (this.enemyClass === 'scout') return 'aimed-single';
    if (this.enemyClass === 'striker') return 'three-way';
    if (this.enemyClass === 'gunship') return 'twin-aimed';
    if (this.enemyClass === 'elite') return 'radial-eight';
    if (this.stageId === 1) return 'manta-fan';
    if (this.stageId === 2) return 'carrier-turrets';
    if (this.stageId === 3) return 'seraph-mirror';
    if (this.stageId === 4) return 'leviathan-orbits';
    return 'raijin-gates';
  }

  consumeShots() {
    return this.shotQueue.splice(0);
  }

  getMuzzleScreenPositions() {
    return this.modelData.muzzles.map(muzzle => this.projectWorld(muzzle)).filter(point => point.visible);
  }

  applyIdle(time) {
    const pulse = Math.sin(time * 2.6);
    this.modelGroup.position.y = Math.sin(time * 1.35) * 0.16;
    this.modelGroup.rotation.y = Math.sin(time * 0.58) * 0.07;
    this.modelGroup.rotation.z = Math.sin(time * 0.82) * 0.035;
    if (this.stageId === 1) {
      this.modelData.wings.forEach((wing, index) => { wing.rotation.z += (index % 2 ? -1 : 1) * pulse * 0.09; });
    } else if (this.stageId === 2) {
      this.modelData.turrets.forEach((turret, index) => { turret.rotation.y += Math.sin(time * 0.9 + index) * 0.08; });
    } else if (this.stageId === 3) {
      this.modelData.wings.forEach((wing, index) => { wing.rotation.y += time * (index % 2 ? -0.18 : 0.18); });
      this.modelData.rings.forEach(ring => { ring.rotation.z += time * 0.45; });
    } else if (this.stageId === 4) {
      this.modelData.rings.forEach((ring, index) => { ring.rotation.z += time * (index % 2 ? -0.55 : 0.55); });
      this.modelData.floatingParts.forEach((part, index) => { part.position.y += Math.sin(time * 1.2 + index) * 0.12; });
    } else {
      this.modelData.rings.forEach(ring => { ring.rotation.z += time * 0.7; });
      this.modelData.floatingParts.forEach((part, index) => {
        part.position.y += Math.sin(time * 1.6 + index * .8) * 0.18;
        part.rotation.y += time * (index % 2 ? -.22 : .22);
      });
    }
    if (this.modelData.core) {
      const s = 1 + pulse * 0.08;
      this.modelData.core.scale.multiplyScalar(s);
    }
  }

  applyGenericEntrance(t) {
    const eased = easeOutCubic(t);
    if (this.stageId === 1) {
      this.modelGroup.position.z = lerp(-14, 0, eased);
      this.modelGroup.position.y = Math.sin(t * Math.PI) * 2.2 - (1 - eased) * 2.5;
      this.modelGroup.rotation.z = (1 - eased) * -0.55;
    } else if (this.stageId === 2) {
      this.modelGroup.scale.set(lerp(.2, 1, eased), lerp(.5, 1, eased), lerp(.2, 1, eased));
      this.modelGroup.rotation.y = (1 - eased) * Math.PI;
    } else if (this.stageId === 3) {
      this.modelGroup.scale.setScalar(elasticOut(t));
      this.modelGroup.rotation.y = (1 - eased) * TAU;
    } else if (this.stageId === 4) {
      this.modelGroup.position.z = lerp(-22, 0, eased);
      this.modelGroup.scale.setScalar(lerp(.25, 1, eased));
      this.modelGroup.rotation.x = (1 - eased) * -0.7;
    } else {
      const steps = 7;
      const stepped = Math.floor(eased * steps) / steps;
      this.modelGroup.position.x = (1 - eased) * Math.sin(stepped * 41) * 3.2;
      this.modelGroup.position.z = lerp(-16, 0, stepped);
      this.modelGroup.scale.setScalar(lerp(.35, 1, eased));
      setOpacity(this.modelGroup, t < .65 ? (Math.sin(t * 60) > -0.1 ? .9 : .16) : 1);
    }
  }

  applyBossEntrance(t, time) {
    if (this.stageId === 1) {
      const breach = smoothstep(clamp((t - .24) / .42, 0, 1));
      const settle = smoothstep(clamp((t - .66) / .34, 0, 1));
      this.modelGroup.position.z = lerp(-18, 0, breach);
      this.modelGroup.position.y = t < .62 ? lerp(-5.5, 3.8, easeOutCubic(clamp((t - .18) / .44, 0, 1))) : lerp(3.8, 0, settle);
      this.modelGroup.rotation.x = lerp(-1.05, 0, breach);
      this.modelGroup.rotation.z = Math.sin(t * Math.PI) * -.3 * (1 - settle);
      this.modelGroup.scale.setScalar(lerp(.62, 1, breach));
      const ring = this.modelData.effectRing;
      if (ring) {
        ring.visible = t > .18 && t < .82;
        ring.position.y = lerp(4.8, -0.6, breach);
        ring.scale.setScalar(lerp(.2, 2.2, breach));
        ring.material.opacity = (1 - clamp((t - .55) / .27, 0, 1)) * .8;
      }
      this.modelData.effectParticles.forEach((particle, index) => {
        const local = clamp((t - .34 - index * .012) / .38, 0, 1);
        particle.visible = local > 0 && local < 1;
        const angle = index / this.modelData.effectParticles.length * TAU;
        particle.position.set(Math.cos(angle) * local * 5.5, 2.2 + Math.sin(local * Math.PI) * 4.2, Math.sin(angle) * local * 3.2);
        particle.rotation.x = time * 2 + index;
      });
    } else if (this.stageId === 2) {
      this.modelGroup.position.y = Math.sin(t * Math.PI) * .4;
      const parts = this.modelData.assemblyParts;
      parts.forEach((part, index) => {
        const local = smoothstep(clamp((t - .08 - index * .028) / .5, 0, 1));
        const side = index % 2 ? 1 : -1;
        part.position.x += side * (1 - local) * (6 + (index % 4) * 1.2);
        part.position.y += (1 - local) * (index % 3) * 1.7;
        part.rotation.y += (1 - local) * side * 1.2;
        part.scale.multiplyScalar(Math.max(.08, local));
      });
      for (const gantry of [this.modelData.effectGateLeft, this.modelData.effectGateRight]) {
        if (!gantry) continue;
        gantry.visible = t < .76;
        gantry.position.x += (gantry === this.modelData.effectGateLeft ? -1 : 1) * lerp(4.5, .3, smoothstep(clamp(t / .48, 0, 1)));
      }
      this.modelData.effectParticles.forEach((spark, index) => {
        const cycle = (t * 3 + index * .071) % 1;
        spark.visible = t > .25 && t < .73;
        spark.position.set((index % 2 ? 1 : -1) * (1.2 + (index % 4) * .6), 1 + cycle * 3, (index % 5 - 2) * .7);
        spark.scale.setScalar(1 - cycle);
      });
      if (t > .72) this.modelGroup.position.y = Math.sin((t - .72) / .28 * Math.PI) * 1.1;
    } else if (this.stageId === 3) {
      setOpacity(this.modelGroup, clamp((t - .18) / .38, 0, 1));
      const parts = this.modelData.assemblyParts;
      parts.forEach((part, index) => {
        const local = elasticOut(clamp((t - .08 - index * .018) / .63, 0, 1));
        const angle = index * 2.399;
        part.position.x += Math.cos(angle) * (1 - local) * (7 + index * .18);
        part.position.y += Math.sin(angle * 1.7) * (1 - local) * 4.8;
        part.position.z += Math.sin(angle) * (1 - local) * 6.5;
        part.rotation.y += (1 - local) * 4.5;
        part.scale.multiplyScalar(Math.max(.04, local));
      });
      const halo = this.modelData.effectRing;
      if (halo) {
        halo.visible = t > .12 && t < .92;
        halo.scale.setScalar(lerp(2.8, .95, smoothstep(clamp((t - .12) / .7, 0, 1))));
        halo.rotation.z = time * 1.7;
        halo.material.opacity = t < .75 ? .75 : (1 - t) * 3;
      }
      this.modelData.effectParticles.forEach((shard, index) => {
        const local = smoothstep(clamp((t - index * .012) / .72, 0, 1));
        shard.visible = local < .98;
        const angle = index / this.modelData.effectParticles.length * TAU + time * .4;
        shard.position.set(Math.cos(angle) * lerp(8, 2, local), Math.sin(angle * 2) * 3 * (1 - local), Math.sin(angle) * lerp(7, 1, local));
      });
      if (t > .82) this.modelGroup.scale.multiplyScalar(1 + Math.sin((t - .82) / .18 * Math.PI) * .13);
    } else if (this.stageId === 4) {
      const emerge = easeInOutCubic(clamp((t - .12) / .68, 0, 1));
      this.modelGroup.position.z = lerp(-38, 0, emerge);
      this.modelGroup.position.y = lerp(7, 0, emerge);
      this.modelGroup.scale.setScalar(lerp(.18, 1, emerge));
      this.modelGroup.rotation.x = lerp(-1.2, 0, emerge);
      if (this.modelData.effectRing2) {
        this.modelData.effectRing2.visible = t < .86;
        this.modelData.effectRing2.scale.setScalar(lerp(3.8, 1.25, emerge));
        this.modelData.effectRing2.material.opacity = t < .5 ? .5 : (1 - t) * 1.1;
      }
      if (this.modelData.effectRing) {
        this.modelData.effectRing.visible = t > .08 && t < .94;
        this.modelData.effectRing.scale.setScalar(lerp(3.5, 1, emerge));
        this.modelData.effectRing.rotation.z = time * 1.2;
      }
      if (t > .78) this.modelGroup.position.y += Math.sin((t - .78) / .22 * Math.PI) * 1.5;
    } else {
      const gates = [this.modelData.effectGateLeft, this.modelData.effectGateRight];
      gates.forEach((gate, index) => {
        if (!gate) return;
        gate.visible = t > .04 && t < .9;
        const open = smoothstep(clamp((t - .04) / .28, 0, 1));
        gate.scale.setScalar(lerp(.15, 1.25, open));
        gate.rotation.z = time * (index ? -.8 : .8);
        gate.material.opacity = t < .72 ? .85 : (1 - t) * 3;
      });
      const parts = this.modelData.assemblyParts;
      parts.forEach((part, index) => {
        const local = smoothstep(clamp((t - .18 - index * .02) / .56, 0, 1));
        const side = index % 2 ? 1 : -1;
        part.position.x += side * (1 - local) * (8 + index * .2);
        part.position.z += (1 - local) * ((index % 3) - 1) * 7;
        part.position.y += (1 - local) * Math.sin(index * 2.1) * 4;
        part.rotation.y += (1 - local) * side * 3.4;
        part.scale.multiplyScalar(Math.max(.02, local));
        part.visible = local > .02 && (local > .65 || Math.sin(time * 30 + index) > -.2);
      });
      if (this.modelData.crown) {
        const crownT = elasticOut(clamp((t - .62) / .25, 0, 1));
        this.modelData.crown.position.y += (1 - crownT) * 7;
      }
      this.modelData.effectParticles.forEach((bolt, index) => {
        const local = clamp((t - .68 - index * .006) / .2, 0, 1);
        bolt.visible = local > 0 && local < 1;
        const angle = index / this.modelData.effectParticles.length * TAU;
        bolt.position.set(Math.cos(angle) * 4.5 * (1 - local), 2 + Math.sin(angle * 3) * 2, Math.sin(angle) * 4.5 * (1 - local));
        bolt.rotation.y = angle;
        bolt.scale.z = 1 + (1 - local) * 4;
      });
      if (t > .82) this.modelGroup.scale.multiplyScalar(1 + Math.sin((t - .82) / .18 * Math.PI) * .18);
    }
  }

  applyAttack(t, time) {
    this.applyIdle(time);
    const recoil = Math.sin(clamp((t - .22) / .16, 0, 1) * Math.PI);
    this.modelGroup.position.z -= recoil * .65;
    this.modelData.wings.forEach((wing, index) => { wing.rotation.z += (index % 2 ? -1 : 1) * Math.sin(t * Math.PI) * .18; });
    this.modelData.turrets.forEach((turret, index) => { turret.rotation.y += Math.sin(t * TAU + index) * .12; });
    this.modelData.rings.forEach((ring, index) => { ring.rotation.z += time * (index % 2 ? -1.4 : 1.4); });
    const fireTimes = this.enemyClass === 'boss' || this.enemyClass === 'midboss' ? [.28, .46, .64] : this.enemyClass === 'elite' ? [.32, .58] : [.42];
    fireTimes.forEach((fireTime, index) => {
      const key = `${index}`;
      if (t >= fireTime && !this.firedMarkers.has(key)) {
        this.firedMarkers.add(key);
        this.queueAttack();
      }
    });
  }

  applyHit(t) {
    const shake = (1 - t) * Math.sin(t * 50);
    this.modelGroup.position.x = shake * .65;
    this.modelGroup.rotation.z = shake * .08;
    setOpacity(this.modelGroup, .78 + Math.abs(Math.sin(t * 26)) * .22);
    if (this.modelData.core) this.modelData.core.scale.multiplyScalar(1 + (1 - t) * .32);
  }

  applyPhase(t, time) {
    this.applyIdle(time);
    const open = smoothstep(t);
    this.modelData.wings.forEach((wing, index) => {
      wing.position.x *= 1 + open * .22;
      wing.rotation.z += (index % 2 ? -1 : 1) * open * .32;
    });
    this.modelData.rings.forEach((ring, index) => {
      ring.scale.multiplyScalar(1 + Math.sin(t * Math.PI) * .45);
      ring.rotation.z += time * (index % 2 ? -1.8 : 1.8);
    });
    this.modelData.floatingParts.forEach((part, index) => {
      const angle = index / Math.max(1, this.modelData.floatingParts.length) * TAU + time;
      part.position.x += Math.cos(angle) * open * .8;
      part.position.z += Math.sin(angle) * open * .8;
    });
    if (this.modelData.core) this.modelData.core.scale.multiplyScalar(1 + Math.sin(t * Math.PI) * .65);
  }

  applyDeath(t, time) {
    const split = easeInOutCubic(t);
    this.pose.forEach((entry, index) => {
      const object = entry.object;
      if (!object.isMesh && !object.isLineSegments && !object.isGroup) return;
      const angle = index * 2.399;
      object.position.x += Math.cos(angle) * split * (1.5 + index * .04);
      object.position.y += Math.sin(angle * 1.7) * split * 2.4;
      object.position.z += Math.sin(angle) * split * (1.8 + index * .035);
      object.rotation.x += split * (index % 2 ? -2.2 : 2.2);
      object.rotation.z += split * (index % 3 - 1) * 2;
    });
    this.modelGroup.scale.multiplyScalar(1 + Math.sin(t * Math.PI) * .28);
    setOpacity(this.modelGroup, 1 - smoothstep(clamp((t - .45) / .55, 0, 1)));
    if (this.modelData.core) {
      this.modelData.core.visible = true;
      this.modelData.core.scale.multiplyScalar(1 + t * 3.5);
      this.modelData.core.rotation.y = time * 6;
    }
  }

  update(deltaSeconds, totalTime) {
    const speed = Number(this.labSettings.playbackSpeed ?? 1);
    this.actionElapsed += deltaSeconds * speed;
    let t = clamp(this.actionElapsed / this.actionDuration, 0, 1);
    this.restorePose();
    this.updatePlacement();

    if (this.action === 'idle') this.applyIdle(totalTime * speed);
    else if (this.action === 'entrance') {
      if (this.enemyClass === 'boss') this.applyBossEntrance(t, totalTime * speed);
      else this.applyGenericEntrance(t);
    } else if (this.action === 'attack') this.applyAttack(t, totalTime * speed);
    else if (this.action === 'hit') this.applyHit(t);
    else if (this.action === 'phase') this.applyPhase(t, totalTime * speed);
    else if (this.action === 'death') this.applyDeath(t, totalTime * speed);

    if (this.actionElapsed >= this.actionDuration) {
      if (this.loop) {
        this.actionElapsed = 0;
        this.firedMarkers.clear();
      } else {
        this.actionElapsed = this.actionDuration;
        t = 1;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  getActionProgress() {
    return clamp(this.actionElapsed / this.actionDuration, 0, 1);
  }

  getRootScreenPosition() {
    return this.projectWorld(this.root);
  }

  getStats() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      materials: this.materials.length,
    };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updatePlacement();
  }

  dispose() {
    this.disposeGenerated();
    this.renderer.dispose();
  }
}

export const bossInfoForStage = stageId => BOSS_INFO[stageId] || BOSS_INFO[1];
