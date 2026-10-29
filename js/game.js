/**
 * game.js — the level runtime. Pure logic, no Three.js.
 *
 * Owns the ball pool, the player's lateral movement and swing, lives, returns,
 * score and combo, hit-stop, and the overcharge rules. Everything the
 * presentation layer needs to know about (hits, bounces, lost lives, ...) is
 * pushed to `events` and drained by the caller each frame.
 *
 * Update order per frame: player movement → spawner → balls move (walls, net,
 * concede, far-baseline return) → Magnetised Grip drift → swing hit test
 * against the moved balls.
 *
 * Smash meter: every racquet contact fills `smash` (regular / clean amounts in
 * CONFIG.smash). Once full, the next contact is a Smash: the hit ball and every
 * other ball on court are launched straight down the court at smash speed.
 */
import { CONFIG } from './config.js';
import { Ball, BOUNCE_NONE } from './ball.js';
import { LevelSpawner } from './level.js';
import { OverchargeState } from './overcharge.js';

const DEG = Math.PI / 180;
const HANDLE_SAMPLES = 4;   // points along the racquet handle tested each frame (head → body end)

export const GameState = Object.freeze({ PLAYING: 'playing', COMPLETE: 'complete', FAILED: 'failed' });

/** Event types pushed to Game.events. */
export const EV = Object.freeze({
  SPAWN: 'spawn',
  WALL_BOUNCE: 'wallBounce',
  HIT: 'hit',
  WHIFF: 'whiff',
  RETURNED: 'returned',
  CONCEDED: 'conceded',
  LIFE_LOST: 'lifeLost',
  NET_HIT: 'netHit',
  NET_BREAK: 'netBreak',
  LASER: 'laser',
  LASER_KILL: 'laserKill',
  SPLIT: 'split',
  SMASH_READY: 'smashReady',
  SMASH: 'smash',
  FLOURISH: 'flourish',
  LEVEL_COMPLETE: 'levelComplete',
  LEVEL_FAILED: 'levelFailed',
});

export class Game {
  /**
   * @param {number} level 1-based level number
   * @param {string[]} activeOvercharges overcharge ids consumed for this level
   */
  constructor(level, activeOvercharges = []) {
    this.level = level;
    this.target = CONFIG.levels.returnTarget(level);
    this.balls = Array.from({ length: CONFIG.ball.maxBalls }, () => new Ball());
    this.spawner = new LevelSpawner(level);
    this.overcharges = new OverchargeState(activeOvercharges);

    const s = CONFIG.swing;
    this.player = {
      x: 0,
      vx: 0,
      swingElapsed: -1,       // seconds into the swing, -1 when not swinging
      swingProgress: 0,       // 0..1 while swinging
      cooldown: 0,            // seconds of cooldown left after a swing
      hitThisSwing: false,
      headX: 0, headY: s.headHeight, headZ: 0,          // racquet head this frame
      prevHeadX: 0, prevHeadY: s.headHeight, prevHeadZ: 0, // racquet head last frame
      prevX: 0,               // player x last frame (the body end of the hit capsule)
    };

    this.lives = CONFIG.lives.perLevel;
    this.returns = 0;
    this.conceded = 0;
    this.cleanHits = 0;
    this.hits = 0;
    this.score = 0;
    this.combo = 0;           // consecutive hits without a whiff

    this.smash = 0;           // smash meter, 0..1
    this.smashReady = false;  // true once the meter is full; the next hit smashes
    this.smashes = 0;         // smashes performed this level

    this.hitStop = 0;         // seconds of freeze left after a lost life
    this.grace = 0;           // seconds of post-hit-stop invulnerability left
    this.slowmo = 0;          // seconds of hit slowdown left
    this.elapsed = 0;
    this.state = GameState.PLAYING;
    this.events = [];
    this._laserOut = [];
  }

  // ── queries ────────────────────────────────────────────────────────────────

  get comboMultiplier() {
    const sc = CONFIG.score;
    return Math.min(sc.comboMax, 1 + Math.floor(this.combo / sc.comboStep));
  }

  get frozen() {
    return this.hitStop > 0;
  }

  activeBallCount() {
    let n = 0;
    for (const b of this.balls) if (b.active) n++;
    return n;
  }

  /** Returns still needed that no ball in flight could provide. */
  owed() {
    return this.target - this.returns - this.activeBallCount();
  }

  results() {
    return {
      level: this.level,
      target: this.target,
      returns: this.returns,
      conceded: this.conceded,
      cleanHits: this.cleanHits,
      lives: this.lives,
      score: this.score,
      smashes: this.smashes,
      flawless: this.conceded === 0,
      failed: this.state === GameState.FAILED,
      lifeGripMultiplier: this.overcharges.lifeGripMultiplier(),
    };
  }

  emit(type, data) {
    data.type = type;
    this.events.push(data);
  }

  // ── spawning ───────────────────────────────────────────────────────────────

  spawnBall(x, vx, vz) {
    const ball = this.balls.find((b) => !b.active);
    if (!ball) return null;
    ball.spawn(x, CONFIG.ball.spawnZ, vx, vz);
    this.emit(EV.SPAWN, { x, z: CONFIG.ball.spawnZ });
    return ball;
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  /**
   * @param {number} dt seconds (already clamped by the caller)
   * @param {{axis:number, dragTarget:number|null, swing:boolean}} input
   */
  update(dt, input) {
    if (this.state !== GameState.PLAYING) return;
    this.elapsed += dt;

    let simDt = dt;
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      simDt = dt * CONFIG.swing.slowmoScale;
    }
    const frozen = this.frozen;
    if (frozen) {
      this.hitStop -= dt;
      if (this.hitStop <= 0) this.grace = CONFIG.lives.graceMs / 1000;
    } else if (this.grace > 0) {
      this.grace -= dt;
    }

    this._movePlayer(simDt, input);
    if (!frozen) {
      this.spawner.update(simDt, this);
      this._moveBalls(simDt);
      if (this.state !== GameState.PLAYING) return;
      this._magnetise(simDt);
    }
    this._swing(simDt, input.swing && !frozen);
  }

  _movePlayer(dt, input) {
    const p = CONFIG.player;
    const pl = this.player;
    const limit = CONFIG.court.halfWidth - p.edgeInset;
    let axis = input.axis;
    if (axis === 0 && input.dragTarget !== null) {
      const targetX = (input.dragTarget * 2 - 1) * limit;
      const diff = targetX - pl.x;
      if (Math.abs(diff) > p.touchDeadZone) axis = Math.sign(diff);
    }
    const accel = p.maxSpeed / p.accelTime;
    const friction = p.maxSpeed / p.frictionTime;
    pl.prevX = pl.x;
    if (axis !== 0) {
      pl.vx = Math.max(-p.maxSpeed, Math.min(p.maxSpeed, pl.vx + axis * accel * dt));
    } else if (pl.vx !== 0) {
      const drop = friction * dt;
      pl.vx = Math.abs(pl.vx) <= drop ? 0 : pl.vx - Math.sign(pl.vx) * drop;
    }
    pl.x += pl.vx * dt;
    if (pl.x > limit) { pl.x = limit; pl.vx = 0; }
    if (pl.x < -limit) { pl.x = -limit; pl.vx = 0; }
  }

  _moveBalls(dt) {
    const c = CONFIG.court;
    const scale = this.overcharges.ballTimeScale();
    for (const ball of this.balls) {
      if (!ball.active) continue;
      const bounce = ball.step(dt * scale);
      if (bounce !== BOUNCE_NONE) {
        this.emit(EV.WALL_BOUNCE, { x: ball.x, y: ball.y, z: ball.z, side: bounce });
      }
      if (ball.vz > 0) {
        const net = this.overcharges.netDeflect(ball);
        if (net === 1) {
          this.emit(EV.NET_HIT, { x: ball.x, y: ball.y, z: ball.z, charges: this.overcharges.netCharges });
        } else if (net === 2) {
          this.emit(EV.NET_BREAK, { x: ball.x, y: ball.y, z: ball.z });
        } else if (ball.z > c.concedeZ && !this.overcharges.netActive) {
          // (with the net up, the net plane behind the baseline is the boundary instead)
          if (this.grace > 0) ball.active = false;
          else this._concede(ball);
          if (this.state !== GameState.PLAYING) return;
        }
      } else if (ball.z < CONFIG.ball.exitZ) {
        this._returned(ball, 'far');
        if (this.state !== GameState.PLAYING) return;
      }
    }
  }

  /** Magnetised Grip: drift incoming balls toward the centre of the swing arc. */
  _magnetise(dt) {
    const pull = this.overcharges.has('magnetisedGrip');
    for (const ball of this.balls) {
      ball.magnetActive = pull && this.overcharges.magnetise(ball, this.player.x, dt) !== 0;
    }
  }

  // ── swing ──────────────────────────────────────────────────────────────────

  /** Racquet head position for swing progress p (0..1), written into out. */
  headAt(p, out) {
    const s = CONFIG.swing;
    const theta = (s.arcStartDeg + (s.arcEndDeg - s.arcStartDeg) * p) * DEG;
    out.x = this.player.x + s.reach * Math.cos(theta);
    out.y = s.headHeight;
    out.z = -s.reach * Math.sin(theta);
    return out;
  }

  _swing(dt, wantSwing) {
    const s = CONFIG.swing;
    const pl = this.player;
    if (pl.cooldown > 0) pl.cooldown -= dt;

    if (pl.swingElapsed < 0) {
      if (wantSwing && pl.cooldown <= 0) {
        pl.swingElapsed = 0;
        pl.hitThisSwing = false;
        this._setHead(this.headAt(0, _tmp));
      } else {
        // resting position: head at the arc start, following the player
        this._setHead(this.headAt(0, _tmp));
        pl.prevHeadX = pl.headX; pl.prevHeadY = pl.headY; pl.prevHeadZ = pl.headZ;
        pl.swingProgress = 0;
        return;
      }
    }

    pl.prevHeadX = pl.headX; pl.prevHeadY = pl.headY; pl.prevHeadZ = pl.headZ;
    pl.swingElapsed += dt;
    const p = Math.min(1, pl.swingElapsed / (s.durationMs / 1000));
    pl.swingProgress = p;
    this._setHead(this.headAt(p, _tmp));

    if (p >= s.activeStart && p <= s.activeEnd) this._hitTest();

    if (p >= 1) {
      pl.swingElapsed = -1;
      pl.cooldown = s.cooldownMs / 1000;
      if (!pl.hitThisSwing) {
        this.combo = 0;
        this.emit(EV.WHIFF, {});
      }
    }
  }

  _setHead(v) {
    const pl = this.player;
    pl.headX = v.x; pl.headY = v.y; pl.headZ = v.z;
  }

  /**
   * Swept hit test. The hit volume is a capsule from the racquet head back
   * along the handle toward the shoulder (CONFIG.swing.bodyExtend of the way),
   * tapering from hitRadius at the head to bodyExtendRadius at the body end.
   * It is sampled at a few points along the handle; each sample's path over
   * this frame is tested against the ball's path over the same frame, in the
   * ball's frame of reference, so neither a fast racquet nor a fast ball can
   * tunnel through the other.
   *
   * Clean Hits and the return angle are always judged from the head sample, so
   * the sweet spot stays on the racquet even though the volume reaches inward.
   */
  _hitTest() {
    const s = CONFIG.swing;
    const pl = this.player;
    const ballR = CONFIG.ball.radius;
    const samples = HANDLE_SAMPLES;
    for (const ball of this.balls) {
      if (!ball.active || ball.returning) continue;
      let best = Infinity;        // closest approach over all samples, minus that sample's radius
      let headDist = Infinity;    // closest approach of the head sample
      let headLateral = 0;        // ball offset from the head along x at the head's closest approach
      for (let i = 0; i < samples; i++) {
        const f = (i / (samples - 1)) * s.bodyExtend;   // 0 = head, bodyExtend = body end
        const radius = s.hitRadius + (s.bodyExtendRadius - s.hitRadius) * (f / s.bodyExtend) + ballR;
        // sample point = head + f * (shoulder - head), shoulder = (player.x, headHeight, 0)
        const pX = pl.prevHeadX + f * (pl.prevX - pl.prevHeadX);
        const pY = pl.prevHeadY + f * (s.headHeight - pl.prevHeadY);
        const pZ = pl.prevHeadZ + f * (0 - pl.prevHeadZ);
        const hX = pl.headX + f * (pl.x - pl.headX);
        const hY = pl.headY + f * (s.headHeight - pl.headY);
        const hZ = pl.headZ + f * (0 - pl.headZ);
        // segment from (prev sample - prev ball) to (cur sample - cur ball)
        const ax = pX - ball.prevX, ay = pY - ball.y, az = pZ - ball.prevZ;
        const bx = hX - ball.x, by = hY - ball.y, bz = hZ - ball.z;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len2 = dx * dx + dy * dy + dz * dz;
        let t = 0;
        if (len2 > 0) t = Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / len2));
        const cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t;
        const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (i === 0) { headDist = dist; headLateral = -cx; }
        best = Math.min(best, dist - radius);
      }
      if (best <= 0) {
        this._onHit(ball, headDist, headLateral);
        if (this.state !== GameState.PLAYING) return;
      }
    }
  }

  /**
   * @param {Ball} ball
   * @param {number} contactDist distance between head centre and ball centre at contact
   * @param {number} lateral ball offset from the head centre along x at contact (negative = left)
   */
  _onHit(ball, contactDist, lateral) {
    const s = CONFIG.swing;
    const pl = this.player;
    const smash = this.smashReady;
    const speed = Math.min(s.maxReturnSpeed, ball.speed * s.reflectMultiplier);
    if (smash) {
      // a smash goes straight down the court, no matter where on the head it lands
      ball.setVelocity(0, -speed * CONFIG.smash.speedMultiplier);
      ball.smashed = true;
    } else {
      const side = Math.max(-1, Math.min(1, lateral / s.hitRadius));
      const angle = side * s.maxReturnAngleDeg * DEG;
      ball.setVelocity(Math.sin(angle) * speed, -Math.cos(angle) * speed);
    }
    const clean = contactDist <= s.sweetSpotRadius;
    ball.cleanHit = clean;
    this.hits++;
    this.combo++;
    if (clean) this.cleanHits++;
    ball.scoreValue = CONFIG.score.perReturn * this.comboMultiplier * (clean ? 1 + CONFIG.score.cleanHitBonus : 1);
    pl.hitThisSwing = true;
    this.slowmo = s.slowmoMs / 1000;
    this.emit(EV.HIT, { x: ball.x, y: ball.y, z: ball.z, clean, smash, combo: this.combo, multiplier: this.comboMultiplier });

    if (smash) this._smash(ball);
    else this._chargeSmash(clean);
    if (this.overcharges.has('multiballFrenzy')) this._split(ball);

    if (this.overcharges.has('laserForehand')) {
      const targets = this.overcharges.laserTargets(pl.headX, pl.headZ, ball.vx, ball.vz, this.balls, this._laserOut);
      this.emit(EV.LASER, { x: pl.headX, y: pl.headY, z: pl.headZ, dx: ball.vx, dz: ball.vz });
      for (const t of targets) {
        if (!t.active) continue;
        if (t.scoreValue === 0) t.scoreValue = CONFIG.score.perReturn * this.comboMultiplier;
        this.emit(EV.LASER_KILL, { x: t.x, y: t.y, z: t.z });
        this._returned(t, 'laser');
        if (this.state !== GameState.PLAYING) return;
      }
    }
  }

  // ── smash ──────────────────────────────────────────────────────────────────

  _chargeSmash(clean) {
    const sm = CONFIG.smash;
    this.smash = Math.min(1, this.smash + (clean ? sm.cleanFill : sm.regularFill));
    if (this.smash >= 1 && !this.smashReady) {
      this.smashReady = true;
      this.emit(EV.SMASH_READY, {});
    }
  }

  /**
   * The smash itself. `hitBall` has already been launched by _onHit; every
   * other ball on court is launched straight down the court at smash speed and
   * counts as a return when it crosses the far baseline.
   */
  _smash(hitBall) {
    const s = CONFIG.swing;
    const sm = CONFIG.smash;
    this.smashReady = false;
    this.smash = 0;
    this.smashes++;
    let count = 1;
    for (const b of this.balls) {
      if (!b.active || b === hitBall) continue;
      const speed = Math.min(s.maxReturnSpeed, b.speed * s.reflectMultiplier) * sm.speedMultiplier;
      b.setVelocity(0, -speed);
      b.smashed = true;
      b.cleanHit = false;
      b.scoreValue = CONFIG.score.perReturn * this.comboMultiplier;
      count++;
    }
    this.slowmo = Math.max(this.slowmo, sm.slowmoMs / 1000);
    this.emit(EV.SMASH, { x: hitBall.x, y: hitBall.y, z: hitBall.z, count });
  }

  /** Multiball Frenzy: spawn a twin of a just-hit ball on a diverging path. */
  _split(ball) {
    const twin = this.balls.find((b) => !b.active);
    if (!twin) return;
    const v = this.overcharges.splitVelocity(ball);
    twin.spawn(ball.x, ball.z, v.vx, v.vz);
    twin.cleanHit = ball.cleanHit;
    twin.scoreValue = ball.scoreValue;
    twin.smashed = ball.smashed;
    this.emit(EV.SPLIT, { x: ball.x, y: ball.y, z: ball.z });
  }

  // ── outcomes ───────────────────────────────────────────────────────────────

  _returned(ball, how) {
    ball.active = false;
    this.returns++;
    this.score += ball.scoreValue;
    this.emit(EV.RETURNED, { x: ball.x, y: ball.y, z: ball.z, clean: ball.cleanHit, how, returns: this.returns });
    if (this.returns >= this.target && this.lives > 0) this._complete();
  }

  _concede(ball) {
    ball.active = false;
    this.conceded++;
    this.lives--;
    this.emit(EV.CONCEDED, { x: ball.x, y: ball.y, z: ball.z });
    this.emit(EV.LIFE_LOST, { lives: this.lives });
    if (this.lives <= 0) {
      this._fail();
      return;
    }
    this.hitStop = CONFIG.lives.hitStopMs / 1000;
    this.player.swingElapsed = -1;
  }

  _complete() {
    this.state = GameState.COMPLETE;
    for (const b of this.balls) {
      if (!b.active) continue;
      b.active = false;
      this.emit(EV.FLOURISH, { x: b.x, y: b.y, z: b.z });
    }
    this.emit(EV.LEVEL_COMPLETE, this.results());
  }

  _fail() {
    this.state = GameState.FAILED;
    this.emit(EV.LEVEL_FAILED, this.results());
  }
}

const _tmp = { x: 0, y: 0, z: 0 };
