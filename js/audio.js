/**
 * audio.js — WebAudio oscillator sound effects plus the play-screen soundtrack
 * (see music.js). No files. Off by default; toggled from the settings panel
 * and persisted in the save.
 *
 * The AudioContext is created lazily on the first play() after a user gesture,
 * which is what browsers require.
 */
import { CONFIG } from './config.js';
import { ChipTune } from './music.js';
import { CrowdVoice } from './crowd.js';

export class GameAudio {
  constructor() {
    this.enabled = CONFIG.audio.enabled;
    this.ctx = null;
    this.music = new ChipTune(this);
    this.crowd = new CrowdVoice(this);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this._ensure();
    else this.stopMusic();
  }

  /**
   * Call from any user gesture (pointer or key). Browsers only let an
   * AudioContext start, or resume after being suspended, inside a gesture, so
   * this keeps the context alive no matter which screen the user is on.
   */
  unlock() {
    if (this.enabled) this._ensure();
  }

  /** Start the play-screen soundtrack (no-op when audio is off). */
  startMusic() {
    if (!this.enabled || !this._ensure()) return;
    this.music.start();
  }

  /** Fade the soundtrack out; position is kept for resume. */
  stopMusic() {
    if (this.ctx) this.music.stop();
  }

  /** Rewind the soundtrack so the next startMusic() begins at the top. */
  resetMusic() { this.music.reset(); }

  /** Shared one-second white-noise buffer used by the smash crack and the drums. */
  makeNoiseBuffer() {
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  _ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.volume;
    this.master.connect(this.ctx.destination);
    // sound effects get their own bus so they can sit above the music and crowd
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = CONFIG.audio.sfxVolume;
    this.sfx.connect(this.master);
    return true;
  }

  /**
   * One oscillator note.
   * @param {OscillatorType} type
   * @param {number} from start frequency
   * @param {number} to end frequency (exponential glide)
   * @param {number} duration seconds
   * @param {number} gain peak gain
   * @param {number} delay seconds
   */
  _tone(type, from, to, duration, gain = 0.3, delay = 0) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(this.sfx);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /**
   * A filtered white-noise burst (the "crack" of the smash).
   * @param {number} duration seconds
   * @param {number} gain peak gain
   * @param {number} freq lowpass cutoff at the start; it sweeps down to a tenth over the burst
   */
  _noise(duration, gain, freq, delay = 0) {
    this.makeNoiseBuffer();
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.1), t0 + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  /** @param {'pop'|'cleanPop'|'thud'|'lifeLost'|'levelComplete'|'zap'|'click'|'buy'|'fail'|'smash'|'smashReady'|'split'|'cheer'|'cheerSmash'|'cheerWin'|'boo'} name */
  play(name) {
    if (!this.enabled || !this._ensure()) return;
    const crowd = CONFIG.audio.crowd;
    switch (name) {
      // ── audience ──
      case 'cheer': this.crowd.cheer(crowd.cleanHit, crowd.cheerMs / 1000); break;
      case 'cheerSmash': this.crowd.cheer(crowd.smash, crowd.cheerMs / 1000); break;
      case 'cheerWin': this.crowd.cheer(crowd.win, crowd.winMs / 1000); break;
      case 'boo': this.crowd.boo(crowd.boo, crowd.booMs / 1000); break;
      // ── effects ──
      case 'smash':
        // a crack on top of a bass thump
        this._noise(0.14, 0.9, 2600);
        this._tone('sine', 120, 28, 0.5, 0.9);
        this._tone('triangle', 220, 40, 0.22, 0.4, 0.005);
        break;
      case 'smashReady': this._tone('square', 660, 990, 0.08, 0.2); this._tone('square', 990, 1320, 0.14, 0.22, 0.07); break;
      case 'split': this._tone('triangle', 700, 1400, 0.07, 0.18); break;
      case 'pop': this._tone('square', 520, 260, 0.09, 0.25); break;
      case 'cleanPop': this._tone('square', 880, 440, 0.12, 0.3); this._tone('triangle', 1320, 660, 0.12, 0.15, 0.02); break;
      case 'thud': this._tone('triangle', 160, 60, 0.12, 0.35); break;
      case 'lifeLost': this._tone('sawtooth', 140, 50, 0.5, 0.3); break;
      case 'levelComplete':
        [523, 659, 784, 1047].forEach((f, i) => this._tone('square', f, f, 0.16, 0.22, i * 0.12));
        break;
      case 'zap': this._tone('sawtooth', 1800, 200, 0.18, 0.28); break;
      case 'click': this._tone('square', 900, 700, 0.04, 0.12); break;
      case 'buy': this._tone('square', 660, 990, 0.1, 0.2); this._tone('square', 990, 1320, 0.1, 0.2, 0.08); break;
      case 'fail': this._tone('sawtooth', 220, 80, 0.7, 0.28); break;
      default: break;
    }
  }
}
