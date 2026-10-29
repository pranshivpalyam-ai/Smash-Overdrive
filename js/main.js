/**
 * main.js — bootstrap, the explicit app state machine and the frame loop.
 *
 * States (see ui/screens.js for the transition table):
 *   TITLE → LEVEL_SELECT → PLAYING → PAUSED / COMPLETE / FAILED, with SHOP and
 *   SETTINGS reachable from the menus. The render loop runs only in TITLE
 *   (idle court pan) and PLAYING; every other state shows a 2D screen over
 *   either the static backdrop or a frozen frame.
 */
import { CONFIG } from './config.js';
import { GameScene } from './scene.js';
import { FollowCamera } from './camera.js';
import { Court } from './court.js';
import { Stands } from './stands.js';
import { Ball } from './ball.js';
import { BallView } from './ballview.js';
import { DepthCues } from './depth.js';
import { Input } from './input.js';
import { Game, EV } from './game.js';
import { PlayerView } from './player.js';
import { Effects } from './fx.js';
import { SmashMeterView } from './smashmeter.js';
import { GameAudio } from './audio.js';
import { loadSave, writeSave, resetSave } from './save.js';
import { recordAttempt, consumeOvercharges, overchargeCount } from './economy.js';
import { Hud } from './ui/hud.js';
import { Screens, STATE, TRANSITIONS } from './ui/screens.js';

// ── DOM ──────────────────────────────────────────────────────────────────────
const container = document.getElementById('app');
const canvas = document.getElementById('gl');
const ui = document.getElementById('ui');
const arrowsEl = document.getElementById('arrows');
const screensEl = document.getElementById('screens');
const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const bot = debug && params.get('bot') === '1'; // debug autoplay: runs to each ball and swings on time

// ── save and settings ────────────────────────────────────────────────────────
let save = loadSave();
const persist = () => writeSave(save);
CONFIG.render.renderScale = save.settings.renderScale;
const audio = new GameAudio();
audio.enabled = save.settings.audio;

// ── 3D ───────────────────────────────────────────────────────────────────────
const gameScene = new GameScene(canvas, container);
const follow = new FollowCamera();
const court = new Court(gameScene);
const stands = new Stands(gameScene);
const ballView = new BallView(gameScene);
const cues = new DepthCues(gameScene, arrowsEl);
const playerView = new PlayerView(gameScene);
const fx = new Effects(gameScene, court);
const meter = new SmashMeterView(gameScene);
const input = new Input(container);
const hud = new Hud(ui);

// an all-inactive pool so the cue renderer can clear itself when no level is running
const emptyBalls = Array.from({ length: CONFIG.ball.maxBalls }, () => new Ball());
const idleGame = { player: { x: 0, vx: 0, swingElapsed: -1, swingProgress: 0, cooldown: 0 }, balls: emptyBalls, hitStop: 0 };

/** Scale the 480x854 design-space UI to the letterboxed stage. */
function fitUi() {
  ui.style.transform = `scale(${gameScene.viewWidth / CONFIG.render.baseWidth})`;
}
window.addEventListener('resize', fitUi);
fitUi();

// ── app state ────────────────────────────────────────────────────────────────
let state = null;
let game = null;
let currentLevel = 1;
let currentOvercharges = [];
let selectedLevel = 1;
let shopReturn = STATE.TITLE;
let settingsReturn = STATE.TITLE;
let ending = null; // { next, results, timer } while the last flourish plays out
let idleTime = 0;

const actions = {
  play: () => setState(STATE.LEVEL_SELECT),
  title: () => setState(STATE.TITLE),
  start: (level, ids) => setState(STATE.PLAYING, { level, ids }),
  shop: () => { shopReturn = state === STATE.TITLE ? STATE.TITLE : STATE.LEVEL_SELECT; setState(STATE.SHOP); },
  settings: () => { settingsReturn = state; setState(STATE.SETTINGS); },
  back: () => {
    if (state === STATE.SHOP) setState(shopReturn);
    else if (state === STATE.SETTINGS) setState(settingsReturn);
  },
  resume: () => setState(STATE.PLAYING, { resume: true }),
  retry: () => {
    // a retry is a fresh attempt: overcharges are consumed again if still owned
    const ids = currentOvercharges.filter((id) => overchargeCount(save, id) > 0);
    if (state === STATE.PAUSED) forceState(STATE.PLAYING, { level: currentLevel, ids });
    else setState(STATE.PLAYING, { level: currentLevel, ids });
  },
  quit: () => setState(STATE.LEVEL_SELECT),
  continue: () => setState(STATE.LEVEL_SELECT),
  cosmeticsChanged: () => playerView.setCosmetics(save.equipped),
  setAudio: (on) => { save.settings.audio = on; audio.setEnabled(on); persist(); if (on) audio.play('click'); },
  setRenderScale: (v) => { save.settings.renderScale = v; gameScene.setRenderScale(v); persist(); },
  resetProgress: () => { save = resetSave(); screens.ctx.save = save; persist(); playerView.setCosmetics(save.equipped); setState(STATE.TITLE); },
};

const screens = new Screens(screensEl, { save, persist, audio, actions });
if (debug) { window.__audio = audio; window.__actions = actions; } // debug hooks for automated tests
console.info(`Smash Overdrive build ${CONFIG.build}`);

// any gesture unlocks/resumes the audio context (browser autoplay policy)
document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
document.addEventListener('keydown', () => audio.unlock());

/** Transition with validation against the table. */
function setState(next, data = {}) {
  if (state !== null && !TRANSITIONS[state].includes(next)) {
    console.warn(`blocked transition ${state} → ${next}`);
    return;
  }
  forceState(next, data);
}

/** Transition without validation (used for retry-from-pause, which restarts the level). */
function forceState(next, data = {}) {
  state = next;
  input.clear();
  ending = null;
  // the soundtrack plays only on the play screen
  if (next === STATE.PLAYING) {
    if (!data.resume) audio.resetMusic();
    audio.startMusic();
  } else {
    audio.stopMusic();
  }
  switch (next) {
    case STATE.TITLE:
      game = null;
      hud.hide();
      fx.reset();
      playerView.setCosmetics(save.equipped);
      follow.snapTo(0);
      screens.showTitle();
      startLoop();
      break;
    case STATE.LEVEL_SELECT:
      game = null;
      hud.hide();
      stopLoop();
      screens.showLevelSelect(selectedLevel);
      break;
    case STATE.SHOP:
      stopLoop();
      hud.hide();
      screens.showShop();
      break;
    case STATE.SETTINGS:
      stopLoop();
      screens.showSettings(settingsReturn);
      break;
    case STATE.PLAYING:
      if (!data.resume) startLevel(data.level, data.ids);
      screens.hide();
      hud.show();
      startLoop();
      break;
    case STATE.PAUSED:
      stopLoop();
      screens.showPause(currentLevel);
      break;
    case STATE.COMPLETE:
      stopLoop();
      hud.hide();
      selectedLevel = Math.min(CONFIG.levels.count, currentLevel + 1);
      screens.showComplete(data.results, data.payout);
      break;
    case STATE.FAILED:
      stopLoop();
      hud.hide();
      screens.showFailed(data.results, data.payout);
      break;
    default:
      break;
  }
}

// ── level lifecycle ──────────────────────────────────────────────────────────
function startLevel(level, ids) {
  currentLevel = level;
  selectedLevel = level;
  currentOvercharges = ids;
  consumeOvercharges(save, ids);
  persist();
  game = new Game(level, ids);
  if (debug) window.__game = game; // debug hook for automated tests
  fx.reset();
  meter.reset();
  if (game.overcharges.has('titaniumNet')) fx.setNetVisible(true);
  if (game.overcharges.has('stickyClay')) court.setTint(CONFIG.overcharges.stickyClay.tint);
  playerView.setCosmetics(save.equipped);
  follow.snapTo(0);
  hud.setLevel(game, ids);
}

function finishLevel(next, results) {
  const payout = recordAttempt(save, results);
  persist();
  setState(next, { results, payout });
}

/** Presentation reactions to game events. */
function handleEvent(e) {
  fx.handle(e);
  switch (e.type) {
    case EV.HIT:
      playerView.model.racquet.flash();
      stands.cheer(e.clean ? CONFIG.stands.cheerClean : CONFIG.stands.cheerHit);
      if (!e.smash) {
        follow.kickBack(e.clean ? 1.4 : 1);
        audio.play(e.clean ? 'cleanPop' : 'pop');
        if (e.clean) audio.play('cheer');
      }
      if (e.clean) hud.cleanHit();
      break;
    case EV.SMASH_READY:
      hud.smashReady();
      audio.play('smashReady');
      break;
    case EV.SMASH:
      stands.cheer(CONFIG.stands.cheerSmash);
      follow.shake(CONFIG.smash.shakeStrength);
      follow.kickBack(CONFIG.smash.kickStrength);
      hud.smash();
      audio.play('smash');
      audio.play('cheerSmash');
      break;
    case EV.RETURNED:
      stands.cheer(CONFIG.stands.cheerReturn);
      break;
    case EV.SPLIT:
      audio.play('split');
      break;
    case EV.WALL_BOUNCE:
      audio.play('thud');
      break;
    case EV.NET_HIT:
    case EV.NET_BREAK:
      audio.play('thud');
      break;
    case EV.LIFE_LOST:
      hud.lifeLost(e.lives);
      follow.shake();
      audio.play('lifeLost');
      break;
    case EV.LASER:
      audio.play('zap');
      break;
    case EV.LEVEL_COMPLETE:
      audio.play('levelComplete');
      audio.play('cheerWin');
      ending = { next: STATE.COMPLETE, results: e, timer: CONFIG.ui.completeDelayMs / 1000 };
      break;
    case EV.LEVEL_FAILED:
      audio.play('fail');
      audio.play('boo');
      ending = { next: STATE.FAILED, results: e, timer: CONFIG.ui.failedDelayMs / 1000 };
      break;
    default:
      break;
  }
}

// ── frame loop ───────────────────────────────────────────────────────────────
let running = false;
let rafId = 0;
let last = performance.now();
let fpsFrames = 0, fpsTime = 0, fps = 0;
let autoFrames = 0, autoTime = 0;

function frame(now) {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(CONFIG.performance.maxDt, (now - last) / 1000);
  last = now;
  trackPerformance(dt);

  if (state === STATE.TITLE) {
    idleTime += dt;
    const c = CONFIG.ui;
    follow.update(dt, Math.sin(idleTime * c.titlePanSpeed) * c.titlePanRange, 0);
    playerView.update(dt, idleGame, false);
    meter.update(dt, null);
    ballView.sync(emptyBalls, dt);
    cues.sync(emptyBalls, follow.camera, dt, CONFIG.render.baseHeight);
    stands.update(dt);
    fx.update(dt);
    gameScene.render(follow.camera);
    return;
  }

  if (state !== STATE.PLAYING || !game) return;

  if (input.consumePause() && !ending) {
    setState(STATE.PAUSED);
    return;
  }

  const control = bot ? botControl(dt) : { axis: input.moveAxis, dragTarget: input.dragTarget, swing: input.consumeSwing() };
  game.update(dt, control);
  for (const e of game.events) handleEvent(e);
  game.events.length = 0;

  follow.update(dt, game.player.x, game.player.vx / CONFIG.player.maxSpeed);
  playerView.update(dt, game, game.frozen);
  meter.update(dt, game);
  ballView.sync(game.balls, game.frozen ? 0 : dt);
  cues.sync(game.balls, follow.camera, game.frozen ? 0 : dt, CONFIG.render.baseHeight);
  if (game.overcharges.has('stickyClay') && !game.frozen) fx.dustTrails(game.balls, dt);
  if (game.overcharges.has('magnetisedGrip') && !game.frozen) fx.magnetSparks(game.balls, dt);
  stands.update(dt);
  fx.update(dt);
  hud.update(game, save.grip, dt);
  gameScene.render(follow.camera);

  if (ending) {
    ending.timer -= dt;
    if (ending.timer <= 0) {
      const { next, results } = ending;
      ending = null;
      finishLevel(next, results);
    }
  }
}

/** Debug autoplay (?debug=1&bot=1): chase the nearest incoming ball, swing when it is in reach. */
function botControl(dt) {
  let target = null;
  for (const b of game.balls) {
    if (b.active && b.incoming && (!target || b.z > target.z)) target = b;
  }
  if (!target) return { axis: 0, dragTarget: null, swing: false };
  const diff = target.predictXAtZ(0) - game.player.x;
  const vz = target.vz * game.overcharges.ballTimeScale();
  const lead = CONFIG.swing.reach + vz * (CONFIG.swing.durationMs / 2000) + vz * dt * 0.5;
  return { axis: Math.abs(diff) > 0.12 ? Math.sign(diff) : 0, dragTarget: null, swing: target.z > -lead && Math.abs(diff) < 0.9 };
}

/** FPS readout and the automatic render-scale step-down. */
function trackPerformance(dt) {
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    if (debug) hud.setDebug(`${fps} FPS  SCALE ${gameScene.renderScale.toFixed(1)}`);
  }
  const r = CONFIG.render;
  if (!r.autoScale || state !== STATE.PLAYING) return;
  autoFrames++;
  autoTime += dt;
  if (autoTime * 1000 >= r.autoScaleWindowMs) {
    const avg = autoFrames / autoTime;
    autoFrames = 0;
    autoTime = 0;
    if (avg < r.autoScaleMinFps && gameScene.renderScale > r.autoScaleFloor) {
      gameScene.setRenderScale(Math.max(r.autoScaleFloor, gameScene.renderScale - r.autoScaleStep));
    }
  }
}

function startLoop() {
  if (running) return;
  running = true;
  last = performance.now();
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  running = false;
  cancelAnimationFrame(rafId);
}

// ── global input routing ─────────────────────────────────────────────────────
input.onAnyKey = (key) => {
  if (state === STATE.PLAYING) return;
  screens.handleKey(key);
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === STATE.PLAYING) setState(STATE.PAUSED);
    else stopLoop();
  } else if (state === STATE.TITLE) {
    startLoop();
  }
});

if (debug) hud.root.hidden = false;
setState(STATE.TITLE);
