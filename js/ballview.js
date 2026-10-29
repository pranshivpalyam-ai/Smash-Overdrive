/**
 * ballview.js — render side of the balls.
 *
 * All balls share one low-poly sphere geometry and one Lambert material, drawn
 * through a single InstancedMesh. Per-ball colour (distance tint) and scale
 * (exaggerated size) go through the instance colour and matrix, so the draw
 * call count is always one regardless of how many balls are in flight.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { canvasTexture } from './scene.js';
import { makeBallCanvas } from './textures.js';
import { sizeBoostAt, distanceFraction } from './depth.js';

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _tintFar = new THREE.Color();
const _tintNear = new THREE.Color();

export class BallView {
  /** @param {import('./scene.js').GameScene} gameScene */
  constructor(gameScene) {
    const b = CONFIG.ball;
    const cues = CONFIG.depthCues;
    this.texture = canvasTexture(makeBallCanvas());
    this.geometry = new THREE.SphereGeometry(b.radius, 10, 8);
    this.material = new THREE.MeshLambertMaterial({ map: this.texture });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, b.maxBalls);
    this.mesh.castShadow = cues.ballsCastShadowMap;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // create the instance colour buffer up front so the material compiles with it
    for (let i = 0; i < b.maxBalls; i++) this.mesh.setColorAt(i, _color.setRGB(1, 1, 1));
    this.spin = new Float32Array(b.maxBalls); // visual spin angle per pool slot
    _tintFar.setRGB(...cues.tintFar);
    _tintNear.setRGB(...cues.tintNear);
    gameScene.add(this.mesh);
  }

  /**
   * Write instance transforms and colours for every active ball.
   * @param {import('./ball.js').Ball[]} balls  the ball pool (index = slot)
   * @param {number} dt seconds
   */
  sync(balls, dt) {
    const b = CONFIG.ball;
    const cues = CONFIG.depthCues;
    let n = 0;
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball.active) continue;

      // spin about the axis perpendicular to travel, as a rolling ball would
      this.spin[i] += (ball.speed / b.radius) * b.spinRate * dt;
      _axis.set(ball.vz, 0, -ball.vx);
      if (_axis.lengthSq() > 1e-6) _axis.normalize(); else _axis.set(1, 0, 0);
      _quat.setFromAxisAngle(_axis, this.spin[i]);

      const s = sizeBoostAt(ball.z);
      _pos.set(ball.x, ball.y, ball.z);
      _scale.set(s, s, s);
      _matrix.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(n, _matrix);

      if (cues.distanceTint) {
        _color.lerpColors(_tintNear, _tintFar, distanceFraction(ball.z));
      } else {
        _color.setRGB(1, 1, 1);
      }
      this.mesh.setColorAt(n, _color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
