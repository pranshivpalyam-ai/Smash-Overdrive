/**
 * economy.js — grip rules, purchases and level records. No Three.js.
 * All functions mutate the save object passed in; the caller persists it.
 */
import { CONFIG } from './config.js';

/**
 * Grip awarded for a level attempt.
 * @param {{returns:number, lives:number, failed:boolean, lifeGripMultiplier?:number}} results
 * @param {boolean} replay true if this level had already been cleared before this attempt
 */
export function levelGrip(results, replay) {
  const g = CONFIG.grip;
  let ballRate = g.perReturn;
  if (results.failed) ballRate *= g.failedBallMultiplier;
  else if (replay) ballRate *= g.replayBallMultiplier;
  const ballGrip = Math.round(results.returns * ballRate);
  const lifeMultiplier = results.lifeGripMultiplier || 1; // Grip Glorify
  const lifeRate = g.perLifeRemaining * lifeMultiplier;
  const lifeGrip = results.failed ? 0 : results.lives * lifeRate;
  return {
    ballCount: results.returns,
    ballRate,
    ballGrip,
    lives: results.failed ? 0 : results.lives,
    lifeRate,
    lifeMultiplier,
    lifeGrip,
    total: ballGrip + lifeGrip,
  };
}

/** Record an attempt: unlocks, best scores and the grip payout. Returns the payout breakdown. */
export function recordAttempt(save, results) {
  const rec = save.levels[results.level] || { cleared: false, bestScore: 0, bestReturns: 0, bestConceded: null };
  const replay = rec.cleared;
  const payout = levelGrip(results, replay);
  save.grip += payout.total;
  rec.bestScore = Math.max(rec.bestScore, results.score);
  rec.bestReturns = Math.max(rec.bestReturns, results.returns);
  if (!results.failed) {
    rec.cleared = true;
    rec.bestConceded = rec.bestConceded === null ? results.conceded : Math.min(rec.bestConceded, results.conceded);
    save.highestUnlocked = Math.max(save.highestUnlocked, Math.min(CONFIG.levels.count, results.level + 1));
  }
  save.levels[results.level] = rec;
  return payout;
}

// ── cosmetics ────────────────────────────────────────────────────────────────

/** @returns {{label:string, options:Array}} */
export function cosmeticGroup(category, key) {
  return CONFIG.cosmetics[category][key];
}

function ownedKey(category, key) {
  return `${category}.${key}`;
}

export function ownsCosmetic(save, category, key, index) {
  if (cosmeticGroup(category, key).options[index].price === 0) return true;
  const list = save.owned.cosmetics[ownedKey(category, key)];
  return Array.isArray(list) && list.includes(index);
}

/** Buy (if needed) and equip. Returns 'equipped', 'bought' or 'unaffordable'. */
export function selectCosmetic(save, category, key, index) {
  const option = cosmeticGroup(category, key).options[index];
  if (!ownsCosmetic(save, category, key, index)) {
    if (save.grip < option.price) return 'unaffordable';
    save.grip -= option.price;
    const k = ownedKey(category, key);
    save.owned.cosmetics[k] = [...(save.owned.cosmetics[k] || []), index];
    save.equipped[key] = index;
    return 'bought';
  }
  save.equipped[key] = index;
  return 'equipped';
}

// ── overcharges ──────────────────────────────────────────────────────────────

export function overchargeCount(save, id) {
  return save.owned.overcharges[id] || 0;
}

export function overchargeCost(id) {
  return CONFIG.overcharges[id].cost;
}

/** Returns true if bought. */
export function buyOvercharge(save, id) {
  const cost = overchargeCost(id);
  if (save.grip < cost) return false;
  save.grip -= cost;
  save.owned.overcharges[id] = overchargeCount(save, id) + 1;
  return true;
}

/** Consume one copy of each active overcharge at level start. */
export function consumeOvercharges(save, ids) {
  for (const id of ids) {
    const n = overchargeCount(save, id);
    if (n > 0) save.owned.overcharges[id] = n - 1;
  }
}
