import { LAYER_IDS, MAX_LAYERS, type LayerId } from './dsp/ambient';

export type Mode = 'binaural' | 'isochronic' | 'monaural';
/** Active soundscape layers and their RMS level in dBFS. Absent = off. */
export type Mix = Partial<Record<LayerId, number>>;

/** Hard limits. The UI, share links and the worklet all validate against these. */
export const LIMITS = {
  carrierHz: { min: 100, max: 500 },
  beatHz: { min: 0.5, max: 40 },
  levelDb: { min: -60, max: -9 },
  ceilingDb: { min: -30, max: -9 },
  mixDb: { min: -60, max: -9 },
  fadeSec: { min: 0, max: 30 },
} as const;

export const DEFAULT_CEILING_DB = -18;
export const DEFAULT_LEVEL_DB = -30;
/** Output saturator ceiling in dBFS. Not reached at policy-compliant levels. */
export const OUTPUT_CEILING_DB = -3;

export interface ToneSpec {
  mode: Mode;
  carrierHz: number;
  beatHz: number;
  /** Peak level of the tone per channel, dBFS. */
  levelDb: number;
  mix: Mix;
}

export interface BeatSegment {
  toHz: number;
  seconds: number;
}

export interface Plan {
  spec: ToneSpec;
  /** Beat ramps played in order, each linear in Hz, starting from spec.beatHz. */
  segments: BeatSegment[];
  /** 0 = run until stopped. Playback reaches silence at this elapsed time. */
  durationSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  ceilingDb: number;
}

export interface LiveState {
  beatHz: number;
  carrierHz: number;
  elapsedSec: number;
  /** 0..1, current fade multiplier. */
  fade: number;
  finished: boolean;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export function sanitizeSpec(s: ToneSpec, ceilingDb: number): ToneSpec {
  const c = clamp(ceilingDb, LIMITS.ceilingDb.min, LIMITS.ceilingDb.max);
  return {
    mode: s.mode,
    carrierHz: clamp(s.carrierHz, LIMITS.carrierHz.min, LIMITS.carrierHz.max),
    beatHz: clamp(s.beatHz, LIMITS.beatHz.min, LIMITS.beatHz.max),
    levelDb: clamp(s.levelDb, LIMITS.levelDb.min, c),
    mix: sanitizeMix(s.mix, c),
  };
}

export function sanitizeMix(m: Mix | undefined, ceilingDb: number): Mix {
  const out: Mix = {};
  let n = 0;
  for (const id of LAYER_IDS) {
    const v = m?.[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || n >= MAX_LAYERS) continue;
    out[id] = clamp(v, LIMITS.mixDb.min, ceilingDb);
    n++;
  }
  return out;
}
