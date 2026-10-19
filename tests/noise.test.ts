import { describe, expect, it } from 'vitest';
import { makeNoise, NOISE_RMS, type NoiseKind } from '../src/engine/dsp/noise';
import { bandMean, welch } from './helpers';

function gen(kind: NoiseKind, n: number): Float32Array {
  const g = makeNoise(kind, 7);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = g.next();
  return x;
}

const db = (v: number): number => 10 * Math.log10(v);

describe('noise calibration', () => {
  for (const kind of ['pink', 'brown', 'white'] as const) {
    it(`${kind} has RMS ${NOISE_RMS} within 5%`, () => {
      const x = gen(kind, 1 << 19);
      let s = 0;
      for (const v of x) s += v * v;
      expect(Math.sqrt(s / x.length)).toBeGreaterThan(NOISE_RMS * 0.95);
      expect(Math.sqrt(s / x.length)).toBeLessThan(NOISE_RMS * 1.05);
    });
  }
});

describe('noise spectral slope (PSD per Hz, decade 200 Hz to 2 kHz)', () => {
  // Pink: -10 dB/decade. Brown: -20. White: 0. Measured with log-spaced DFT bins.
  const cases: [NoiseKind, number][] = [
    ['pink', -10],
    ['brown', -20],
    ['white', 0],
  ];
  for (const sr of [44100, 48000]) {
    for (const [kind, expected] of cases) {
      it(`${kind} at ${sr} Hz is ${expected} dB/decade +-1.5`, () => {
        const x = gen(kind, 1 << 17);
        const psd = welch(x);
        const lo = bandMean(psd, sr, 200, 400);
        const hi = bandMean(psd, sr, 2000, 4000);
        const slope = db(hi) - db(lo);
        expect(slope).toBeGreaterThan(expected - 1.5);
        expect(slope).toBeLessThan(expected + 1.5);
      });
    }
  }
});
