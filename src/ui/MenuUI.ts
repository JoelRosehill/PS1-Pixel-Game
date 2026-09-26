import type { Input } from '../core/Input';
import { ACTIONS, type ActionId, keyName, PIXEL_LINES, type Settings, type SettingsData } from '../core/Settings';
import './menu.css';

export type Screen = 'title' | 'pause' | 'settings' | 'ending' | 'confirm-new';
type Tab = 'audio' | 'display' | 'controls';

/** What the menus need from the game. */
export interface MenuHost {
  input: Input;
  settings: Settings;
  applySettings(): void;
  /** A save was loaded: offer Continue. */
  resumed(): boolean;
  continueLabel(): string;
  /** Leave the title screen and play (starts audio, captures the mouse). */
  begin(): void;
  newJourney(): void;
  toTitle(): void;
  openJournal(): void;
  openMap(): void;
  endingStats(): [string, string][];
  sound(name: string): void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Title screen, pause menu, settings (audio, display, controls with rebinding) and the
 * ending card (Job 10). One native modal dialog pauses the world like the other menus.
 */
export class MenuUI {
  readonly dialog = document.createElement('dialog');
  screen: Screen | null = null;
  /** Where Back returns to from settings. */
  private back: Screen = 'title';
  private tab: Tab = 'audio';
  private listening: ActionId | null = null;
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly host: MenuHost) {
    this.dialog.className = 'menu-dialog';
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', e => {
      e.preventDefault();
      if (this.listening) return;
      if (this.screen === 'pause') this.resume();
      else if (this.screen === 'settings' || this.screen === 'confirm-new') this.show(this.back === 'settings' ? 'title' : this.back);
      else if (this.screen === 'ending') this.close(true);
    });
    this.dialog.addEventListener('click', e => this.onClick(e));
    this.dialog.addEventListener('input', e => this.onInput(e, false));
    this.dialog.addEventListener('change', e => this.onInput(e, true));
    // Rebinding listens before anything else so the key never reaches the game or menus.
    window.addEventListener('keydown', this.onRebindKey, true);
  }

  get paused(): boolean {
    return this.screen !== null;
  }

  open(screen: Screen): void {
    if (!this.screen) {
      if (screen !== 'title' && document.querySelector('dialog[open]')) return;
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.host.input.blocked = true;
      this.host.input.clear();
      if (document.pointerLockElement) document.exitPointerLock();
      this.show(screen);
      this.dialog.showModal();
    } else this.show(screen);
    this.focusFirst();
  }

  /** Closes the menu; `play` recaptures the mouse. */
  close(play: boolean): void {
    if (!this.screen) return;
    this.screen = null;
    this.listening = null;
    this.dialog.close();
    this.host.input.clear();
    this.host.input.blocked = false;
    this.previousFocus?.focus();
    if (play) this.host.input.requestLock();
  }

  private resume(): void {
    this.close(true);
  }

  private show(screen: Screen): void {
    if (screen === 'settings' && this.screen && this.screen !== 'settings') this.back = this.screen;
    this.screen = screen;
    this.dialog.dataset.screen = screen;
    this.render();
    this.focusFirst();
  }

  private focusFirst(): void {
    this.dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  // --- events --------------------------------------------------------------------

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-tab], [data-rebind]');
    if (!el) return;
    if (el.dataset.tab) { this.tab = el.dataset.tab as Tab; this.render(); this.dialog.querySelector<HTMLElement>(`[data-tab="${this.tab}"]`)?.focus(); this.host.sound('uiSelect'); return; }
    if (el.dataset.rebind) { this.listening = el.dataset.rebind as ActionId; this.render(); this.dialog.querySelector<HTMLElement>(`[data-rebind="${this.listening}"]`)?.focus(); return; }
    this.host.sound('uiSelect');
    switch (el.dataset.action) {
      case 'continue': this.close(true); this.host.begin(); break;
      case 'new': if (this.host.resumed()) this.show('confirm-new'); else { this.close(true); this.host.begin(); } break;
      case 'new-confirm': this.host.newJourney(); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.show(this.back); break;
      case 'resume': this.resume(); break;
      case 'journal': this.close(false); this.host.openJournal(); break;
      case 'map': this.close(false); this.host.openMap(); break;
      case 'title': this.host.toTitle(); break;
      case 'keep-exploring': this.close(true); break;
      case 'reset-keys': {
        const s = this.host.settings.data;
        for (const a of ACTIONS) s.keys[a.id] = a.key;
        this.commit(); this.render(); this.focusFirst();
        break;
      }
      case 'reset-all': this.host.settings.reset(); this.commit(); this.render(); this.focusFirst(); break;
    }
  }

  private onInput(e: Event, final: boolean): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const key = el.dataset.setting as keyof SettingsData | undefined;
    if (!key) return;
    const data = this.host.settings.data as unknown as Record<string, unknown>;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') data[key] = el.checked;
    else data[key] = Number(el.value);
    const out = this.dialog.querySelector(`output[for="${el.id}"]`);
    if (out) out.textContent = this.format(key, Number(el.value));
    this.host.applySettings();
    if (final) this.host.settings.save();
  }

  private commit(): void {
    this.host.applySettings();
    this.host.settings.save();
  }

  private onRebindKey = (e: KeyboardEvent): void => {
    if (!this.listening) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const action = this.listening;
    this.listening = null;
    if (e.code !== 'Escape') {
      const keys = this.host.settings.data.keys;
      // Swap with any action already on that key, so nothing is left unbound.
      const other = ACTIONS.find(a => a.id !== action && keys[a.id] === e.code);
      if (other) keys[other.id] = keys[action];
      keys[action] = e.code;
      this.commit();
      this.host.sound('uiSelect');
    }
    this.render();
    this.dialog.querySelector<HTMLElement>(`[data-rebind="${action}"]`)?.focus();
  };

  // --- rendering -----------------------------------------------------------------

  private format(key: string, v: number): string {
    if (key === 'sensitivity') return `${v.toFixed(2)}×`;
    if (key === 'fov') return `${Math.round(v)}°`;
    return pct(v);
  }

  private render(): void {
    switch (this.screen) {
      case 'title': this.renderTitle(); break;
      case 'confirm-new': this.renderConfirm(); break;
      case 'pause': this.renderPause(); break;
      case 'settings': this.renderSettings(); break;
      case 'ending': this.renderEnding(); break;
    }
  }

  private renderTitle(): void {
    const resumed = this.host.resumed();
    this.dialog.setAttribute('aria-label', 'Chromatic Odyssey');
    this.dialog.innerHTML = `<div class="menu-title">
        <h1>CHROMATIC ODYSSEY</h1>
        <p class="menu-tagline">A chill-fi dark fantasy · the long night</p>
        <nav class="menu-buttons">
          ${resumed ? `<button type="button" data-action="continue" data-autofocus>Continue<small>${this.host.continueLabel()}</small></button>` : ''}
          <button type="button" data-action="new" ${resumed ? '' : 'data-autofocus'}>${resumed ? 'New journey' : 'Begin the journey'}</button>
          <button type="button" data-action="settings">Settings</button>
        </nav>
        <p class="menu-keys">WASD move · Mouse look · LMB strike · RMB heavy · Q parry · E cast · F use · Esc pause</p>
        <p class="menu-foot">Headphones recommended</p>
      </div>`;
  }

  private renderConfirm(): void {
    this.back = 'title';
    this.dialog.setAttribute('aria-label', 'Begin a new journey?');
    this.dialog.innerHTML = `<div class="menu-panel" role="alertdialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title">Begin a new journey?</h2>
        <p>Your shrines, pages and everything you have found will be forgotten. This cannot be undone.</p>
        <nav class="menu-buttons"><button type="button" data-action="back" data-autofocus>Keep my journey</button><button type="button" class="danger" data-action="new-confirm">Forget and begin anew</button></nav>
      </div>`;
  }

  private renderPause(): void {
    this.dialog.setAttribute('aria-label', 'Paused');
    this.dialog.innerHTML = `<div class="menu-panel">
        <span class="menu-kicker">WORLD PAUSED</span>
        <h2>Paused</h2>
        <nav class="menu-buttons">
          <button type="button" data-action="resume" data-autofocus>Resume</button>
          <button type="button" data-action="journal">Journal</button>
          <button type="button" data-action="map">World map</button>
          <button type="button" data-action="settings">Settings</button>
          <button type="button" data-action="title">Save and return to title</button>
        </nav>
      </div>`;
  }

  private renderEnding(): void {
    const rows = this.host.endingStats().map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.dialog.setAttribute('aria-label', 'The long night ends');
    this.dialog.innerHTML = `<div class="menu-panel menu-ending">
        <span class="menu-kicker">EPILOGUE</span>
        <h2>The Long Night Ends</h2>
        <p>The chain is broken and the moon goes home. Over the Threshold, for the first time in four hundred years, the sky begins to pale. Somewhere a child asks what the light is for, and someone old enough to remember tells them: it is for waking up.</p>
        <dl class="menu-stats">${rows}</dl>
        <nav class="menu-buttons"><button type="button" data-action="keep-exploring" data-autofocus>Keep exploring</button><button type="button" data-action="title">Return to title</button></nav>
        <p class="menu-foot">Chromatic Odyssey · thank you for playing</p>
      </div>`;
  }

  private slider(key: keyof SettingsData, label: string, min: number, max: number, step: number): string {
    const v = this.host.settings.data[key] as number;
    const id = `set-${key}`;
    return `<label class="menu-row" for="${id}"><span>${label}</span><input type="range" id="${id}" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output for="${id}">${this.format(key, v)}</output></label>`;
  }

  private check(key: keyof SettingsData, label: string, hint = ''): string {
    const id = `set-${key}`;
    return `<label class="menu-row menu-check" for="${id}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" id="${id}" data-setting="${key}" ${this.host.settings.data[key] ? 'checked' : ''}></label>`;
  }

  private select(key: keyof SettingsData, label: string, options: [number, string][], hint = ''): string {
    const id = `set-${key}`;
    const v = this.host.settings.data[key];
    return `<label class="menu-row" for="${id}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><select id="${id}" data-setting="${key}">${options.map(([value, text]) => `<option value="${value}" ${value === v ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  }

  private renderSettings(): void {
    const s = this.host.settings.data;
    let body = '';
    if (this.tab === 'audio') {
      body = this.slider('master', 'Master volume', 0, 1, 0.05) + this.slider('music', 'Music', 0, 1, 0.05)
        + this.slider('sfx', 'Effects', 0, 1, 0.05) + this.slider('ambience', 'Ambience (crackle, wind)', 0, 1, 0.05);
    } else if (this.tab === 'display') {
      const sizes: [number, string][] = PIXEL_LINES.map(l => [l, { 270: 'Chunky', 360: 'Large', 450: 'Medium', 540: 'Classic', 720: 'Fine' }[l] + ` (${l} lines)`]);
      body = this.select('pixelLines', 'Pixel size', sizes)
        + this.select('bands', 'Depth bands', [[4, '4 · fastest'], [6, '6 · default'], [8, '8 · finest distance']], 'Fewer bands draw the world fewer times')
        + this.slider('bloom', 'Pixel bloom', 0, 1, 0.05)
        + this.check('outline', 'Pixel outlines')
        + this.slider('fov', 'Field of view', 60, 100, 1)
        + this.check('motion', 'Camera motion', 'Speed FOV kick, wall-run roll, screen shake')
        + this.check('compass', 'Compass')
        + this.check('hints', 'Movement hints')
        + this.check('debugHud', 'Debug overlay', 'Frame rate and renderer stats (H)');
    } else {
      const rows = ACTIONS.map(a => `<li><span>${a.label}</span><button type="button" data-rebind="${a.id}" aria-label="${a.label}: ${keyName(s.keys[a.id])}. Press to rebind" ${this.listening === a.id ? 'class="listening"' : ''}>${this.listening === a.id ? 'Press a key… (Esc cancels)' : keyName(s.keys[a.id])}</button></li>`).join('');
      body = this.slider('sensitivity', 'Mouse sensitivity', 0.25, 3, 0.05) + this.check('invertY', 'Invert vertical look')
        + `<ul class="menu-keys-list">${rows}</ul><p class="menu-note">Mouse: left strike · right (hold) heavy · middle dash. Keys that swap places keep every action bound.</p>
        <button type="button" data-action="reset-keys" class="menu-small">Reset keys</button>`;
    }
    const tabs = (['audio', 'display', 'controls'] as Tab[]).map(t => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === this.tab}" ${t === this.tab ? 'data-autofocus' : ''}>${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
    this.dialog.setAttribute('aria-label', 'Settings');
    this.dialog.innerHTML = `<div class="menu-panel menu-settings">
        <header><h2>Settings</h2><button type="button" data-action="back">Back <kbd>Esc</kbd></button></header>
        <div class="menu-tabs" role="tablist">${tabs}</div>
        <div class="menu-body" role="tabpanel">${body}</div>
        <footer><button type="button" data-action="reset-all" class="menu-small">Restore defaults</button><small>Settings save automatically</small></footer>
      </div>`;
  }
}
