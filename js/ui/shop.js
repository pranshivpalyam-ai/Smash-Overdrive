/**
 * shop.js — the three-tab shop (overcharges, character, racquet) with a live
 * 3D turntable preview of the player for the two cosmetic tabs.
 *
 * The preview is the one place the player sees their character's front. It
 * uses its own small WebGL renderer on a low-resolution canvas upscaled with
 * nearest-neighbour CSS so it matches the pixel look around it.
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { OVERCHARGE_IDS, OVERCHARGE_INFO } from '../overcharge.js';
import { buyOvercharge, overchargeCost, overchargeCount, ownsCosmetic, selectCosmetic } from '../economy.js';
import { buildPlayerModel } from '../player.js';
import { paletteColor } from '../scene.js';
import { el, panel, row, button, textCanvas, iconCanvas, swatchCanvas, setText, setButtonLabel, setDisabled } from './pixelui.js';

/** Small self-contained turntable renderer for the shop inset. */
class Preview {
  constructor(width = 132, height = 176) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width * 2}px`;
    this.canvas.style.height = `${height * 2}px`;
    this.renderer.setClearColor(paletteColor(2));

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(paletteColor(21), paletteColor(12), 2.4));
    const sun = new THREE.DirectionalLight(paletteColor(5), 2.4);
    sun.position.set(2, 4, -3); // from the camera's side so the front is lit
    this.scene.add(sun);
    // floor disc so the figure has a ground
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshLambertMaterial({ color: paletteColor(9) }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    this.model = buildPlayerModel();
    this.model.armL.rotation.z = Math.PI / 2 + 0.2;
    this.model.armR.rotation.z = -Math.PI / 2 + 0.35;
    this.model.armR.rotation.y = 0.5;
    this.scene.add(this.model.root);

    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 20);
    this.camera.position.set(1.7, 1.6, -2.8); // three-quarter FRONT: the figure faces -z
    this.camera.lookAt(0, 0.9, 0);

    this.angle = 0;
    this.last = performance.now();
    this.running = true;
    this._tick = (now) => {
      if (!this.running) return;
      requestAnimationFrame(this._tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.angle += dt * CONFIG.cosmetics.previewTurntableSpeed;
      this.model.root.rotation.y = this.angle;
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(this._tick);
  }

  setCosmetics(eq) {
    this.model.setCosmetics(eq);
  }

  dispose() {
    this.running = false;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    this.renderer.dispose();
  }
}

/**
 * @param {{save:object, persist:()=>void, onBack:()=>void, onCosmeticsChanged:()=>void, audio:object}} ctx
 * @returns {{element:HTMLElement, dispose:()=>void}}
 */
export function buildShop(ctx) {
  const { save } = ctx;
  let preview = null;
  let tab = 'overcharges';

  const title = textCanvas('SHOP', { scale: 5, color: 13, shadow: 17 });
  const gripText = textCanvas(String(save.grip), { scale: 3, color: 14, shadow: 0 });
  const gripLine = row('grip-line', iconCanvas('grip', 3), gripText);
  const refreshGrip = () => setText(gripText, String(save.grip));

  const tabs = row('tabs');
  const body = el('div', 'shop-body');
  const tabButtons = {};
  for (const [id, label] of [['overcharges', 'OVERCHARGES'], ['character', 'CHARACTER'], ['racquet', 'RACQUET']]) {
    const b = button(label, () => { ctx.audio.play('click'); showTab(id); }, { scale: 2, cls: 'tab' });
    tabButtons[id] = b;
    tabs.appendChild(b);
  }

  function showTab(id) {
    tab = id;
    for (const [k, b] of Object.entries(tabButtons)) b.classList.toggle('selected', k === id);
    if (preview) { preview.dispose(); preview = null; }
    body.replaceChildren(id === 'overcharges' ? buildOvercharges() : buildCosmetics(id));
  }

  // ── overcharges tab ────────────────────────────────────────────────────────
  function buildOvercharges() {
    const list = el('div', 'over-list');
    for (const id of OVERCHARGE_IDS) {
      const cost = overchargeCost(id);
      const owned = textCanvas(`OWNED X${overchargeCount(save, id)}`, { scale: 2, color: 4 });
      const priceLabel = () => (save.grip >= cost ? `BUY ${cost}` : `NEED ${cost - save.grip}`);
      const buy = button(priceLabel(), () => {
        if (buyOvercharge(save, id)) {
          ctx.audio.play('buy');
          ctx.persist();
          refreshGrip();
          setText(owned, `OWNED X${overchargeCount(save, id)}`);
          refreshAll();
        }
      }, { scale: 2, color: 13, cls: 'buy' });
      const card = panel('over-item',
        row('', iconCanvas(OVERCHARGE_INFO[id].icon, 4), el('div', 'over-text',
          textCanvas(OVERCHARGE_INFO[id].name, { scale: 2, color: 5 }),
          wrapText(OVERCHARGE_INFO[id].blurb, 32),
        )),
        row('over-foot', owned, buy),
      );
      card._refresh = () => { setButtonLabel(buy, priceLabel()); buy.classList.toggle('dim', save.grip < cost); };
      list.appendChild(card);
    }
    return list;
  }

  /** Simple word wrap into stacked small text canvases. */
  function wrapText(text, cols) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      if ((line + ' ' + word).trim().length > cols) { lines.push(line.trim()); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) lines.push(line);
    return el('div', 'blurb', ...lines.map((l) => textCanvas(l, { scale: 1, color: 4 })));
  }

  // ── cosmetics tabs ─────────────────────────────────────────────────────────
  function buildCosmetics(category) {
    preview = new Preview();
    preview.setCosmetics(save.equipped);
    const groups = CONFIG.cosmetics[category];
    const options = el('div', 'cosmetic-groups');
    for (const [key, group] of Object.entries(groups)) {
      const line = row('cosmetic-row');
      group.options.forEach((opt, index) => {
        const owned = () => ownsCosmetic(save, category, key, index);
        const apply = () => {
          const result = selectCosmetic(save, category, key, index);
          if (result === 'unaffordable') { ctx.audio.play('click'); return; }
          ctx.audio.play(result === 'bought' ? 'buy' : 'click');
          ctx.persist();
          refreshGrip();
          preview.setCosmetics(save.equipped);
          ctx.onCosmeticsChanged();
          refreshAll();
        };
        const b = button(opt.style ? opt.name : '', () => {
          // owned (or free) items equip straight away; a purchase asks first
          if (owned()) { apply(); return; }
          if (save.grip < opt.price) { ctx.audio.play('click'); return; }
          ctx.audio.play('click');
          const confirm = button('BUY', () => { ctx.closeModal(); apply(); }, { scale: 3, color: 13, cls: 'primary' });
          const content = el('div', 'confirm-buy',
            textCanvas('CONFIRM PURCHASE', { scale: 3, color: 13, shadow: 17 }),
            row('', opt.style ? null : swatchCanvas(opt.color, 30), textCanvas(`${group.label.toUpperCase()}: ${opt.name.toUpperCase()}`, { scale: 2, color: 5 })),
            row('grip-line', iconCanvas('grip', 3), textCanvas(`${opt.price}  (YOU HAVE ${save.grip})`, { scale: 2, color: 14 })),
            row('', button('CANCEL', () => ctx.closeModal(), { scale: 2 }), confirm),
          );
          content._defaultFocus = confirm;
          ctx.openModal(content);
        }, { scale: 2, cls: 'swatch-btn', icon: opt.style ? null : swatchCanvas(opt.color, 30) });
        const price = textCanvas('', { scale: 1, color: 13 });
        b.appendChild(price);
        b._refresh = () => {
          const eq = save.equipped[key] === index;
          b.classList.toggle('selected', eq);
          const isOwned = owned();
          b.classList.toggle('dim', !isOwned && save.grip < opt.price);
          setText(price, eq ? 'ON' : isOwned ? 'OWNED' : String(opt.price));
        };
        line.appendChild(b);
      });
      options.appendChild(el('div', 'cosmetic-group', textCanvas(group.label.toUpperCase(), { scale: 2, color: 4 }), line));
    }
    const wrap = row('cosmetics', el('div', 'preview-box', preview.canvas), options);
    return wrap;
  }

  function refreshAll() {
    for (const node of body.querySelectorAll('*')) if (node._refresh) node._refresh();
  }

  const back = button('BACK', () => ctx.onBack(), { scale: 3 });
  const screen = el('div', 'screen shop', title, gripLine, tabs, body, row('actions', back));
  screen._defaultFocus = tabButtons.overcharges;
  showTab(tab);
  refreshAll();
  // refresh after the first tab is in the DOM
  queueMicrotask(refreshAll);

  return {
    element: screen,
    dispose() { if (preview) { preview.dispose(); preview = null; } },
  };
}
