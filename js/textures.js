/**
 * textures.js — every texture in the game is generated here at load time.
 *
 * All functions return plain HTMLCanvasElements. They know nothing about
 * Three.js; the render modules wrap them in CanvasTextures with NearestFilter.
 * Keeping the canvases Three-free also lets the 2D UI reuse them.
 */
import { CONFIG, PALETTE } from './config.js';

const hex = (i) => PALETTE[i];

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Parse a palette hex string into [r, g, b] bytes. */
export function paletteRGB(index) {
  const h = PALETTE[index];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/**
 * The grass ground texture. Covers the whole ground plane (not just the court)
 * so a single texture carries the mown stripes, the off-court grass, and all
 * the court markings.
 *
 * Texel mapping (must match court.js): u = (x + groundHalfWidth) * ppu,
 * row = (z - groundFarZ) * ppu, so row 0 is the FAR end (top of the image,
 * which Three maps to v = 1).
 */
export function makeGrassCanvas() {
  const c = CONFIG.court;
  const ppu = c.texelsPerUnit;
  const worldW = c.groundHalfWidth * 2;
  const worldD = c.groundBackZ - c.groundFarZ;
  const w = Math.round(worldW * ppu);
  const h = Math.round(worldD * ppu);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const uOf = (x) => (x + c.groundHalfWidth) * ppu;
  const rowOf = (z) => (z - c.groundFarZ) * ppu;

  // ── base grass with stripes and dithered noise, written straight to pixels ──
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const a = paletteRGB(c.grassA);
  const b = paletteRGB(c.grassB);
  const out = paletteRGB(c.grassOutside);
  const wallU0 = uOf(-c.halfWidth);
  const wallU1 = uOf(c.halfWidth);
  const stripeTexels = c.stripeWidth * ppu;
  for (let y = 0; y < h; y++) {
    const stripe = Math.floor(y / stripeTexels) & 1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let col;
      if (x < wallU0 || x >= wallU1) {
        col = out;
        // sparse lighter flecks so the off-court grass is not a flat slab
        if (Math.random() < 0.06) col = a;
      } else {
        col = stripe ? a : b;
        // dithered noise: occasionally flip to the other shade
        if (Math.random() < c.noiseAmount * 0.5) col = stripe ? b : a;
      }
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // ── court markings ────────────────────────────────────────────────────────
  const inner = c.halfWidth - c.lineInset; // sideline x
  const lines = []; // world-space rects {x0, x1, z0, z1} used again for the scuffs
  const addLine = (x0, x1, z0, z1) => lines.push({ x0, x1, z0, z1 });
  const lw = c.lineWidth;       // along-court lines
  const cw = c.crossLineWidth;  // across-court lines
  // sidelines
  addLine(-inner - lw / 2, -inner + lw / 2, -c.length, 0);
  addLine(inner - lw / 2, inner + lw / 2, -c.length, 0);
  // bold baseline at z = 0, far baseline regular
  addLine(-inner, inner, -c.baselineWidth / 2, c.baselineWidth / 2);
  addLine(-inner, inner, -c.length - cw / 2, -c.length + cw / 2);
  // service lines, net line, centre line
  for (const z of c.serviceLineZ) addLine(-inner, inner, z - cw / 2, z + cw / 2);
  addLine(-inner, inner, c.netLineZ - cw * 0.5, c.netLineZ + cw * 0.5);
  addLine(-lw / 2, lw / 2, Math.min(...c.serviceLineZ), Math.max(...c.serviceLineZ));
  // centre marks on both baselines
  addLine(-lw / 2, lw / 2, -c.centreMarkLength, 0);
  addLine(-lw / 2, lw / 2, -c.length, -c.length + c.centreMarkLength);

  ctx.fillStyle = hex(c.lineColor);
  for (const l of lines) {
    const u0 = Math.round(uOf(l.x0)), u1 = Math.round(uOf(l.x1));
    const r0 = Math.round(rowOf(l.z0)), r1 = Math.round(rowOf(l.z1));
    ctx.fillRect(u0, r0, Math.max(1, u1 - u0), Math.max(1, r1 - r0));
  }

  // ── wear: erode small patches out of the lines ────────────────────────────
  for (let i = 0; i < c.scuffCount; i++) {
    const l = lines[Math.floor(Math.random() * lines.length)];
    const x = l.x0 + Math.random() * (l.x1 - l.x0);
    const z = l.z0 + Math.random() * (l.z1 - l.z0);
    ctx.fillStyle = Math.random() < 0.5 ? hex(c.grassA) : hex(c.grassB);
    ctx.globalAlpha = 0.3 + Math.random() * 0.3;
    ctx.fillRect(Math.round(uOf(x)), Math.round(rowOf(z)), 1, 1);
  }
  ctx.globalAlpha = 1;

  // ── dirt specks on the playing surface ───────────────────────────────────
  ctx.fillStyle = hex(6);
  for (let i = 0; i < c.dirtCount; i++) {
    const x = -c.halfWidth + Math.random() * c.halfWidth * 2;
    const z = c.groundFarZ + Math.random() * worldD;
    ctx.globalAlpha = 0.25 + Math.random() * 0.35;
    ctx.fillRect(Math.round(uOf(x)), Math.round(rowOf(z)), 1, 1);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** Equirectangular tennis ball texture: fuzzy yellow-green with a white seam. */
export function makeBallCanvas() {
  const w = 64, h = 32;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex(11);
  ctx.fillRect(0, 0, w, h);
  // felt noise
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? hex(12) : hex(13);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
  }
  ctx.globalAlpha = 1;
  // seam: a sine wave around the equator, 3 texels wide with a darker edge
  for (let u = 0; u < w; u++) {
    const v = h / 2 + Math.sin((u / w) * Math.PI * 2) * (h * 0.28);
    ctx.fillStyle = hex(12);
    ctx.fillRect(u, Math.round(v) - 2, 1, 5);
    ctx.fillStyle = hex(5);
    ctx.fillRect(u, Math.round(v) - 1, 1, 3);
  }
  return canvas;
}

/**
 * Sky gradient, drawn as hard palette bands with 2-row dither strips between
 * them so it stays pixel-art after quantisation. Row 0 is the zenith.
 */
export function makeSkyCanvas() {
  const c = CONFIG.court;
  const w = 8, h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  // [colour, end row, dither rows] from the top down. The horizon sits at row
  // 128 and one row is 180/256 degrees of elevation. The camera only ever sees
  // ~14 degrees above the horizon, so the bands are packed tightly around it.
  const bands = [
    [c.skyTop, 100, 6],
    [c.skyMid, 120, 4],
    [c.skyHorizon, 140, 4],
    [c.skyMid, 256, 0], // below the horizon, mostly hidden by the ground
  ];
  let start = 0;
  for (let i = 0; i < bands.length; i++) {
    const [color, end, ditherRows] = bands[i];
    ctx.fillStyle = hex(color);
    ctx.fillRect(0, start, w, end - start);
    // dithered transition into the next band
    if (i < bands.length - 1 && ditherRows > 0) {
      ctx.fillStyle = hex(bands[i + 1][0]);
      for (let y = end - ditherRows; y < end; y++) {
        for (let x = 0; x < w; x++) {
          const density = (y - (end - ditherRows)) / ditherRows; // 0 → 1 toward the boundary
          if (((x + y) & 1) === 0 && density > 0.3) ctx.fillRect(x, y, 1, 1);
          else if (density > 0.7) ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    start = end;
  }
  return canvas;
}

/**
 * Far-end backdrop: a low-detail stand silhouette with a fence in front.
 * Transparent where there is nothing, so the sky shows through.
 */
export function makeBackdropCanvas() {
  const w = 512, h = 112;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // stand tiers, stepping up toward the back
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const tierH = 14;
    const y = h - 24 - t * tierH;
    ctx.fillStyle = t % 2 ? hex(1) : hex(2);
    ctx.fillRect(0, y - tierH, w, tierH);
    // rows of seats / crowd dots
    for (let x = 4; x < w; x += 6) {
      const r = Math.random();
      ctx.fillStyle = r < 0.55 ? hex(3) : r < 0.7 ? hex(23) : r < 0.85 ? hex(5) : r < 0.93 ? hex(19) : hex(14);
      ctx.fillRect(x, y - tierH + 4, 3, 3);
    }
  }
  // roof line and support posts
  ctx.fillStyle = hex(0);
  ctx.fillRect(0, h - 24 - tiers * 14 - 4, w, 4);
  for (let x = 16; x < w; x += 64) ctx.fillRect(x, h - 24 - tiers * 14, 3, tiers * 14);

  // fence: posts and two rails
  ctx.fillStyle = hex(2);
  ctx.fillRect(0, h - 22, w, 2);
  ctx.fillRect(0, h - 10, w, 2);
  for (let x = 0; x < w; x += 24) ctx.fillRect(x, h - 24, 3, 24);
  // ground strip under the fence so it meets the grass cleanly
  ctx.fillStyle = hex(6);
  ctx.fillRect(0, h - 3, w, 3);
  return canvas;
}

/** Soft white disc with a radial alpha falloff — ground shadows and trails. */
export function makeSoftDiscCanvas(size = 32) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Hard-edged white ring — the baseline-crossing marker. */
export function makeRingCanvas(size = 64) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.arc(r, r, r - 7, 0, Math.PI * 2, true);
  ctx.fill();
  // four tick marks so the ring reads as a target even when tiny
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate((i * Math.PI) / 2);
    ctx.fillRect(-2, -r - 1, 4, 10);
    ctx.restore();
  }
  return canvas;
}

/** Racquet string bed: a cross-hatch of 1-texel lines on a transparent ground. Tinted by the material. */
export function makeStringCanvas(size = 32, pitch = 4) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  for (let i = 1; i < size; i += pitch) {
    ctx.fillRect(i, 0, 1, size);
    ctx.fillRect(0, i, size, 1);
  }
  return canvas;
}

/** Titanium Net mesh: a coarser grid with a thicker top cord. */
export function makeNetCanvas(width = 128, height = 32) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < width; x += 4) ctx.fillRect(x, 0, 1, height);
  for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
  ctx.fillRect(0, 0, width, 3);
  return canvas;
}

/** Wall scuff: a ragged dark smudge with soft alpha. */
export function makeScuffCanvas(size = 16) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  for (let i = 0; i < 40; i++) {
    const r = Math.random() * c * 0.9;
    const a = Math.random() * Math.PI * 2;
    ctx.fillStyle = `rgba(20, 10, 5, ${0.35 + Math.random() * 0.4})`;
    ctx.fillRect(Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r), 1 + Math.floor(Math.random() * 2), 1);
  }
  return canvas;
}
