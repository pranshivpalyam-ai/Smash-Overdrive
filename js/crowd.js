/**
 * crowd.js — synthesised audience reactions. No files. A cheer is built from
 * three layers so it reads as a crowd rather than a synth swell:
 *
 *   roar    two bands of noise (low body, bright air), each wobbled by a slow
 *           random tremolo so it sounds like many people rather than a hiss
 *   voices  a cluster of detuned sawtooth "voices" coming in staggered and
 *           sliding upward (the "yeah"), through a vowel-like low-pass
 *   claps   a scatter of short bright noise ticks across the sound (applause)
 *
 * A boo uses the roar and voices only, pitched low, sliding down, dull.
 *
 * Owned by GameAudio and routed through its own gain bus under the master so
 * the crowd level is tuned independently of the effects and the music.
 * Levels and lengths live in CONFIG.audio.crowd.
 */
import { CONFIG } from './config.js';

export class CrowdVoice {
  /** @param {import('./audio.js').GameAudio} audio */
  constructor(audio) {
    this.audio = audio;
    this.bus = null;
  }

  _ensureBus() {
    if (this.bus) return;
    const ctx = this.audio.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = CONFIG.audio.crowd.volume;
    this.bus.connect(this.audio.master);
  }

  /** A cheer. strength is the peak gain (roughly 0..1), duration in seconds. */
  cheer(strength, duration) {
    this._ensureBus();
    const t0 = this.audio.ctx.currentTime;
    this._roar(t0, duration, strength * 0.7, 'bandpass', 700, 0.6, 0.15, 0.55);
    this._roar(t0, duration, strength * 0.45, 'bandpass', 2400, 0.9, 0.2, 0.5);
    this._voices(t0, duration, strength * 0.6, {
      count: 14, low: 200, high: 600, glide: 1.2, cutoff: 2200, attack: 0.18, sustain: 0.55, stagger: 0.25,
    });
    this._claps(t0 + 0.08, duration, strength * 0.8, Math.round(10 * duration));
  }

  /** A boo: low, slow and dull. */
  boo(strength, duration) {
    this._ensureBus();
    const t0 = this.audio.ctx.currentTime;
    this._roar(t0, duration, strength * 0.5, 'lowpass', 480, 0.5, 0.35, 0.7);
    this._voices(t0, duration, strength, {
      count: 10, low: 110, high: 200, glide: 0.78, cutoff: 620, attack: 0.4, sustain: 0.8, stagger: 0.3,
    });
  }

  // ── layers ─────────────────────────────────────────────────────────────────

  /** Looping noise through a filter with a swell envelope and a random tremolo. */
  _roar(t0, duration, gain, type, freq, q, attack, sustain) {
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.makeNoiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    this._swell(env.gain, t0, duration, gain, attack, sustain);
    // tremolo: an LFO wobbles the level by ±35% so the roar breathes
    const trem = ctx.createGain();
    trem.gain.value = 0.65;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5 + Math.random() * 4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(trem.gain);
    src.connect(filter).connect(env).connect(trem).connect(this.bus);
    src.start(t0);
    lfo.start(t0);
    src.stop(t0 + duration + 0.05);
    lfo.stop(t0 + duration + 0.05);
  }

  /**
   * A cluster of sawtooth voices at random pitches between low and high Hz,
   * each coming in within `stagger` seconds and gliding to (pitch * glide),
   * through a shared low-pass with a swell envelope.
   */
  _voices(t0, duration, gain, o) {
    const ctx = this.audio.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.cutoff;
    const env = ctx.createGain();
    this._swell(env.gain, t0, duration, gain, o.attack, o.sustain);
    filter.connect(env).connect(this.bus);
    for (let i = 0; i < o.count; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f = o.low + Math.random() * (o.high - o.low);
      const start = t0 + Math.random() * o.stagger;
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * o.glide, start + duration * 0.6);
      // independent wobble so the cluster does not sound like one organ chord
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vib.frequency.value = 3 + Math.random() * 4;
      vibGain.gain.value = f * 0.015;
      vib.connect(vibGain).connect(osc.frequency);
      const vg = ctx.createGain();
      vg.gain.value = 1 / o.count;
      osc.connect(vg).connect(filter);
      osc.start(start);
      vib.start(start);
      osc.stop(t0 + duration + 0.05);
      vib.stop(t0 + duration + 0.05);
    }
  }

  /** Short bright noise ticks scattered over the duration, denser near the start. */
  _claps(t0, duration, gain, count) {
    const ctx = this.audio.ctx;
    const buffer = this.audio.makeNoiseBuffer();
    for (let i = 0; i < count; i++) {
      // bias toward the first half so the applause swells with the cheer
      const at = t0 + Math.pow(Math.random(), 1.4) * duration * 0.85;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loopStart = Math.random() * 0.5;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500 + Math.random() * 1800;
      filter.Q.value = 1.2;
      const g = ctx.createGain();
      const peak = Math.max(0.0001, gain * (0.5 + Math.random() * 0.5));
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
      src.connect(filter).connect(g).connect(this.bus);
      src.start(at, src.loopStart);
      src.stop(at + 0.05);
    }
  }

  /** Rise to the peak, settle to a sustain level, then fade to silence at t0 + duration. */
  _swell(param, t0, duration, peak, attack, sustain) {
    const p = Math.max(0.0001, peak);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(p, t0 + attack);
    param.exponentialRampToValueAtTime(Math.max(0.0001, p * sustain), t0 + attack + duration * 0.35);
    param.exponentialRampToValueAtTime(0.0001, t0 + duration);
  }
}
