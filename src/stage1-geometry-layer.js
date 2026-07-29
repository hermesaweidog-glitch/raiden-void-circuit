import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js';

const LAYERS = ['far', 'mid', 'near', 'closest'];
const BANDS = {
  far: { nearZ: -44, farZ: -96, color: 0x315f72, emissive: 0x123d4c, phase: 0.2 },
  mid: { nearZ: -24, farZ: -58, color: 0x275f73, emissive: 0x0d5265, phase: 1.1 },
  near: { nearZ: -8, farZ: -32, color: 0x1f697e, emissive: 0x08677b, phase: 2.0 },
  closest: { nearZ: 8, farZ: -14, color: 0x1c7487, emissive: 0x08778d, phase: 2.9 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class Stage1GeometryLayer {
  constructor({ canvas, width = 480, height = 800, settings }) {
    if (!canvas) throw new Error('Stage1GeometryLayer requires a canvas.');
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.settings = clone(settings);
    this.cityGroups = {};
    this.edgeLines = [];
    this.materials = [];
    this.geometries = [];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMappingExposure = this.settings.exposure;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x03101d, this.settings.fog);

    this.camera = new THREE.PerspectiveCamera(
      this.settings.camera.fov,
      width / height,
      0.1,
      260,
    );

    this.world = new THREE.Group();
    this.scene.add(this.world);

    const hemi = new THREE.HemisphereLight(0x75dfff, 0x020611, 1.25);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xdafcff, 2.15);
    key.position.set(-16, 30, 18);
    this.scene.add(key);
    const leftRim = new THREE.PointLight(0x34e7ff, 26, 90, 2);
    leftRim.position.set(-12, 12, -14);
    this.scene.add(leftRim);
    const rightRim = new THREE.PointLight(0x4c8cff, 24, 90, 2);
    rightRim.position.set(12, 12, -24);
    this.scene.add(rightRim);

    this.rebuild();
    this.updateCamera();
  }

  setSettings(settings, { rebuild = false } = {}) {
    this.settings = clone(settings);
    this.scene.fog.density = this.settings.fog;
    this.renderer.toneMappingExposure = this.settings.exposure;
    this.updateCamera();
    if (rebuild) this.rebuild();
    this.setEdgesVisible(this.settings.showEdges);
  }

  updateCamera() {
    const config = this.settings.camera;
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

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
    this.cityGroups = {};
  }

  makeMaterial(layer, rng) {
    const band = BANDS[layer];
    const color = new THREE.Color(band.color).offsetHSL(0, 0, rng() * 0.07 - 0.025);
    return this.trackMaterial(new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(band.emissive),
      emissiveIntensity: 0.28 + (layer === 'closest' ? 0.18 : 0),
      metalness: 0.74,
      roughness: 0.36,
      transparent: this.settings[layer].alpha < 0.995,
      opacity: this.settings[layer].alpha,
      depthWrite: this.settings[layer].alpha > 0.76,
    }));
  }

  addBox(parent, size, position, material) {
    const mesh = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), material);
    mesh.position.copy(position);
    parent.add(mesh);
    return mesh;
  }

  addEdges(parent, mesh, layer) {
    const geometry = this.trackGeometry(new THREE.EdgesGeometry(mesh.geometry, 24));
    const material = this.trackMaterial(new THREE.LineBasicMaterial({
      color: layer === 'closest' ? 0x72e9ff : 0x4abbd2,
      transparent: true,
      opacity: layer === 'far' ? 0.16 : 0.28,
    }));
    const edges = new THREE.LineSegments(geometry, material);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    edges.scale.copy(mesh.scale);
    parent.add(edges);
    this.edgeLines.push(edges);
  }

  createBuilding(layer, side, rng, z, rowOffset = 0) {
    const config = this.settings[layer];
    const group = new THREE.Group();
    const scale = config.scale;
    const width = randomRange(rng, 2.2, 4.0) * scale;
    const depth = randomRange(rng, 3.0, 5.8) * scale;
    const height = randomRange(rng, config.minH, config.maxH) * scale;
    const roadHalf = this.settings.city.roadHalfWidth;
    const roadEdge = roadHalf + config.spread + rowOffset;
    group.position.set(side * (roadEdge + width / 2), 0, z);

    const mainMaterial = this.makeMaterial(layer, rng);
    const darkMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x07131c,
      emissive: 0x062b36,
      emissiveIntensity: 0.24,
      metalness: 0.82,
      roughness: 0.42,
      transparent: config.alpha < 0.995,
      opacity: config.alpha,
      depthWrite: config.alpha > 0.76,
    }));
    const glowMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: rng() > 0.86 ? 0xffc65a : 0x55e8ff,
      transparent: true,
      opacity: Math.min(1, config.alpha * 0.86),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));

    const body = this.addBox(group, new THREE.Vector3(width, height, depth), new THREE.Vector3(0, height / 2, 0), mainMaterial);
    this.addEdges(group, body, layer);

    const upperH = height * randomRange(rng, 0.18, 0.38);
    const upperW = width * randomRange(rng, 0.46, 0.76);
    const upperD = depth * randomRange(rng, 0.52, 0.80);
    const upper = this.addBox(
      group,
      new THREE.Vector3(upperW, upperH, upperD),
      new THREE.Vector3(side * width * randomRange(rng, -0.07, 0.07), height + upperH / 2, randomRange(rng, -0.30, 0.30)),
      darkMaterial,
    );
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
      const bandH = randomRange(rng, 0.04, 0.12) * scale;
      this.addBox(
        group,
        new THREE.Vector3(0.05, bandH, depth * randomRange(rng, 0.42, 0.78)),
        new THREE.Vector3(roadFaceX, bandY, randomRange(rng, -0.14, 0.14)),
        glowMaterial,
      );
    }

    const modules = 2 + Math.floor(rng() * 3);
    for (let index = 0; index < modules; index += 1) {
      const moduleH = height * randomRange(rng, 0.09, 0.22);
      const moduleW = width * randomRange(rng, 0.08, 0.19);
      const moduleD = depth * randomRange(rng, 0.24, 0.54);
      const module = this.addBox(
        group,
        new THREE.Vector3(moduleW, moduleH, moduleD),
        new THREE.Vector3(roadFaceX + side * moduleW * 0.54, randomRange(rng, moduleH / 2, height - moduleH / 2), randomRange(rng, -depth * 0.28, depth * 0.28)),
        darkMaterial,
      );
      this.addEdges(group, module, layer);
    }

    return group;
  }

  rebuild() {
    this.disposeGenerated();
    for (const layer of LAYERS) {
      this.cityGroups[layer] = {};
      const band = BANDS[layer];
      const config = this.settings[layer];
      for (const side of [-1, 1]) {
        const sideName = side < 0 ? 'left' : 'right';
        const group = new THREE.Group();
        group.userData.baseY = config.y;
        group.userData.phase = band.phase + (side > 0 ? 0.55 : 0);
        const rng = seeded(this.settings.seed + LAYERS.indexOf(layer) * 1009 + (side < 0 ? 17 : 41));
        const count = Math.round(config.count);
        const nearZ = Number.isFinite(config.nearZ) ? config.nearZ : band.nearZ;
        const farZ = Number.isFinite(config.farZ) ? config.farZ : band.farZ;
        for (let index = 0; index < count; index += 1) {
          const t = count === 1 ? 0 : index / (count - 1);
          const z = lerp(nearZ, farZ, t) + randomRange(rng, -1.1, 1.1);
          group.add(this.createBuilding(layer, side, rng, z, 0));
          if (layer === 'far' && index % 3 === 1) {
            const rear = this.createBuilding(layer, side, rng, z - randomRange(rng, 1.5, 3.2), randomRange(rng, 2.3, 4.0));
            rear.scale.multiplyScalar(randomRange(rng, 0.72, 0.88));
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

  update(timeSeconds) {
    for (const layer of LAYERS) {
      const config = this.settings[layer];
      for (const sideName of ['left', 'right']) {
        const group = this.cityGroups[layer]?.[sideName];
        if (!group) continue;
        group.position.y = config.y + Math.sin(timeSeconds * config.frequency * Math.PI * 2 + group.userData.phase) * config.amp;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }


  drawTo(context, x = 0, y = 0, width = this.width, height = this.height) {
    if (!context?.drawImage) throw new Error('drawTo requires a 2D canvas context.');
    context.drawImage(this.canvas, x, y, width, height);
  }

  dispose() {
    this.disposeGenerated();
    this.renderer.dispose();
  }
}
