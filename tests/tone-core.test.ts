import { describe, expect, it } from 'vitest';
import { ToneCore } from '../src/engine/dsp/tone-core';
import { dbToGain, OUTPUT_CEILING_DB } from '../src/engine/types';
import { baseSpec, render, zeroCrossFreq } from './helpers';

const SR = 48000;

function started(spec = baseSpec, ceiling = -18, sr = SR): ToneCore {
  const c = new ToneCore(sr, spec, ceiling);
  c.fadeIn(0);
  return c;
}

describe('per-ear frequencies', () => {
  for (const sr of [44100, 48000]) {
    it(`binaural: L = carrier - beat/2, R = carrier + beat/2 at ${sr} Hz`, () => {
      const c = started({ ...baseSpec, carrierHz: 220, beatHz: 10 }, -18, sr);
      const { l, r } = render(c, 10);
      expect(zeroCrossFreq(l, sr)).toBeCloseTo(215, 1);
      expect(zeroCrossFreq(r, sr)).toBeCloseTo(225, 1);
    });
  }

  it('monaural and isochronic send identical signals to both ears', () => {
    for (const mode of ['monaural', 'isochronic'] as const) {
      const c = started({ ...baseSpec, mode });
      const { l, r } = render(c, 1);
      expect(Array.from(l.slice(1000, 1100))).toEqual(Array.from(r.slice(1000, 1100)));
    }
  });
});

describe('beat ramp (regression: induction never reached its target)', () => {
  it('is linear and reaches the target at exactly the stated duration', () => {
    const c = started({ ...baseSpec, beatHz: 18 });
    c.setBeatSchedule([{ toHz: 2, seconds: 60 }]);
    render(c, 30);
    expect(c.state.beatHz).toBeCloseTo(10, 2);
    render(c, 30);
    expect(c.state.beatHz).toBeCloseTo(2, 3);
    render(c, 30);
    expect(c.state.beatHz).toBe(2);
  });

  it('plays segments back to back', () => {
    const c = started({ ...baseSpec, beatHz: 15 });
    c.setBeatSchedule([
      { toHz: 10, seconds: 10 },
      { toHz: 6, seconds: 10 },
    ]);
    render(c, 10);
    expect(c.state.beatHz).toBeCloseTo(10, 3);
    render(c, 5);
    expect(c.state.beatHz).toBeCloseTo(8, 2);
    render(c, 5);
    expect(c.state.beatHz).toBeCloseTo(6, 3);
  });

  it('scales with the sample rate (no 48 kHz assumption)', () => {
    for (const sr of [44100, 48000]) {
      const c = started({ ...baseSpec, beatHz: 20 }, -18, sr);
      c.setBeatSchedule([{ toHz: 4, seconds: 20 }]);
      render(c, 20);
      expect(c.state.beatHz).toBeCloseTo(4, 3);
    }
  });
});

describe('manual set (regression: tuning ignored on play)', () => {
  it('honors the spec it was built with', () => {
    const c = started({ ...baseSpec, beatHz: 12, carrierHz: 300 });
    const { l, r } = render(c, 5);
    expect(zeroCrossFreq(l, SR)).toBeCloseTo(294, 1);
    expect(zeroCrossFreq(r, SR)).toBeCloseTo(306, 1);
  });

  it('a manual beat change cancels the schedule and ramps smoothly', () => {
    const c = started({ ...baseSpec, beatHz: 18 });
    c.setBeatSchedule([{ toHz: 2, seconds: 600 }]);
    render(c, 1);
    c.set({ beatHz: 12 }, 0.5);
    render(c, 1);
    expect(c.state.beatHz).toBeCloseTo(12, 3);
    render(c, 30);
    expect(c.state.beatHz).toBeCloseTo(12, 3);
  });
});

describe('level policy and limiter', () => {
  it('clamps level to the ceiling', () => {
    const c = started({ ...baseSpec, levelDb: -3 }, -18);
    expect(c.currentSpec.levelDb).toBe(-18);
    const { l, r } = render(c, 1);
    const peak = Math.max(...Array.from(l, Math.abs), ...Array.from(r, Math.abs));
    expect(peak).toBeLessThanOrEqual(dbToGain(-18) * 1.001);
  });

  it('never exceeds the output ceiling, with no NaN, even with noise at the maximum', () => {
    const c = started({ ...baseSpec, levelDb: -9, mix: { white: -9, rain: -9, storm: -9, forest: -9 } }, -9);
    const { l, r } = render(c, 3);
    const lim = dbToGain(OUTPUT_CEILING_DB);
    for (const x of [l, r]) for (const v of x) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(lim);
    }
  });

  it('saturator is monotonic', () => {
    const satC = dbToGain(OUTPUT_CEILING_DB);
    let prev = -Infinity;
    for (let x = -4; x <= 4; x += 0.001) {
      const y = satC * Math.tanh(x / satC);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});

describe('fades', () => {
  it('fade-in has no step larger than the smoothing allows', () => {
    const c = new ToneCore(SR, baseSpec, -18);
    c.fadeIn(2);
    const { l } = render(c, 3);
    let maxStep = 0;
    for (let i = 1; i < l.length; i++) maxStep = Math.max(maxStep, Math.abs(l[i]! - l[i - 1]!));
    // A full-scale 200 Hz sine at -18 dB moves at most 2*pi*200/48000*0.126 per sample.
    expect(maxStep).toBeLessThan(0.0035);
    expect(Math.abs(l[0]!)).toBeLessThan(1e-4);
  });

  it('is silent before fadeIn and finishes after fadeOut', () => {
    const c = new ToneCore(SR, baseSpec, -18);
    expect(Math.max(...Array.from(render(c, 0.1).l, Math.abs))).toBe(0);
    c.fadeIn(0);
    render(c, 0.5);
    c.fadeOut(1);
    render(c, 1.1);
    expect(c.state.finished).toBe(true);
    expect(Math.max(...Array.from(render(c, 0.1).l, Math.abs))).toBe(0);
  });

  it('scheduled end reaches silence at the stated elapsed time', () => {
    const c = started();
    c.scheduleEnd(10, 2);
    render(c, 7.9);
    expect(c.state.finished).toBe(false);
    const tail = render(c, 2.2);
    expect(c.state.finished).toBe(true);
    expect(Math.max(...Array.from(tail.l.slice(Math.round(2.1 * SR)), Math.abs))).toBe(0);
  });
});

describe('determinism', () => {
  it('same seed and inputs give identical output', () => {
    const spec = { ...baseSpec, mix: { rain: -30 } };
    const a = render(started(spec), 0.5).l;
    const b = render(started(spec), 0.5).l;
    expect(Array.from(a.slice(0, 500))).toEqual(Array.from(b.slice(0, 500)));
  });
});
