import type { Journey } from './plan';
import type { Mix, ToneSpec } from './types';

export interface Preset {
  id: 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
  beatHz: number;
  carrierHz: number;
  /** Conventional EEG band range this beat falls in, Hz. A naming convention, not a measurement. */
  band: [number, number];
}

/** Descriptive labels only. See docs/safety.md for the wording rules. */
export const PRESETS: readonly Preset[] = [
  { id: 'delta', beatHz: 2, carrierHz: 200, band: [1, 4] },
  { id: 'theta', beatHz: 6, carrierHz: 210, band: [4, 8] },
  { id: 'alpha', beatHz: 10, carrierHz: 220, band: [8, 13] },
  { id: 'beta', beatHz: 15, carrierHz: 200, band: [13, 30] },
  { id: 'gamma', beatHz: 40, carrierHz: 220, band: [30, 45] },
];

export const DEFAULT_PRESET_ID: Preset['id'] = 'alpha';

export function presetSpec(p: Preset, base: Pick<ToneSpec, 'levelDb' | 'mix' | 'mode'>): ToneSpec {
  return { ...base, carrierHz: p.carrierHz, beatHz: p.beatHz };
}

export interface JourneyTemplate {
  id: 'windDown' | 'settle' | 'lift';
  startHz: number;
  journey: Journey;
}

export const JOURNEY_TEMPLATES: readonly JourneyTemplate[] = [
  {
    id: 'windDown',
    startHz: 15,
    journey: {
      steps: [
        { toHz: 10, minutes: 8 },
        { toHz: 6, minutes: 12 },
      ],
    },
  },
  { id: 'settle', startHz: 10, journey: { steps: [{ toHz: 6, minutes: 15 }] } },
  {
    id: 'lift',
    startHz: 6,
    journey: {
      steps: [
        { toHz: 10, minutes: 6 },
        { toHz: 15, minutes: 6 },
      ],
    },
  },
];

/**
 * Ready-made listening setups for common situations. Each one is only a starting
 * tuning (beat, carrier, soundscape, length); nothing here claims an effect.
 */
export interface Scene {
  id: 'study' | 'deepWork' | 'reading' | 'creative' | 'relax' | 'outdoors' | 'windDown' | 'night';
  beatHz: number;
  carrierHz: number;
  mix: Mix;
  timerMin: number;
  /** When set, the scene opens the Journey screen with this ramp. */
  journey?: { startHz: number; steps: { toHz: number; minutes: number }[] };
}

export const SCENES: readonly Scene[] = [
  { id: 'study', beatHz: 12, carrierHz: 220, mix: { rain: -36, pink: -50 }, timerMin: 45 },
  { id: 'deepWork', beatHz: 15, carrierHz: 200, mix: { brown: -42, fan: -46 }, timerMin: 60 },
  { id: 'reading', beatHz: 10, carrierHz: 220, mix: { forest: -38, stream: -44 }, timerMin: 30 },
  { id: 'creative', beatHz: 8, carrierHz: 210, mix: { ocean: -38, wind: -48 }, timerMin: 30 },
  { id: 'relax', beatHz: 10, carrierHz: 220, mix: { ocean: -36, forest: -48 }, timerMin: 20 },
  { id: 'outdoors', beatHz: 10, carrierHz: 230, mix: { forest: -36, stream: -40, wind: -50 }, timerMin: 20 },
  {
    id: 'windDown',
    beatHz: 15,
    carrierHz: 200,
    mix: { rain: -38, fan: -48 },
    timerMin: 20,
    journey: {
      startHz: 15,
      steps: [
        { toHz: 10, minutes: 8 },
        { toHz: 6, minutes: 12 },
      ],
    },
  },
  { id: 'night', beatHz: 4, carrierHz: 200, mix: { night: -40, brown: -46 }, timerMin: 45 },
];
