/**
 * court.js — the grass court, side walls and far backdrop.
 *
 * The court runs along -z: baseline at z = 0 (player end), far baseline at
 * z = -CONFIG.court.length. Walls are the physical x boundaries for balls;
 * their inner faces sit exactly at ±halfWidth.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { paletteColor, canvasTexture } from './scene.js';
import { makeGrassCanvas, makeBackdropCanvas } from './textures.js';

export class Court {
  /** @param {import('./scene.js').GameScene} gameScene */
  constructor(gameScene) {
    const c = CONFIG.court;
    this.group = new THREE.Group();

    // ── ground ───────────────────────────────────────────────────────────────
    const worldW = c.groundHalfWidth * 2;
    const worldD = c.groundBackZ - c.groundFarZ;
    this.grassTexture = canvasTexture(makeGrassCanvas());
    if (c.groundMipmaps) {
      // crisp up close (nearest mag), stable far away (trilinear min + anisotropy)
      this.grassTexture.generateMipmaps = true;
      this.grassTexture.minFilter = THREE.LinearMipmapLinearFilter;
      this.grassTexture.anisotropy = Math.min(4, gameScene.renderer.capabilities.getMaxAnisotropy());
    }
    this.groundMaterial = new THREE.MeshLambertMaterial({ map: this.grassTexture });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldD), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, (c.groundBackZ + c.groundFarZ) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    // ── side walls ───────────────────────────────────────────────────────────
    const wallLen = c.wallBackZ + c.length + c.wallFarExtra;
    const wallZ = (c.wallBackZ - c.length - c.wallFarExtra) / 2;
    const wallGeo = new THREE.BoxGeometry(c.wallThickness, c.wallHeight, wallLen);
    const capGeo = new THREE.BoxGeometry(c.wallThickness + 0.06, 0.08, wallLen);
    const wallMat = new THREE.MeshLambertMaterial({ color: paletteColor(c.wallColor) });
    const capMat = new THREE.MeshLambertMaterial({ color: paletteColor(c.wallCapColor) });
    for (const side of [-1, 1]) {
      const x = side * (c.halfWidth + c.wallThickness / 2);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(x, c.wallHeight / 2, wallZ);
      wall.receiveShadow = true;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, c.wallHeight - 0.04, wallZ);
      this.group.add(wall, cap);
    }

    // ── far backdrop: stand + fence silhouette ───────────────────────────────
    const backdropTex = canvasTexture(makeBackdropCanvas());
    const backdropMat = new THREE.MeshBasicMaterial({ map: backdropTex, alphaTest: 0.5, fog: false });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(worldW, c.backdropHeight), backdropMat);
    backdrop.position.set(0, c.backdropHeight / 2, c.backdropZ);
    this.group.add(backdrop);

    gameScene.add(this.group);
  }

  /** Multiply the court colour (Sticky Clay wash). Pass [1, 1, 1] to clear. */
  setTint(rgb) {
    this.groundMaterial.color.setRGB(rgb[0], rgb[1], rgb[2]);
  }
}
