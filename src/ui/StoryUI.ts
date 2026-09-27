import { type Input, logicalCode } from '../core/Input';
import type { Progress } from '../core/Progress';
import { ARCS, LORE, type LoreFragment, MEMORIALS, REMEMBRANCES } from '../story/Lore';
import { roman } from '../world/biomes/Chapters';
import type { Shrine } from '../world/StoryProps';
import './story.css';

type Mode = 'reader' | 'rest' | 'journal';

export interface ReaderPage {
  kicker: string;
  title: string;
  text: string;
  /** The Wanderer speaks; tablets and memorials are read. */
  speaker?: string;
}

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * The story dialogs (Job 9): the lore reader (tablets, memorials, the Wanderer), the
 * Ember Shrine rest menu with fast travel, and the journal (J). A native modal dialog
 * pauses the world and keeps keyboard focus, like the spellbook and the map.
 */
export class StoryUI {
  readonly dialog = document.createElement('dialog');
  mode: Mode | null = null;
  /** Fast travel was chosen in the rest menu. */
  onTravel: (shrine: Shrine) => void = () => {};
  /** "Begin anew" confirmed. */
  onReset: () => void = () => {};
  /** Shrines the rest menu lists (kindled ones become travel targets). */
  shrines: () => Shrine[] = () => [];
  /** Journey summary line for the rest menu. */
  summary: () => string = () => '';
  private page: ReaderPage | null = null;
  private here: Shrine | null = null;
  private confirmReset = false;
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly input: Input, private readonly progress: Progress, private readonly canOpen: () => boolean) {
    this.dialog.className = 'story-dialog';
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
    this.dialog.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') this.close();
      if (action === 'travel') {
        const target = this.shrines().find(s => s.id === button.dataset.shrine);
        if (target) { this.close(); this.onTravel(target); }
      }
      if (action === 'reset') { this.confirmReset = true; this.render(); this.focus('[data-action="reset-confirm"]'); }
      if (action === 'reset-cancel') { this.confirmReset = false; this.render(); this.focus('[data-action="reset"]'); }
      if (action === 'reset-confirm') { this.close(false); this.onReset(); }
    });
    window.addEventListener('keydown', e => {
      if (logicalCode(e.code) !== 'KeyJ' || e.repeat) return;
      if (this.mode === 'journal') { e.preventDefault(); this.close(); return; }
      if (this.mode || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      this.openJournal();
    });
  }

  get paused(): boolean {
    return this.mode !== null;
  }

  read(page: ReaderPage): void {
    this.page = page;
    this.open('reader');
  }

  rest(shrine: Shrine): void {
    this.here = shrine;
    this.confirmReset = false;
    this.open('rest');
  }

  openJournal(): void {
    this.open('journal');
  }

  private open(mode: Mode): void {
    if (this.mode || !this.canOpen() || document.querySelector('dialog[open]')) return;
    this.mode = mode;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.input.blocked = true;
    this.input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
    this.dialog.showModal();
    this.focus('[data-action="close"]');
  }

  close(relock = true): void {
    if (!this.mode) return;
    this.mode = null;
    this.dialog.close();
    this.input.clear();
    this.input.blocked = false;
    this.previousFocus?.focus();
    if (relock) this.input.requestLock();
  }

  private focus(selector: string): void {
    this.dialog.querySelector<HTMLButtonElement>(selector)?.focus();
  }

  private render(): void {
    this.dialog.dataset.mode = this.mode ?? '';
    if (this.mode === 'reader') this.renderReader();
    else if (this.mode === 'rest') this.renderRest();
    else if (this.mode === 'journal') this.renderJournal();
  }

  private renderReader(): void {
    const p = this.page!;
    this.dialog.setAttribute('aria-label', p.title);
    this.dialog.innerHTML = `<article class="story-reader${p.speaker ? ' spoken' : ''}">
        <span class="story-kicker">${escape(p.kicker)}</span>
        <h1>${escape(p.title)}</h1>
        <p>${p.speaker ? '“' : ''}${escape(p.text)}${p.speaker ? '”' : ''}</p>
        ${p.speaker ? `<cite>— ${escape(p.speaker)}</cite>` : ''}
      </article>
      <footer class="story-footer"><small>World paused · J opens the journal</small><button type="button" data-action="close">Continue <kbd>Esc</kbd></button></footer>`;
  }

  private renderRest(): void {
    const here = this.here!;
    const all = this.shrines();
    const kindled = all.filter(s => s.prop.kindled);
    const byChapter = new Map<number, Shrine[]>();
    for (const s of kindled) byChapter.set(s.chapter, [...(byChapter.get(s.chapter) ?? []), s]);
    const groups = [...byChapter.keys()].sort((a, b) => a - b).map(ch => {
      const list = byChapter.get(ch)!.map(s => `<li><button type="button" data-action="travel" data-shrine="${s.id}" ${s === here ? 'disabled aria-current="true"' : ''}>${escape(s.name)}${s === here ? ' <small>you are here</small>' : ''}</button></li>`).join('');
      return `<section><h2>Chapter ${roman(ch)}</h2><ul>${list}</ul></section>`;
    }).join('');
    const reset = this.confirmReset
      ? `<div class="story-reset" role="alert"><p>Forget everything and wake again in Hollowmere? This cannot be undone.</p><button type="button" data-action="reset-confirm">Yes, begin anew</button><button type="button" data-action="reset-cancel">Keep my journey</button></div>`
      : `<button type="button" class="story-quiet" data-action="reset">Begin anew…</button>`;
    this.dialog.setAttribute('aria-label', `Ember Shrine: ${here.name}`);
    this.dialog.innerHTML = `<header class="story-header"><div><span>EMBER SHRINE</span><h1>${escape(here.name)}</h1><p>Wounds mended · Journey saved · You will wake here</p></div><button type="button" data-action="close">Rise <kbd>Esc</kbd></button></header>
      <div class="story-rest">
        <div class="story-travel"><h2 class="story-sub">Travel to a kindled shrine <small>${kindled.length} / ${all.length}</small></h2>${groups}</div>
        <aside><p class="story-summary">${escape(this.summary())}</p>${reset}</aside>
      </div>`;
  }

  private renderJournal(): void {
    const pr = this.progress;
    const chapters = new Set<number>();
    for (const id of pr.discovered) { const m = /^c(\d+)-/.exec(id); if (m) chapters.add(Number(m[1])); }
    const fragments: LoreFragment[] = [...Object.values(LORE), ...Object.values(MEMORIALS)];
    const arcs = ARCS.filter(a => chapters.has(a.chapter)).map(a => {
      const found = fragments.filter(f => f.chapter === a.chapter);
      const read = found.filter(f => pr.lore.has(f.id));
      const items = found.map(f => pr.lore.has(f.id)
        ? `<li><strong>${escape(f.title)}</strong><p>${escape(f.text)}</p></li>`
        : '<li class="missing"><strong>An unread fragment</strong></li>').join('');
      return `<section class="journal-arc"><h2>${a.chapter ? `${roman(a.chapter)} · ` : ''}${escape(a.title)} <small>${read.length} / ${found.length} read</small></h2><p class="arc-text">${escape(a.text)}</p><ul>${items}</ul></section>`;
    }).join('');
    const rems = REMEMBRANCES.filter(r => pr.remembrances.has(r.id))
      .map(r => `<li><strong>${escape(r.name)}</strong><p>${escape(r.text)}</p></li>`).join('');
    const total = fragments.length;
    const readCount = fragments.filter(f => pr.lore.has(f.id)).length;
    this.dialog.setAttribute('aria-label', 'Journal');
    this.dialog.innerHTML = `<header class="story-header"><div><span>JOURNAL</span><h1>The Long Night</h1><p>${readCount} / ${total} fragments read · ${pr.remembrances.size} / ${REMEMBRANCES.length} remembrances · World paused</p></div><button type="button" data-action="close">Close <kbd>J</kbd></button></header>
      <div class="story-journal">${arcs}
        <section class="journal-arc remembrances"><h2>Remembrances</h2>${rems ? `<ul>${rems}</ul>` : '<p class="arc-text">What great foes leave behind when they fall.</p>'}</section>
      </div>`;
  }
}
