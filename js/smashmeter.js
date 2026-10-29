/**
 * smashmeter.js — the smash meter: a vertical bar in the scene beside the
 * player that fills with every racquet contact and pulses when a smash is
 * ready. Pure presentation; the meter value lives in game.smash.
 *
 * Two upright quads: a dark backing and a fill whose origin is at its bottom
 * edge so scaling y grows it upward. The camera never rotates, so the quads
 * can face +z permanently.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { paletteColor } from './scene.js';

export class SmashMeterView {
  /** @param {import('./scene.js').GameScene} gameScene */
  constructor(gameScene) {
    const sm = CONFIG.smash;
    this.group = new THREE.Group();

    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(sm.barWidth + sm.barBorder * 2, sm.barHeight + sm.barBorder * 2),
      new THREE.MeshBasicMaterial({ color: paletteColor(sm.barBackColor) }),
    );
    back.position.y = sm.barBottomY + sm.barHeight / 2;
    this.group.add(back);

    this.fillColor = paletteColor(sm.barFillColor);
    this.readyColor = paletteColor(sm.barReadyColor);
    this.fillMat = new THREE.MeshBasicMaterial({ color: this.fillColor.clone() });
    const fillGeo = new THREE.PlaneGeometry(sm.barWidth, sm.barHeight);
    fillGeo.translate(0, sm.barHeight / 2, 0); // origin at the bottom edge
    this.fill = new THREE.Mesh(fillGeo, this.fillMat);
    this.fill.position.set(0, sm.barBottomY, 0.01);
    this.fill.scale.y = 0.001;
    this.group.add(this.fill);

    // a thin tick at the top marks "full"
    const tick = new THREE.Mesh(
      new THREE.PlaneGeometry(sm.barWidth + sm.barBorder * 4, sm.barBorder),
      new THREE.MeshBasicMaterial({ color: paletteColor(sm.barReadyColor) }),
    );
    tick.position.set(0, sm.barBottomY + sm.barHeight + sm.barBorder * 1.5, 0.01);
    this.group.add(tick);

    this.group.position.z = sm.barZ;
    this.group.visible = false;
    this.pulse = 0;
    this.shown = 0; // displayed fraction, eased toward the real one
    gameScene.add(this.group);
  }

  /**
   * @param {number} dt seconds
   * @param {import('./game.js').Game|null} game null (or a game without a meter) hides the bar
   */
  update(dt, game) {
    const sm = CONFIG.smash;
    if (!game || game.smash === undefined) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.x = game.player.x + sm.barOffsetX;

    // ease the fill so a +30% clean hit visibly climbs rather than jumps
    const target = game.smash;
    this.shown += (target - this.shown) * Math.min(1, dt * 14);
    if (Math.abs(target - this.shown) < 0.003) this.shown = target;
    this.fill.scale.y = Math.max(0.001, this.shown);

    if (game.smashReady) {
      this.pulse += dt * sm.readyPulseHz;
      this.fillMat.color.copy(Math.floor(this.pulse) % 2 === 0 ? this.readyColor : this.fillColor);
    } else {
      this.pulse = 0;
      this.fillMat.color.copy(this.fillColor);
    }
  }

  reset() {
    this.shown = 0;
    this.pulse = 0;
    this.fill.scale.y = 0.001;
  }
}
