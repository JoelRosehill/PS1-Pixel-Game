import type { Input } from '../core/Input';
import type { Player } from '../player/Player';
import { SPELL_PAGES } from '../spells/SpellBook';
import './spellbook.css';

/** Native dialog gives keyboard focus containment. Both menus pause gameplay. */
export class SpellbookUI {
  readonly dialog = document.createElement('dialog');
  readonly hud = document.createElement('div');
  mode: 'book' | 'wheel' | null = null;
  private index = 0;
  private wheelIndex = 0;
  private readonly status = document.createElement('div');
  private readonly pickup = document.createElement('div');
  private readonly toast = document.createElement('div');
  private previousFocus: HTMLElement | null = null;
  private lastHud = '';
  constructor(private readonly player: Player, private readonly input: Input, container: HTMLElement) {
    this.dialog.className = 'spell-dialog';
    this.dialog.setAttribute('aria-label', 'The Living Spellbook');
    document.body.append(this.dialog);
    this.hud.className = 'spell-hud'; this.status.className = 'spell-status';
    this.pickup.className = 'page-prompt'; this.toast.className = 'spell-toast';
    this.toast.setAttribute('role', 'status'); this.toast.setAttribute('aria-live', 'polite');
    this.hud.append(this.status, this.pickup, this.toast); container.append(this.hud);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', e => {
      if (e.code === 'Tab' && this.mode === 'wheel') { e.preventDefault(); this.commitWheel(); }
    });
    window.addEventListener('blur', () => { if (this.mode === 'wheel') this.close(false); });
    this.dialog.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
    this.dialog.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') this.close();
      if (action === 'prev') this.flip(-1);
      if (action === 'next') this.flip(1);
      if (action === 'equip') { this.player.spells.book.select(SPELL_PAGES[this.index].id); this.render(); }
      if (button.dataset.slot) { this.wheelIndex = Number(button.dataset.slot) - 1; this.commitWheel(); }
    });
    this.dialog.addEventListener('pointermove', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-slot]');
      if (this.mode === 'wheel' && button) this.highlight(Number(button.dataset.slot) - 1);
    });
  }
  get paused(): boolean { return this.mode !== null; }
  open(mode: 'book' | 'wheel'): void {
    if (!this.player.active || !this.player.combat.alive || this.mode) return;
    if (document.querySelector('dialog[open]')) return; // another menu (the map) is open
    this.mode = mode;
    this.index = SPELL_PAGES.findIndex(p => p.id === this.player.spells.book.selected);
    this.wheelIndex = this.index;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.input.blocked = true; this.input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.render(); this.dialog.showModal();
    this.dialog.querySelector<HTMLButtonElement>(mode === 'book' ? '[data-action="next"]' : '[aria-pressed="true"]')?.focus();
  }
  close(relock = true): void {
    if (!this.mode) return;
    this.mode = null; this.dialog.close(); this.input.clear(); this.input.blocked = false;
    this.previousFocus?.focus();
    if (relock) this.input.requestLock();
  }
  private flip(delta: number): void {
    this.index = (this.index + delta + SPELL_PAGES.length) % SPELL_PAGES.length;
    this.render();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.dialog.querySelector('.book-page')?.animate([
        { transform: `perspective(700px) rotateY(${delta * 8}deg)`, opacity: 0.65 },
        { transform: 'perspective(700px) rotateY(0deg)', opacity: 1 },
      ], { duration: 180, easing: 'ease-out' });
    }
    this.dialog.querySelector<HTMLButtonElement>(delta > 0 ? '[data-action="next"]' : '[data-action="prev"]')?.focus();
  }
  private highlight(index: number): void {
    if (!this.player.spells.book.has(SPELL_PAGES[index].id)) return;
    this.wheelIndex = index;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.slot) - 1 === index)));
    this.dialog.querySelector<HTMLButtonElement>(`[data-slot="${index + 1}"]`)?.focus();
    const label = this.dialog.querySelector('.wheel-current');
    if (label) label.textContent = SPELL_PAGES[index].name;
  }
  private commitWheel(): void {
    this.player.spells.book.select(SPELL_PAGES[this.wheelIndex].id); this.close();
  }
  private keyDown = (e: KeyboardEvent): void => {
    if (!this.mode) {
      if (!e.repeat && (e.code === 'KeyB' || e.code === 'Tab')) { e.preventDefault(); this.open(e.code === 'KeyB' ? 'book' : 'wheel'); }
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyB') { e.preventDefault(); if (!e.repeat) this.close(); return; }
    if (this.mode === 'wheel') {
      if (e.code === 'Tab') { e.preventDefault(); return; }
      const digit = /^Digit([1-8])$/.exec(e.code);
      if (digit) { e.preventDefault(); this.highlight(Number(digit[1]) - 1); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault(); const d = ['ArrowLeft', 'ArrowUp'].includes(e.code) ? -1 : 1;
        for (let step = 1; step <= 8; step++) {
          const index = (this.wheelIndex + d * step + 16) % 8;
          if (this.player.spells.book.has(SPELL_PAGES[index].id)) { this.highlight(index); break; }
        }
      }
      if (e.code === 'Enter') { e.preventDefault(); this.commitWheel(); }
    } else {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); this.flip(e.code === 'ArrowRight' ? 1 : -1); }
    }
  };
  private render(): void {
    const book = this.player.spells.book, page = SPELL_PAGES[this.index], owned = book.has(page.id);
    this.dialog.classList.toggle('wheel-mode', this.mode === 'wheel');
    if (this.mode === 'wheel') {
      this.dialog.innerHTML = `<div class="wheel-heading">Choose a spell <span>WORLD PAUSED</span></div>
        <div class="spell-wheel">${SPELL_PAGES.map((p, i) => `<button type="button" data-slot="${i + 1}" style="--slot:${i};--rune:#${p.color.toString(16)}" ${book.has(p.id) ? '' : 'disabled'} aria-pressed="${i === this.wheelIndex}" aria-label="${p.name}${book.has(p.id) ? '' : ', page missing'}"><span class="slot-number">${i + 1}</span><span class="wheel-glyph">${book.has(p.id) ? p.glyph : '·'}</span><span>${book.has(p.id) ? p.name : 'Lost page'}</span><small>${book.has(p.id) ? this.player.combat.momentum.costOf(p.cost) + ' Momentum' : 'Explore to discover'}</small></button>`).join('')}
          <div class="wheel-centre"><span>BOUND SPELL</span><strong class="wheel-current">${book.current.name}</strong><small>Release Tab to equip</small></div></div>
        <p class="wheel-help">Mouse or arrow keys to choose · 1–8 jump to a page · Esc cancels</p>`;
      return;
    }
    const equipped = book.selected === page.id;
    this.dialog.innerHTML = `<header class="book-header"><div><span>THE LIVING SPELLBOOK</span><p>${book.count} / 8 pages recovered · ${book.tierName} binding</p></div><button type="button" data-action="close" aria-label="Close spellbook">Close <kbd>B</kbd></button></header>
      <div class="book-spread" style="--rune:#${page.color.toString(16)}">
        <section class="book-illustration" aria-label="Page illustration"><span class="folio">FOLIO ${String(this.index + 1).padStart(2, '0')}</span><div class="sigil-frame ${owned ? '' : 'unfound'}"><span>${owned ? page.glyph : '?'}</span></div><blockquote>${owned ? page.lore : 'A space in the binding. A word still waiting to be found.'}</blockquote><span class="binding-mark">CHROMATIC ODYSSEY</span></section>
        <section class="book-page"><span class="page-school">${page.school} · ${owned ? 'Recovered' : 'Missing page'}</span><h1>${page.name}</h1><p class="spell-description">${owned ? page.description : 'This spell has not yet been bound into your book.'}</p>
          ${owned ? `<dl class="spell-stats"><div><dt>Momentum</dt><dd>${this.player.combat.momentum.costOf(page.cost)}${this.player.combat.momentum.resonance ? ' <small>Resonance</small>' : ''}</dd></div><div><dt>Recovery</dt><dd>${page.cooldown} s</dd></div></dl>` : ''}
          <div class="page-location"><span>${owned ? 'Found in the world' : 'Follow the trace'}</span><p>${page.hint}</p></div>
          <button type="button" data-action="equip" class="bind-spell" ${!owned || equipped ? 'disabled' : ''}>${!owned ? 'Find this page to unlock' : equipped ? 'Equipped · E to cast' : 'Equip this spell'}</button>
        </section></div>
      <footer class="book-footer"><button type="button" data-action="prev" aria-label="Previous page">← Previous</button><span>${this.index + 1} / 8 <small>· World paused</small></span><button type="button" data-action="next" aria-label="Next page">Next →</button></footer>`;
  }
  /** `prompt` is the world's use prompt (pages, shrines, lore, the Wanderer). */
  update(dt: number, prompt = ''): void {
    const spells = this.player.spells, combat = this.player.combat, page = spells.book.current;
    spells.messageTime = Math.max(0, spells.messageTime - dt);
    const remaining = spells.remaining(page.id);
    const cost = combat.momentum.costOf(page.cost);
    const text = `<span class="hud-glyph" style="color:#${page.color.toString(16)}">${page.glyph}</span><div><strong>${page.name}</strong><span>${remaining > 0 ? `Recovering ${remaining.toFixed(1)} s` : `${cost} Momentum · E cast`}</span><small>Hold Tab · choose spell &nbsp; B · read book</small>${combat.wardTime > 0 ? `<span class="ward-status">Ward ${combat.wardTime.toFixed(1)} s · damage halved</span>` : ''}</div>`;
    if (text !== this.lastHud) { this.status.innerHTML = text; this.lastHud = text; }
    this.status.classList.toggle('unaffordable', !combat.momentum.canAfford(page.cost));
    if (this.pickup.textContent !== prompt) this.pickup.textContent = prompt;
    this.pickup.hidden = !prompt || this.paused;
    const message = spells.messageTime > 0 ? spells.message : '';
    if (this.toast.textContent !== message) this.toast.textContent = message;
    this.toast.hidden = !message || this.paused;
  }
}
