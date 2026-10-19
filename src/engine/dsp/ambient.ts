import { Biquad, OnePole } from './filters';
import { makeNoise, Rng, type NoiseSource } from './noise';

/**
 * Procedural soundscapes. Everything is synthesized from noise, filters and short
 * event voices, so there are no audio files to ship or license and the output is
 * deterministic for a given seed (WAV export matches live playback).
 */
export const LAYER_IDS = [
  'pink',
  'brown',
  'white',
  'rain',
  'storm',
  'ocean',
  'wind',
  'stream',
  'fire',
  'forest',
  'night',
  'city',
  'fan',
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export const NOISE_LAYERS: readonly LayerId[] = ['pink', 'brown', 'white'];
export const MAX_LAYERS = 4;

export interface Layer {
  /** Write one stereo frame into out[0], out[1]. */
  next(out: Float64Array): void;
}

/** Per-layer gain so every layer has RMS 1 at unity (measured by scripts/calibrate-layers.ts). */
export const LAYER_NORM: Record<LayerId, number> = {
  pink: 0.9946,
  brown: 0.9959,
  white: 1,
  rain: 3.1879,
  storm: 1.768,
  ocean: 1.1267,
  wind: 5.7051,
  stream: 4.239,
  fire: 2.9562,
  forest: 7.5576,
  night: 10.1995,
  city: 1.3553,
  fan: 1.4482,
};

const TAU = Math.PI * 2;
const panGains = (pan: number): [number, number] => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface VoiceParams {
  f: number;
  /** Frequency change per sample (Hz). */
  df?: number;
  amp: number;
  /** Exponential decay time constant, seconds. Ignored when `cos` is set. */
  tau?: number;
  /** Length in seconds for raised-cosine envelopes. */
  dur?: number;
  cos?: boolean;
  /** Amplitude modulation rate (Hz) and depth 0..1, for trills. */
  am?: number;
  amDepth?: number;
  noise?: boolean;
  pan: number;
}

/** Fixed pool of short event voices: drops, bubbles, crackles, chirps. */
class Voices {
  private readonly active: Uint8Array;
  private readonly t: Float64Array;
  private readonly phase: Float64Array;
  private readonly f: Float64Array;
  private readonly df: Float64Array;
  private readonly amp: Float64Array;
  private readonly k: Float64Array;
  private readonly cur: Float64Array;
  private readonly len: Float64Array;
  private readonly cos: Uint8Array;
  private readonly am: Float64Array;
  private readonly amDepth: Float64Array;
  private readonly noise: Uint8Array;
  private readonly pl: Float64Array;
  private readonly pr: Float64Array;

  constructor(
    private n: number,
    private sr: number,
    private rng: Rng,
  ) {
    const f = () => new Float64Array(n);
    this.active = new Uint8Array(n);
    this.cos = new Uint8Array(n);
    this.noise = new Uint8Array(n);
    this.t = f();
    this.phase = f();
    this.f = f();
    this.df = f();
    this.amp = f();
    this.k = f();
    this.cur = f();
    this.len = f();
    this.am = f();
    this.amDepth = f();
    this.pl = f();
    this.pr = f();
  }

  spawn(p: VoiceParams): void {
    let i = this.active.indexOf(0);
    if (i < 0) i = 0; // steal the oldest slot
    const sr = this.sr;
    this.active[i] = 1;
    this.t[i] = 0;
    this.phase[i] = 0;
    this.f[i] = p.f;
    this.df[i] = p.df ?? 0;
    this.amp[i] = p.amp;
    this.cos[i] = p.cos ? 1 : 0;
    this.noise[i] = p.noise ? 1 : 0;
    this.am[i] = p.am ?? 0;
    this.amDepth[i] = p.amDepth ?? 0;
    this.cur[i] = 1;
    if (p.cos) {
      this.len[i] = Math.max(2, (p.dur ?? 0.05) * sr);
      this.k[i] = 1;
    } else {
      const tau = p.tau ?? 0.005;
      this.k[i] = Math.exp(-1 / (tau * sr));
      this.len[i] = tau * sr * 9;
    }
    const [l, r] = panGains(p.pan);
    this.pl[i] = l;
    this.pr[i] = r;
  }

  render(out: Float64Array): void {
    const sr = this.sr;
    for (let i = 0; i < this.n; i++) {
      if (this.active[i] === 0) continue;
      const t = this.t[i]!;
      if (t >= this.len[i]!) {
        this.active[i] = 0;
        continue;
      }
      let env: number;
      if (this.cos[i] === 1) env = 0.5 - 0.5 * Math.cos((TAU * t) / this.len[i]!);
      else {
        env = this.cur[i]!;
        this.cur[i] = env * this.k[i]!;
      }
      let s = this.noise[i] === 1 ? this.rng.next() : Math.sin(TAU * this.phase[i]!);
      const depth = this.amDepth[i]!;
      if (depth > 0) s *= 1 - depth + depth * 0.5 * (1 + Math.sin((TAU * this.am[i]! * t) / sr));
      let ph = this.phase[i]! + this.f[i]! / sr;
      if (ph >= 1) ph -= 1;
      this.phase[i] = ph;
      this.f[i] = this.f[i]! + this.df[i]!;
      this.t[i] = t + 1;
      const v = s * env * this.amp[i]!;
      out[0]! += v * this.pl[i]!;
      out[1]! += v * this.pr[i]!;
    }
  }
}

/** Per-sample Poisson trigger. */
const poisson = (rng: Rng, ratePerSec: number, sr: number): boolean => rng.u() < ratePerSec / sr;

class Pair {
  constructor(
    public l: NoiseSource,
    public r: NoiseSource,
  ) {}
}
const noisePair = (kind: 'pink' | 'brown' | 'white', seed: number): Pair => new Pair(makeNoise(kind, seed), makeNoise(kind, seed + 7919));

class ColorLayer implements Layer {
  private p: Pair;
  constructor(kind: 'pink' | 'brown' | 'white', seed: number) {
    this.p = noisePair(kind, seed);
  }
  next(out: Float64Array): void {
    out[0] = this.p.l.next();
    out[1] = this.p.r.next();
  }
}

class RainLayer implements Layer {
  private rng: Rng;
  private white: Pair;
  private hpL: OnePole;
  private hpR: OnePole;
  private lpL: OnePole;
  private lpR: OnePole;
  private voices: Voices;
  private thunder: Thunder | null;
  constructor(
    private sr: number,
    seed: number,
    private rate: number,
    private bed: number,
    storm: boolean,
  ) {
    this.rng = new Rng(seed + 11);
    this.white = noisePair('white', seed + 3);
    this.hpL = new OnePole(700, sr);
    this.hpR = new OnePole(700, sr);
    this.lpL = new OnePole(7500, sr);
    this.lpR = new OnePole(7500, sr);
    this.voices = new Voices(48, sr, this.rng);
    this.thunder = storm ? new Thunder(sr, seed + 5) : null;
  }
  next(out: Float64Array): void {
    out[0] = this.lpL.lp(this.hpL.hp(this.white.l.next())) * this.bed;
    out[1] = this.lpR.lp(this.hpR.hp(this.white.r.next())) * this.bed;
    if (poisson(this.rng, this.rate, this.sr)) {
      const u = this.rng.u();
      this.voices.spawn({
        f: 1400 + this.rng.u() * 5200,
        amp: 0.12 + 0.7 * u * u,
        tau: 0.0022 + this.rng.u() * 0.003,
        pan: this.rng.next(),
      });
    }
    this.voices.render(out);
    this.thunder?.add(out);
  }
}

/** Distant rumble: low-passed noise, slow attack, long decay, rare. */
class Thunder {
  private rng: Rng;
  private lp1: OnePole;
  private lp2: OnePole;
  private t = 0;
  private wait: number;
  private dur = 0;
  private amp = 0;
  private flutter = 0;
  private fl: OnePole;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.lp1 = new OnePole(90, sr);
    this.lp2 = new OnePole(140, sr);
    this.fl = new OnePole(6, sr);
    this.wait = 5 * sr;
  }
  add(out: Float64Array): void {
    if (this.dur === 0) {
      if (--this.wait <= 0) {
        this.dur = (5 + this.rng.u() * 5) * this.sr;
        this.amp = 3 + this.rng.u() * 3;
        this.t = 0;
      }
      return;
    }
    const x = this.t / this.sr;
    const attack = Math.min(1, x / 0.4);
    const env = attack * Math.exp(-Math.max(0, x - 0.4) / 2.4);
    this.flutter = this.fl.lp(this.rng.next()) * 6;
    const v = this.lp2.lp(this.lp1.lp(this.rng.next())) * 13 * env * this.amp * (0.7 + 0.3 * Math.min(1, Math.abs(this.flutter)));
    out[0]! += v;
    out[1]! += v * 0.9;
    if (++this.t >= this.dur) {
      this.dur = 0;
      this.wait = (14 + this.rng.u() * 28) * this.sr;
    }
  }
}

class OceanLayer implements Layer {
  private rng: Rng;
  private brown: Pair;
  private pink: Pair;
  private lpL: OnePole;
  private lpR: OnePole;
  private ph = 0;
  private period: number;
  private target: number;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.rng = new Rng(seed + 21);
    this.brown = noisePair('brown', seed + 1);
    this.pink = noisePair('pink', seed + 2);
    this.lpL = new OnePole(500, sr);
    this.lpR = new OnePole(500, sr);
    this.period = 9;
    this.target = 9;
  }
  private swell(phase: number): number {
    const p = phase - Math.floor(phase);
    return 0.12 + 0.88 * Math.pow(0.5 - 0.5 * Math.cos(TAU * p), 1.7);
  }
  next(out: Float64Array): void {
    this.ph += 1 / (this.period * this.sr);
    if (this.ph >= 1) {
      this.ph -= 1;
      this.target = 7 + this.rng.u() * 5;
    }
    this.period += (this.target - this.period) * 0.00002;
    const eL = this.swell(this.ph);
    const eR = this.swell(this.ph + 0.12);
    this.lpL.setCutoff(300 + 2200 * eL);
    this.lpR.setCutoff(300 + 2200 * eR);
    out[0] = this.lpL.lp(this.brown.l.next() * 1.4 + this.pink.l.next() * 0.9) * eL;
    out[1] = this.lpR.lp(this.brown.r.next() * 1.4 + this.pink.r.next() * 0.9) * eR;
  }
}

class WindLayer implements Layer {
  private pink: Pair;
  private bpL: Biquad;
  private bpR: Biquad;
  private n = 0;
  private t = 0;
  private gust = 1;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.pink = noisePair('pink', seed + 31);
    this.bpL = new Biquad(sr, 600, 1.4);
    this.bpR = new Biquad(sr, 640, 1.4);
  }
  next(out: Float64Array): void {
    this.t += 1 / this.sr;
    if ((this.n++ & 63) === 0) {
      const t = this.t;
      this.bpL.set(560 + 260 * Math.sin(TAU * 0.07 * t) + 140 * Math.sin(TAU * 0.113 * t + 1));
      this.bpR.set(620 + 240 * Math.sin(TAU * 0.061 * t + 2) + 150 * Math.sin(TAU * 0.127 * t));
      const g = 0.5 + 0.5 * Math.sin(TAU * 0.043 * t + 0.6) * Math.sin(TAU * 0.017 * t + 1.2);
      this.gust = 0.25 + 0.75 * g * g;
    }
    out[0] = this.bpL.process(this.pink.l.next()) * this.gust;
    out[1] = this.bpR.process(this.pink.r.next()) * this.gust;
  }
}

class StreamLayer implements Layer {
  private rng: Rng;
  private white: Pair;
  private bpL: Biquad;
  private bpR: Biquad;
  private mod: OnePole;
  private voices: Voices;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.rng = new Rng(seed + 41);
    this.white = noisePair('white', seed + 4);
    this.bpL = new Biquad(sr, 1900, 0.7);
    this.bpR = new Biquad(sr, 2300, 0.7);
    this.mod = new OnePole(11, sr);
    this.voices = new Voices(40, sr, this.rng);
  }
  next(out: Float64Array): void {
    const m = 0.55 + 1.9 * Math.abs(this.mod.lp(this.rng.next()));
    out[0] = this.bpL.process(this.white.l.next()) * m;
    out[1] = this.bpR.process(this.white.r.next()) * m;
    if (poisson(this.rng, 34, this.sr)) {
      const f = 500 + this.rng.u() * 900;
      this.voices.spawn({
        f,
        df: (f * 0.55) / (0.016 * this.sr),
        amp: 0.12 + 0.3 * this.rng.u(),
        tau: 0.007,
        pan: this.rng.next() * 0.8,
      });
    }
    this.voices.render(out);
  }
}

class FireLayer implements Layer {
  private rng: Rng;
  private brown: Pair;
  private lpL: OnePole;
  private lpR: OnePole;
  private mod: OnePole;
  private voices: Voices;
  private burst = 0;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.rng = new Rng(seed + 51);
    this.brown = noisePair('brown', seed + 5);
    this.lpL = new OnePole(260, sr);
    this.lpR = new OnePole(260, sr);
    this.mod = new OnePole(2.5, sr);
    this.voices = new Voices(48, sr, this.rng);
  }
  next(out: Float64Array): void {
    const m = 0.5 + 1.4 * Math.abs(this.mod.lp(this.rng.next()) * 3);
    out[0] = this.lpL.lp(this.brown.l.next()) * 0.8 * m;
    out[1] = this.lpR.lp(this.brown.r.next()) * 0.8 * m;
    if (this.burst > 0) this.burst--;
    else if (poisson(this.rng, 1.1, this.sr)) this.burst = Math.round(this.sr * (0.15 + this.rng.u() * 0.4));
    const rate = this.burst > 0 ? 55 : 6;
    if (poisson(this.rng, rate, this.sr)) {
      const u = this.rng.u();
      this.voices.spawn({ f: 0, amp: 0.1 + 1.2 * u * u * u, tau: 0.0008 + this.rng.u() * 0.0016, noise: true, pan: this.rng.next() });
    }
    if (poisson(this.rng, 0.35, this.sr)) {
      this.voices.spawn({ f: 90 + this.rng.u() * 80, amp: 0.5 + 0.6 * this.rng.u(), tau: 0.02, pan: this.rng.next() * 0.6 });
    }
    this.voices.render(out);
  }
}

interface QueuedSpawn {
  at: number;
  p: VoiceParams;
}

class ForestLayer implements Layer {
  private rng: Rng;
  private pink: Pair;
  private lpL: OnePole;
  private lpR: OnePole;
  private voices: Voices;
  private queue: QueuedSpawn[] = [];
  private frame = 0;
  private nextSong: number;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.rng = new Rng(seed + 61);
    this.pink = noisePair('pink', seed + 6);
    this.lpL = new OnePole(1100, sr);
    this.lpR = new OnePole(1100, sr);
    this.voices = new Voices(24, sr, this.rng);
    this.nextSong = Math.round(0.8 * sr);
  }
  private song(): void {
    const r = this.rng;
    const pan = r.next() * 0.9;
    const kind = Math.floor(r.u() * 3);
    const count = 2 + Math.floor(r.u() * 4);
    const base = 2300 + r.u() * 1900;
    let at = this.frame;
    for (let i = 0; i < count; i++) {
      const amp = 0.7 + r.u() * 0.5;
      const dur = 0.07 + r.u() * 0.09;
      const f = base * (1 + (r.u() - 0.5) * 0.12);
      const sweep = (kind === 0 ? 0.35 : kind === 1 ? -0.3 : 0) * f;
      this.queue.push({
        at,
        p: {
          f,
          df: sweep / (dur * this.sr),
          amp,
          cos: true,
          dur: kind === 2 ? dur * 2.2 : dur,
          am: kind === 2 ? 24 : 0,
          amDepth: kind === 2 ? 0.85 : 0,
          pan,
        },
      });
      at += Math.round((dur + 0.06 + r.u() * 0.14) * this.sr);
    }
  }
  next(out: Float64Array): void {
    out[0] = this.lpL.lp(this.pink.l.next()) * 0.1;
    out[1] = this.lpR.lp(this.pink.r.next()) * 0.1;
    if (this.frame >= this.nextSong) {
      this.song();
      this.nextSong = this.frame + Math.round((1.2 + this.rng.u() * 3.5) * this.sr);
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.at <= this.frame) {
        this.voices.spawn(this.queue[i]!.p);
        this.queue.splice(i, 1);
      }
    }
    this.frame++;
    this.voices.render(out);
  }
}

class NightLayer implements Layer {
  private rng: Rng;
  private pink: Pair;
  private lpL: OnePole;
  private lpR: OnePole;
  private voices: Voices;
  private crickets: { f: number; pan: number; next: number; rate: number }[];
  private queue: QueuedSpawn[] = [];
  private frame = 0;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.rng = new Rng(seed + 71);
    this.pink = noisePair('pink', seed + 8);
    this.lpL = new OnePole(500, sr);
    this.lpR = new OnePole(500, sr);
    this.voices = new Voices(32, sr, this.rng);
    this.crickets = [0, 1, 2].map((i) => ({
      f: 4100 + i * 320 + this.rng.u() * 120,
      pan: -0.7 + i * 0.7,
      next: Math.round(sr * (0.2 + this.rng.u())),
      rate: 1.1 + this.rng.u() * 0.7,
    }));
  }
  next(out: Float64Array): void {
    out[0] = this.lpL.lp(this.pink.l.next()) * 0.07;
    out[1] = this.lpR.lp(this.pink.r.next()) * 0.07;
    for (const c of this.crickets) {
      if (this.frame >= c.next) {
        for (let k = 0; k < 3; k++) {
          this.queue.push({
            at: this.frame + Math.round(k * 0.045 * this.sr),
            p: { f: c.f, amp: 0.5, cos: true, dur: 0.022, am: 0, pan: c.pan },
          });
        }
        c.next = this.frame + Math.round((1 / c.rate) * this.sr * (0.85 + 0.3 * this.rng.u()));
      }
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.at <= this.frame) {
        this.voices.spawn(this.queue[i]!.p);
        this.queue.splice(i, 1);
      }
    }
    this.frame++;
    this.voices.render(out);
  }
}

class CityLayer implements Layer {
  private rng: Rng;
  private brown: Pair;
  private pink: Pair;
  private lpL: OnePole;
  private lpR: OnePole;
  private wash: Biquad;
  private pass: { bp: Biquad; t: number; dur: number; amp: number; pan0: number; pan1: number; f0: number } | null = null;
  private wait: number;
  private n = 0;
  private t = 0;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.rng = new Rng(seed + 81);
    this.brown = noisePair('brown', seed + 9);
    this.pink = noisePair('pink', seed + 10);
    this.lpL = new OnePole(220, sr);
    this.lpR = new OnePole(220, sr);
    this.wash = new Biquad(sr, 520, 0.5);
    this.wait = Math.round(2 * sr);
  }
  next(out: Float64Array): void {
    this.t += 1 / this.sr;
    const swing = 0.6 + 0.4 * Math.sin(TAU * 0.05 * this.t);
    const w = this.wash.process(this.pink.l.next()) * 0.7 * swing;
    out[0] = this.lpL.lp(this.brown.l.next()) * 0.9 + w;
    out[1] = this.lpR.lp(this.brown.r.next()) * 0.9 + w;
    if (!this.pass) {
      if (--this.wait <= 0) {
        const dir = this.rng.u() < 0.5 ? -1 : 1;
        this.pass = {
          bp: new Biquad(this.sr, 350, 1.2),
          t: 0,
          dur: (4 + this.rng.u() * 3) * this.sr,
          amp: 1.6 + this.rng.u() * 1.2,
          pan0: -0.9 * dir,
          pan1: 0.9 * dir,
          f0: 300 + this.rng.u() * 150,
        };
      }
    } else {
      const p = this.pass;
      const x = p.t / p.dur;
      if ((this.n++ & 31) === 0) p.bp.set(p.f0 * (1 + 1.1 * Math.sin(Math.PI * x)));
      const bell = Math.sin(Math.PI * x);
      const v = p.bp.process(this.rng.next()) * bell * bell * p.amp;
      const [gl, gr] = panGains(lerp(p.pan0, p.pan1, x));
      out[0]! += v * gl * 1.4;
      out[1]! += v * gr * 1.4;
      if (++p.t >= p.dur) {
        this.pass = null;
        this.wait = Math.round((5 + this.rng.u() * 9) * this.sr);
      }
    }
  }
}

class FanLayer implements Layer {
  private pink: Pair;
  private lpL: OnePole;
  private lpR: OnePole;
  private ph = 0;
  private t = 0;
  constructor(
    private sr: number,
    seed: number,
  ) {
    this.pink = noisePair('pink', seed + 91);
    this.lpL = new OnePole(1700, sr);
    this.lpR = new OnePole(1700, sr);
  }
  next(out: Float64Array): void {
    this.t += 1 / this.sr;
    this.ph += 100 / this.sr;
    if (this.ph >= 1) this.ph -= 1;
    const hum = (Math.sin(TAU * this.ph) * 0.14 + Math.sin(TAU * this.ph * 2) * 0.07) * (1 + 0.03 * Math.sin(TAU * 0.3 * this.t));
    out[0] = this.lpL.lp(this.pink.l.next()) * 0.8 + hum;
    out[1] = this.lpR.lp(this.pink.r.next()) * 0.8 + hum;
  }
}

export function createLayer(id: LayerId, sr: number, seed: number): Layer {
  switch (id) {
    case 'pink':
    case 'brown':
    case 'white':
      return new ColorLayer(id, seed);
    case 'rain':
      return new RainLayer(sr, seed, 55, 0.5, false);
    case 'storm':
      return new RainLayer(sr, seed, 130, 0.85, true);
    case 'ocean':
      return new OceanLayer(sr, seed);
    case 'wind':
      return new WindLayer(sr, seed);
    case 'stream':
      return new StreamLayer(sr, seed);
    case 'fire':
      return new FireLayer(sr, seed);
    case 'forest':
      return new ForestLayer(sr, seed);
    case 'night':
      return new NightLayer(sr, seed);
    case 'city':
      return new CityLayer(sr, seed);
    case 'fan':
      return new FanLayer(sr, seed);
  }
}
