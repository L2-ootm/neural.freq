import { parseJourney, type Journey } from './plan';
import { parseSpec } from './protocol';
import { sanitizeSpec, type ToneSpec } from './types';

export interface ShareState {
  spec: ToneSpec;
  timerMin: number;
  journey: Journey | null;
}

const VERSION = 1;

const b64url = {
  enc(s: string): string {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s: string): string {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(pad);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

/** Spec, timer and journey only. Never history, notes or preferences. */
export function encodeShare(s: ShareState): string {
  return b64url.enc(JSON.stringify({ v: VERSION, spec: s.spec, t: s.timerMin, j: s.journey }));
}

/** Returns null for anything malformed. Unknown keys are ignored; numbers are clamped. */
export function decodeShare(token: string, ceilingDb: number): ShareState | null {
  try {
    if (token.length > 2000) return null;
    const o = JSON.parse(b64url.dec(token)) as Record<string, unknown>;
    if (o.v !== VERSION) return null;
    const spec = parseSpec(o.spec);
    if (!spec) return null;
    const t = typeof o.t === 'number' && Number.isFinite(o.t) ? Math.min(Math.max(o.t, 0), 180) : 20;
    const journey = o.j == null ? null : parseJourney(o.j);
    if (o.j != null && !journey) return null;
    return { spec: sanitizeSpec(spec, ceilingDb), timerMin: t, journey };
  } catch {
    return null;
  }
}

export function shareUrl(s: ShareState, base = location.href.split('#')[0] ?? ''): string {
  return `${base}#s=${encodeShare(s)}`;
}

export function tokenFromHash(hash: string): string | null {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(hash);
  return m?.[1] ?? null;
}
