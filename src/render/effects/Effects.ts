import * as THREE from 'three';
import { GLYPH_ATLAS_WIDTH, GLYPH_CELL, GLYPH_ORDER, glyphAtlas } from '../PixelTextures';

/**
 * Combat feedback pools: sword trails, impact sparks, shock rings and floating damage
 * numbers. Everything is pre-allocated and additive, so hits read as bright pixel flashes
 * against the dark palette without allocating during the fight.
 */

const SPARKS = 220;
const RINGS = 10;
const NUMBERS = 96;
const TRAIL_SAMPLES = 14;

interface Spark {
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
  pos: THREE.Vector3;
  size: number;
}

interface Ring {
  life: number;
  maxLife: number;
  radius: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface FloatNumber {
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  glyph: number;
  offset: number;
  scale: number;
}

export class Effects {
  readonly group = new THREE.Group();

  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly sparks: Spark[] = [];
  private readonly rings: Ring[] = [];
  private readonly numberMesh: THREE.InstancedMesh;
  private readonly numbers: FloatNumber[] = [];
  private readonly numberUv: THREE.InstancedBufferAttribute;

  private readonly trail: THREE.Mesh;
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private readonly trailHistory: { hilt: THREE.Vector3; tip: THREE.Vector3 }[] = [];
  private trailActive = false;
  private trailColor = new THREE.Color(0x6ad8ff);

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor() {
    this.group.name = 'effects';
    this.group.frustumCulled = false;

    // --- sparks
    const sparkMat = new THREE.MeshBasicMaterial({ vertexColors: false, transparent: true, depthWrite: false });
    this.sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), sparkMat, SPARKS);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < SPARKS; i++) {
      this.sparks.push({ life: 0, maxLife: 1, vel: new THREE.Vector3(), pos: new THREE.Vector3(), size: 0.07 });
      this.sparkMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.group.add(this.sparkMesh);

    // --- rings
    for (let i = 0; i < RINGS; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 24), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ life: 0, maxLife: 1, radius: 1, mesh, material });
    }

    // --- damage numbers (instanced glyph quads with a per-instance UV offset)
    const atlas = glyphAtlas();
    const glyphW = GLYPH_CELL / GLYPH_ATLAS_WIDTH;
    const numberGeo = new THREE.PlaneGeometry(1, 1.25);
    const uv = numberGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * glyphW);
    const numberMat = new THREE.MeshBasicMaterial({
      map: atlas,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.numberUv = new THREE.InstancedBufferAttribute(new Float32Array(NUMBERS), 1);
    numberMat.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float aGlyph;\nvarying float vGlyph;\n${shader.vertexShader}`.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n  vGlyph = aGlyph;',
      );
      shader.fragmentShader = `varying float vGlyph;\n${shader.fragmentShader}`.replace(
        '#include <map_fragment>',
        `vec2 glyphUv = vMapUv + vec2(vGlyph * ${glyphW.toFixed(6)}, 0.0);
         vec4 sampledDiffuseColor = texture2D(map, glyphUv);
         diffuseColor *= sampledDiffuseColor;`,
      );
    };
    numberMat.customProgramCacheKey = () => 'glyph-atlas';
    this.numberMesh = new THREE.InstancedMesh(numberGeo, numberMat, NUMBERS);
    this.numberMesh.geometry.setAttribute('aGlyph', this.numberUv);
    this.numberMesh.frustumCulled = false;
    this.numberMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < NUMBERS; i++) {
      this.numbers.push({ life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), glyph: 0, offset: 0, scale: 1 });
      this.numberMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.group.add(this.numberMesh);

    // --- sword trail ribbon
    const trailGeo = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(TRAIL_SAMPLES * 2 * 3);
    this.trailColors = new Float32Array(TRAIL_SAMPLES * 2 * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_SAMPLES - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    trailGeo.setIndex(idx);
    this.trail = new THREE.Mesh(
      trailGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.group.add(this.trail);
  }

  // --- spawners ------------------------------------------------------------

  sparkBurst(point: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation, count = 12, speed = 7): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const s = this.sparks.find((x) => x.life <= 0);
      if (!s) return;
      const idx = this.sparks.indexOf(s);
      s.life = s.maxLife = 0.22 + Math.random() * 0.3;
      s.size = 0.05 + Math.random() * 0.07;
      s.pos.copy(point);
      s.vel
        .copy(dir)
        .multiplyScalar(speed * (0.4 + Math.random()))
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(speed * 0.8));
      this.sparkMesh.setColorAt(idx, c);
    }
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  ring(point: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, duration = 0.4, vertical = false): void {
    const r = this.rings.find((x) => x.life <= 0);
    if (!r) return;
    r.life = r.maxLife = duration;
    r.radius = radius;
    r.mesh.position.copy(point);
    r.mesh.rotation.x = vertical ? 0 : -Math.PI / 2;
    r.mesh.visible = true;
    r.material.color.set(color);
    r.material.opacity = 1;
  }

  /** Floating damage number. `text` is digits, optionally prefixed with + or !. */
  number(point: THREE.Vector3, text: string, color: THREE.ColorRepresentation, scale = 1): void {
    const c = new THREE.Color(color);
    const width = text.length * 0.17 * scale;
    for (let i = 0; i < text.length; i++) {
      const glyph = GLYPH_ORDER.indexOf(text[i]);
      if (glyph < 0) continue;
      const n = this.numbers.find((x) => x.life <= 0);
      if (!n) return;
      const idx = this.numbers.indexOf(n);
      n.life = n.maxLife = 0.85;
      n.glyph = glyph;
      n.scale = scale;
      n.offset = i * 0.17 * scale - width / 2;
      n.pos.copy(point).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
      n.vel.set((Math.random() - 0.5) * 0.7, 2.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.7);
      this.numberMesh.setColorAt(idx, c);
    }
    if (this.numberMesh.instanceColor) this.numberMesh.instanceColor.needsUpdate = true;
  }

  // --- sword trail ---------------------------------------------------------

  beginTrail(color: THREE.ColorRepresentation): void {
    this.trailActive = true;
    this.trailHistory.length = 0;
    this.trailColor.set(color);
    this.trail.visible = true;
  }

  pushTrail(hilt: THREE.Vector3, tip: THREE.Vector3): void {
    if (!this.trailActive) return;
    this.trailHistory.push({ hilt: hilt.clone(), tip: tip.clone() });
    if (this.trailHistory.length > TRAIL_SAMPLES) this.trailHistory.shift();
  }

  endTrail(): void {
    this.trailActive = false;
  }

  private updateTrail(dt: number): void {
    if (!this.trailActive && this.trailHistory.length > 0 && Math.random() < dt * 40) this.trailHistory.shift();
    const n = this.trailHistory.length;
    if (n < 2) {
      this.trail.visible = false;
      return;
    }
    this.trail.visible = true;
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      const sample = this.trailHistory[Math.min(i, n - 1)];
      const fade = i < n ? i / Math.max(n - 1, 1) : 0;
      const a = i * 6;
      this.trailPositions.set([sample.hilt.x, sample.hilt.y, sample.hilt.z], a);
      this.trailPositions.set([sample.tip.x, sample.tip.y, sample.tip.z], a + 3);
      const k = fade * fade;
      const c = this.trailColor;
      this.trailColors.set([c.r * k * 0.35, c.g * k * 0.35, c.b * k * 0.35], a);
      this.trailColors.set([c.r * k, c.g * k, c.b * k], a + 3);
    }
    (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.trail.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- per-frame -----------------------------------------------------------

  update(dt: number, camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.q);

    let sparkDirty = false;
    for (let i = 0; i < SPARKS; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) {
        this.m.makeScale(0, 0, 0);
        this.sparkMesh.setMatrixAt(i, this.m);
        continue;
      }
      s.life -= dt;
      s.vel.y -= 22 * dt;
      s.pos.addScaledVector(s.vel, dt);
      const k = Math.max(0, s.life / s.maxLife);
      const size = s.size * (0.4 + k * 0.6);
      this.m.compose(s.pos, this.q, this.s.set(size, size, size));
      this.sparkMesh.setMatrixAt(i, this.m);
      sparkDirty = true;
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (!sparkDirty) this.sparkMesh.visible = this.sparks.some((s) => s.life > 0);
    else this.sparkMesh.visible = true;

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life / r.maxLife);
      const scale = r.radius * (0.25 + k * 0.95);
      r.mesh.scale.setScalar(scale);
      r.material.opacity = Math.max(0, 1 - k) ** 1.5;
      if (r.life <= 0) r.mesh.visible = false;
    }

    for (let i = 0; i < NUMBERS; i++) {
      const n = this.numbers[i];
      if (n.life <= 0) {
        this.m.makeScale(0, 0, 0);
        this.numberMesh.setMatrixAt(i, this.m);
        continue;
      }
      n.life -= dt;
      n.vel.y -= 5.5 * dt;
      n.pos.addScaledVector(n.vel, dt);
      const k = Math.max(0, n.life / n.maxLife);
      const size = (0.34 + (1 - k) * 0.05) * n.scale * Math.min(1, k * 4);
      this.p.copy(n.pos).addScaledVector(this.right(camera), n.offset);
      this.m.compose(this.p, this.q, this.s.set(size, size, size));
      this.numberMesh.setMatrixAt(i, this.m);
      this.numberUv.setX(i, n.glyph);
    }
    this.numberMesh.instanceMatrix.needsUpdate = true;
    this.numberUv.needsUpdate = true;

    this.updateTrail(dt);
  }

  private readonly rightVec = new THREE.Vector3();
  private right(camera: THREE.Camera): THREE.Vector3 {
    return this.rightVec.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  }
}
