import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Progress } from '../core/Progress';
import type { EnemyDirector } from '../enemies/EnemyDirector';
import type { Player } from '../player/Player';
import { getSkyPreset } from '../render/sky/SkyPresets';
import { roman } from '../world/biomes/Chapters';
import { SECTOR, WORLD } from '../world/engine/WorldAtlas';
import type { World } from '../world/World';
import './worldmap.css';

const SIZE = 256;
const EXTENT = 4800;

/**
 * The world map (Job 7), opened with M. Painted from the same analytic ground the game
 * renders (hill-shaded), with regions revealed as they are discovered. Shows chapters,
 * landmarks, camps, gates, the Spire Citadel and the player. Pauses the world like the
 * spellbook and keeps keyboard focus inside its native dialog.
 */
export class WorldMap {
  readonly dialog = document.createElement('dialog');
  isOpen = false;
  private base: Uint8ClampedArray | null = null;
  private siteOf: Int16Array | null = null;
  private readonly canvas = document.createElement('canvas');
  private readonly panel = document.createElement('div');
  private previousFocus: HTMLElement | null = null;

  constructor(
    private readonly world: World,
    private readonly player: Player,
    private readonly input: Input,
    private readonly progress: Progress,
    private readonly enemies: EnemyDirector,
  ) {
    this.dialog.className = 'map-dialog';
    this.dialog.setAttribute('aria-label', 'World map');
    this.canvas.width = this.canvas.height = SIZE * 2;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Map of the world; details are listed beside it');
    const header = document.createElement('header');
    header.className = 'map-header';
    header.innerHTML = '<div><span>THE WORLD</span><p>World paused</p></div><button type="button" data-action="close" aria-label="Close map">Close <kbd>M</kbd></button>';
    const body = document.createElement('div');
    body.className = 'map-body';
    this.panel.className = 'map-panel';
    body.append(this.canvas, this.panel);
    this.dialog.append(header, body);
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
    this.dialog.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('[data-action="close"]')) this.close();
    });
    window.addEventListener('keydown', e => {
      if (e.code !== 'KeyM' || e.repeat) return;
      if (this.isOpen) { e.preventDefault(); this.close(); return; }
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      this.open();
    });
  }

  get paused(): boolean {
    return this.isOpen;
  }

  open(): void {
    if (this.isOpen || !this.player.active) return;
    this.isOpen = true;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.input.blocked = true;
    this.input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
    this.dialog.showModal();
    this.dialog.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
  }

  close(relock = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dialog.close();
    this.input.clear();
    this.input.blocked = false;
    this.previousFocus?.focus();
    if (relock) this.input.requestLock();
  }

  /** World (x, z) → map pixel (on the 512 px canvas). */
  toMap(x: number, z: number): [number, number] {
    return [((x + EXTENT) / (EXTENT * 2)) * SIZE * 2, ((z + EXTENT) / (EXTENT * 2)) * SIZE * 2];
  }

  /** Paints the terrain once (about 65k ground samples). */
  private paintBase(): void {
    const w = this.world;
    const heights = new Float32Array(SIZE * SIZE);
    const step = (EXTENT * 2) / SIZE;
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++) heights[j * SIZE + i] = w.heightAt(-EXTENT + (i + 0.5) * step, -EXTENT + (j + 0.5) * step);
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);
    const siteOf = new Int16Array(SIZE * SIZE);
    const c = new THREE.Color();
    const water = new THREE.Color();
    const sites = w.atlas.sites;
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++) {
        const k = j * SIZE + i;
        const x = -EXTENT + (i + 0.5) * step, z = -EXTENT + (j + 0.5) * step;
        const h = heights[k];
        const hx = heights[j * SIZE + Math.min(SIZE - 1, i + 1)] - heights[j * SIZE + Math.max(0, i - 1)];
        const hz = heights[Math.min(SIZE - 1, j + 1) * SIZE + i] - heights[Math.max(0, j - 1) * SIZE + i];
        const slope = Math.min(1, Math.hypot(hx, hz) / (step * 2) * 0.6);
        const site = w.siteAt(x, z);
        siteOf[k] = site ? sites.indexOf(site) : -1;
        if (h < 0) {
          water.set(getSkyPreset(site?.biome.sky ?? 'cosmic-violet').water.shallow).lerp(new THREE.Color(0x0a1a2a), Math.min(0.6, -h * 0.12));
          c.copy(water);
        } else w.terrain.colorAt(x, z, h, slope, c);
        // Hill shading from the north-west.
        const shade = THREE.MathUtils.clamp(0.82 + (-hx - hz) / (step * 2) * 0.9, 0.45, 1.3);
        c.multiplyScalar(h < 0 ? 1 : shade);
        c.convertLinearToSRGB();
        data[k * 4] = c.r * 255; data[k * 4 + 1] = c.g * 255; data[k * 4 + 2] = c.b * 255; data[k * 4 + 3] = 255;
      }
    this.base = data;
    this.siteOf = siteOf;
  }

  /** Map pixels of discovered vs undiscovered ground (tests). */
  get stats(): { revealed: number; hidden: number } {
    if (!this.siteOf) this.paintBase();
    let revealed = 0, hidden = 0;
    for (const s of this.siteOf!) {
      if (s < 0 || this.progress.discovered.has(this.world.atlas.sites[s].id)) revealed++; else hidden++;
    }
    return { revealed, hidden };
  }

  render(): void {
    if (!this.base) this.paintBase();
    const w = this.world;
    const ctx = this.canvas.getContext('2d')!;
    const img = new ImageData(SIZE, SIZE);
    const sites = w.atlas.sites;
    const known = sites.map(s => this.progress.discovered.has(s.id));
    for (let k = 0; k < SIZE * SIZE; k++) {
      const s = this.siteOf![k];
      const reveal = s < 0 || known[s];
      const f = reveal ? 1 : 0.16;
      img.data[k * 4] = this.base![k * 4] * f + (reveal ? 0 : 22);
      img.data[k * 4 + 1] = this.base![k * 4 + 1] * f + (reveal ? 0 : 14);
      img.data[k * 4 + 2] = this.base![k * 4 + 2] * f + (reveal ? 0 : 34);
      img.data[k * 4 + 3] = 255;
    }
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = SIZE;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, SIZE * 2, SIZE * 2);
    ctx.font = '11px Consolas, monospace';
    ctx.textAlign = 'center';

    // Chapter numerals.
    for (const chapter of w.atlas.chapters) {
      const a = (chapter.index - 1) * SECTOR;
      const [mx, my] = this.toMap(Math.sin(a) * 2600, -Math.cos(a) * 2600);
      const seen = sites.some((s, i) => s.chapter === chapter.index && known[i]);
      ctx.font = 'bold 16px Consolas, monospace';
      ctx.fillStyle = seen ? '#f4e8ff' : '#6a5a80';
      ctx.fillText(roman(chapter.index), mx, my);
    }
    ctx.font = '11px Consolas, monospace';
    // Hub and citadel.
    const [hx, hy] = this.toMap(0, 0);
    ctx.strokeStyle = '#ffd070';
    ctx.beginPath(); ctx.arc(hx, hy, (WORLD.hubOuter / (EXTENT * 2)) * SIZE * 2, 0, Math.PI * 2); ctx.stroke();
    const c = w.hub.citadelAt;
    const [cx, cy] = this.toMap(c.x, c.z);
    ctx.fillStyle = '#ff5a7a';
    ctx.fillRect(cx - 2, cy - 7, 4, 10);
    // Landmarks and camps in discovered regions.
    w.landmarks.forEach((lm, i) => {
      if (!known[i]) return;
      const [lx, ly] = this.toMap(lm.x, lm.z);
      ctx.fillStyle = '#' + (sites[i].biome.landmark.color ?? 0xffd36a).toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.moveTo(lx, ly - 5); ctx.lineTo(lx + 4, ly); ctx.lineTo(lx, ly + 5); ctx.lineTo(lx - 4, ly); ctx.fill();
    });
    for (const enc of this.enemies.encounters) {
      if (!enc.def.id.startsWith('camp:')) continue;
      const site = sites.findIndex(s => enc.def.id.startsWith(`camp:${s.id}:`));
      if (site < 0 || !known[site]) continue;
      const [ex, ey] = this.toMap(enc.def.trigger.x, enc.def.trigger.z);
      const cleared = this.progress.cleared.has(enc.def.id);
      ctx.fillStyle = cleared ? '#8a8098' : '#ff4a6a';
      ctx.fillRect(ex - 2, ey - 2, 4, 4);
    }
    // Gates.
    for (const gate of w.gates.gates) {
      const [gx, gy] = this.toMap(gate.pass.x, gate.pass.z);
      ctx.fillStyle = gate.open ? '#ffd070' : '#b07cff';
      ctx.fillRect(gx - 4, gy - 4, 8, 8);
    }
    // The player.
    const p = this.player.controller.position;
    const [px, py] = this.toMap(p.x, p.z);
    const yaw = this.player.camera.yaw;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#7fffd4';
    ctx.strokeStyle = '#0a0414';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();

    // Text panel: where you are and each chapter's progress.
    const here = w.siteAt(p.x, p.z);
    const rows = w.atlas.chapters.map(chapter => {
      const seenSites = sites.filter(s => s.chapter === chapter.index && this.progress.discovered.has(s.id));
      const gate = w.gates.gateFor(chapter.index);
      const need = w.gates.need(chapter.index), done = w.gates.clearedIn(chapter.index);
      const status = !seenSites.length ? 'Undiscovered' : `${seenSites.map(s => s.biome.name).join(', ')}`;
      const gateText = gate ? (gate.open ? 'Gate open' : `Gate sealed · camps ${done}/${need}`) : chapter.index === 8 ? 'The last chapter' : '';
      return `<li class="${seenSites.length ? 'seen' : ''}"><strong>${roman(chapter.index)} · ${seenSites.length ? chapter.name : '???'}</strong><span>${status}</span><small>${gateText}</small></li>`;
    }).join('');
    this.panel.innerHTML = `<p class="map-here">You are in <strong>${here ? here.biome.name : 'The Threshold'}</strong>${here ? ` · Chapter ${roman(here.chapter)}` : ''}</p>
      <ol class="map-chapters">${rows}</ol>
      <p class="map-legend"><i class="lg-player"></i>You <i class="lg-landmark"></i>Landmark <i class="lg-camp"></i>Camp <i class="lg-cleared"></i>Cleared <i class="lg-gate"></i>Sealed gate <i class="lg-open"></i>Open gate</p>`;
  }
}
