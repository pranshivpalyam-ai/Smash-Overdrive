/**
 * overcharge.js — pure overcharge logic. No Three.js.
 *
 * Overcharges are single-level consumables chosen on the level select screen.
 * This module tracks which are active for the current level and applies their
 * rules to balls; their visuals live in fx.js.
 *
 *   titaniumNet     a 2-charge net behind the player that deflects balls back
 *   stickyClay      every ball moves at half speed for the whole level
 *   laserForehand   every hit fires a beam that destroys balls along its line
 *   multiballFrenzy every ball hit back splits into two; both count as returns
 *   magnetisedGrip  incoming balls drift toward the centre of the swing arc
 *   gripGlorify     each life left at level clear pays 5x grip
 */
import { CONFIG } from './config.js';

export const OVERCHARGE_IDS = ['titaniumNet', 'stickyClay', 'laserForehand', 'multiballFrenzy', 'magnetisedGrip', 'gripGlorify'];

export const OVERCHARGE_INFO = {
  titaniumNet: { name: 'Titanium Net', short: 'NET', icon: 'net', blurb: 'A 2-charge net behind you. Balls that would cost a life bounce back instead.' },
  stickyClay: { name: 'Sticky Clay', short: 'CLAY', icon: 'clay', blurb: 'Every ball moves at half speed for the whole level.' },
  laserForehand: { name: 'Laser Forehand', short: 'LASER', icon: 'laser', blurb: 'Every hit fires a beam that destroys balls in its path. Kills count as returns.' },
  multiballFrenzy: { name: 'Multiball Frenzy', short: 'MULTI', icon: 'multi', blurb: 'Every ball you hit back splits into two. Both count toward the level target.' },
  magnetisedGrip: { name: 'Magnetised Grip', short: 'MAGNET', icon: 'magnet', blurb: 'Incoming balls drift toward the middle of your swing. A nudge, not a guarantee.' },
  gripGlorify: { name: 'Grip Glorify', short: 'GLORY', icon: 'glory', blurb: 'Every life you have left at the end of the level pays 5x grip.' },
};

export class OverchargeState {
  /** @param {string[]} activeIds overcharge ids active for this level */
  constructor(activeIds = []) {
    this.active = new Set(activeIds);
    this.netCharges = this.has('titaniumNet') ? CONFIG.overcharges.titaniumNet.charges : 0;
  }

  has(id) {
    return this.active.has(id);
  }

  /** True while the net still has charges left. */
  get netActive() {
    return this.netCharges > 0;
  }

  /** Multiplier applied to ball simulation time. */
  ballTimeScale() {
    return this.has('stickyClay') ? CONFIG.overcharges.stickyClay.speedMultiplier : 1;
  }

  /** Multiplier on the grip paid per life remaining at level clear. */
  lifeGripMultiplier() {
    return this.has('gripGlorify') ? CONFIG.overcharges.gripGlorify.lifeMultiplier : 1;
  }

  /**
   * Sphere-vs-plane test against the net. If the ball's leading edge reaches
   * the net plane while travelling toward it, mirror it back down the court
   * at the boosted speed and spend a charge. Returns 0 (no contact),
   * 1 (deflected) or 2 (deflected and the net snapped).
   */
  netDeflect(ball) {
    if (!this.netActive || ball.vz <= 0) return 0;
    const net = CONFIG.overcharges.titaniumNet;
    const r = CONFIG.ball.radius;
    const edge = ball.z + r;
    if (edge < net.z) return 0;
    ball.z -= 2 * (edge - net.z);
    const m = net.speedMultiplier;
    ball.setVelocity(ball.vx * m, -Math.abs(ball.vz) * m);
    ball.netHits++;
    this.netCharges--;
    return this.netCharges > 0 ? 1 : 2;
  }

  /**
   * Collect every active ball within the laser radius of the beam from
   * (ox, oz) along (dx, dz), stopping at the far baseline. Results are pushed
   * to `out` (cleared first) so nothing is allocated per call.
   */
  laserTargets(ox, oz, dx, dz, balls, out) {
    out.length = 0;
    const len = Math.hypot(dx, dz);
    if (len === 0) return out;
    dx /= len;
    dz /= len;
    const reach = CONFIG.overcharges.laserForehand.radius + CONFIG.ball.radius;
    const farZ = CONFIG.ball.exitZ;
    for (const ball of balls) {
      if (!ball.active) continue;
      const rx = ball.x - ox;
      const rz = ball.z - oz;
      const t = rx * dx + rz * dz;
      if (t < 0 || ball.z < farZ) continue;
      const px = rx - t * dx;
      const pz = rz - t * dz;
      if (Math.hypot(px, pz) <= reach) out.push(ball);
    }
    return out;
  }

  /**
   * Magnetised Grip: drift an incoming ball's x toward `centreX` (the middle
   * of the swing arc) at a capped rate, up to a capped total per ball.
   * Returns the shift applied this step (0 when nothing happened).
   */
  magnetise(ball, centreX, dt) {
    if (!this.has('magnetisedGrip') || !ball.active || !ball.incoming) return 0;
    const m = CONFIG.overcharges.magnetisedGrip;
    if (ball.z < -m.range || ball.z > CONFIG.court.concedeZ) return 0;
    const budget = m.maxShift - ball.magnetShift;
    if (budget <= 0) return 0;
    const cap = Math.min(budget, m.pullSpeed * dt);
    const want = centreX - ball.x;
    const step = Math.max(-cap, Math.min(cap, want));
    if (step === 0) return 0;
    const limit = CONFIG.court.halfWidth - CONFIG.ball.radius;
    ball.x = Math.max(-limit, Math.min(limit, ball.x + step));
    ball.magnetShift += Math.abs(step);
    return step;
  }

  /**
   * Multiball Frenzy: velocity for the twin of a ball that has just been hit,
   * rotated splitAngleDeg away from the hit direction toward the centre of
   * the court (so the twin is less likely to hug a wall).
   */
  splitVelocity(ball) {
    const a = CONFIG.overcharges.multiballFrenzy.splitAngleDeg * Math.PI / 180;
    // the ball travels toward -z; a positive rotation about y turns it toward +x
    const sign = ball.x > 0 ? -1 : 1;
    const c = Math.cos(a), s = Math.sin(a) * sign;
    return { vx: ball.vx * c - ball.vz * s, vz: ball.vx * s + ball.vz * c };
  }
}
