/**
 * depth.js — depth cues. Reading an approaching ball in 3D is the hardest part
 * of the game, so these are first-class and each one can be switched off in
 * CONFIG.depthCues to test whether it earns its place.
 *
 *   groundShadow   dark ellipse on the grass directly under each ball
 *   marker         ring on the grass where an incoming ball will cross the baseline
 *   trail          fading quads behind each ball (a smashed ball leaves a larger white streak)
 *   distanceTint   far balls cool/desaturated, near balls warm (applied in ballview.js)
 *   sizeBoost      far balls drawn larger than perspective would (applied in ballview.js)
 *   offscreenArrows DOM arrows at the screen edge for balls outside the frustum
 *
 * The three ground/trail decals are each a single InstancedMesh with a small
 * shader that adds per-instance alpha and a near/far colour blend.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { paletteColor, canvasTexture } from './scene.js';
import { makeSoftDiscCanvas, makeRingCanvas } from './textures.js';

// ── pure helpers (also used by ballview.js) ──────────────────────────────────

/** 0 at the baseline, 1 at the far baseline. */
export function distanceFraction(z) {
  return Math.min(1, Math.max(0, -z / CONFIG.court.length));
}

/** Visual scale multiplier for a ball at z: sizeBoostFar at the far end easing to 1.0. */
export function sizeBoostAt(z) {
  const c = CONFIG.depthCues;
  if (!c.sizeBoost) return 1;
  const t = Math.min(1, Math.max(0, (z - c.sizeBoostNearZ) / (c.sizeBoostFarZ - c.sizeBoostNearZ)));
  const eased = t * t * (3 - 2 * t);
  return 1 + (c.sizeBoostFar - 1) * eased;
}

// ── instanced decal material ─────────────────────────────────────────────────

const DECAL_VERT = /* glsl */ `
  attribute float aAlpha;
  attribute float aNear;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vNear;
  void main() {
    vUv = uv;
    vAlpha = aAlpha;
    vNear = aNear;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const DECAL_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uColorFar;
  uniform vec3 uColorNear;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vNear;
  void main() {
    vec4 t = texture2D(map, vUv);
    float a = t.a * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(uColorFar, uColorNear, vNear) * t.rgb, a);
  }
`;

/** One InstancedMesh of `capacity` textured quads with per-instance alpha and colour blend. */
function makeDecalMesh(geometry, texture, colorFar, colorNear, capacity, renderOrder) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      uColorFar: { value: colorFar },
      uColorNear: { value: colorNear },
    },
    vertexShader: DECAL_VERT,
    fragmentShader: DECAL_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const geo = geometry.clone();
  geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aNear', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.InstancedMesh(geo, material, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = renderOrder;
  return mesh;
}

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _proj = new THREE.Vector3();

export class DepthCues {
  /**
   * @param {import('./scene.js').GameScene} gameScene
   * @param {HTMLElement} arrowsContainer  DOM element that holds the off-camera arrows
   */
  constructor(gameScene, arrowsContainer) {
    const c = CONFIG.depthCues;
    const maxBalls = CONFIG.ball.maxBalls;

    const flatQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const uprightQuad = new THREE.PlaneGeometry(1, 1);
    const disc = canvasTexture(makeSoftDiscCanvas(), { srgb: false });
    const ring = canvasTexture(makeRingCanvas(), { srgb: false });

    this.shadows = makeDecalMesh(flatQuad, disc, paletteColor(c.shadowColor), paletteColor(c.shadowColor), maxBalls, 1);
    this.rings = makeDecalMesh(flatQuad, ring, paletteColor(c.markerFarColor), paletteColor(c.markerNearColor), maxBalls, 2);
    // the trail's "near" colour slot is used for the smash streak (aNear = 1 on smashed balls)
    this.trails = makeDecalMesh(uprightQuad, disc, paletteColor(c.trailColor), paletteColor(CONFIG.smash.trailColor), maxBalls * c.trailLength, 3);
    flatQuad.dispose();
    uprightQuad.dispose();
    gameScene.add(this.shadows);
    gameScene.add(this.rings);
    gameScene.add(this.trails);

    // trail history: a ring buffer of past positions per pool slot
    this.trailLen = c.trailLength;
    this.history = new Float32Array(maxBalls * this.trailLen * 3);
    this.histHead = new Int32Array(maxBalls);
    this.histCount = new Int32Array(maxBalls);
    this.sampleTimer = new Float32Array(maxBalls);
    this.lastSerial = new Int32Array(maxBalls);

    // off-camera arrows, one DOM element per pool slot
    this.arrows = [];
    for (let i = 0; i < maxBalls; i++) {
      const el = document.createElement('div');
      el.className = 'arrow';
      arrowsContainer.appendChild(el);
      this.arrows.push(el);
    }
  }

  /**
   * Update every cue for the current frame.
   * @param {import('./ball.js').Ball[]} balls  the ball pool (index = slot)
   * @param {THREE.Camera} camera
   * @param {number} dt seconds
   * @param {number} viewHeight css px height of the stage, for arrow placement
   */
  sync(balls, camera, dt, viewHeight) {
    const c = CONFIG.depthCues;
    const sm = CONFIG.smash;
    const diameter = CONFIG.ball.radius * 2;
    let nShadow = 0, nRing = 0, nTrail = 0;
    const shadowAlpha = this.shadows.geometry.getAttribute('aAlpha');
    const shadowNear = this.shadows.geometry.getAttribute('aNear');
    const ringAlpha = this.rings.geometry.getAttribute('aAlpha');
    const ringNear = this.rings.geometry.getAttribute('aNear');
    const trailAlpha = this.trails.geometry.getAttribute('aAlpha');
    const trailNear = this.trails.geometry.getAttribute('aNear');
    _quat.identity();
    camera.updateMatrixWorld();

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      const arrow = this.arrows[i];
      if (!ball.active) {
        if (arrow.classList.contains('on')) arrow.classList.remove('on');
        continue;
      }
      // a reused slot starts a fresh trail
      if (this.lastSerial[i] !== ball.serial) {
        this.lastSerial[i] = ball.serial;
        this.histCount[i] = 0;
        this.histHead[i] = 0;
        this.sampleTimer[i] = 0;
      }
      const closeness = 1 - distanceFraction(ball.z);

      // ── ground shadow ──────────────────────────────────────────────────────
      if (c.groundShadow) {
        const r = c.shadowRadius * (1 + c.shadowHeightGrowth * ball.y) * 2;
        _pos.set(ball.x, 0.012, ball.z);
        _scale.set(r, 1, r * c.shadowStretchZ);
        _matrix.compose(_pos, _quat, _scale);
        this.shadows.setMatrixAt(nShadow, _matrix);
        shadowAlpha.setX(nShadow, c.shadowOpacity);
        shadowNear.setX(nShadow, 0);
        nShadow++;
      }

      // ── baseline marker ────────────────────────────────────────────────────
      if (c.marker && ball.incoming) {
        const px = ball.predictXAtZ(0);
        const s = c.markerFarScale + (c.markerNearScale - c.markerFarScale) * closeness;
        _pos.set(px, 0.02, 0);
        _scale.set(s, 1, s);
        _matrix.compose(_pos, _quat, _scale);
        this.rings.setMatrixAt(nRing, _matrix);
        ringAlpha.setX(nRing, c.markerFarOpacity + (c.markerNearOpacity - c.markerFarOpacity) * closeness);
        ringNear.setX(nRing, closeness);
        nRing++;
      }

      // ── motion trail ───────────────────────────────────────────────────────
      if (c.trail) {
        // a smashed ball covers most of a unit per frame, so sample it every frame
        const smashed = ball.smashed;
        this.sampleTimer[i] += dt * 1000;
        if (smashed ? dt > 0 : this.sampleTimer[i] >= c.trailSampleMs) {
          this.sampleTimer[i] = 0;
          const head = this.histHead[i];
          const base = (i * this.trailLen + head) * 3;
          this.history[base] = ball.x;
          this.history[base + 1] = ball.y;
          this.history[base + 2] = ball.z;
          this.histHead[i] = (head + 1) % this.trailLen;
          if (this.histCount[i] < this.trailLen) this.histCount[i]++;
        }
        const count = this.histCount[i];
        // k = 0 is the newest sample; it sits on the ball itself, so start one behind
        for (let k = 1; k < count; k++) {
          const idx = (this.histHead[i] - 1 - k + this.trailLen * 2) % this.trailLen;
          const base = (i * this.trailLen + idx) * 3;
          const f = k / this.trailLen;
          _pos.set(this.history[base], this.history[base + 1], this.history[base + 2]);
          let s = diameter * sizeBoostAt(_pos.z) * (c.trailStartScale + (c.trailEndScale - c.trailStartScale) * f);
          if (smashed) s *= sm.trailScale;
          _scale.set(s, s, s);
          _matrix.compose(_pos, camera.quaternion, _scale);
          this.trails.setMatrixAt(nTrail, _matrix);
          trailAlpha.setX(nTrail, (smashed ? sm.trailOpacity : c.trailOpacity) * (1 - f));
          trailNear.setX(nTrail, smashed ? 1 : 0);
          nTrail++;
        }
      }

      // ── off-camera arrows ──────────────────────────────────────────────────
      if (c.offscreenArrows) {
        _proj.set(ball.x, ball.y, ball.z).project(camera);
        const behind = _proj.z > 1;
        const off = !behind && (_proj.x < -1 || _proj.x > 1);
        if (off) {
          const y = Math.min(0.95, Math.max(0.05, (1 - _proj.y) / 2)) * viewHeight;
          arrow.style.top = `${Math.round(y)}px`;
          arrow.classList.toggle('left', _proj.x < -1);
          arrow.classList.toggle('right', _proj.x > 1);
          if (!arrow.classList.contains('on')) arrow.classList.add('on');
        } else if (arrow.classList.contains('on')) {
          arrow.classList.remove('on');
        }
      } else if (arrow.classList.contains('on')) {
        arrow.classList.remove('on');
      }
    }

    this.shadows.count = nShadow;
    this.rings.count = nRing;
    this.trails.count = nTrail;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    this.trails.instanceMatrix.needsUpdate = true;
    shadowAlpha.needsUpdate = shadowNear.needsUpdate = true;
    ringAlpha.needsUpdate = ringNear.needsUpdate = true;
    trailAlpha.needsUpdate = trailNear.needsUpdate = true;
  }
}
