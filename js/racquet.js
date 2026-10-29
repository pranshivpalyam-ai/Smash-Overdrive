/**
 * racquet.js — the tennis racquet mesh.
 *
 * Local space: the handle end is at the origin and the racquet extends along
 * +y. The head centre sits at `headOffset` along that axis and the string bed
 * faces ±z. player.js parents this to the racquet arm and rotates it so the
 * head lands where game.js expects it.
 *
 * Cosmetics are plain material colour swaps: frame, strings and grip tape.
 */
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { paletteColor, canvasTexture } from './scene.js';
import { makeStringCanvas } from './textures.js';

let sharedStringTexture = null;

export class Racquet {
  constructor() {
    this.group = new THREE.Group();
    this.headOffset = 0.62;
    this.flashLeft = 0;

    if (!sharedStringTexture) {
      sharedStringTexture = canvasTexture(makeStringCanvas(), { srgb: false });
      sharedStringTexture.wrapS = sharedStringTexture.wrapT = THREE.RepeatWrapping;
      sharedStringTexture.repeat.set(2, 2.5);
    }

    this.frameMat = new THREE.MeshLambertMaterial({ transparent: true });
    this.stringMat = new THREE.MeshLambertMaterial({ map: sharedStringTexture, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    this.gripMat = new THREE.MeshLambertMaterial({ transparent: true });
    this.materials = [this.frameMat, this.stringMat, this.gripMat];

    // grip / handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.26, 6), this.gripMat);
    handle.position.y = 0.13;
    // throat: a short frame section between handle and head
    const throat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.024), this.frameMat);
    throat.position.y = 0.34;
    // head: an oval frame. TorusGeometry sits in the XY plane, so its face normal is z
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 16), this.frameMat);
    head.scale.set(1, 1.25, 1);
    head.position.y = this.headOffset;
    // string bed
    const strings = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.36), this.stringMat);
    strings.position.y = this.headOffset;

    this.group.add(handle, throat, head, strings);
    for (const m of this.group.children) m.castShadow = true;
    this.setColors(0, 0, 0);
  }

  /** @param {number} frame @param {number} strings @param {number} grip option indices from CONFIG.cosmetics.racquet */
  setColors(frame, strings, grip) {
    const r = CONFIG.cosmetics.racquet;
    this.frameMat.color.copy(paletteColor(r.frameColor.options[frame].color));
    this.stringMat.color.copy(paletteColor(r.stringColor.options[strings].color));
    this.gripMat.color.copy(paletteColor(r.gripTape.options[grip].color));
  }

  /** Brief bright flash on a hit. */
  flash() {
    this.flashLeft = CONFIG.swing.flashMs / 1000;
  }

  setOpacity(alpha) {
    for (const m of this.materials) m.opacity = alpha;
  }

  update(dt) {
    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      const on = this.flashLeft > 0;
      const e = on ? 0.9 : 0;
      this.frameMat.emissive.setScalar(e);
      this.stringMat.emissive.setScalar(e);
    }
  }
}

/** Palette hex for the frame colour of a given option, for the 2D shop swatches. */
export function racquetSwatch(optionKey, index) {
  return PALETTE[CONFIG.cosmetics.racquet[optionKey].options[index].color];
}
