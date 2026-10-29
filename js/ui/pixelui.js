/**
 * pixelui.js — the 2D pixel-art toolkit: a hand-drawn 5x7 bitmap font, text
 * and icon canvases, DOM widget helpers and keyboard focus handling.
 *
 * All UI is laid out in a fixed 480x854 design space (#ui) that main.js scales
 * to the stage, so every size here is in design pixels.
 */
import { PALETTE } from '../config.js';

export const GLYPH_W = 5;
export const GLYPH_H = 7;

// Each glyph: 7 rows of 5 characters, '#' = pixel on.
const RAW = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '%': ['##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
};

/** Glyph rows for a character; lowercase maps to uppercase, unknown to '?'. */
function glyph(ch) {
  const key = ch.toUpperCase();
  return RAW[key] || RAW['?'];
}

// ── canvases ─────────────────────────────────────────────────────────────────

/** Width in design pixels of a string at a given scale. */
export function measureText(str, scale = 3, spacing = 1) {
  if (!str.length) return 0;
  return (str.length * GLYPH_W + (str.length - 1) * spacing) * scale;
}

/** Draw text onto a 2D context with the top-left at (x, y). */
export function drawText(ctx, str, x, y, scale = 3, color = PALETTE[5], spacing = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of str) {
    const rows = glyph(ch);
    for (let r = 0; r < GLYPH_H; r++) {
      const row = rows[r];
      for (let c = 0; c < GLYPH_W; c++) {
        if (row[c] === '#') ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += (GLYPH_W + spacing) * scale;
  }
}

/**
 * Render a string to a canvas element. Options: scale, color (palette index),
 * shadow (palette index or null) for a hard drop shadow, spacing.
 */
export function textCanvas(str, { scale = 3, color = 5, shadow = null, spacing = 1 } = {}) {
  const w = Math.max(1, measureText(str, scale, spacing) + (shadow !== null ? scale : 0));
  const h = GLYPH_H * scale + (shadow !== null ? scale : 0);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (shadow !== null) drawText(ctx, str, scale, scale, scale, PALETTE[shadow], spacing);
  drawText(ctx, str, 0, 0, scale, PALETTE[color], spacing);
  canvas.className = 'px';
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas._px = { str, scale, color, shadow, spacing };
  return canvas;
}

/** Re-render an existing text canvas with a new string (no-op if unchanged). */
export function setText(canvas, str) {
  const o = canvas._px;
  if (o.str === str) return;
  const fresh = textCanvas(str, o);
  canvas.width = fresh.width;
  canvas.height = fresh.height;
  canvas.style.width = fresh.style.width;
  canvas.style.height = fresh.style.height;
  canvas.getContext('2d').drawImage(fresh, 0, 0);
  canvas._px.str = str;
}

// ── icons ────────────────────────────────────────────────────────────────────

// 8x8 sprites. Letters map to palette indices via the legend; '.' is transparent.
const LEGEND = { y: 11, w: 5, d: 12, g: 14, k: 1, s: 4, o: 16, r: 15, c: 22, l: 10, b: 19, e: 23 };
const SPRITES = {
  ball: ['..yyyy..', '.yywyyy.', 'yywyyyyy', 'ywyyyyyd', 'ywyyyydd', 'yywyyydd', '.yyyddd.', '..dddd..'],
  grip: ['..kkkk..', '.kggggk.', 'kggkkggk', 'kgk..kgk', 'kgk..kgk', 'kggkkggk', '.kggggk.', '..kkkk..'],
  net: ['ssssssss', 's.s.s.s.', 'ssssssss', '.s.s.s.s', 'ssssssss', 's.s.s.s.', 'ssssssss', '.s.s.s.s'],
  clay: ['........', '...oo...', '..oroo..', '.orrroo.', 'oorrrooo', '.ooooo..', '..oooo..', '........'],
  laser: ['.......c', '......cw', '.....cwc', '....cwc.', '...cwc..', '..cwc...', '.cwc....', 'cwc.....'],
  lock: ['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kkgkkgkk', 'kkkggkkk', 'kkkkkkkk', '.kkkkkk.'],
  star: ['...gg...', '...gg...', '..gggg..', 'gggggggg', '.gggggg.', '..gggg..', '.gg..gg.', 'gg....gg'],
  tick: ['.......l', '......ll', '.....ll.', 'l...ll..', 'll.ll...', '.llll...', '..ll....', '........'],
  heart: ['.ee..ee.', 'eeeeeeee', 'eeeeeeee', 'eeeeeeee', '.eeeeee.', '..eeee..', '...ee...', '........'],
  sound: ['...b....', '..bb....', 'bbbb.b..', 'bbbb..b.', 'bbbb..b.', 'bbbb.b..', '..bb....', '...b....'],
  multi: ['yyy.....', 'ywyy....', 'yyyd....', '.yd.....', '.....yyy', '....ywyy', '....yyyd', '.....yd.'],
  magnet: ['.ss..ss.', '.ee..ee.', '.ee..ee.', '.ee..ee.', '.ee..ee.', '.eeeeee.', '..eeee..', '........'],
  glory: ['g......g', '..kkkk..', '.kggggk.', 'kggkkggk', 'kgk..kgk', 'kggkkggk', '.kggggk.', 'g.kkkk.g'],
};

export function iconCanvas(name, scale = 3) {
  const rows = SPRITES[name];
  const canvas = document.createElement('canvas');
  canvas.width = 8 * scale;
  canvas.height = 8 * scale;
  const ctx = canvas.getContext('2d');
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = PALETTE[LEGEND[ch]];
      ctx.fillRect(c * scale, r * scale, scale, scale);
    }
  }
  canvas.className = 'px icon';
  canvas.style.width = `${8 * scale}px`;
  canvas.style.height = `${8 * scale}px`;
  return canvas;
}

/** A solid colour swatch canvas with a dark border (cosmetic options). */
export function swatchCanvas(paletteIndex, size = 24) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PALETTE[0];
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = PALETTE[paletteIndex];
  ctx.fillRect(3, 3, size - 6, size - 6);
  canvas.className = 'px';
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  return canvas;
}

/** Static pixel-art backdrop for the title and shop: the court seen from the stands. */
export function backdropDataUrl() {
  const w = 96, h = 171;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const fill = (i, x, y, ww, hh) => { ctx.fillStyle = PALETTE[i]; ctx.fillRect(x, y, ww, hh); };
  fill(18, 0, 0, w, 40);
  fill(19, 0, 40, w, 20);
  fill(20, 0, 60, w, 14);
  fill(21, 0, 74, w, 6);
  // stands
  fill(1, 0, 80, w, 10);
  fill(2, 0, 90, w, 6);
  for (let x = 2; x < w; x += 5) { fill([3, 23, 5, 14][(x / 5) % 4 | 0], x, 82, 2, 2); fill([5, 3, 19][(x / 5) % 3 | 0], x + 1, 92, 2, 2); }
  // court
  fill(7, 0, 96, w, h - 96);
  fill(8, 12, 100, 72, 66);
  for (let y = 100; y < 166; y += 8) fill(9, 12, y, 72, 4);
  fill(16, 8, 100, 4, 66);
  fill(16, 84, 100, 4, 66);
  fill(5, 14, 102, 68, 2);
  fill(5, 14, 162, 68, 2);
  fill(5, 14, 131, 68, 1);
  fill(5, 14, 102, 2, 62);
  fill(5, 80, 102, 2, 62);
  fill(11, 40, 120, 3, 3);
  fill(11, 60, 145, 3, 3);
  fill(11, 30, 152, 3, 3);
  return canvas.toDataURL();
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

export function el(tag, className = '', ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const panel = (cls, ...children) => el('div', `panel ${cls}`, ...children);
export const row = (cls, ...children) => el('div', `row ${cls}`, ...children);

/**
 * A pixel button. Activation goes through `activate(btn)` so keyboard and
 * pointer share one path. Options: scale, color, cls, icon (canvas).
 */
export function button(label, onActivate, { scale = 3, color = 5, cls = '', icon = null } = {}) {
  const btn = el('div', `btn ${cls}`, icon, textCanvas(label, { scale, color, shadow: 0 }));
  btn.dataset.label = label;
  btn._activate = onActivate;
  btn.addEventListener('click', (e) => { e.stopPropagation(); activate(btn); });
  return btn;
}

export function setButtonLabel(btn, label) {
  const canvas = btn.querySelector('canvas:not(.icon)');
  if (canvas) setText(canvas, label);
  btn.dataset.label = label;
}

export function setDisabled(btn, disabled) {
  btn.classList.toggle('disabled', disabled);
}

export function activate(btn) {
  if (btn.classList.contains('disabled')) return;
  if (btn._activate) btn._activate(btn);
}

/**
 * Keyboard focus for one screen: arrow keys move between buttons spatially,
 * Enter/Space activates. Touch/mouse clicks bypass it entirely.
 */
export class FocusRing {
  constructor(container) {
    this.container = container;
    this.current = null;
  }

  buttons() {
    return [...this.container.querySelectorAll('.btn')].filter((b) => !b.classList.contains('disabled') && b.offsetParent !== null);
  }

  set(btn) {
    if (this.current) this.current.classList.remove('focus');
    this.current = btn;
    if (btn) btn.classList.add('focus');
  }

  /** Focus the first button if nothing is focused. */
  ensure() {
    const list = this.buttons();
    if (!list.length) { this.set(null); return; }
    if (!this.current || !list.includes(this.current)) this.set(list[0]);
  }

  /** Move focus in a direction (dx, dy ∈ -1, 0, 1) to the nearest button that way. */
  move(dx, dy) {
    this.ensure();
    if (!this.current) return;
    const from = this.current.getBoundingClientRect();
    const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
    let best = null, bestScore = Infinity;
    for (const b of this.buttons()) {
      if (b === this.current) continue;
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ox = cx - fx, oy = cy - fy;
      const along = ox * dx + oy * dy;
      if (along <= 1) continue;
      const across = Math.abs(ox * dy) + Math.abs(oy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (best) this.set(best);
  }

  activate() {
    this.ensure();
    if (this.current) activate(this.current);
  }

  /** Route a key. Returns true if handled. */
  handleKey(key) {
    switch (key) {
      case 'ArrowLeft': case 'a': case 'A': this.move(-1, 0); return true;
      case 'ArrowRight': case 'd': case 'D': this.move(1, 0); return true;
      case 'ArrowUp': case 'w': case 'W': this.move(0, -1); return true;
      case 'ArrowDown': case 's': case 'S': this.move(0, 1); return true;
      case 'Enter': case ' ': case 'j': case 'J': this.activate(); return true;
      default: return false;
    }
  }
}
