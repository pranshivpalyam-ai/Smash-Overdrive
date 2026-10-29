/**
 * level.js — per-level difficulty and the ball spawner. No Three.js.
 *
 * Difficulty is driven by LEVEL, not elapsed time: CONFIG.difficulty gives the
 * spawn interval and ball speed curves. The spawner only spawns balls that are
 * still owed (target minus returns minus balls in flight), so a conceded ball
 * is always replaced and a level always ends on the full target.
 *
 * Reachability: every candidate spawn is checked against where it will cross
 * the baseline and whether the player could get there in time at max run speed
 * (allowing for the acceleration ramp). Unreachable spawns are re-rolled.
 */
import { CONFIG } from './config.js';
import { Ball, ballXLimit, velocityFromAngle, spreadSpeed } from './ball.js';

const DEG = Math.PI / 180;

export class LevelSpawner {
  /**
   * @param {number} level 1-based level number
   * @param {() => number} rng random source, replaceable for tests
   */
  constructor(level, rng = Math.random) {
    const d = CONFIG.difficulty;
    this.level = level;
    this.rng = rng;
    this.interval = d.spawnInterval(level) / 1000;
    this.speed = d.ballSpeed(level);
    this.timer = this.interval * 0.6; // first ball arrives a little early
    this.pending = [];                 // group members waiting on their delay: {delay, prevX, prevT}
    this.scratch = new Ball();         // for crossing predictions without allocating
  }

  /** Maximum group size allowed at this level. */
  maxGroup() {
    const d = CONFIG.difficulty;
    if (this.level >= d.triplesFromLevel) return 3;
    if (this.level >= d.pairsFromLevel) return 2;
    return 1;
  }

  /** Roll a group size, biased by the per-level chances. */
  rollGroup() {
    const d = CONFIG.difficulty;
    const max = this.maxGroup();
    if (max >= 3 && this.rng() < d.tripleChance) return 3;
    if (max >= 2 && this.rng() < d.pairChance) return 2;
    return 1;
  }

  /**
   * @param {number} dt seconds
   * @param {{ owed(): number, player: {x:number, vx:number}, spawnBall(x, vx, vz): void }} game
   */
  update(dt, game) {
    // group members due now
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay <= 0) {
        this.pending.splice(i, 1);
        if (game.owed() > 0) this.spawnOne(game, p.prevX, p.prevT);
      }
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval;
    const owed = game.owed();
    if (owed <= 0) return;

    const size = Math.min(owed, this.rollGroup());
    const first = this.spawnOne(game, null, null);
    let prevX = first.crossX;
    let prevT = first.crossT;
    const gap = CONFIG.difficulty.groupSpacingMs / 1000;
    for (let i = 1; i < size; i++) {
      this.pending.push({ delay: gap * i, prevX, prevT: prevT + gap * i });
    }
  }

  /**
   * Choose a reachable spawn and hand it to the game. Returns the chosen
   * baseline crossing for chaining group members.
   */
  spawnOne(game, prevX, prevT) {
    const d = CONFIG.difficulty;
    const pl = CONFIG.player;
    const limit = ballXLimit();
    let best = null;
    let bestMargin = -Infinity;
    for (let attempt = 0; attempt < d.spawnRerolls; attempt++) {
      const x = (this.rng() * 2 - 1) * (limit - 0.4);
      const angle = (this.rng() * 2 - 1) * CONFIG.ball.maxAngleDeg * DEG;
      const { vx, vz } = velocityFromAngle(spreadSpeed(this.speed, CONFIG.ball.speedSpread, this.rng), angle, 1);
      this.scratch.spawn(x, CONFIG.ball.spawnZ, vx, vz);
      const crossX = this.scratch.predictXAtZ(0);
      const crossT = this.scratch.timeToZ(0);

      // can the player get from where they are to the crossing point in time?
      const travel = Math.max(0, crossT - pl.accelTime * 0.5) * pl.maxSpeed * d.reachSafety;
      let margin = travel - Math.abs(crossX - game.player.x);
      // inside a group: also reachable from the previous ball's crossing, and spaced apart
      if (prevX !== null) {
        const between = Math.max(0, crossT - prevT) * pl.maxSpeed * d.reachSafety;
        margin = Math.min(margin, between - Math.abs(crossX - prevX));
        if (Math.abs(crossX - prevX) < d.groupSpacingX) margin -= d.groupSpacingX;
      }
      if (margin > bestMargin) {
        bestMargin = margin;
        best = { x, vx, vz, crossX, crossT };
      }
      if (margin >= 0) break;
    }
    game.spawnBall(best.x, best.vx, best.vz);
    return best;
  }
}
