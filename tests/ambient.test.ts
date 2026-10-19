import { describe, expect, it } from 'vitest';
import { createLayer, LAYER_IDS, MAX_LAYERS, type LayerId } from '../src/engine/dsp/ambient';
import { ToneCore } from '../src/engine/dsp/tone-core';
import { sanitizeMix } from '../src/engine/types';
import { baseSpec, bandMean, render, welch } from './helpers';

const SR = 48000;

function gen(id: LayerId, seconds: number, sr = SR, seed = 0x5eed): { l: Float32Array; r: Float32Array } {
  const layer = createLayer(id, sr, seed);
  const n = Math.round(seconds * sr);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const o = new Float64Array(2);
  for (let i = 0; i < n; i++) {
    o[0] = 0;
    o[1] = 0;
    layer.next(o);
    l[i] = o[0]!;
    r[i] = o[1]!;
  }
  return { l, r };
}

const db = (v: number): number => 10 * Math.log10(v);

describe('soundscape layers', () => {
  it('every layer is finite, bounded and audible, at both common sample rates', () => {
    for (const sr of [44100, 48000]) {
      for (const id of LAYER_IDS) {
        const { l, r } = gen(id, 12, sr);
        let s = 0;
        let peak = 0;
        for (let i = 0; i < l.length; i++) {
          expect(Number.isFinite(l[i]!) && Number.isFinite(r[i]!)).toBe(true);
          s += l[i]! * l[i]! + r[i]! * r[i]!;
          peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
        }
        const rms = Math.sqrt(s / (2 * l.length));
        expect(rms, `${id}@${sr} rms`).toBeGreaterThan(0.02);
        expect(peak, `${id}@${sr} peak`).toBeLessThan(40);
      }
    }
  });

  it('is deterministic for a seed and different across seeds', () => {
    const a = gen('forest', 3);
    const b = gen('forest', 3);
    const c = gen('forest', 3, SR, 99);
    expect(Array.from(a.l.slice(5000, 5100))).toEqual(Array.from(b.l.slice(5000, 5100)));
    expect(Array.from(a.l.slice(5000, 5100))).not.toEqual(Array.from(c.l.slice(5000, 5100)));
  });

  it('has the spectral character its name implies', () => {
    const psd = (id: LayerId, secs = 20) => welch(gen(id, secs).l);
    const band = (p: Float64Array, lo: number, hi: number) => db(bandMean(p, SR, lo, hi));

    const rain = psd('rain');
    expect(band(rain, 2000, 6000) - band(rain, 100, 300)).toBeGreaterThan(6);

    const ocean = psd('ocean');
    expect(band(ocean, 100, 300) - band(ocean, 3000, 6000)).toBeGreaterThan(15);

    const fan = psd('fan');
    expect(band(fan, 95, 105) - band(fan, 2000, 4000)).toBeGreaterThan(10);

    const city = psd('city', 30);
    expect(band(city, 60, 200) - band(city, 2000, 4000)).toBeGreaterThan(10);

    const night = psd('night');
    expect(band(night, 3800, 5200) - band(night, 300, 600)).toBeGreaterThan(8);

  });

  it('forest is made of sparse bird events over a quiet bed', () => {
    const { l } = gen('forest', 30);
    const frames: number[] = [];
    const size = 4800;
    for (let o = 0; o + size <= l.length; o += size) {
      let e = 0;
      for (let i = o + 1; i < o + size; i++) e += (l[i]! - l[i - 1]!) ** 2;
      frames.push(Math.sqrt(e / size));
    }
    const sorted = [...frames].sort((a, b) => a - b);
    expect(sorted[sorted.length - 1]! / sorted[Math.floor(sorted.length / 2)]!).toBeGreaterThan(3);
  });

  it('layers are stereo (channels differ) except where mono is intended', () => {
    for (const id of ['rain', 'ocean', 'wind', 'stream', 'forest'] as LayerId[]) {
      const { l, r } = gen(id, 4);
      let diff = 0;
      for (let i = 0; i < l.length; i++) diff += Math.abs(l[i]! - r[i]!);
      expect(diff / l.length, id).toBeGreaterThan(1e-3);
    }
  });
});

describe('mix through ToneCore', () => {
  it('limits active layers and clamps levels to the ceiling', () => {
    const m = sanitizeMix({ rain: 0, storm: -20, ocean: -20, wind: -20, fire: -20, fan: -20 }, -18);
    expect(Object.keys(m)).toHaveLength(MAX_LAYERS);
    expect(m.rain).toBe(-18);
  });

  it('layer gain follows its level in dB', () => {
    const rmsOf = (db: number) => {
      const c = new ToneCore(SR, { ...baseSpec, levelDb: -60, mix: { white: db } }, -9);
      c.fadeIn(0);
      const { l } = render(c, 2);
      let s = 0;
      for (const v of l) s += v * v;
      return Math.sqrt(s / l.length);
    };
    const a = rmsOf(-30);
    const b = rmsOf(-40);
    expect(20 * Math.log10(a / b)).toBeCloseTo(10, 0);
  });

  it('turning a layer off ramps it down smoothly to silence', () => {
    const c = new ToneCore(SR, { ...baseSpec, levelDb: -60, mix: { white: -30 } }, -18);
    c.fadeIn(0);
    render(c, 1);
    c.set({ mix: {} }, 1);
    const { l } = render(c, 2);
    const size = 960;
    let prev = 0;
    for (let o = 0; o < SR; o += size) {
      let e = 0;
      for (let i = o; i < o + size; i++) e += l[i]! * l[i]!;
      const rms = Math.sqrt(e / size);
      if (prev > 0) expect(rms / prev).toBeLessThan(1.25);
      prev = rms;
    }
    const tail = l.slice(Math.round(1.2 * SR));
    expect(Math.max(...Array.from(tail, Math.abs))).toBeLessThan(0.00101); // only the -60 dB tone remains
  });
});
