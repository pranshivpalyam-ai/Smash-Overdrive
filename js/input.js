/**
 * input.js — keyboard and touch input. No Three.js.
 *
 * Keyboard: A/D or Left/Right move, Space or J swing, Esc pause.
 * Touch (via Pointer Events, so a mouse works the same way for testing):
 *   - drag anywhere on the lower half → the player tracks the finger's x
 *   - tap the upper half → swing
 *   - hold the left/right edge zones of the lower half → held arrows
 * Both methods are read together every frame and never conflict: keyboard
 * axis and held zones combine into `moveAxis`, and a touch drag provides an
 * absolute `dragTarget` (0..1 across the stage) that the player module turns
 * into a run using the same acceleration curve.
 */
import { CONFIG } from './config.js';

const LEFT_KEYS = new Set(['a', 'A', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['d', 'D', 'ArrowRight']);
const SWING_KEYS = new Set([' ', 'j', 'J']);
const PAUSE_KEYS = new Set(['Escape']);

export class Input {
  /** @param {HTMLElement} element the stage element that receives touches */
  constructor(element) {
    this.element = element;
    this.cfg = CONFIG.input;
    this.keyLeft = false;
    this.keyRight = false;
    this.zoneAxis = 0;        // -1, 0, 1 from the held on-screen arrow zones
    this.dragTarget = null;   // 0..1 across the stage width while dragging, else null
    this.swingQueued = false;
    this.pauseQueued = false;
    this.pointers = new Map(); // pointerId → { startX, startY, startTime, moved, mode }
    this.onAnyKey = null;      // optional hook for menus: called with the key name

    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);
    this._onPointerDown = (e) => this._pointerDown(e);
    this._onPointerMove = (e) => this._pointerMove(e);
    this._onPointerUp = (e) => this._pointerUp(e);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    element.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    window.addEventListener('blur', () => this.clear());
  }

  /** -1..1 combined lateral intent from keys and held zones. */
  get moveAxis() {
    const keys = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    return keys !== 0 ? keys : this.zoneAxis;
  }

  consumeSwing() {
    const s = this.swingQueued;
    this.swingQueued = false;
    return s;
  }

  consumePause() {
    const p = this.pauseQueued;
    this.pauseQueued = false;
    return p;
  }

  /** Drop all held state (focus loss, screen change). */
  clear() {
    this.keyLeft = this.keyRight = false;
    this.zoneAxis = 0;
    this.dragTarget = null;
    this.pointers.clear();
  }

  // ── keyboard ───────────────────────────────────────────────────────────────

  _keyDown(e) {
    if (LEFT_KEYS.has(e.key)) this.keyLeft = true;
    else if (RIGHT_KEYS.has(e.key)) this.keyRight = true;
    else if (SWING_KEYS.has(e.key)) { if (!e.repeat) this.swingQueued = true; }
    else if (PAUSE_KEYS.has(e.key)) { if (!e.repeat) this.pauseQueued = true; }
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    if (this.onAnyKey && !e.repeat) this.onAnyKey(e.key);
  }

  _keyUp(e) {
    if (LEFT_KEYS.has(e.key)) this.keyLeft = false;
    else if (RIGHT_KEYS.has(e.key)) this.keyRight = false;
  }

  // ── pointer / touch ────────────────────────────────────────────────────────

  _local(e) {
    const r = this.element.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  _pointerDown(e) {
    e.preventDefault();
    const p = this._local(e);
    let mode;
    if (p.y < this.cfg.touchZoneSplit) {
      mode = 'tap';
    } else if (p.x < this.cfg.arrowZoneWidth) {
      mode = 'zoneLeft';
      this.zoneAxis = -1;
    } else if (p.x > 1 - this.cfg.arrowZoneWidth) {
      mode = 'zoneRight';
      this.zoneAxis = 1;
    } else {
      mode = 'drag';
      this.dragTarget = p.x;
    }
    this.pointers.set(e.pointerId, { startX: e.clientX, startY: e.clientY, startTime: performance.now(), moved: false, mode });
  }

  _pointerMove(e) {
    const info = this.pointers.get(e.pointerId);
    if (!info) return;
    const dist = Math.hypot(e.clientX - info.startX, e.clientY - info.startY);
    if (dist > this.cfg.touchTapMaxMove) info.moved = true;
    if (info.mode === 'drag') this.dragTarget = this._local(e).x;
  }

  _pointerUp(e) {
    const info = this.pointers.get(e.pointerId);
    if (!info) return;
    this.pointers.delete(e.pointerId);
    if (info.mode === 'tap') {
      const quick = performance.now() - info.startTime <= this.cfg.touchTapMaxMs;
      if (quick && !info.moved) this.swingQueued = true;
    } else if (info.mode === 'drag') {
      this.dragTarget = null;
    } else {
      this.zoneAxis = 0;
    }
  }
}
