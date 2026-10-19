import { LAYER_IDS } from './dsp/ambient';
import { clamp, LIMITS, type BeatSegment, type LiveState, type Mix, type Mode, type ToneSpec } from './types';

export const PROTOCOL_VERSION = 1 as const;

export type ToWorklet =
  | { v: 1; type: 'init'; spec: ToneSpec; ceilingDb: number; seed: number }
  | { v: 1; type: 'set'; patch: Partial<ToneSpec>; rampSec: number }
  | { v: 1; type: 'schedule'; segments: BeatSegment[] }
  | { v: 1; type: 'fadeIn'; sec: number }
  | { v: 1; type: 'fadeOut'; sec: number }
  | { v: 1; type: 'end'; totalSec: number; fadeOutSec: number };

export type FromWorklet = { v: 1; type: 'state'; state: LiveState } | { v: 1; type: 'ended' };

const MODES: Mode[] = ['binaural', 'isochronic', 'monaural'];

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sec = (v: unknown): number | null => (num(v) ? clamp(v, 0, 86400) : null);
const fade = (v: unknown): number | null => (num(v) ? clamp(v, LIMITS.fadeSec.min, LIMITS.fadeSec.max) : null);

/** Validate a mix object: known layer ids with finite dB values. Unknown keys are dropped. */
export function parseMix(o: unknown): Mix | null {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const src = o as Record<string, unknown>;
  const out: Mix = {};
  for (const id of LAYER_IDS) {
    if (src[id] === undefined) continue;
    if (!num(src[id])) return null;
    out[id] = src[id];
  }
  return out;
}

/** Validate a spec-shaped object from an untrusted source (share link, storage, port). */
export function parseSpec(o: unknown): ToneSpec | null {
  if (typeof o !== 'object' || o === null) return null;
  const s = o as Record<string, unknown>;
  const mix = parseMix(s.mix);
  if (!MODES.includes(s.mode as Mode) || !mix) return null;
  if (!num(s.carrierHz) || !num(s.beatHz) || !num(s.levelDb)) return null;
  return {
    mode: s.mode as Mode,
    mix,
    carrierHz: s.carrierHz,
    beatHz: s.beatHz,
    levelDb: s.levelDb,
  };
}

function parsePatch(o: unknown): Partial<ToneSpec> | null {
  if (typeof o !== 'object' || o === null) return null;
  const s = o as Record<string, unknown>;
  const out: Partial<ToneSpec> = {};
  if (s.mode !== undefined) {
    if (!MODES.includes(s.mode as Mode)) return null;
    out.mode = s.mode as Mode;
  }
  if (s.mix !== undefined) {
    const mix = parseMix(s.mix);
    if (!mix) return null;
    out.mix = mix;
  }
  for (const k of ['carrierHz', 'beatHz', 'levelDb'] as const) {
    if (s[k] !== undefined) {
      if (!num(s[k])) return null;
      out[k] = s[k] as number;
    }
  }
  return out;
}

/** Validate a message arriving at the worklet. Returns null for anything malformed. */
export function parseToWorklet(m: unknown): ToWorklet | null {
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  if (o.v !== PROTOCOL_VERSION) return null;
  switch (o.type) {
    case 'init': {
      const spec = parseSpec(o.spec);
      if (!spec || !num(o.ceilingDb) || !num(o.seed)) return null;
      return { v: 1, type: 'init', spec, ceilingDb: o.ceilingDb, seed: o.seed };
    }
    case 'set': {
      const patch = parsePatch(o.patch);
      const r = sec(o.rampSec);
      return patch && r !== null ? { v: 1, type: 'set', patch, rampSec: r } : null;
    }
    case 'schedule': {
      if (!Array.isArray(o.segments) || o.segments.length > 32) return null;
      const segments: BeatSegment[] = [];
      for (const s of o.segments as unknown[]) {
        const r = s as Record<string, unknown>;
        if (!num(r?.toHz) || !num(r?.seconds)) return null;
        segments.push({ toHz: r.toHz, seconds: clamp(r.seconds, 0, 86400) });
      }
      return { v: 1, type: 'schedule', segments };
    }
    case 'fadeIn':
    case 'fadeOut': {
      const s = fade(o.sec);
      return s === null ? null : { v: 1, type: o.type, sec: s };
    }
    case 'end': {
      const t = sec(o.totalSec);
      const f = fade(o.fadeOutSec);
      return t === null || f === null ? null : { v: 1, type: 'end', totalSec: t, fadeOutSec: f };
    }
    default:
      return null;
  }
}
