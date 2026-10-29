/**
 * stands.js — the stadium: tiered stands on both sides and across the far end,
 * filled with an instanced, animated crowd.
 *
 * Geometry is real 3D (stepped concrete tiers with a light edge strip and a
 * tall back wall), so the stands read with perspective instead of as a flat
 * silhouette. Spectators are two InstancedMeshes (bodies and heads) sharing
 * one transform per seat, with per-instance colours. They sway idly, a random
 * subset fidgets more, and the whole crowd hops when cheer() is called.
 *
 * Everything tunable is in CONFIG.stands.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { paletteColor } from './scene.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export class Stands {
  /** @param {import('./scene.js').GameScene} gameScene */
  constructor(gameScene) {
    this.cfg = CONFIG.stands;
    this.group = new THREE.Group();
    this.time = 0;
    this.cheerAmp = 0;
    this.bodies = null;
    this.heads = null;

    /** One entry per occupied seat. */
    this.seats = [];

    if (this.cfg.enabled) {
      this._buildTiers();
      this._buildCrowd();
    }
    gameScene.add(this.group);
  }

  // ── structure ──────────────────────────────────────────────────────────────

  _buildTiers() {
    const c = this.cfg;
    const court = CONFIG.court;
    const concrete = [
      new THREE.MeshLambertMaterial({ color: paletteColor(c.concreteA) }),
      new THREE.MeshLambertMaterial({ color: paletteColor(c.concreteB) }),
    ];
    const edgeMat = new THREE.MeshLambertMaterial({ color: paletteColor(c.edgeColor) });
    const wallMat = new THREE.MeshLambertMaterial({ color: paletteColor(c.backWallColor) });

    const innerX = court.halfWidth + court.wallThickness + c.sideGap; // front face of the side stands
    const zNear = court.wallBackZ;                                      // side stands start level with the walls
    const zFar = c.farFrontZ;                                           // and run to the far stand's front face
    const topY = c.tiers * c.tierHeight;
    const outerX = innerX + c.tiers * c.tierDepth;                      // back of the top side tier
    const farBackZ = zFar - c.tiers * c.tierDepth;
    const fullW = (outerX + c.backWallThickness) * 2;                   // far stand spans the corners too

    // a tier block stands on the ground up to its tread height, so nothing shows underneath
    const tier = (w, h, d, x, z, t) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concrete[t % 2]);
      box.position.set(x, h / 2, z);
      this.group.add(box);
    };
    // a light strip along the front top edge of a tread
    const edge = (w, d, x, y, z) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, c.edgeHeight, d), edgeMat);
      strip.position.set(x, y - c.edgeHeight / 2, z);
      this.group.add(strip);
    };

    const sideLen = zNear - zFar;
    const sideZ = (zNear + zFar) / 2;
    for (let t = 0; t < c.tiers; t++) {
      const h = (t + 1) * c.tierHeight;
      for (const side of [-1, 1]) {
        const x0 = innerX + t * c.tierDepth;
        tier(c.tierDepth, h, sideLen, side * (x0 + c.tierDepth / 2), sideZ, t);
        edge(c.edgeWidth, sideLen, side * (x0 + c.edgeWidth / 2), h, sideZ);
      }
      const z0 = zFar - t * c.tierDepth;
      tier(fullW, h, c.tierDepth, 0, z0 - c.tierDepth / 2, t);
      edge(fullW, c.edgeWidth, 0, h, z0 - c.edgeWidth / 2);
    }

    // back walls behind the top tiers enclose the bowl, with a light rail on top
    const wallH = topY + c.backWallExtra;
    const sideWallLen = zNear - farBackZ;
    const sideWallZ = (zNear + farBackZ) / 2;
    for (const side of [-1, 1]) {
      const x = side * (outerX + c.backWallThickness / 2);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(c.backWallThickness, wallH, sideWallLen), wallMat);
      wall.position.set(x, wallH / 2, sideWallZ);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(c.backWallThickness + 0.1, c.edgeHeight, sideWallLen), edgeMat);
      rail.position.set(x, wallH, sideWallZ);
      this.group.add(wall, rail);
    }
    const farWall = new THREE.Mesh(new THREE.BoxGeometry(fullW, wallH, c.backWallThickness), wallMat);
    farWall.position.set(0, wallH / 2, farBackZ - c.backWallThickness / 2);
    const farRail = new THREE.Mesh(new THREE.BoxGeometry(fullW + 0.2, c.edgeHeight, c.backWallThickness + 0.1), edgeMat);
    farRail.position.set(0, wallH, farBackZ - c.backWallThickness / 2);
    this.group.add(farWall, farRail);

    // seats: one row per tier, set back from the tread's front edge, facing the court
    for (let t = 0; t < c.tiers; t++) {
      const y = (t + 1) * c.tierHeight;
      for (const side of [-1, 1]) {
        const x = side * (innerX + t * c.tierDepth + c.seatInset);
        for (let z = zNear - c.seatSpacing / 2; z > zFar + c.seatSpacing / 2; z -= c.seatSpacing) {
          this._addSeat(x, y, z, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
      const z = zFar - t * c.tierDepth - c.seatInset;
      const halfW = outerX - c.seatSpacing / 2;
      for (let x = -halfW; x <= halfW; x += c.seatSpacing) {
        this._addSeat(x, y, z, 0);
      }
    }
  }

  _addSeat(x, y, z, rotY) {
    const c = this.cfg;
    if (Math.random() > c.fill) return;
    this.seats.push({
      x: x + (Math.random() - 0.5) * c.seatJitter,
      y,
      z: z + (Math.random() - 0.5) * c.seatJitter,
      rotY: rotY + (Math.random() - 0.5) * 0.5,
      phase: Math.random() * Math.PI * 2,
      speed: c.idleSpeed * (0.7 + Math.random() * 0.6),
      fidget: Math.random() < c.fidgetChance ? 1 : 0,
      jump: 0.6 + Math.random() * 0.8,
      scale: 0.9 + Math.random() * 0.2,
    });
  }

  // ── crowd ──────────────────────────────────────────────────────────────────

  _buildCrowd() {
    const c = this.cfg;
    const n = this.seats.length;
    if (n === 0) return;

    const bodyGeo = new THREE.BoxGeometry(c.bodyWidth, c.bodyHeight, c.bodyDepth);
    bodyGeo.translate(0, c.bodyHeight / 2, 0);
    const headGeo = new THREE.BoxGeometry(c.headSize, c.headSize, c.headSize);
    headGeo.translate(0, c.bodyHeight + c.headSize / 2 + 0.02, 0);

    this.bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), n);
    this.heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), n);
    for (const mesh of [this.bodies, this.heads]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }

    for (let i = 0; i < n; i++) {
      const shirt = c.shirtColors[Math.floor(Math.random() * c.shirtColors.length)];
      const skin = c.skinColors[Math.floor(Math.random() * c.skinColors.length)];
      this.bodies.setColorAt(i, _c.set(paletteColor(shirt)));
      this.heads.setColorAt(i, _c.set(paletteColor(skin)));
    }
    this.bodies.instanceColor.needsUpdate = true;
    this.heads.instanceColor.needsUpdate = true;
    this.group.add(this.bodies, this.heads);
    this._pose();
  }

  _pose() {
    const c = this.cfg;
    const t = this.time;
    const cheer = this.cheerAmp;
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      const idle = Math.sin(t * s.speed + s.phase);
      let y = s.y + idle * c.idleBob * (1 + s.fidget * c.fidgetBoost);
      if (cheer > 0.001) {
        // a hop: only the positive half of the wave lifts the spectator off the seat
        y += Math.max(0, Math.sin(t * c.cheerSpeed + s.phase)) * c.cheerJump * cheer * s.jump;
      }
      _p.set(s.x, y, s.z);
      _q.setFromAxisAngle(UP, s.rotY);
      _s.setScalar(s.scale);
      _m.compose(_p, _q, _s);
      this.bodies.setMatrixAt(i, _m);
      this.heads.setMatrixAt(i, _m);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  // ── runtime ────────────────────────────────────────────────────────────────

  /** Make the crowd hop. strength is roughly 0..1; a smash goes a little over. */
  cheer(strength = 1) {
    this.cheerAmp = Math.min(this.cfg.cheerMax, Math.max(this.cheerAmp, strength));
  }

  update(dt) {
    if (!this.bodies) return;
    this.time += dt;
    this.cheerAmp *= Math.exp(-this.cfg.cheerDecay * dt);
    this._pose();
  }
}
