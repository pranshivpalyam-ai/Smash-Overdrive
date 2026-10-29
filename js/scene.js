/**
 * scene.js — renderer, low-resolution render target, palette quantise pass,
 * lighting and sky. Owns the WebGL context and the letterboxed viewport.
 *
 * Frame pipeline:
 *   1. Render the 3D scene into a small render target (base 480x854 x renderScale).
 *   2. Draw that target onto the full canvas through a fragment shader that
 *      snaps every pixel to the nearest of the 32 palette colours. The target
 *      uses NearestFilter, so the upscale is pixel-perfect.
 */
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { makeSkyCanvas } from './textures.js';

/** Palette index → THREE.Color (converted to linear working space by Three). */
export function paletteColor(index) {
  return new THREE.Color(PALETTE[index]);
}

/** Wrap a generated canvas as a crisp, non-mipmapped texture. */
export function canvasTexture(canvas, { srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PALETTE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PALETTE_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec3 uPalette[32];
  uniform float uDither;
  uniform vec2 uRes;
  varying vec2 vUv;

  // 2x2 Bayer cell: (0,0)=0 (1,0)=2 (0,1)=3 (1,1)=1
  float b2(vec2 p) { return p.x * 2.0 + p.y * 3.0 - 4.0 * p.x * p.y; }
  float bayer4(vec2 p) {
    vec2 q = mod(p, 2.0);
    vec2 r = mod(floor(p * 0.5), 2.0);
    return (b2(q) * 4.0 + b2(r)) / 16.0;
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 c = toSRGB(clamp(texture2D(tSrc, vUv).rgb, 0.0, 1.0));
    c += (bayer4(floor(vUv * uRes)) - 0.5) * uDither * 0.15;
    float best = 1e9;
    vec3 pick = uPalette[0];
    for (int i = 0; i < 32; i++) {
      vec3 d = c - uPalette[i];
      float dist = dot(d * d, vec3(0.30, 0.59, 0.11));
      if (dist < best) { best = dist; pick = uPalette[i]; }
    }
    gl_FragColor = vec4(pick, 1.0);
  }
`;

// Injected after <project_vertex> when render.vertexSnap is on.
const SNAP_CHUNK = /* glsl */ `
  #include <project_vertex>
  {
    vec2 ndc = gl_Position.xy / gl_Position.w;
    ndc = (floor((ndc * 0.5 + 0.5) * uSnapGrid) + 0.5) / uSnapGrid * 2.0 - 1.0;
    gl_Position.xy = ndc * gl_Position.w;
  }
`;

export class GameScene {
  /**
   * @param {HTMLCanvasElement} canvas  the WebGL canvas
   * @param {HTMLElement} container     the letterboxed stage element sized by resize()
   */
  constructor(canvas, container) {
    this.cfg = CONFIG.render;
    this.canvas = canvas;
    this.container = container;
    this.viewWidth = 1;
    this.viewHeight = 1;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(paletteColor(CONFIG.court.skyHorizon));

    this.scene = new THREE.Scene();
    this.snapUniform = { value: new THREE.Vector2(1, 1) };

    this.renderTarget = null;
    this._createRenderTarget(this.cfg.renderScale);
    this._setupPalettePass();
    this._setupLights();
    this._setupSky();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  // ── setup ──────────────────────────────────────────────────────────────────

  _createRenderTarget(scale) {
    if (this.renderTarget) this.renderTarget.dispose();
    const w = Math.round(this.cfg.baseWidth * scale);
    const h = Math.round(this.cfg.baseHeight * scale);
    this.renderTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.renderScale = scale;
    this.snapUniform.value.set(Math.round(w * this.cfg.vertexSnapGrid), Math.round(h * this.cfg.vertexSnapGrid));
  }

  _setupPalettePass() {
    const palette = PALETTE.map((h) => new THREE.Vector3(
      parseInt(h.slice(1, 3), 16) / 255,
      parseInt(h.slice(3, 5), 16) / 255,
      parseInt(h.slice(5, 7), 16) / 255,
    ));
    this.paletteMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: this.renderTarget.texture },
        uPalette: { value: palette },
        uDither: { value: this.cfg.dither },
        uRes: { value: new THREE.Vector2(this.renderTarget.width, this.renderTarget.height) },
      },
      vertexShader: PALETTE_VERT,
      fragmentShader: PALETTE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.paletteMaterial);
    this.postScene.add(this.postQuad);
  }

  _setupLights() {
    const l = CONFIG.lighting;
    this.hemi = new THREE.HemisphereLight(paletteColor(l.hemisphereSky), paletteColor(l.hemisphereGround), l.hemisphereIntensity);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(paletteColor(l.sunColor), l.sunIntensity);
    const dir = new THREE.Vector3().fromArray(l.sunDirection).normalize();
    const court = CONFIG.court;
    this.sun.target.position.set(0, 0, -court.length / 2);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 40);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -court.halfWidth - 3;
    cam.right = court.halfWidth + 3;
    cam.top = court.length / 2 + 5;
    cam.bottom = -court.length / 2 - 5;
    cam.near = 1;
    cam.far = 90;
    this.sun.shadow.mapSize.set(this.cfg.shadowMapSize, this.cfg.shadowMapSize);
    this.sun.shadow.radius = l.shadowRadius;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    if (l.fog) {
      this.scene.fog = new THREE.Fog(paletteColor(l.fogColor), l.fogNear, l.fogFar);
    }
  }

  _setupSky() {
    const tex = canvasTexture(makeSkyCanvas());
    const geo = new THREE.SphereGeometry(120, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.position.set(0, 0, -CONFIG.court.length / 2);
    this.scene.add(this.sky);
  }

  // ── scene management ───────────────────────────────────────────────────────

  /** Add an object to the scene, applying vertex snapping to its materials if enabled. */
  add(object) {
    if (this.cfg.vertexSnap) {
      object.traverse((o) => {
        if (o.material && !o.material.isShaderMaterial) this._applySnap(o.material);
      });
    }
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }

  _applySnap(material) {
    const snap = this.snapUniform;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSnapGrid = snap;
      shader.vertexShader = 'uniform vec2 uSnapGrid;\n' + shader.vertexShader.replace('#include <project_vertex>', SNAP_CHUNK);
    };
    material.customProgramCacheKey = () => 'vsnap';
  }

  // ── viewport ───────────────────────────────────────────────────────────────

  /** Letterbox the stage to 9:16 inside the window and size the canvas to it. */
  resize() {
    const aspect = this.cfg.baseWidth / this.cfg.baseHeight;
    let w = window.innerWidth;
    let h = window.innerHeight;
    if (w / h > aspect) w = Math.floor(h * aspect);
    else h = Math.floor(w / aspect);
    this.container.style.width = `${w}px`;
    this.container.style.height = `${h}px`;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.cfg.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.viewWidth = w;
    this.viewHeight = h;
  }

  /** Change the internal resolution at runtime (0.5–1.0). */
  setRenderScale(scale) {
    scale = Math.min(1, Math.max(0.25, scale));
    if (scale === this.renderScale) return;
    this._createRenderTarget(scale);
    this.paletteMaterial.uniforms.tSrc.value = this.renderTarget.texture;
    this.paletteMaterial.uniforms.uRes.value.set(this.renderTarget.width, this.renderTarget.height);
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  render(camera) {
    const r = this.renderer;
    r.setRenderTarget(this.renderTarget);
    r.render(this.scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }

  // ── teardown ───────────────────────────────────────────────────────────────

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const key of Object.keys(m)) {
            if (m[key] && m[key].isTexture) m[key].dispose();
          }
          m.dispose();
        }
      }
    });
    this.postQuad.geometry.dispose();
    this.paletteMaterial.dispose();
    this.renderTarget.dispose();
    this.renderer.dispose();
  }
}
