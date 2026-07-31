import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js';
import { STAGE_DEFINITIONS, STAGE_GEOMETRY_SETTINGS } from './stage1-geometry-settings.js';
import { ENEMY_CLASSES, ENEMY_LAB_DEFAULTS } from './enemy-geometry-settings.js';
import { EnemyGeometryLayer } from './enemy-model-factory.js';

const BOSS_STAGE = Object.freeze({ manta: 1, carrier: 2, seraph: 3, leviathan: 4, raijin: 5 });
const SMALL_TYPES = new Set(['scout', 'striker', 'gunship', 'elite']);
const LARGE_TYPES = new Set(['midboss', 'boss']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ANIM = EnemyGeometryLayer.prototype;

function objectPath(root, target) {
  if (root === target) return [];
  const path = [];
  let current = target;
  while (current && current !== root) {
    const parent = current.parent;
    if (!parent) return null;
    path.unshift(parent.children.indexOf(current));
    current = parent;
  }
  return current === root ? path : null;
}

function resolvePath(root, path) {
  let current = root;
  for (const index of path || []) {
    current = current?.children?.[index];
    if (!current) return null;
  }
  return current;
}

function cloneFactoryModel(factory) {
  const source = factory.modelGroup;
  const clone = source.clone(true);
  const originals = [];
  const copies = [];
  source.traverse(object => originals.push(object));
  clone.traverse(object => copies.push(object));
  const objectMap = new Map();
  const resources = { geometries: new Set(), materials: new Set() };

  originals.forEach((original, index) => {
    const copy = copies[index];
    objectMap.set(original, copy);
    if (original.geometry) {
      copy.geometry = original.geometry.clone();
      resources.geometries.add(copy.geometry);
    }
    if (original.material) {
      if (Array.isArray(original.material)) {
        copy.material = original.material.map(material => {
          const next = material.clone();
          next.userData = { ...material.userData };
          resources.materials.add(next);
          return next;
        });
      } else {
        copy.material = original.material.clone();
        copy.material.userData = { ...original.material.userData };
        resources.materials.add(copy.material);
      }
    }
  });

  const dataPaths = {};
  for (const [key, value] of Object.entries(factory.modelData || {})) {
    if (Array.isArray(value)) dataPaths[key] = { kind: 'array', paths: value.map(object => objectPath(source, object)).filter(Boolean) };
    else if (value?.isObject3D) dataPaths[key] = { kind: 'object', path: objectPath(source, value) };
    else dataPaths[key] = { kind: 'value', value };
  }

  const pose = [];
  clone.traverse(object => {
    if (object === clone) return;
    pose.push({
      path: objectPath(clone, object),
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      visible: object.visible,
    });
  });

  const bounds = new THREE.Box3().setFromObject(clone);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    root: clone,
    dataPaths,
    pose,
    resources,
    rawWidth: Math.max(0.001, size.x),
    rawDepth: Math.max(0.001, size.z),
    fitWorldScale: factory.root?.scale?.x || 1,
    referenceY: ENEMY_CLASSES[factory.enemyClass]?.screenY || 300,
  };
}

function clonePrototype(prototype, uniqueMaterials = false) {
  const modelGroup = prototype.root.clone(true);
  const sourceObjects = [];
  const clonedObjects = [];
  prototype.root.traverse(object => sourceObjects.push(object));
  modelGroup.traverse(object => clonedObjects.push(object));
  const cloneMap = new Map();
  const ownedMaterials = [];
  sourceObjects.forEach((source, index) => {
    const copy = clonedObjects[index];
    cloneMap.set(source, copy);
    if (uniqueMaterials && copy.material) {
      if (Array.isArray(copy.material)) {
        copy.material = copy.material.map(material => {
          const next = material.clone();
          next.userData = { ...material.userData };
          ownedMaterials.push(next);
          return next;
        });
      } else {
        copy.material = copy.material.clone();
        copy.material.userData = { ...source.material.userData };
        ownedMaterials.push(copy.material);
      }
    }
  });

  const modelData = {};
  for (const [key, descriptor] of Object.entries(prototype.dataPaths)) {
    if (descriptor.kind === 'array') modelData[key] = descriptor.paths.map(path => resolvePath(modelGroup, path)).filter(Boolean);
    else if (descriptor.kind === 'object') modelData[key] = resolvePath(modelGroup, descriptor.path);
    else modelData[key] = descriptor.value;
  }

  const pose = prototype.pose.map(entry => ({
    object: resolvePath(modelGroup, entry.path),
    position: entry.position.clone(),
    rotation: entry.rotation.clone(),
    scale: entry.scale.clone(),
    visible: entry.visible,
  })).filter(entry => entry.object);

  const root = new THREE.Group();
  root.add(modelGroup);
  return { root, modelGroup, modelData, pose, ownedMaterials };
}

export class EnemyVisualLayer {
  constructor({ camera, width = 480, height = 800, stageId = 1, settings }) {
    if (!camera) throw new Error('EnemyVisualLayer requires the shared stage camera.');
    this.camera = camera;
    this.width = width;
    this.height = height;
    this.stageId = Number(stageId) || 1;
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2((STAGE_DEFINITIONS[this.stageId] || STAGE_DEFINITIONS[1]).palette.fog, settings?.fog || 0.012);
    this.instances = new Map();
    this.prototypes = new Map();
    this.lastTimeSeconds = 0;
    this.currentFactoryStage = null;

    this.hemi = new THREE.HemisphereLight(0xdafcff, 0x03040a, 1.5);
    this.key = new THREE.DirectionalLight(0xffffff, 3.2);
    this.key.position.set(-12, 28, 22);
    this.rim = new THREE.PointLight(0x55e8ff, 36, 90, 2);
    this.rim.position.set(12, 16, -10);
    this.warm = new THREE.PointLight(0xffc65a, 24, 80, 2);
    this.warm.position.set(-12, 9, 10);
    this.scene.add(this.hemi, this.key, this.rim, this.warm);
    this.applyLighting();

    const factoryCanvas = document.createElement('canvas');
    factoryCanvas.width = width;
    factoryCanvas.height = height;
    this.factory = new EnemyGeometryLayer({
      canvas: factoryCanvas,
      width,
      height,
      stageId: this.stageId,
      stageSettings: settings,
      labSettings: { ...ENEMY_LAB_DEFAULTS, stageId: this.stageId, enemyClass: 'scout', action: 'idle' },
    });
    this.ensureStagePrototypes(this.stageId, settings);
  }

  applyLighting() {
    const profile = STAGE_DEFINITIONS[this.stageId] || STAGE_DEFINITIONS[1];
    const accent = new THREE.Color(profile.palette.accent);
    const warm = new THREE.Color(profile.palette.warm);
    this.hemi.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.35);
    this.hemi.groundColor.setHex(profile.kind === 'solar-citadel' ? 0x160300 : 0x020611);
    this.key.color.copy(warm).lerp(new THREE.Color(0xffffff), 0.52);
    this.rim.color.copy(accent);
    this.warm.color.copy(warm);
    this.rim.intensity = profile.kind === 'void-throne' ? 42 : 36;
    this.warm.intensity = profile.kind === 'solar-citadel' ? 34 : 24;
  }

  prototypeKey(stageId, type) {
    return `${stageId}:${type}`;
  }

  ensureStagePrototypes(stageId, settings) {
    const missing = Object.keys(ENEMY_CLASSES).some(type => !this.prototypes.has(this.prototypeKey(stageId, type)));
    if (!missing) return;
    if (this.currentFactoryStage !== stageId) {
      this.factory.setStage(stageId, settings || STAGE_GEOMETRY_SETTINGS[stageId]);
      this.currentFactoryStage = stageId;
    }
    for (const type of Object.keys(ENEMY_CLASSES)) {
      const key = this.prototypeKey(stageId, type);
      if (this.prototypes.has(key)) continue;
      this.factory.setEnemyClass(type);
      this.prototypes.set(key, cloneFactoryModel(this.factory));
    }
  }

  setStage(stageId, settings) {
    this.stageId = Number(stageId) || 1;
    this.settings = settings || STAGE_GEOMETRY_SETTINGS[this.stageId];
    const profile = STAGE_DEFINITIONS[this.stageId] || STAGE_DEFINITIONS[1];
    this.scene.fog.color.setHex(profile.palette.fog);
    this.scene.fog.density = this.settings?.fog || 0.012;
    this.applyLighting();
    this.clearInstances();
    this.ensureStagePrototypes(this.stageId, this.settings);
  }

  stageForEnemy(enemy) {
    if (enemy.type === 'boss') return BOSS_STAGE[enemy.bossId] || this.stageId;
    return clamp(Number(enemy.stageId) || this.stageId, 1, 5);
  }

  createInstance(enemy) {
    const stageId = this.stageForEnemy(enemy);
    const type = ENEMY_CLASSES[enemy.type] ? enemy.type : 'scout';
    this.ensureStagePrototypes(stageId, STAGE_GEOMETRY_SETTINGS[stageId]);
    const prototype = this.prototypes.get(this.prototypeKey(stageId, type));
    const uniqueMaterials = LARGE_TYPES.has(type);
    const clone = clonePrototype(prototype, uniqueMaterials);
    const instance = {
      id: enemy.id,
      applyIdle: ANIM.applyIdle,
      stageId,
      type,
      prototype,
      ...clone,
      lastEnemy: { ...enemy },
      lastPhase: enemy.phase || 0,
      phaseElapsed: 99,
      dying: false,
      deathElapsed: 0,
    };
    instance.root.userData.enemyId = enemy.id;
    this.scene.add(instance.root);
    this.instances.set(enemy.id, instance);
    return instance;
  }

  restorePose(instance) {
    ANIM.restorePose.call(instance);
  }

  screenToWorld(px, py, planeY = 7.5) {
    const ndc = new THREE.Vector3((px / this.width) * 2 - 1, 1 - (py / this.height) * 2, 0.2);
    ndc.unproject(this.camera);
    const direction = ndc.sub(this.camera.position).normalize();
    if (Math.abs(direction.y) < 1e-5) return new THREE.Vector3(0, planeY, -20);
    const distance = (planeY - this.camera.position.y) / direction.y;
    return this.camera.position.clone().add(direction.multiplyScalar(distance));
  }

  unitsPerPixel(px, py, planeY = 7.5) {
    const a = this.screenToWorld(px, py, planeY);
    const b = this.screenToWorld(px + 1, py, planeY);
    return Math.max(0.00001, a.distanceTo(b));
  }

  placeInstance(instance, enemy) {
    const classInfo = ENEMY_CLASSES[instance.type] || ENEMY_CLASSES.scout;
    const planeY = 7.5;
    instance.root.position.copy(this.screenToWorld(enemy.x, enemy.y, planeY));
    const currentUnits = this.unitsPerPixel(enemy.x, enemy.y, planeY);
    const referenceUnits = this.unitsPerPixel(this.width / 2, instance.prototype.referenceY, planeY);
    const radiusScale = Number(enemy.radius || classInfo.radius) / Math.max(1, classInfo.radius);
    const scale = instance.prototype.fitWorldScale * (currentUnits / referenceUnits) * radiusScale;
    instance.root.scale.setScalar(scale);
  }

  applyFirePulse(instance, enemy) {
    const frames = Math.max(0, Number(enemy.visualFirePulse) || 0);
    if (!frames) return;
    const t = 1 - clamp(frames / 10, 0, 1);
    const recoil = Math.sin(t * Math.PI);
    instance.modelGroup.position.z -= recoil * 0.58;
    instance.modelData.turrets?.forEach((turret, index) => {
      turret.rotation.y += Math.sin(t * Math.PI + index * 0.4) * 0.14;
    });
    if (instance.modelData.core) instance.modelData.core.scale.multiplyScalar(1 + recoil * 0.34);
  }

  updateAlive(instance, enemy, timeSeconds, deltaSeconds) {
    this.restorePose(instance);
    this.placeInstance(instance, enemy);
    instance.lastEnemy = { ...enemy };

    if ((enemy.phase || 0) !== instance.lastPhase) {
      instance.lastPhase = enemy.phase || 0;
      instance.phaseElapsed = 0;
    } else instance.phaseElapsed += deltaSeconds;

    if (instance.type === 'boss' && enemy.arriving) {
      const t = clamp((enemy.y + 85) / 203, 0, 1);
      ANIM.applyBossEntrance.call(instance, t, timeSeconds);
    } else if (instance.type === 'midboss' && !enemy.orbiting) {
      const t = clamp((enemy.y + 110) / 255, 0, 1);
      ANIM.applyGenericEntrance.call(instance, t);
    } else if (instance.phaseElapsed < 0.72 && LARGE_TYPES.has(instance.type)) {
      ANIM.applyPhase.call(instance, clamp(instance.phaseElapsed / 0.72, 0, 1), timeSeconds);
    } else {
      ANIM.applyIdle.call(instance, timeSeconds + enemy.id * 0.037);
      this.applyFirePulse(instance, enemy);
    }

    if ((enemy.hitFlash || 0) > 0) {
      const strength = clamp(enemy.hitFlash / 8, 0, 1);
      instance.modelGroup.position.x += Math.sin(timeSeconds * 75 + enemy.id) * 0.35 * strength;
      instance.modelGroup.rotation.z += Math.sin(timeSeconds * 59 + enemy.id) * 0.045 * strength;
    }
  }

  updateDying(instance, deltaSeconds, timeSeconds) {
    instance.deathElapsed += deltaSeconds;
    this.restorePose(instance);
    const duration = instance.type === 'boss' ? 1.3 : 0.9;
    ANIM.applyDeath.call(instance, clamp(instance.deathElapsed / duration, 0, 1), timeSeconds);
    return instance.deathElapsed >= duration;
  }

  sync(enemies, timeSeconds, { allowDeathAnimations = true } = {}) {
    const deltaSeconds = this.lastTimeSeconds ? clamp(timeSeconds - this.lastTimeSeconds, 0, 0.05) : 1 / 60;
    this.lastTimeSeconds = timeSeconds;
    const active = new Set();

    for (const enemy of enemies) {
      if (!enemy?.alive) continue;
      active.add(enemy.id);
      let instance = this.instances.get(enemy.id);
      const stageId = this.stageForEnemy(enemy);
      if (!instance || instance.type !== enemy.type || instance.stageId !== stageId) {
        if (instance) this.removeInstance(instance);
        instance = this.createInstance(enemy);
      }
      instance.dying = false;
      this.updateAlive(instance, enemy, timeSeconds, deltaSeconds);
    }

    for (const instance of [...this.instances.values()]) {
      if (active.has(instance.id)) continue;
      if (allowDeathAnimations && LARGE_TYPES.has(instance.type)) {
        if (!instance.dying) {
          instance.dying = true;
          instance.deathElapsed = 0;
        }
        if (this.updateDying(instance, deltaSeconds, timeSeconds)) this.removeInstance(instance);
      } else this.removeInstance(instance);
    }
  }

  removeInstance(instance) {
    this.scene.remove(instance.root);
    for (const material of instance.ownedMaterials || []) material.dispose();
    this.instances.delete(instance.id);
  }

  clearInstances() {
    for (const instance of [...this.instances.values()]) this.removeInstance(instance);
  }

  dispose() {
    this.clearInstances();
    for (const prototype of this.prototypes.values()) {
      for (const geometry of prototype.resources.geometries) geometry.dispose();
      for (const material of prototype.resources.materials) material.dispose();
    }
    this.prototypes.clear();
    this.factory?.dispose();
  }
}
