/**
 * music.js — procedural 8-bit adventure soundtrack. No files: four WebAudio
 * voices (25% pulse lead, 50% square arpeggio, triangle bass, noise drums)
 * sequenced on a 16th-note grid and looped.
 *
 * The loop is scheduled a little ahead of the clock from a short timer, which
 * is the standard way to keep WebAudio timing tight. The music runs through
 * its own gain bus under the master so it stays quieter than the effects.
 *
 * Owned by GameAudio; call start() when the play screen appears and stop()
 * when it goes away.
 */
import { CONFIG } from './config.js';

const SEMITONE = Math.pow(2, 1 / 12);
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'F#4' → frequency in Hz. */
function freq(name) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const semis = NOTE_INDEX[m[1]] + (m[2] ? 1 : 0) + (parseInt(m[3], 10) - 4) * 12 - 9; // relative to A4
  return 440 * Math.pow(SEMITONE, semis);
}

/**
 * A track is a list of [note, lengthIn16ths] pairs ('-' is a rest). Expanded
 * to events with absolute step positions so the scheduler can look them up.
 */
function expand(pairs) {
  const events = [];
  let step = 0;
  for (const [note, len] of pairs) {
    if (note !== '-') events.push({ step, freq: freq(note), len });
    step += len;
  }
  return { events, length: step };
}

// ── the tune: 8 bars in E minor, 150 BPM ─────────────────────────────────────
// chord per bar: Em | G | C | D | Em | C | Am | B

const LEAD = expand([
  ['E4', 4], ['G4', 2], ['A4', 2], ['B4', 4], ['A4', 2], ['G4', 2],
  ['A4', 4], ['G4', 2], ['F#4', 2], ['E4', 6], ['D4', 2],
  ['E4', 4], ['G4', 2], ['B4', 2], ['D5', 4], ['C5', 2], ['B4', 2],
  ['A4', 2], ['B4', 2], ['A4', 2], ['G4', 2], ['F#4', 8],
  ['E5', 4], ['D5', 2], ['B4', 2], ['C5', 4], ['B4', 2], ['A4', 2],
  ['B4', 4], ['A4', 2], ['G4', 2], ['A4', 6], ['B4', 2],
  ['C5', 2], ['B4', 2], ['A4', 2], ['G4', 2], ['A4', 4], ['B4', 4],
  ['E4', 4], ['F#4', 2], ['G4', 2], ['E4', 8],
]);

/** One bar of 16th-note arpeggio over a chord triad. */
function arpBar(a, b, c) {
  return [[a, 1], [b, 1], [c, 1], [b, 1], [a, 1], [b, 1], [c, 1], [b, 1],
          [a, 1], [b, 1], [c, 1], [b, 1], [a, 1], [b, 1], [c, 1], [b, 1]];
}
const ARP = expand([
  ...arpBar('E4', 'G4', 'B4'),
  ...arpBar('G4', 'B4', 'D5'),
  ...arpBar('C4', 'E4', 'G4'),
  ...arpBar('D4', 'F#4', 'A4'),
  ...arpBar('E4', 'G4', 'B4'),
  ...arpBar('C4', 'E4', 'G4'),
  ...arpBar('A3', 'C4', 'E4'),
  ...arpBar('B3', 'D#4', 'F#4'),
]);

/** One bar of driving bass: root, root, octave, root, root, octave, root, fifth. */
function bassBar(root, octave, fifth) {
  return [[root, 2], [root, 2], [octave, 2], [root, 2], [root, 2], [octave, 2], [root, 2], [fifth, 2]];
}
const BASS = expand([
  ...bassBar('E2', 'E3', 'B2'),
  ...bassBar('G2', 'G3', 'D3'),
  ...bassBar('C2', 'C3', 'G2'),
  ...bassBar('D2', 'D3', 'A2'),
  ...bassBar('E2', 'E3', 'B2'),
  ...bassBar('C2', 'C3', 'G2'),
  ...bassBar('A2', 'A3', 'E3'),
  ...bassBar('B2', 'B3', 'F#3'),
]);

// drums are on a 16-step bar: K = kick, S = snare, h = closed hat, . = nothing
const DRUM_BAR = 'KhhhShhhKhKhShhh';

export class ChipTune {
  /** @param {import('./audio.js').GameAudio} audio */
  constructor(audio) {
    this.audio = audio;
    this.bus = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.pulseWave = null;
    this.loopLength = LEAD.length; // 128 steps
  }

  get running() { return this.timer !== null; }

  /** Begin (or continue) the loop from the current step. */
  start() {
    if (this.running) return;
    const ctx = this.audio.ctx;
    const music = CONFIG.audio.music;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.connect(this.audio.master);
      this.pulseWave = this._makePulse(ctx, 0.25);
    }
    this.bus.gain.cancelScheduledValues(ctx.currentTime);
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(music.volume, ctx.currentTime + 0.08);
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this._tick(), music.lookaheadMs);
    this._tick();
  }

  /** Fade out and stop scheduling. The step position is kept so resume continues the tune. */
  stop() {
    if (!this.running) return;
    clearInterval(this.timer);
    this.timer = null;
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), t);
    this.bus.gain.exponentialRampToValueAtTime(0.0001, t + CONFIG.audio.music.fadeOutMs / 1000);
  }

  /** Restart from the top on the next start(). */
  reset() { this.step = 0; }

  _tick() {
    const ctx = this.audio.ctx;
    const music = CONFIG.audio.music;
    const stepSeconds = 60 / music.bpm / 4;
    while (this.nextTime < ctx.currentTime + music.scheduleAhead) {
      this._scheduleStep(this.step, this.nextTime, stepSeconds);
      this.step = (this.step + 1) % this.loopLength;
      this.nextTime += stepSeconds;
    }
  }

  _scheduleStep(step, t, stepSeconds) {
    for (const e of LEAD.events) if (e.step === step) this._note(this.pulseWave, e.freq, t, e.len * stepSeconds, 0.22);
    for (const e of ARP.events) if (e.step === step) this._note('square', e.freq, t, e.len * stepSeconds * 0.9, 0.05);
    for (const e of BASS.events) if (e.step === step) this._note('triangle', e.freq, t, e.len * stepSeconds * 0.85, 0.3);
    const d = DRUM_BAR[step % 16];
    if (d === 'K') this._kick(t);
    else if (d === 'S') this._snare(t);
    else if (d === 'h') this._hat(t);
  }

  /**
   * One chip voice note with a snappy envelope.
   * @param {OscillatorType|PeriodicWave} type
   */
  _note(type, hz, t, duration, gain) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    if (typeof type === 'string') osc.type = type;
    else osc.setPeriodicWave(type);
    osc.frequency.setValueAtTime(hz, t);
    const release = Math.min(0.05, duration * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain, t + duration - release);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.bus);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  _kick(t) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  _snare(t) { this._noiseHit(t, 0.09, 0.22, 1800); }
  _hat(t) { this._noiseHit(t, 0.03, 0.08, 6000); }

  _noiseHit(t, duration, gain, cutoff) {
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noiseBuffer || this.audio.makeNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.bus);
    src.start(t);
    src.stop(t + duration + 0.01);
  }

  /** A pulse wave with the given duty cycle, the classic NES lead timbre. */
  _makePulse(ctx, duty) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }
}
