import { describe, expect, it } from 'vitest';
import { buildPlan, journeyBeatAt, journeyMinutes, parseJourney } from '../src/engine/plan';
import { parseToWorklet } from '../src/engine/protocol';
import { decodeShare, encodeShare, tokenFromHash } from '../src/engine/share';
import { JOURNEY_TEMPLATES, PRESETS } from '../src/engine/presets';
import { renderWav } from '../src/engine/wav';
import { baseSpec } from './helpers';

describe('presets', () => {
  it('stay inside the engine limits', () => {
    for (const p of PRESETS) {
      expect(p.beatHz).toBeGreaterThanOrEqual(0.5);
      expect(p.beatHz).toBeLessThanOrEqual(40);
      expect(p.beatHz).toBeGreaterThanOrEqual(p.band[0]);
      expect(p.beatHz).toBeLessThanOrEqual(p.band[1]);
      expect(p.carrierHz - p.beatHz / 2).toBeGreaterThan(100);
    }
  });
});

describe('buildPlan', () => {
  it('uses the user spec, not preset data (regression: tuning ignored on play)', () => {
    const p = buildPlan({
      spec: { ...baseSpec, beatHz: 12, carrierHz: 300 },
      journey: null,
      timerMin: 20,
      fadeInSec: 4,
      fadeOutSec: 4,
      ceilingDb: -18,
    });
    expect(p.spec.beatHz).toBe(12);
    expect(p.spec.carrierHz).toBe(300);
    expect(p.segments).toEqual([]);
    expect(p.durationSec).toBe(1200);
  });

  it('turns a journey into linear segments whose total is the duration', () => {
    const t = JOURNEY_TEMPLATES[0]!;
    const p = buildPlan({
      spec: { ...baseSpec, beatHz: t.startHz },
      journey: t.journey,
      timerMin: 5,
      fadeInSec: 4,
      fadeOutSec: 4,
      ceilingDb: -18,
    });
    expect(p.durationSec).toBe(journeyMinutes(t.journey) * 60);
    expect(p.segments.map((s) => s.toHz)).toEqual([10, 6]);
  });

  it('interpolates the journey preview', () => {
    const j = { steps: [{ toHz: 10, minutes: 10 }, { toHz: 6, minutes: 10 }] };
    expect(journeyBeatAt(15, j, 0)).toBe(15);
    expect(journeyBeatAt(15, j, 300)).toBeCloseTo(12.5);
    expect(journeyBeatAt(15, j, 600)).toBeCloseTo(10);
    expect(journeyBeatAt(15, j, 1200)).toBeCloseTo(6);
    expect(journeyBeatAt(15, j, 9999)).toBe(6);
  });

  it('rejects malformed journeys', () => {
    expect(parseJourney({ steps: [] })).toBeNull();
    expect(parseJourney({ steps: [{ toHz: 'x', minutes: 1 }] })).toBeNull();
    expect(parseJourney({ steps: Array(9).fill({ toHz: 5, minutes: 1 }) })).toBeNull();
    expect(parseJourney({ steps: [{ toHz: 999, minutes: 999 }] })?.steps[0]).toEqual({ toHz: 40, minutes: 60 });
  });
});

describe('share links', () => {
  const state = { spec: { ...baseSpec, beatHz: 7.5 }, timerMin: 30, journey: null };

  it('round-trip', () => {
    const tok = encodeShare(state);
    expect(tokenFromHash(`#s=${tok}`)).toBe(tok);
    expect(decodeShare(tok, -18)).toEqual(state);
  });

  it('clamp out-of-range values and reject garbage', () => {
    const hostile = encodeShare({ ...state, spec: { ...state.spec, levelDb: 0, beatHz: 999 } });
    const out = decodeShare(hostile, -18);
    expect(out?.spec.levelDb).toBe(-18);
    expect(out?.spec.beatHz).toBe(40);
    expect(decodeShare('not-base64!!', -18)).toBeNull();
    expect(decodeShare('e30', -18)).toBeNull();
    expect(decodeShare('A'.repeat(3000), -18)).toBeNull();
    expect(tokenFromHash('#s=<script>')).toBeNull();
  });
});

describe('worklet protocol', () => {
  it('accepts well-formed messages', () => {
    expect(parseToWorklet({ v: 1, type: 'fadeIn', sec: 4 })).toEqual({ v: 1, type: 'fadeIn', sec: 4 });
    expect(parseToWorklet({ v: 1, type: 'set', patch: { beatHz: 8 }, rampSec: 0.4 })).not.toBeNull();
  });

  it('rejects wrong versions, NaN, unknown types and bad shapes', () => {
    expect(parseToWorklet({ v: 2, type: 'fadeIn', sec: 4 })).toBeNull();
    expect(parseToWorklet({ v: 1, type: 'fadeIn', sec: NaN })).toBeNull();
    expect(parseToWorklet({ v: 1, type: 'set', patch: { beatHz: 'x' }, rampSec: 1 })).toBeNull();
    expect(parseToWorklet({ v: 1, type: 'set', patch: { mode: 'fm' }, rampSec: 1 })).toBeNull();
    expect(parseToWorklet({ v: 1, type: 'bogus' })).toBeNull();
    expect(parseToWorklet(null)).toBeNull();
    expect(parseToWorklet({ v: 1, type: 'schedule', segments: [{ toHz: 5 }] })).toBeNull();
  });
});

describe('wav export', () => {
  it('writes a valid 16-bit stereo header and bounded samples', async () => {
    const plan = buildPlan({
      spec: baseSpec,
      journey: null,
      timerMin: 1,
      fadeInSec: 0.5,
      fadeOutSec: 0.5,
      ceilingDb: -18,
    });
    const blob = await renderWav(plan, 2, 44100);
    const buf = await blob.arrayBuffer();
    const v = new DataView(buf);
    expect(new TextDecoder().decode(buf.slice(0, 4))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(2 * 44100 * 4);
    expect(buf.byteLength).toBe(44 + 2 * 44100 * 4);
    let peak = 0;
    for (let o = 44; o < buf.byteLength; o += 2) peak = Math.max(peak, Math.abs(v.getInt16(o, true)));
    expect(peak).toBeGreaterThan(1000);
    expect(peak).toBeLessThanOrEqual(Math.round(32767 * 0.1259) + 3); // -18 dBFS + dither
    // fade-in starts silent; the last frame has faded to (dithered) silence
    expect(Math.abs(v.getInt16(44, true))).toBeLessThanOrEqual(2);
    expect(Math.abs(v.getInt16(buf.byteLength - 4, true))).toBeLessThanOrEqual(2);
  });
});
