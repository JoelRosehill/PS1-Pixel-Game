import * as THREE from 'three';
import type { ColliderWorld } from '../../physics/Colliders';
import { sharedUniforms } from '../../render/Materials';
import type { Boss, BossDef } from './Boss';

export interface BossArenaDef {
  boss: BossDef;
  center: THREE.Vector3;
  radius: number;
}

export type ArenaState = 'idle' | 'intro' | 'fight' | 'defeated';

/** Seconds the cinematic intro lasts. */
export const INTRO_SECONDS = 3.6;

/**
 * A boss arena: a ring the player walks into, a cinematic intro, then walls of mist
 * that hold both of them until one falls. Dying resets it; winning dissolves the walls.
 */
export class BossArena {
  state: ArenaState = 'idle';
  boss: Boss | null = null;
  introTime = 0;
  attempts = 0;
  readonly group = new THREE.Group();
  private readonly veil: THREE.Mesh;
  private walls = false;

  constructor(readonly def: BossArenaDef, private readonly colliders: ColliderWorld) {
    const color = new THREE.Color(def.boss.color ?? (def.boss.kind === 'dragon' ? 0xff5a2a : def.boss.kind === 'beast' ? 0xb07cff : 0xc8e8ff));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: sharedUniforms.uWindTime, uColor: { value: color.multiplyScalar(1.5) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          vec2 cell = floor(vUv * vec2(160.0, 24.0));
          float band = sin(vUv.y * 10.0 + sin(cell.x * 0.21 + uTime) * 2.0 + uTime * 0.8) * 0.5 + 0.5;
          float a = (0.12 + band * 0.25) * smoothstep(1.0, 0.4, vUv.y);
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    this.veil = new THREE.Mesh(new THREE.CylinderGeometry(def.radius, def.radius, 34, 48, 1, true), material);
    this.veil.position.copy(def.center).y += 12;
    this.veil.visible = false;
    this.veil.frustumCulled = false;
    this.group.add(this.veil);
    this.group.name = `arena:${def.boss.id}`;
  }

  get id(): string {
    return this.def.boss.id;
  }

  get wallsUp(): boolean {
    return this.walls;
  }

  raiseWalls(heightAt: (x: number, z: number) => number): void {
    if (this.walls) return;
    this.walls = true;
    this.veil.visible = true;
    const r = this.def.radius;
    const n = 40;
    this.colliders.beginGroup(this.group.name);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = this.def.center.x + Math.sin(a) * r, z = this.def.center.z - Math.cos(a) * r;
      this.colliders.addBox(x, heightAt(x, z) + 60, z, 3, 200, (Math.PI * 2 * r) / n + 1, Math.PI / 2 - a);
    }
    this.colliders.endGroup();
  }

  lowerWalls(): void {
    if (!this.walls) return;
    this.walls = false;
    this.veil.visible = false;
    this.colliders.removeGroup(this.group.name);
  }
}
