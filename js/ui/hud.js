/**
 * hud.js — the in-game HUD, DOM pixel art kept inside the top 12% of the
 * stage: returns progress (top-left), lives (top-centre), active overcharges
 * under the lives, combo and grip (top-right), plus the CLEAN HIT / SMASH
 * flashes, the white smash screen flash and the red vignette for a lost life.
 */
import { CONFIG } from '../config.js';
import { OVERCHARGE_INFO } from '../overcharge.js';
import { el, textCanvas, setText, iconCanvas } from './pixelui.js';

export class Hud {
  /** @param {HTMLElement} parent the #ui design-space element */
  constructor(parent) {
    const s = CONFIG.ui.hudTextScale;
    this.root = el('div', 'hud');
    this.root.hidden = true;

    this.returnsText = textCanvas('0 / 10', { scale: s, shadow: 0 });
    this.bar = el('div', 'hud-bar', el('div', 'hud-bar-fill'));
    this.barFill = this.bar.firstChild;
    this.left = el('div', 'hud-left', this.returnsText, this.bar);

    this.livesRow = el('div', 'hud-lives');
    this.overRow = el('div', 'hud-over');
    this.centre = el('div', 'hud-centre', this.livesRow, this.overRow);

    this.comboText = textCanvas('X1', { scale: s + 1, color: 14, shadow: 0 });
    this.gripText = textCanvas('0', { scale: s, color: 5, shadow: 0 });
    this.right = el('div', 'hud-right', this.comboText, el('div', 'hud-grip', iconCanvas('grip', 2), this.gripText));

    this.flash = el('div', 'hud-flash', textCanvas('CLEAN HIT', { scale: 5, color: 13, shadow: 17 }));
    this.flash.hidden = true;
    this.smashText = el('div', 'hud-flash hud-smash', textCanvas('SMASH READY', { scale: 4, color: 14, shadow: 17 }));
    this.smashText.hidden = true;
    this.whiteFlash = el('div', 'smash-flash');
    this.whiteFlash.style.animationDuration = `${CONFIG.smash.flashMs}ms`;
    this.vignette = el('div', 'vignette');
    this.debug = textCanvas('', { scale: 2, color: 4 });
    this.debug.className = 'px hud-debug';

    // faint markers for the held on-screen arrow zones (shown on coarse pointers only, see style.css)
    this.zones = el('div', 'touch-zones', el('div', 'touch-zone left'), el('div', 'touch-zone right'));
    this.root.append(this.left, this.centre, this.right, this.whiteFlash, this.flash, this.smashText, this.vignette, this.zones, this.debug);
    parent.appendChild(this.root);

    this.lifeIcons = [];
    this.netBadge = null;
    this.flashTimer = 0;
    this.smashTimer = 0;
    this.last = { returns: -1, combo: -1, grip: -1 };
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; }

  /** Reset for a new level. */
  setLevel(game, overchargeIds) {
    this.livesRow.replaceChildren();
    this.lifeIcons = [];
    for (let i = 0; i < CONFIG.lives.perLevel; i++) {
      const wrap = el('div', 'life', iconCanvas('ball', 3));
      this.livesRow.appendChild(wrap);
      this.lifeIcons.push(wrap);
    }
    this.overRow.replaceChildren();
    this.netBadge = null;
    for (const id of overchargeIds) {
      const chip = el('div', 'over-chip', iconCanvas(OVERCHARGE_INFO[id].icon, 2));
      chip.title = OVERCHARGE_INFO[id].name;
      if (id === 'titaniumNet') {
        this.netBadge = textCanvas(String(CONFIG.overcharges.titaniumNet.charges), { scale: 2, color: 13, shadow: 0 });
        chip.appendChild(this.netBadge);
      }
      this.overRow.appendChild(chip);
    }
    this.last = { returns: -1, combo: -1, grip: -1 };
    this.flash.hidden = true;
    this.smashText.hidden = true;
    this.whiteFlash.classList.remove('on');
    this.vignette.classList.remove('on');
    this.update(game, 0, 0);
  }

  /** @param {import('../game.js').Game} game */
  update(game, grip, dt) {
    if (game.returns !== this.last.returns) {
      this.last.returns = game.returns;
      setText(this.returnsText, `${game.returns} / ${game.target}`);
      this.barFill.style.width = `${Math.min(100, (game.returns / game.target) * 100)}%`;
    }
    const combo = game.comboMultiplier;
    if (combo !== this.last.combo) {
      this.last.combo = combo;
      setText(this.comboText, `X${combo}`);
      this.comboText.classList.toggle('hot', combo > 1);
    }
    if (grip !== this.last.grip) {
      this.last.grip = grip;
      setText(this.gripText, String(grip));
    }
    if (this.netBadge) setText(this.netBadge, String(game.overcharges.netCharges));
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.hidden = true;
    }
    if (this.smashTimer > 0) {
      this.smashTimer -= dt;
      if (this.smashTimer <= 0) this.smashText.hidden = true;
    }
  }

  /** Shatter the icon for the life just lost. */
  lifeLost(livesLeft) {
    const icon = this.lifeIcons[livesLeft];
    if (!icon || icon.classList.contains('lost')) return;
    icon.classList.add('lost');
    for (let i = 0; i < CONFIG.lives.iconShatterParticles; i++) {
      const shard = el('div', 'shard');
      const a = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 26;
      shard.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      shard.style.setProperty('--dy', `${Math.sin(a) * d + 20}px`);
      icon.appendChild(shard);
      setTimeout(() => shard.remove(), 650);
    }
    this.vignette.classList.remove('on');
    void this.vignette.offsetWidth; // restart the CSS animation
    this.vignette.classList.add('on');
  }

  cleanHit() {
    this.flash.hidden = false;
    this.flash.classList.remove('pop');
    void this.flash.offsetWidth;
    this.flash.classList.add('pop');
    this.flashTimer = CONFIG.ui.cleanHitFlashMs / 1000;
  }

  /** The meter just filled. */
  smashReady() {
    this._smashFlash('SMASH READY');
  }

  /** A smash just happened: text plus the white screen flash. */
  smash() {
    this._smashFlash('SMASH!');
    this.whiteFlash.classList.remove('on');
    void this.whiteFlash.offsetWidth;
    this.whiteFlash.classList.add('on');
  }

  _smashFlash(text) {
    setText(this.smashText.firstChild, text);
    this.smashText.hidden = false;
    this.smashText.classList.remove('pop');
    void this.smashText.offsetWidth;
    this.smashText.classList.add('pop');
    this.smashTimer = CONFIG.ui.cleanHitFlashMs / 1000;
  }

  setDebug(text) {
    setText(this.debug, text);
  }
}
