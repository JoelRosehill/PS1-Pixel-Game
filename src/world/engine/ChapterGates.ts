import * as THREE from 'three';
import type { Progress } from '../../core/Progress';
import type { ColliderWorld } from '../../physics/Colliders';
import { glow, sharedUniforms } from '../../render/Materials';
import { roman } from '../biomes/Chapters';
import { box, cone, cylinder, GeoBucket, place } from '../geometry';
import type { WorldMaterials } from '../props/WorldMaterials';
import { type ChapterGate, WORLD, type WorldAtlas } from './WorldAtlas';


export interface Gate {
  id: string;
  /** Where it stands on the road. */
  pass: ChapterGate;
  from: number;
  to: number;
  open: boolean;
  group: THREE.Group;
  curtain: THREE.ShaderMaterial;
  fade: number;
}

/**
 * Chapter gating (Jobs 7, 15). Where two chapters meet, the Long Road's valley narrows
 * into a gorge spanned by a colossal gateway holding a veil of mist; it opens once the
 * chapter has been proven: `need(chapter)` camps cleared and its boss dead. (The valley's
 * edge itself is an analytic boundary in the collision world; see `World`.)
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
    for (const gate of atlas.gates) this.buildGate(gate, m);
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

  // --- gates -----------------------------------------------------------------

  /**
   * A colossal gateway across the gorge: two towers, a lintel high overhead and, between
   * them, the veil — a curtain of drifting light that blocks the way until it opens.
   */
  private buildGate(pass: ChapterGate, m: WorldMaterials): void {
    const id = `gate:${pass.from}-${pass.to}`;
    const ground = this.heightAt(pass.x, pass.z);
    const half = pass.width + 4;
    const rot = Math.atan2(pass.tx, pass.tz);
    const [lx, lz] = this.atlas.road.leftNormal(pass.tx, pass.tz);
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
    const tall = 70;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, tall * 0.8, 1, 1), curtain);
    plane.position.set(pass.x, ground + tall * 0.4 - 2, pass.z);
    plane.rotation.y = rot;
    plane.renderOrder = 3;
    plane.frustumCulled = false;
    const b = new GeoBucket();
    const rune = glow(color.getHex(), 2.6);
    for (const side of [-1, 1]) {
      const px = pass.x + lx * side * (half + 7), pz = pass.z + lz * side * (half + 7);
      const py = Math.min(ground, this.heightAt(px, pz)) - 2;
      // A stepped tower: base, shaft, crown and spire.
      b.add(m.darkStone, place(box(18, 10, 18, 3), px, py + 5, pz, rot));
      b.add(m.darkStone, place(box(13, tall, 13, 6), px, py + 10 + tall / 2, pz, rot));
      b.add(m.darkStone, place(box(17, 5, 17, 2), px, py + 10 + tall, pz, rot));
      b.add(m.darkStone, place(cone(9, 22, 4, 1), px, py + 22.5 + tall, pz, rot + Math.PI / 4));
      b.add(rune, place(box(1.2, tall * 0.8, 13.2, 1), px, py + 10 + tall * 0.5, pz, rot));
      for (let k = 0; k < 4; k++) b.add(rune, place(cylinder(0.8, 0.8, 3, 6, 1), px + lx * side * 7, py + 20 + k * 14, pz + lz * side * 7));
      this.colliders.addBox(px, py + (10 + tall) / 2, pz, 18, 10 + tall + 10, 18, rot);
    }
    // The lintel spanning the gorge high overhead, and its keystone.
    const span = (half + 7) * 2 + 13;
    b.add(m.darkStone, place(box(span, 8, 10, 6), pass.x, ground + tall + 4, pass.z, rot));
    b.add(rune, place(box(span * 0.7, 1.2, 10.2, 3), pass.x, ground + tall + 1.2, pass.z, rot));
    b.add(m.darkStone, place(cone(7, 14, 4, 1), pass.x, ground + tall + 15, pass.z, rot + Math.PI / 4));
    const group = b.build(new THREE.Group());
    group.add(plane);
    group.name = id;
    this.group.add(group);
    const gate: Gate = { id, pass, from: pass.from, to: pass.to, open: false, group, curtain, fade: 1 };
    this.colliders.beginGroup(id);
    // The veil's barrier spans the gorge out to the valley's edge, so it cannot be
    // climbed around on the slopes.
    this.colliders.addBox(pass.x, ground + 150, pass.z, (pass.width + WORLD.wallOffset) * 2 + 40, 600, 4, rot);
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
      if (Math.hypot(at.x - gate.pass.x, at.z - gate.pass.z) < gate.pass.width + 40) hint = why;
    }
    return hint;
  }

  describe(gate: Gate): string {
    return `Gate of Chapter ${roman(gate.from)} → ${roman(gate.to)}`;
  }
}
