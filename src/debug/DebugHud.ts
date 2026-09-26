import type { PlayerState } from '../player/PlayerController';
import type { SmartPixelRenderer } from '../render/SmartPixelRenderer';

export interface HudState {
  fps: number;
  presetName: string;
  flyMode: boolean;
  flyWalk: boolean;
  flySpeed: number;
  player: {
    state: PlayerState;
    speed: number;
    vertical: number;
    dash: number;
    grounded: boolean;
  };
}

/** Plain-DOM debug overlay (throttled to 4 Hz). */
export class DebugHud {
  visible = true;
  private acc = 0;

  constructor(private readonly el: HTMLElement) {}

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }

  update(dt: number, pixel: SmartPixelRenderer, s: HudState): void {
    this.acc += dt;
    if (!this.visible || this.acc < 0.25) return;
    this.acc = 0;
    const info = pixel.renderer.info.render;
    const st = pixel.settings;
    const p = s.player;
    const body = s.flyMode
      ? `<span class="k">FLY CAM</span>  ${s.flyWalk ? 'walk' : 'fly'}  speed ${s.flySpeed.toFixed(0)}\n` +
        `<span class="dim">WASD move · Shift fast · Space/C up-down · G walk · V back to player</span>`
      : `Move   <span class="k">${p.state.toUpperCase().padEnd(5)}</span> ${p.speed.toFixed(1)} m/s` +
        `  vy ${p.vertical >= 0 ? '+' : ''}${p.vertical.toFixed(1)}\n` +
        `Dash   ${'◆'.repeat(p.dash)}${'◇'.repeat(Math.max(0, 3 - p.dash))}` +
        `   <span class="dim">${p.grounded ? 'grounded' : 'airborne'}</span>\n` +
        `<span class="dim">WASD move · Space jump · Shift dash · Ctrl slide\n` +
        `R respawn · V fly cam · 1-4 sky · F1 render mode</span>`;
    this.el.innerHTML =
      `<span class="k">CHROMATIC ODYSSEY</span> <span class="dim">· Job 2 · Movement</span>\n` +
      `FPS ${s.fps.toFixed(0)}  draws ${info.calls}  tris ${(info.triangles / 1e6).toFixed(2)}M\n` +
      `Render ${pixel.mode.name}  base ${pixel.basePx}px  sky <span class="k">${s.presetName}</span>\n` +
      `<span class="dim">[F2] bands ${on(st.debugBands)} · [F3] outline ${on(st.outline > 0)} · [F4] palette ${on(st.quantLevels < 64)} · [H] hide</span>\n` +
      body;
  }
}

const on = (b: boolean) => (b ? 'on' : 'off');
