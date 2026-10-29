/**
 * fx.js — in-scene effects: pooled particles, wall scuff decals, the far-
 * baseline sparkle, the Titanium Net and the Laser Forehand beam.
 *
 * Effects.handle(event) consumes the events emitted by game.js. Everything is
 * pooled; nothing is allocated per frame.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { EV } from './game.js';
import { paletteColor, canvasTexture } from './scene.js';
import { makeScuffCanvas, makeNetCanvas } from './textures.js';

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

export class Effects {
  /**
   * @param {import('./scene.js').GameScene} gameScene
   * @param {import('./court.js').Court} court
   */
  constructor(gameScene, court) {
    this.court = court;
    const fx = CONFIG.fx;
    const n = CONFIG.performance.particlePool;

    // ── particles: one instanced mesh of small cubes ─────────────────────────
    this.particles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(fx.particleSize, fx.particleSize, fx.particleSize),
      new THREE.MeshBasicMaterial(),
      n,
    );
    this.particles.frustumCulled = false;
    this.particles.count = 0;
    for (let i = 0; i < n; i++) this.particles.setColorAt(i, _color.setRGB(1, 1, 1));
    this.pPos = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3);
    this.pLife = new Float32Array(n);
    this.pMaxLife = new Float32Array(n);
    this.pGravity = new Float32Array(n);
    this.pColor = new Float32Array(n * 3);
    this.pAlive = 0;
    gameScene.add(this.particles);

    // ── wall scuffs ─────────────────────────────────────────────────────────
    const scuffTex = canvasTexture(makeScuffCanvas(), { srgb: false });
    this.scuffs = [];
    this.scuffNext = 0;
    for (let i = 0; i < CONFIG.performance.scuffPool; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: scuffTex, transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(fx.scuffSize, fx.scuffSize), mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      gameScene.add(mesh);
      this.scuffs.push({ mesh, life: 0 });
    }

    // ── Titanium Net ────────────────────────────────────────────────────────
    const net = CONFIG.overcharges.titaniumNet;
    const width = CONFIG.court.halfWidth * 2;
    const netTex = canvasTexture(makeNetCanvas(), { srgb: false });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    netTex.repeat.set(width / 1.6, 1);
    this.netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: paletteColor(net.color) });
    this.net = new THREE.Group();
    this.netMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, net.height), this.netMat);
    this.netMesh.position.y = net.height / 2;
    const postMat = new THREE.MeshLambertMaterial({ color: paletteColor(3) });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, net.height + 0.1, 6), postMat);
      post.position.set(side * (CONFIG.court.halfWidth - 0.05), (net.height + 0.1) / 2, 0);
      this.net.add(post);
    }
    this.net.add(this.netMesh);
    this.net.position.z = net.z;
    this.net.visible = false;
    gameScene.add(this.net);

    // ── laser beams (small pool for rapid hits) ─────────────────────────────
    const laser = CONFIG.overcharges.laserForehand;
    this.beams = [];
    this.beamNext = 0;
    for (let i = 0; i < 3; i++) {
      const coreMat = new THREE.MeshBasicMaterial({ color: paletteColor(laser.coreColor), transparent: true, depthWrite: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: paletteColor(laser.glowColor), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.CylinderGeometry(laser.coreRadius, laser.coreRadius, 1, 6, 1, true), coreMat);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(laser.glowRadius, laser.glowRadius, 1, 8, 1, true), glowMat);
      group.add(core, glow);
      group.visible = false;
      gameScene.add(group);
      this.beams.push({ group, coreMat, glowMat, life: 0 });
    }
  }

  // ── particles ──────────────────────────────────────────────────────────────

  /**
   * Spawn a burst of particles.
   * @param {number} colorIndex palette index
   * @param {number} speed initial speed
   * @param {boolean} gravity whether they fall
   */
  burst(x, y, z, count, colorIndex, speed = CONFIG.fx.hitBurstSpeed, gravity = true, life = 0.6) {
    const c = paletteColor(colorIndex);
    for (let k = 0; k < count; k++) {
      const i = this._freeParticle();
      if (i < 0) return;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      this.pVel[i * 3] = Math.cos(a) * Math.cos(b) * s;
      this.pVel[i * 3 + 1] = Math.sin(b) * s + (gravity ? 1.5 : 0.6);
      this.pVel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
      this.pLife[i] = this.pMaxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.pGravity[i] = gravity ? CONFIG.fx.particleGravity : 0;
      this.pColor[i * 3] = c.r; this.pColor[i * 3 + 1] = c.g; this.pColor[i * 3 + 2] = c.b;
    }
  }

  _freeParticle() {
    const n = this.pLife.length;
    for (let i = 0; i < n; i++) if (this.pLife[i] <= 0) return i;
    return -1;
  }

  // ── event handling ─────────────────────────────────────────────────────────

  /** Consume one game event. */
  handle(e) {
    const fx = CONFIG.fx;
    switch (e.type) {
      case EV.WALL_BOUNCE: {
        const wallX = e.side === 2 ? CONFIG.court.halfWidth : -CONFIG.court.halfWidth;
        this.burst(wallX, e.y, e.z, fx.wallPuffCount, fx.wallPuffColor, 1.6, true, 0.45);
        this._scuff(wallX, e.y, e.z, e.side);
        break;
      }
      case EV.HIT:
        this.burst(e.x, e.y, e.z, e.clean ? CONFIG.swing.particleCount * 2 : CONFIG.swing.particleCount, e.clean ? 5 : 13);
        break;
      case EV.RETURNED:
        if (e.how === 'far') this.burst(e.x, e.y, CONFIG.ball.exitZ, fx.sparkleCount, fx.sparkleColor, 2.2, false, 0.8);
        break;
      case EV.LASER_KILL:
        this.burst(e.x, e.y, e.z, 12, CONFIG.overcharges.laserForehand.glowColor, 3, false, 0.5);
        break;
      case EV.SPLIT: {
        const mb = CONFIG.overcharges.multiballFrenzy;
        this.burst(e.x, e.y, e.z, mb.burstCount, mb.color, 2.5, false, 0.5);
        break;
      }
      case EV.SMASH: {
        const sm = CONFIG.smash;
        this.burst(e.x, e.y, e.z, sm.burstCount, 5, 6, true, 0.7);
        this.burst(e.x, e.y, e.z, sm.burstCount / 2, 14, 4, false, 0.5);
        break;
      }
      case EV.FLOURISH:
        this.burst(e.x, e.y, e.z, 14, fx.flourishColor, 3, false, 0.9);
        break;
      case EV.LASER:
        this._beam(e.x, e.y, e.z, e.dx, e.dz);
        break;
      case EV.NET_HIT:
        this._netSag();
        this.burst(e.x, e.y, e.z, 10, 4, 2.5);
        break;
      case EV.NET_BREAK:
        this._netBreak(e);
        break;
      default:
        break;
    }
  }

  _scuff(wallX, y, z, side) {
    const s = this.scuffs[this.scuffNext];
    this.scuffNext = (this.scuffNext + 1) % this.scuffs.length;
    s.mesh.position.set(wallX - (side === 2 ? 0.01 : -0.01), y, z);
    s.mesh.rotation.set(0, side === 2 ? -Math.PI / 2 : Math.PI / 2, Math.random() * Math.PI * 2);
    s.mesh.visible = true;
    s.life = CONFIG.fx.scuffLifeMs / 1000;
    s.mesh.material.opacity = 0.9;
  }

  _beam(x, y, z, dx, dz) {
    const laser = CONFIG.overcharges.laserForehand;
    const b = this.beams[this.beamNext];
    this.beamNext = (this.beamNext + 1) % this.beams.length;
    const len = Math.hypot(dx, dz);
    if (len === 0) return;
    const t = (CONFIG.ball.exitZ - z) / (dz / len);
    if (!(t > 0)) return;
    _dir.set(dx / len, 0, dz / len);
    b.group.position.set(x + _dir.x * t / 2, y, z + _dir.z * t / 2);
    b.group.quaternion.setFromUnitVectors(_up, _dir);
    b.group.scale.set(1, t, 1);
    b.group.visible = true;
    b.life = (laser.holdMs + laser.fadeMs) / 1000;
    b.coreMat.opacity = 1;
    b.glowMat.opacity = 0.5;
  }

  // ── net ────────────────────────────────────────────────────────────────────

  setNetVisible(on) {
    const net = CONFIG.overcharges.titaniumNet;
    this.net.visible = on;
    this.netMesh.scale.y = 1;
    this.netMesh.position.y = net.height / 2;
    this.netMat.color.copy(paletteColor(net.color));
  }

  _netSag() {
    const net = CONFIG.overcharges.titaniumNet;
    this.netMesh.scale.y = 1 - net.sagAmount;
    this.netMesh.position.y = (net.height * (1 - net.sagAmount)) / 2;
    this.netMat.color.copy(paletteColor(net.dullColor));
  }

  _netBreak(e) {
    const net = CONFIG.overcharges.titaniumNet;
    this.net.visible = false;
    for (let i = 0; i < net.debrisCount; i++) {
      const x = (Math.random() * 2 - 1) * CONFIG.court.halfWidth;
      this.burst(x, Math.random() * net.height, net.z, 1, i % 2 ? net.color : net.dullColor, 1.2, true, 1.1);
    }
    this.burst(e.x, e.y, e.z, 10, 5, 3);
  }

  /** Sticky Clay: drag a dust trail behind every active ball. */
  dustTrails(balls, dt) {
    const clay = CONFIG.overcharges.stickyClay;
    this.dustAccum = (this.dustAccum || 0) + dt * clay.dustRate;
    if (this.dustAccum < 1) return;
    const n = Math.floor(this.dustAccum);
    this.dustAccum -= n;
    for (const b of balls) {
      if (!b.active) continue;
      for (let k = 0; k < n; k++) {
        this.burst(b.x - b.vx * 0.02, b.y - 0.05, b.z - b.vz * 0.02, 1, clay.dustColor, 0.4, false, 0.5);
      }
    }
  }

  /** Magnetised Grip: sparkle on balls being pulled this frame. */
  magnetSparks(balls, dt) {
    const m = CONFIG.overcharges.magnetisedGrip;
    this.sparkAccum = (this.sparkAccum || 0) + dt * m.sparkRate;
    if (this.sparkAccum < 1) return;
    const n = Math.floor(this.sparkAccum);
    this.sparkAccum -= n;
    for (const b of balls) {
      if (!b.active || !b.magnetActive) continue;
      for (let k = 0; k < n; k++) this.burst(b.x, b.y, b.z, 1, m.color, 0.9, false, 0.35);
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  update(dt) {
    // particles
    let n = 0;
    _quat.identity();
    for (let i = 0; i < this.pLife.length; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) continue;
      this.pVel[i * 3 + 1] += this.pGravity[i] * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pPos[i * 3 + 1] < 0.03) { this.pPos[i * 3 + 1] = 0.03; this.pVel[i * 3 + 1] *= -0.3; }
      const f = this.pLife[i] / this.pMaxLife[i];
      _pos.set(this.pPos[i * 3], this.pPos[i * 3 + 1], this.pPos[i * 3 + 2]);
      _scale.setScalar(0.4 + f * 0.8);
      _matrix.compose(_pos, _quat, _scale);
      this.particles.setMatrixAt(n, _matrix);
      this.particles.setColorAt(n, _color.setRGB(this.pColor[i * 3], this.pColor[i * 3 + 1], this.pColor[i * 3 + 2]));
      n++;
    }
    this.particles.count = n;
    this.particles.instanceMatrix.needsUpdate = true;
    this.particles.instanceColor.needsUpdate = true;

    // scuffs
    for (const s of this.scuffs) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.mesh.material.opacity = Math.min(0.9, s.life / (CONFIG.fx.scuffLifeMs / 1000) * 1.5);
    }

    // beams
    const laser = CONFIG.overcharges.laserForehand;
    for (const b of this.beams) {
      if (!b.group.visible) continue;
      b.life -= dt;
      if (b.life <= 0) { b.group.visible = false; continue; }
      const fadeSeconds = laser.fadeMs / 1000;
      const f = Math.min(1, b.life / fadeSeconds);
      b.coreMat.opacity = f;
      b.glowMat.opacity = 0.5 * f;
    }
  }

  /** Hide everything (level start / teardown between levels). */
  reset() {
    this.pLife.fill(0);
    this.particles.count = 0;
    for (const s of this.scuffs) s.mesh.visible = false;
    for (const b of this.beams) b.group.visible = false;
    this.net.visible = false;
    this.court.setTint([1, 1, 1]);
  }
}
