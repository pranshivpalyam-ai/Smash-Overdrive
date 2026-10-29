/**
 * player.js — render side of the player: a low-poly figure built from boxes,
 * animated by rotating and offsetting limb meshes directly (no skeleton).
 *
 * buildPlayerModel() is shared by the in-game view and the shop's turntable
 * preview. The figure faces -z (down the court); the camera sees its back.
 *
 * The racquet arm is a group at the right shoulder whose local +x runs down
 * the arm into the racquet. game.js defines the racquet head as
 *   shoulder + reach * (cos θ, 0, -sin θ) at height CONFIG.swing.headHeight,
 * so the arm is tilted down by φ (to drop from shoulder height to head
 * height) and rotated about y by θ; its visual length is reach / cos φ.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { paletteColor } from './scene.js';
import { Racquet } from './racquet.js';

const DEG = Math.PI / 180;
const SHOULDER_Y = 1.5;
const SHOULDER_X = 0.26;
const HIP_Y = 0.85;

/**
 * Build the figure. Returns the root group plus handles for animation and
 * cosmetics. All parts cast shadows; the materials are transparent-capable so
 * the whole figure can fade.
 */
export function buildPlayerModel() {
  const root = new THREE.Group();
  const mats = {
    skin: new THREE.MeshLambertMaterial({ transparent: true }),
    hair: new THREE.MeshLambertMaterial({ transparent: true }),
    shirt: new THREE.MeshLambertMaterial({ transparent: true }),
    shorts: new THREE.MeshLambertMaterial({ transparent: true }),
    shoes: new THREE.MeshLambertMaterial({ transparent: true, color: paletteColor(5) }),
    socks: new THREE.MeshLambertMaterial({ transparent: true, color: paletteColor(4) }),
  };
  const box = (w, h, d, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    return m;
  };

  // hips: legs and shorts pivot here so the lower body can yaw toward the run direction
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  root.add(hips);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, 0, 0);
    const thigh = box(0.14, 0.42, 0.14, mats.skin);
    thigh.position.y = -0.21;
    const shin = box(0.12, 0.34, 0.12, mats.skin);
    shin.position.y = -0.6;
    const sock = box(0.13, 0.12, 0.13, mats.socks);
    sock.position.y = -0.74;
    const shoe = box(0.15, 0.09, 0.26, mats.shoes);
    shoe.position.set(0, -0.81, -0.03);
    leg.add(thigh, shin, sock, shoe);
    hips.add(leg);
    legs.push(leg);
  }
  const shorts = box(0.42, 0.3, 0.26, mats.shorts);
  shorts.position.y = -0.05;
  hips.add(shorts);

  // torso group pivots at the waist so it can twist for the swing and lean when running
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  root.add(torso);
  const chest = box(0.44, 0.56, 0.24, mats.shirt);
  chest.position.y = 0.3;
  // a slightly wider back panel gives the shirt some shape from behind
  const back = box(0.36, 0.5, 0.06, mats.shirt);
  back.position.set(0, 0.32, 0.13);
  const neck = box(0.1, 0.08, 0.1, mats.skin);
  neck.position.y = 0.62;
  const head = box(0.24, 0.26, 0.24, mats.skin);
  head.position.y = 0.79;
  torso.add(chest, back, neck, head);
  // eyes on the front face (-z), only ever seen in the shop preview
  const eyeMat = new THREE.MeshLambertMaterial({ color: paletteColor(0), transparent: true });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.02), eyeMat);
    eye.position.set(side * 0.055, 0.02, -0.125);
    head.add(eye);
  }
  mats.eyes = eyeMat;

  // hair variants, all attached to the head; one is visible at a time
  const hair = {};
  const cap = box(0.27, 0.1, 0.27, mats.hair);
  cap.position.y = 0.11;
  const backPanel = box(0.26, 0.14, 0.05, mats.hair);
  backPanel.position.set(0, 0.03, 0.12);
  hair.short = new THREE.Group();
  hair.short.add(cap, backPanel);

  const buzz = box(0.26, 0.05, 0.26, mats.hair);
  buzz.position.y = 0.14;
  hair.buzz = new THREE.Group();
  hair.buzz.add(buzz);

  const bunCap = cap.clone();
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), mats.hair);
  bun.castShadow = true;
  bun.position.set(0, 0.1, 0.17);
  hair.bun = new THREE.Group();
  hair.bun.add(bunCap, backPanel.clone(), bun);

  hair.spiky = new THREE.Group();
  hair.spiky.add(cap.clone());
  for (let i = 0; i < 4; i++) {
    const spike = box(0.06, 0.12, 0.06, mats.hair);
    spike.position.set(-0.09 + i * 0.06, 0.2, (i % 2) * 0.08 - 0.04);
    spike.rotation.z = (i - 1.5) * 0.25;
    hair.spiky.add(spike);
  }
  for (const g of Object.values(hair)) {
    g.visible = false;
    head.add(g);
  }

  // arms. Left arm hangs and swings while running; right arm carries the racquet.
  const armL = new THREE.Group();
  armL.position.set(-SHOULDER_X, SHOULDER_Y - 1.0, 0);
  const upperL = box(0.11, 0.11, 0.11, mats.shirt);
  upperL.position.x = -0.06;
  const foreL = box(0.5, 0.1, 0.1, mats.skin);
  foreL.position.x = -0.33;
  armL.add(upperL, foreL);
  torso.add(armL);

  const armR = new THREE.Group();
  armR.position.set(SHOULDER_X, SHOULDER_Y - 1.0, 0);
  armR.rotation.order = 'YZX';
  const sleeveR = box(0.11, 0.11, 0.11, mats.shirt);
  sleeveR.position.x = 0.06;
  const foreR = box(0.44, 0.1, 0.1, mats.skin);
  foreR.position.x = 0.3;
  armR.add(sleeveR, foreR);
  torso.add(armR);

  const racquet = new Racquet();
  racquet.group.rotation.z = -Math.PI / 2; // +y (racquet length) → +x (down the arm)
  racquet.group.position.x = 0.48;
  armR.add(racquet.group);

  const materials = [...Object.values(mats), ...racquet.materials];

  return {
    root, hips, torso, legs, armL, armR, head, hair, racquet, materials,
    /** Apply cosmetic option indices from the save's `equipped` object. */
    setCosmetics(eq) {
      const c = CONFIG.cosmetics.character;
      mats.skin.color.copy(paletteColor(c.skinTone.options[eq.skinTone].color));
      mats.hair.color.copy(paletteColor(c.hairColor.options[eq.hairColor].color));
      mats.shirt.color.copy(paletteColor(c.shirtColor.options[eq.shirtColor].color));
      mats.shorts.color.copy(paletteColor(c.shortsColor.options[eq.shortsColor].color));
      const style = c.hairStyle.options[eq.hairStyle].style;
      for (const [name, g] of Object.entries(hair)) g.visible = name === style;
      racquet.setColors(eq.frameColor, eq.stringColor, eq.gripTape);
    },
    setOpacity(alpha) {
      for (const m of materials) m.opacity = alpha;
    },
  };
}

const COOLDOWN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const COOLDOWN_FRAG = /* glsl */ `
  uniform float uFrac;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float a = atan(vUv.y - 0.5, vUv.x - 0.5) / 6.2831853 + 0.5;
    if (a > uFrac) discard;
    gl_FragColor = vec4(uColor, 0.85);
  }
`;

/** In-game player view: drives the model from game.player and handles the fade and cooldown arc. */
export class PlayerView {
  /** @param {import('./scene.js').GameScene} gameScene */
  constructor(gameScene) {
    this.model = buildPlayerModel();
    this.root = this.model.root;
    this.runPhase = 0;
    this.idlePhase = 0;
    this.alpha = 1;
    this.swingBlend = 0; // 0 = rest pose, 1 = swing pose

    const fx = CONFIG.fx;
    this.arcMat = new THREE.ShaderMaterial({
      uniforms: { uFrac: { value: 0 }, uColor: { value: paletteColor(fx.cooldownArcColor) } },
      vertexShader: COOLDOWN_VERT,
      fragmentShader: COOLDOWN_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.arc = new THREE.Mesh(new THREE.RingGeometry(fx.cooldownArcRadius - 0.07, fx.cooldownArcRadius, 24, 1), this.arcMat);
    this.arc.rotation.x = -Math.PI / 2;
    this.arc.position.y = 0.015;
    this.arc.visible = false;

    gameScene.add(this.root);
    gameScene.add(this.arc);
  }

  setCosmetics(equipped) {
    this.model.setCosmetics(equipped);
  }

  /**
   * @param {number} dt seconds
   * @param {import('./game.js').Game} game
   * @param {boolean} blink  true during the hit-stop blink
   */
  update(dt, game, blink) {
    const p = CONFIG.player;
    const s = CONFIG.swing;
    const gp = game.player;
    const m = this.model;
    const speedFrac = Math.max(-1, Math.min(1, gp.vx / p.maxSpeed));
    const absSpeed = Math.abs(speedFrac);

    // position and lean
    this.root.position.x = gp.x;
    this.root.rotation.z = -speedFrac * p.runLeanDeg * DEG;

    // idle bob and run cycle
    this.idlePhase += dt * p.idleBobSpeed * Math.PI * 2;
    this.runPhase += dt * p.runCycleSpeed * absSpeed * Math.PI * 2;
    const stride = Math.sin(this.runPhase) * 0.7 * absSpeed;
    this.root.position.y = Math.sin(this.idlePhase) * p.idleBobAmount * (1 - absSpeed) + Math.abs(Math.sin(this.runPhase)) * 0.05 * absSpeed;
    m.legs[0].rotation.x = stride;
    m.legs[1].rotation.x = -stride;
    m.hips.rotation.y = speedFrac * 0.45;
    m.armL.rotation.z = Math.PI / 2 + 0.15;
    m.armL.rotation.x = -stride * 0.8;

    // swing pose: blend into the arc pose quickly, ease back to rest after
    const swinging = gp.swingElapsed >= 0;
    const blendTarget = swinging ? 1 : 0;
    this.swingBlend += (blendTarget - this.swingBlend) * Math.min(1, dt * (swinging ? 40 : 9));
    const theta = (s.arcStartDeg + (s.arcEndDeg - s.arcStartDeg) * gp.swingProgress) * DEG;
    const tilt = -Math.atan2(SHOULDER_Y - s.headHeight, s.reach);
    const restZ = -Math.PI / 2 + 0.25;
    m.armR.rotation.y = theta * this.swingBlend;
    m.armR.rotation.z = restZ + (tilt - restZ) * this.swingBlend;
    m.armR.rotation.x = -stride * 0.5 * (1 - this.swingBlend);
    m.torso.rotation.y = (theta - Math.PI / 2) * 0.35 * this.swingBlend;
    m.racquet.update(dt);

    // fade when a ball is close and directly behind the player from the camera's view
    let occluding = false;
    for (const b of game.balls) {
      if (!b.active) continue;
      if (b.z < 0 && b.z > -p.fadeDistance && Math.abs(b.x - gp.x) < 0.7) { occluding = true; break; }
    }
    const targetAlpha = occluding ? p.fadeAlpha : 1;
    this.alpha += (targetAlpha - this.alpha) * Math.min(1, dt * p.fadeSpeed);
    const blinkOff = blink && Math.floor(game.hitStop * 14) % 2 === 0;
    m.setOpacity(blinkOff ? 0.15 : this.alpha);

    // cooldown arc under the feet
    const frac = gp.cooldown > 0 ? gp.cooldown / (s.cooldownMs / 1000) : 0;
    this.arc.visible = frac > 0;
    this.arcMat.uniforms.uFrac.value = frac;
    this.arc.position.x = gp.x;
  }
}
