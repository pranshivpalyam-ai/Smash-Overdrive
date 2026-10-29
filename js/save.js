/**
 * save.js — one versioned save object in localStorage. No Three.js.
 *
 * A missing, corrupt or old-version save falls back to defaults rather than
 * crashing. Unknown fields are dropped; missing fields are filled in.
 */
import { CONFIG } from './config.js';

export function defaultSave() {
  return {
    version: CONFIG.save.version,
    grip: 0,
    highestUnlocked: 1,
    levels: {},          // level number → { cleared, bestScore, bestReturns, bestConceded }
    owned: {
      cosmetics: {},     // "category.key" → [option indices]
      overcharges: {},   // id → count
    },
    equipped: {
      skinTone: 0, hairStyle: 0, hairColor: 0, shirtColor: 0, shortsColor: 0,
      frameColor: 0, stringColor: 0, gripTape: 0,
    },
    settings: {
      audio: CONFIG.audio.enabled,
      renderScale: CONFIG.render.renderScale,
    },
  };
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Copy known fields from `src` onto the defaults, recursively for plain objects. */
function merge(defaults, src) {
  if (!isObject(src)) return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const s = src[key];
    if (s === undefined) continue;
    if (isObject(d)) out[key] = Object.keys(d).length === 0 ? (isObject(s) ? { ...s } : d) : merge(d, s);
    else if (typeof d === typeof s) out[key] = s;
  }
  return out;
}

export function loadSave() {
  const defaults = defaultSave();
  try {
    const raw = localStorage.getItem(CONFIG.save.key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== CONFIG.save.version) return defaults;
    return merge(defaults, parsed);
  } catch {
    return defaults;
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(CONFIG.save.key, JSON.stringify(save));
  } catch {
    // storage full or unavailable: the game keeps running with in-memory state
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(CONFIG.save.key);
  } catch {
    // ignore
  }
  return defaultSave();
}
