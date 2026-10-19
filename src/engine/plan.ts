import { parseSpec } from './protocol';
import { clamp, LIMITS, sanitizeSpec, type Plan, type ToneSpec } from './types';

export interface JourneyStep {
  toHz: number;
  minutes: number;
}

/** A sequence of linear beat ramps. The first ramp starts at the draft spec's beat. */
export interface Journey {
  steps: JourneyStep[];
}

export const MAX_JOURNEY_STEPS = 4;
export const MAX_STEP_MINUTES = 60;

export interface PlanOptions {
  spec: ToneSpec;
  journey: Journey | null;
  timerMin: number;
  fadeInSec: number;
  fadeOutSec: number;
  ceilingDb: number;
}

export function buildPlan(o: PlanOptions): Plan {
  const spec = sanitizeSpec(o.spec, o.ceilingDb);
  const base = {
    spec,
    fadeInSec: clamp(o.fadeInSec, LIMITS.fadeSec.min, LIMITS.fadeSec.max),
    fadeOutSec: clamp(o.fadeOutSec, LIMITS.fadeSec.min, LIMITS.fadeSec.max),
    ceilingDb: o.ceilingDb,
  };
  if (o.journey && o.journey.steps.length > 0) {
    const segments = o.journey.steps.map((s) => ({
      toHz: clamp(s.toHz, LIMITS.beatHz.min, LIMITS.beatHz.max),
      seconds: clamp(s.minutes, 0.5, MAX_STEP_MINUTES) * 60,
    }));
    return { ...base, segments, durationSec: segments.reduce((a, s) => a + s.seconds, 0) };
  }
  return { ...base, segments: [], durationSec: Math.max(0, o.timerMin) * 60 };
}

export function journeyMinutes(j: Journey): number {
  return j.steps.reduce((a, s) => a + s.minutes, 0);
}

/** Beat in Hz at `tSec` into a journey that starts at `startHz`. Used by the timeline preview. */
export function journeyBeatAt(startHz: number, j: Journey, tSec: number): number {
  let from = startHz;
  let t = tSec;
  for (const s of j.steps) {
    const dur = s.minutes * 60;
    if (t <= dur) return from + ((s.toHz - from) * t) / dur;
    t -= dur;
    from = s.toHz;
  }
  return from;
}

export function parseJourney(o: unknown): Journey | null {
  if (typeof o !== 'object' || o === null) return null;
  const steps = (o as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_JOURNEY_STEPS) return null;
  const out: JourneyStep[] = [];
  for (const s of steps as unknown[]) {
    const r = s as Record<string, unknown>;
    if (typeof r?.toHz !== 'number' || typeof r?.minutes !== 'number') return null;
    if (!Number.isFinite(r.toHz) || !Number.isFinite(r.minutes)) return null;
    out.push({
      toHz: clamp(r.toHz, LIMITS.beatHz.min, LIMITS.beatHz.max),
      minutes: clamp(r.minutes, 0.5, MAX_STEP_MINUTES),
    });
  }
  return { steps: out };
}

export { parseSpec };
