/**
 * camera.js — the third-person follow camera.
 *
 * The camera never rotates. It sits a fixed distance behind and above the
 * player, pitched down by a fixed angle, and only slides along x with damping.
 * A fixed orientation is what makes incoming ball angles readable.
 *
 * The render target is portrait, so the horizontal view is narrow. The camera
 * is therefore placed well back and high with a wide FOV (see CONFIG.camera)
 * so the full court width is on screen from roughly 8 units in front of the
 * player; balls should rarely need the off-screen arrows.
 *
 * Small effects, all tunable in CONFIG.camera:
 *   - roll: 1–2 degrees during fast lateral movement
 *   - kick: a short backward kick on a successful hit
 *   - shake: random jitter when a life is lost
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';

const DEG = Math.PI / 180;

export class FollowCamera {
  constructor() {
    this.cfg = CONFIG.camera;
    const r = CONFIG.render;
    this.camera = new THREE.PerspectiveCamera(this.cfg.fov, r.baseWidth / r.baseHeight, this.cfg.near, this.cfg.far);
    this.camera.rotation.order = 'XYZ';

    this.x = 0;              // damped follow position
    this.roll = 0;           // current roll in radians
    this.kick = 0;           // current backward kick offset
    this.shakeAmp = 0;       // current shake amplitude
    this.shakeX = 0;
    this.shakeY = 0;
    this.pitch = this.cfg.pitchDeg * DEG;
    this.xLimit = CONFIG.court.halfWidth - this.cfg.xMargin;
    this._apply();
  }

  /** Jump straight to an x position with no damping (level start, respawn). */
  snapTo(x) {
    this.x = this._clamp(x);
    this.roll = 0;
    this.kick = 0;
    this.shakeAmp = 0;
    this._apply();
  }

  /**
   * @param {number} dt              seconds since the last frame
   * @param {number} targetX         the player's x
   * @param {number} lateralFraction the player's velocity as a fraction of max speed, -1..1
   */
  update(dt, targetX, lateralFraction) {
    const frames = dt * 60;
    // damping is specified per frame at 60fps; convert to frame-rate independent
    const follow = 1 - Math.pow(1 - this.cfg.damping, frames);
    this.x += (this._clamp(targetX) - this.x) * follow;

    const targetRoll = -lateralFraction * this.cfg.rollDeg * DEG;
    const rollFollow = 1 - Math.pow(1 - this.cfg.rollDamping, frames);
    this.roll += (targetRoll - this.roll) * rollFollow;

    this.kick *= Math.exp(-this.cfg.kickReturn * dt);
    this.shakeAmp *= Math.exp(-this.cfg.shakeReturn * dt);
    if (this.shakeAmp > 0.001) {
      this.shakeX = (Math.random() * 2 - 1) * this.shakeAmp;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeAmp;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    this._apply();
  }

  /** Short backward kick — call on a successful hit. */
  kickBack(strength = 1) {
    this.kick = this.cfg.kickDistance * strength;
  }

  /** Random shake — call when a life is lost. */
  shake(strength = 1) {
    this.shakeAmp = this.cfg.shakeAmount * strength;
  }

  _clamp(x) {
    return Math.min(this.xLimit, Math.max(-this.xLimit, x));
  }

  _apply() {
    this.camera.position.set(this.x + this.shakeX, this.cfg.height + this.shakeY, this.cfg.back + this.kick);
    this.camera.rotation.set(-this.pitch, 0, this.roll);
  }
}
