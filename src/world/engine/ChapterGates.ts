import * as THREE from 'three';
import type { Progress } from '../../core/Progress';
import type { ColliderWorld } from '../../physics/Colliders';
import { glow, sharedUniforms } from '../../render/Materials';
import { roman } from '../biomes/Chapters';
import { box, cone, GeoBucket, place } from '../geometry';
import type { WorldMaterials } from '../props/WorldMaterials';
import { type Pass, SECTOR, type WorldAtlas } from './WorldAtlas';

/** Half-width of each pass opening along the ridge (m). */
const PASS_HALF = 80;
/** Radius of the hub's rampart wall and the valley opening through it. */
export const HUB_WALL_R = 585;
export const HUB_OPENING = 0.1;
const EDGE_WALL_R = 4350;

export interface Gate {
  id: string;
  pass: Pass;
  from: number;
  to: number;
  open: boolean;
  group: THREE.Group;
  curtain: THREE.ShaderMaterial;
  fade: number;
}

/**
 * Chapter gating (Job 7). Ridges between chapters are backed by invisible walls along
 * their crests (so they cannot be climbed around), the hub is enclosed except for its
 * northern valley, and the world's edge is walled. Each pass holds a veil of mist that
 * opens once the chapter behind it has been proven: `need(chapter)` camps cleared.
 * Job 8 adds the chapter's boss as the final key.
 */
export class ChapterGates {
  readonly gates: Gate[] = [];
  readonly group = new THREE.Group();
  /** Extra condition per chapter (Job 8: the chapter boss is dead). */
  bossRequirement: (chapter: number) => { met: boolean; text: string } = () => ({ met: true, text: '' });
  onOpen: (gate: Gate) => void = () => {};
  private readonly campsByChapter = new Map<number, string[]>();

  constructor(
    private readonly atlas: WorldAtlas,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly colliders: ColliderWorld,
    private readonly progress: Progress,
    campIds: string[],
    m: WorldMaterials,
  ) {
    this.group.name = 'chapter-gates';
    for (const id of campIds) {
      const chapter = Number(/^camp:c(\d+)-/.exec(id)?.[1] ?? 0);
      const list = this.campsByChapter.get(chapter) ?? [];
      list.push(id);
      this.campsByChapter.set(chapter, list);
    }
    this.buildWalls();
    for (const pass of atlas.passes) this.buildGate(pass, m);
    for (const gate of this.gates) if (progress.gates.has(gate.id)) this.setOpen(gate, true);
  }

  /** Camps that must be cleared in `chapter` before its gate opens. */
  need(chapter: number): number {
    return Math.min(3, this.campsByChapter.get(chapter)?.length ?? 0);
  }

  clearedIn(chapter: number): number {
    return (this.campsByChapter.get(chapter) ?? []).filter(id => this.progress.cleared.has(id)).length;
  }

  gateFor(from: number): Gate | undefined {
    return this.gates.find(g => g.from === from);
  }

  // --- walls ---------------------------------------------------------------

  private wall(x: number, z: number, length: number, rotY: number): void {
    this.colliders.addBox(x, this.heightAt(x, z) + 150, z, 4, 600, length, rotY);
  }

  private buildWalls(): void {
    // Along every ridge crest, except the pass openings.
    for (let b = 0; b < 8; b++) {
      const az = b * SECTOR + SECTOR / 2;
      const pass = this.atlas.passFor(b);
      for (let r = 640; r < EDGE_WALL_R; r += 64) {
        const mid = r + 32;
        if (pass && Math.abs(mid - pass.r) < PASS_HALF + 32) continue;
        this.wall(Math.sin(az) * mid, -Math.cos(az) * mid, 66, Math.PI - az);
      }
    }
    // Around the hub, leaving the northern valley open.
    const valley = Math.atan2(54, 760);
    const n = Math.ceil((Math.PI * 2 * HUB_WALL_R) / 30);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(az - valley), Math.cos(az - valley))) < HUB_OPENING) continue;
      this.wall(Math.sin(az) * HUB_WALL_R, -Math.cos(az) * HUB_WALL_R, 32, Math.PI / 2 - az);
    }
    // The world's edge.
    const e = Math.ceil((Math.PI * 2 * EDGE_WALL_R) / 64);
    for (let i = 0; i < e; i++) {
      const az = (i / e) * Math.PI * 2;
      this.wall(Math.sin(az) * EDGE_WALL_R, -Math.cos(az) * EDGE_WALL_R, 66, Math.PI / 2 - az);
    }
  }

  // --- gates -----------------------------------------------------------------

  private buildGate(pass: Pass, m: WorldMaterials): void {
    const id = `gate:${pass.from}-${pass.to}`;
    const az = pass.azimuth;
    const dirX = Math.sin(az), dirZ = -Math.cos(az);
    const ground = this.heightAt(pass.x, pass.z);
    const color = new THREE.Color(this.atlas.chapters[pass.to - 1]?.biomes[0]?.landmark.color ?? 0xb07cff);
    const curtain = new THREE.ShaderMaterial({
      uniforms: { uTime: sharedUniforms.uWindTime, uColor: { value: color.clone().multiplyScalar(1.6) }, uFade: { value: 1 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uFade;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 cell = floor(vUv * vec2(96.0, 36.0));
          float drift = sin(cell.x * 0.37 + uTime * 0.9) * 0.5 + sin(cell.x * 0.11 - uTime * 0.5) * 0.5;
          float band = smoothstep(0.2, 1.0, sin(vUv.y * 12.0 + drift * 3.0 + uTime * 0.6) * 0.5 + 0.5);
          float n = h(cell + floor(uTime * 3.0));
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(1.0, 0.55, vUv.y);
          float a = (0.22 + band * 0.35 + n * 0.12) * edge * uFade;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(PASS_HALF * 2, 60, 1, 1), curtain);
    plane.position.set(pass.x, ground + 26, pass.z);
    plane.rotation.y = Math.PI / 2 - az;
    plane.renderOrder = 3;
    plane.frustumCulled = false;
    // Guardian pillars at both ends of the veil.
    const b = new GeoBucket();
    const rune = glow(color.getHex(), 2.6);
    for (const side of [-1, 1]) {
      const px = pass.x + dirX * side * (PASS_HALF + 3), pz = pass.z + dirZ * side * (PASS_HALF + 3);
      const py = this.heightAt(px, pz) - 1;
      b.add(m.darkStone, place(box(4, 30, 4, 2), px, py + 15, pz, Math.PI / 2 - az));
      b.add(m.darkStone, place(cone(3, 5, 4, 1), px, py + 32.5, pz, Math.PI / 2 - az + Math.PI / 4));
      b.add(rune, place(box(0.5, 20, 4.1, 1), px, py + 14, pz, Math.PI / 2 - az));
      this.colliders.addBox(px, py + 15, pz, 4, 30, 4, Math.PI / 2 - az);
    }
    const group = b.build(new THREE.Group());
    group.add(plane);
    group.name = id;
    this.group.add(group);
    const gate: Gate = { id, pass, from: pass.from, to: pass.to, open: false, group, curtain, fade: 1 };
    this.colliders.beginGroup(id);
    this.colliders.addBox(pass.x, ground + 150, pass.z, 4, 600, PASS_HALF * 2, Math.PI - az);
    this.colliders.endGroup();
    this.gates.push(gate);
  }

  private setOpen(gate: Gate, instant: boolean): void {
    if (gate.open) return;
    gate.open = true;
    this.colliders.removeGroup(gate.id);
    this.progress.openGate(gate.id);
    if (instant) { gate.fade = 0; gate.curtain.uniforms.uFade.value = 0; }
  }

  /** Opens (instantly) every gate recorded in progress — used after loading a save. */
  sync(): void {
    for (const gate of this.gates) if (this.progress.gates.has(gate.id)) this.setOpen(gate, true);
  }

  /** Why a gate is still closed (null when its conditions are met). */
  blocker(gate: Gate): string | null {
    const chapter = this.atlas.chapters[gate.from - 1];
    const need = this.need(gate.from);
    const done = this.clearedIn(gate.from);
    if (done < need) return `The mist will not part. Clear ${need - done} more camp${need - done === 1 ? '' : 's'} in ${chapter.name} (${done}/${need}).`;
    const boss = this.bossRequirement(gate.from);
    if (!boss.met) return boss.text;
    return null;
  }

  /** Opens gates whose conditions are met; returns a hint for a closed gate near `at`. */
  update(dt: number, at: THREE.Vector3): string {
    let hint = '';
    for (const gate of this.gates) {
      if (gate.open) {
        if (gate.fade > 0) {
          gate.fade = Math.max(0, gate.fade - dt * 0.6);
          gate.curtain.uniforms.uFade.value = gate.fade;
          if (gate.fade === 0) gate.group.children.at(-1)!.visible = false;
        }
        continue;
      }
      const why = this.blocker(gate);
      if (!why) {
        this.setOpen(gate, false);
        this.onOpen(gate);
        continue;
      }
      if (Math.hypot(at.x - gate.pass.x, at.z - gate.pass.z) < PASS_HALF + 30) hint = why;
    }
    return hint;
  }

  describe(gate: Gate): string {
    return `Gate of Chapter ${roman(gate.from)} → ${roman(gate.to)}`;
  }
}
