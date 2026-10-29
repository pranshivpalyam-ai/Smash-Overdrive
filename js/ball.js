/**
 * ball.js — pure ball simulation. No Three.js.
 *
 * Balls fly in straight lines at constant speed and constant height. There is
 * no gravity and no floor bounce. The only things that change a ball's
 * velocity are the side walls (x is mirrored), the racquet, the Titanium Net
 * and the Laser Forehand.
 *
 * Wall collision is sphere-vs-plane with mirroring: after a move, any overshoot
 * past the wall is reflected back inside. Because the court is 10 wide and a
 * ball moves at most speedCeiling * maxDt = 1 unit per step, a ball can never
 * tunnel through a wall or hit both walls in one step.
 */
import { CONFIG } from './config.js';

export const BOUNCE_NONE = 0;
export const BOUNCE_LEFT = 1;
export const BOUNCE_RIGHT = 2;

/** Half-width available to a ball's centre. */
export function ballXLimit() {
  return CONFIG.court.halfWidth - CONFIG.ball.radius;
}

/**
 * Fold an unbounded x back into [-limit, limit] as if it had mirrored off the
 * walls any number of times. Used to predict where a ball will cross a z plane.
 */
export function foldX(x, limit) {
  const w = 2 * limit;
  let t = (x + limit) % (2 * w);
  if (t < 0) t += 2 * w;
  return (t <= w ? t : 2 * w - t) - limit;
}

/** Velocity for a given speed and angle (radians) from straight-on. dirZ = +1 toward the player. */
export function velocityFromAngle(speed, angle, dirZ = 1) {
  return { vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed * dirZ };
}

/** Random ±spread variation around a base speed. */
export function spreadSpeed(base, spread = CONFIG.ball.speedSpread, rng = Math.random) {
  return base * (1 + (rng() * 2 - 1) * spread);
}

export class Ball {
  constructor() {
    this.serial = 0;   // incremented on every spawn so renderers can detect reuse of a pool slot
    this.reset();
  }

  reset() {
    this.active = false;
    this.x = 0;
    this.y = CONFIG.ball.height;
    this.z = 0;
    this.prevX = 0;        // position before the last step, for swept collision tests
    this.prevZ = 0;
    this.scoreValue = 0;   // score banked when this ball reaches the far baseline
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.age = 0;          // seconds in flight
    this.bounces = 0;      // wall bounces so far
    this.returning = false;// true once hit back toward the far end
    this.cleanHit = false; // true if the return was a sweet-spot hit
    this.netHits = 0;      // Titanium Net deflections
    this.smashed = false;  // launched by a Smash (white streak, no further hits)
    this.magnetShift = 0;  // total lateral drift applied by Magnetised Grip
    this.magnetActive = false; // true on frames where Magnetised Grip moved this ball
  }

  /** Put the ball in flight. */
  spawn(x, z, vx, vz) {
    this.reset();
    this.active = true;
    this.serial++;
    this.x = this.prevX = x;
    this.z = this.prevZ = z;
    this.setVelocity(vx, vz);
  }

  setVelocity(vx, vz) {
    this.vx = vx;
    this.vz = vz;
    this.speed = Math.hypot(vx, vz);
    this.returning = vz < 0;
  }

  /** True while the ball is travelling toward the player. */
  get incoming() {
    return this.vz > 0;
  }

  /**
   * Advance by dt seconds. Returns BOUNCE_NONE, BOUNCE_LEFT or BOUNCE_RIGHT so
   * the caller can spawn wall effects.
   */
  step(dt) {
    if (!this.active) return BOUNCE_NONE;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.age += dt;
    const limit = ballXLimit();
    if (this.x > limit) {
      this.x = 2 * limit - this.x;
      this.vx = -Math.abs(this.vx);
      this.bounces++;
      return BOUNCE_RIGHT;
    }
    if (this.x < -limit) {
      this.x = -2 * limit - this.x;
      this.vx = Math.abs(this.vx);
      this.bounces++;
      return BOUNCE_LEFT;
    }
    return BOUNCE_NONE;
  }

  /** Seconds until the ball reaches the given z plane, or Infinity if it never will. */
  timeToZ(zPlane) {
    if (this.vz === 0) return Infinity;
    const t = (zPlane - this.z) / this.vz;
    return t >= 0 ? t : Infinity;
  }

  /** The x at which the ball will cross a z plane, accounting for wall bounces. */
  predictXAtZ(zPlane) {
    const t = this.timeToZ(zPlane);
    if (!Number.isFinite(t)) return this.x;
    return foldX(this.x + this.vx * t, ballXLimit());
  }
}
