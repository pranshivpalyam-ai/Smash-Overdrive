/**
 * screens.js — the app state table and every 2D screen except level select
 * and the shop (which have their own modules but are mounted from here).
 *
 * Backdrops: 'live' (title, over the idle 3D shot), 'static' (level select,
 * shop, settings from the title: the pixel-art backdrop) and 'frozen' (pause,
 * complete, failed: a blurred, dimmed frame of the court).
 */
import { CONFIG } from '../config.js';
import { el, panel, row, button, textCanvas, iconCanvas, setText, setButtonLabel, FocusRing, backdropDataUrl } from './pixelui.js';
import { buildLevelSelect } from './levelselect.js';
import { buildShop } from './shop.js';

export const STATE = Object.freeze({
  TITLE: 'title',
  LEVEL_SELECT: 'levelSelect',
  SHOP: 'shop',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETE: 'complete',
  FAILED: 'failed',
  SETTINGS: 'settings',
});

/** Allowed transitions. main.js refuses anything not listed here. */
export const TRANSITIONS = Object.freeze({
  [STATE.TITLE]: [STATE.LEVEL_SELECT, STATE.SHOP, STATE.SETTINGS],
  [STATE.LEVEL_SELECT]: [STATE.PLAYING, STATE.SHOP, STATE.TITLE],
  [STATE.SHOP]: [STATE.TITLE, STATE.LEVEL_SELECT],
  [STATE.PLAYING]: [STATE.PAUSED, STATE.COMPLETE, STATE.FAILED],
  [STATE.PAUSED]: [STATE.PLAYING, STATE.LEVEL_SELECT, STATE.SETTINGS],
  [STATE.COMPLETE]: [STATE.LEVEL_SELECT, STATE.SHOP],
  [STATE.FAILED]: [STATE.PLAYING, STATE.SHOP, STATE.LEVEL_SELECT],
  [STATE.SETTINGS]: [STATE.TITLE, STATE.PAUSED],
});

export class Screens {
  /**
   * @param {HTMLElement} root the #screens element
   * @param {object} ctx  { save, persist, audio, actions }
   */
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.focus = new FocusRing(root);
    this.current = null;
    this.timers = [];
    this.shop = null;
    this.onBack = null;
    this.modal = null;
    this.focusBeforeModal = null;
    this.backdropUrl = backdropDataUrl();
    this.root.hidden = true;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  hide() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.shop) { this.shop.dispose(); this.shop = null; }
    this.modal = null;
    this.focus.container = this.root;
    this.root.replaceChildren();
    this.root.hidden = true;
    this.root.className = '';
    this.current = null;
    this.onBack = null;
    this.focus.set(null);
  }

  _mount(name, element, backdrop, onBack) {
    this.hide();
    this.current = name;
    this.root.className = backdrop;
    this.root.style.backgroundImage = backdrop === 'static' ? `url(${this.backdropUrl})` : '';
    this.root.appendChild(element);
    this.root.hidden = false;
    this.onBack = onBack;
    this.focus.set(element._defaultFocus || null);
    this.focus.ensure();
  }

  /** Route a key press while a screen is up. Returns true if handled. */
  handleKey(key) {
    if (this.current === null) return false;
    if (key === 'Escape') {
      this.ctx.audio.play('click');
      if (this.modal) this.closeModal();
      else if (this.onBack) this.onBack();
      return true;
    }
    return this.focus.handleKey(key);
  }

  // ── modal popups ───────────────────────────────────────────────────────────

  /**
   * Show a small panel over the current screen. Keyboard focus is confined to
   * the popup until it closes; Escape closes it. `content` should contain at
   * least one button.
   */
  openModal(content) {
    this.closeModal();
    const backdrop = el('div', 'modal-backdrop', panel('modal', content));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.closeModal(); });
    this.root.appendChild(backdrop);
    this.modal = backdrop;
    this.focusBeforeModal = this.focus.current;
    this.focus.container = backdrop;
    this.focus.set(content._defaultFocus || backdrop.querySelector('.btn'));
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.focus.container = this.root;
    this.focus.set(this.focusBeforeModal);
    this.focus.ensure();
  }

  /** The keys and touch gestures, shown from the title screen. */
  showControls() {
    const line = (keys, what) => row('control-line', textCanvas(keys, { scale: 2, color: 13 }), textCanvas(what, { scale: 2, color: 4 }));
    const content = el('div', 'controls',
      textCanvas('CONTROLS', { scale: 4, color: 13, shadow: 17 }),
      line('A / D', 'MOVE LEFT / RIGHT'),
      line('LEFT / RIGHT', 'MOVE LEFT / RIGHT'),
      line('SPACE / J', 'SWING'),
      line('ESC', 'PAUSE'),
      line('SMASH BAR', 'FULL = NEXT HIT SMASHES'),
      el('div', 'divider'),
      textCanvas('TOUCH', { scale: 2, color: 5 }),
      line('DRAG LOWER HALF', 'MOVE'),
      line('TAP UPPER HALF', 'SWING'),
      line('HOLD BOTTOM CORNERS', 'MOVE'),
      button('CLOSE', () => this.closeModal(), { scale: 3, color: 13, cls: 'primary' }),
    );
    this.openModal(content);
  }

  _later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  // ── screens ────────────────────────────────────────────────────────────────

  showTitle() {
    const a = this.ctx.actions;
    const screen = el('div', 'screen title',
      el('div', 'title-big',
        textCanvas('SMASH', { scale: CONFIG.ui.titleScale, color: 13, shadow: 17 }),
        textCanvas('OVERDRIVE', { scale: CONFIG.ui.titleScale, color: 14, shadow: 17 }),
      ),
      textCanvas('3D TENNIS TOWER DEFENCE', { scale: 2, color: 21, shadow: 0 }),
      row('grip-line title-grip',
        iconCanvas('grip', 3),
        textCanvas(String(this.ctx.save.grip), { scale: 3, color: 14, shadow: 0 }),
        button('CONTROLS', () => this.showControls(), { scale: 2, cls: 'small' }),
      ),
      row('actions title-actions',
        button('PLAY', () => a.play(), { scale: 4, color: 13, cls: 'primary' }),
        button('SHOP', () => a.shop(), { scale: 3 }),
        button('SETTINGS', () => a.settings(), { scale: 3 }),
      ),
      el('div', 'build-stamp', textCanvas(`BUILD ${CONFIG.build}`, { scale: 2, color: 4, shadow: 0 })),
    );
    screen._defaultFocus = screen.querySelector('.primary');
    this._mount(STATE.TITLE, screen, 'live', null);
  }

  showLevelSelect(selectedLevel) {
    const a = this.ctx.actions;
    const screen = buildLevelSelect({
      save: this.ctx.save,
      selectedLevel,
      audio: this.ctx.audio,
      onStart: (level, ids) => a.start(level, ids),
      onShop: () => a.shop(),
      onBack: () => a.title(),
    });
    this._mount(STATE.LEVEL_SELECT, screen, 'static', () => a.title());
  }

  showShop() {
    const a = this.ctx.actions;
    this.shop = buildShop({
      save: this.ctx.save,
      persist: this.ctx.persist,
      audio: this.ctx.audio,
      onBack: () => a.back(),
      onCosmeticsChanged: () => a.cosmeticsChanged(),
      openModal: (content) => this.openModal(content),
      closeModal: () => this.closeModal(),
    });
    this._mount(STATE.SHOP, this.shop.element, 'static', () => a.back());
  }

  showPause(level) {
    const a = this.ctx.actions;
    const screen = el('div', 'screen pause',
      panel('menu',
        textCanvas('PAUSED', { scale: 5, color: 13, shadow: 17 }),
        textCanvas(`LEVEL ${level}`, { scale: 2, color: 4 }),
        button('RESUME', () => a.resume(), { scale: 3, color: 13, cls: 'primary wide' }),
        button('RETRY', () => a.retry(), { scale: 3, cls: 'wide' }),
        button('SETTINGS', () => a.settings(), { scale: 3, cls: 'wide' }),
        button('QUIT', () => a.quit(), { scale: 3, cls: 'wide' }),
      ),
    );
    screen._defaultFocus = screen.querySelector('.primary');
    this._mount(STATE.PAUSED, screen, 'frozen', () => a.resume());
  }

  /**
   * Level complete: stats, then the grip tally animates line by line and the
   * total counts up into the balance.
   */
  showComplete(results, payout) {
    const a = this.ctx.actions;
    const g = CONFIG.grip;
    const stat = (label, value, color = 5) => row('stat', textCanvas(label, { scale: 2, color: 4 }), textCanvas(String(value), { scale: 2, color }));
    const balanceBefore = this.ctx.save.grip - payout.total;
    const balance = textCanvas(String(balanceBefore), { scale: 3, color: 14, shadow: 0 });
    const tally = el('div', 'tally');

    const screen = el('div', 'screen complete',
      panel('menu',
        textCanvas(`LEVEL ${results.level} CLEAR`, { scale: 4, color: 13, shadow: 17 }),
        results.flawless ? el('div', 'badge', iconCanvas('star', 2), textCanvas('FLAWLESS', { scale: 2, color: 0 })) : null,
        stat('RETURNS', `${results.returns} / ${results.target}`),
        stat('CONCEDED', results.conceded, results.conceded ? 23 : 10),
        stat('CLEAN HITS', results.cleanHits, 13),
        stat('SMASHES', results.smashes || 0, 14),
        stat('LIVES LEFT', results.lives),
        stat('SCORE', results.score, 14),
        el('div', 'divider'),
        tally,
        row('grip-line', iconCanvas('grip', 3), balance),
        row('actions',
          button('SHOP', () => a.shop(), { scale: 3 }),
          button('CONTINUE', () => a.continue(), { scale: 3, color: 13, cls: 'primary' }),
        ),
      ),
    );
    screen._defaultFocus = screen.querySelector('.primary');
    this._mount(STATE.COMPLETE, screen, 'frozen', () => a.continue());

    // animated tally
    const line1 = textCanvas(`RETURNS ${payout.ballCount} X ${payout.ballRate}  +${payout.ballGrip}`, { scale: 2, color: 5 });
    const line2 = textCanvas(`LIVES ${payout.lives} X ${payout.lifeRate}  +${payout.lifeGrip}`, { scale: 2, color: 5 });
    const line3 = textCanvas(`TOTAL +${payout.total}`, { scale: 3, color: 14 });
    const step = g.tallyLineMs;
    this._later(() => tally.appendChild(line1), step);
    this._later(() => {
      tally.appendChild(line2);
      if (payout.lifeMultiplier > 1) tally.appendChild(textCanvas(`GRIP GLORIFY X${payout.lifeMultiplier}`, { scale: 1, color: 14 }));
    }, step * 2);
    this._later(() => {
      tally.appendChild(line3);
      const start = performance.now();
      const tick = () => {
        const f = Math.min(1, (performance.now() - start) / g.countUpMs);
        setText(balance, String(Math.round(balanceBefore + payout.total * f)));
        if (f < 1 && this.current === STATE.COMPLETE) requestAnimationFrame(tick);
      };
      tick();
    }, step * 3);
    if (payout.ballRate === 0) {
      this._later(() => tally.appendChild(textCanvas('REPLAY: LIFE BONUS ONLY', { scale: 1, color: 4 })), step);
    }
  }

  showFailed(results, payout) {
    const a = this.ctx.actions;
    const screen = el('div', 'screen failed',
      panel('menu',
        textCanvas(`LEVEL ${results.level} FAILED`, { scale: 4, color: 23, shadow: 17 }),
        row('stat', textCanvas('RETURNS', { scale: 2, color: 4 }), textCanvas(`${results.returns} / ${results.target}`, { scale: 2 })),
        row('stat', textCanvas('GRIP EARNED', { scale: 2, color: 4 }), row('', iconCanvas('grip', 2), textCanvas(`+${payout.total}`, { scale: 2, color: 14 }))),
        row('actions',
          button('LEVELS', () => a.quit(), { scale: 2 }),
          button('SHOP', () => a.shop(), { scale: 3 }),
          button('RETRY', () => a.retry(), { scale: 3, color: 13, cls: 'primary' }),
        ),
      ),
    );
    screen._defaultFocus = screen.querySelector('.primary');
    this._mount(STATE.FAILED, screen, 'frozen', () => a.quit());
  }

  showSettings(from) {
    const a = this.ctx.actions;
    const s = this.ctx.save.settings;
    const audioBtn = button(`AUDIO ${s.audio ? 'ON' : 'OFF'}`, () => {
      a.setAudio(!s.audio);
      setButtonLabel(audioBtn, `AUDIO ${s.audio ? 'ON' : 'OFF'}`);
    }, { scale: 3, cls: 'wide', icon: iconCanvas('sound', 2) });
    const scaleText = textCanvas(`RENDER SCALE ${s.renderScale.toFixed(1)}`, { scale: 2, color: 4 });
    const bump = (d) => {
      a.setRenderScale(Math.round(Math.min(1, Math.max(0.5, s.renderScale + d)) * 10) / 10);
      setText(scaleText, `RENDER SCALE ${s.renderScale.toFixed(1)}`);
    };
    const confirm = el('div', 'confirm');
    confirm.hidden = true;
    const resetBtn = button('RESET PROGRESS', () => { confirm.hidden = false; this.focus.set(confirm.querySelector('.btn')); }, { scale: 2, cls: 'wide danger' });
    confirm.append(
      textCanvas('ERASE ALL PROGRESS?', { scale: 2, color: 23 }),
      row('', button('CANCEL', () => { confirm.hidden = true; this.focus.set(resetBtn); }, { scale: 2 }),
        button('YES RESET', () => { a.resetProgress(); }, { scale: 2, cls: 'danger' })),
    );
    const screen = el('div', 'screen settings',
      panel('menu',
        textCanvas('SETTINGS', { scale: 5, color: 13, shadow: 17 }),
        audioBtn,
        scaleText,
        row('', button('-', () => bump(-0.1), { scale: 3 }), button('+', () => bump(0.1), { scale: 3 })),
        textCanvas('LOWER = CHUNKIER AND FASTER', { scale: 1, color: 3 }),
        resetBtn,
        confirm,
        button('BACK', () => a.back(), { scale: 3, cls: 'wide' }),
      ),
    );
    screen._defaultFocus = audioBtn;
    this._mount(STATE.SETTINGS, screen, from === STATE.PAUSED ? 'frozen' : 'static', () => a.back());
  }
}
