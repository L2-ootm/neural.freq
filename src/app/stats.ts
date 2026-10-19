export interface SessionRecord {
  id: string;
  startedAt: number;
  playedSec: number;
  kind: 'preset' | 'journey';
  presetId: string;
  mode: 'binaural' | 'isochronic' | 'monaural';
  carrierHz: number;
  beatStartHz: number;
  beatEndHz: number;
  completed: boolean;
  note: string;
}

export const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Calendar-day arithmetic via Date(y, m, d - n): correct across DST changes. */
function daysAgo(now: number, n: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12).getTime();
}

export function weekly(sessions: SessionRecord[], now: number): { key: string; minutes: number; ts: number }[] {
  const out = Array.from({ length: 7 }, (_, i) => {
    const ts = daysAgo(now, 6 - i);
    return { key: dayKey(ts), minutes: 0, ts };
  });
  const byKey = new Map(out.map((o) => [o.key, o]));
  for (const s of sessions) {
    const b = byKey.get(dayKey(s.startedAt));
    if (b) b.minutes += s.playedSec / 60;
  }
  return out;
}

/** Consecutive calendar days with a session, ending today, or yesterday if today has none yet. */
export function streak(sessions: SessionRecord[], now: number): number {
  const days = new Set(sessions.filter((s) => s.playedSec >= 30).map((s) => dayKey(s.startedAt)));
  let n = 0;
  let offset = days.has(dayKey(now)) ? 0 : 1;
  while (days.has(dayKey(daysAgo(now, offset)))) {
    n++;
    offset++;
  }
  return n;
}

export function totalSec(sessions: SessionRecord[]): number {
  return sessions.reduce((a, s) => a + s.playedSec, 0);
}

export function parseRecords(o: unknown): SessionRecord[] | null {
  if (typeof o !== 'object' || o === null) return null;
  const list = (o as { sessions?: unknown }).sessions;
  if (!Array.isArray(list) || list.length > 20000) return null;
  const out: SessionRecord[] = [];
  const modes = ['binaural', 'isochronic', 'monaural'];
  for (const r of list as Record<string, unknown>[]) {
    const nums = [r?.startedAt, r?.playedSec, r?.carrierHz, r?.beatStartHz, r?.beatEndHz];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    if (typeof r.id !== 'string' || r.id.length > 64) return null;
    if (!modes.includes(r.mode as string)) return null;
    out.push({
      id: r.id,
      startedAt: r.startedAt as number,
      playedSec: Math.max(0, r.playedSec as number),
      kind: r.kind === 'journey' ? 'journey' : 'preset',
      presetId: typeof r.presetId === 'string' ? r.presetId.slice(0, 16) : 'custom',
      mode: r.mode as SessionRecord['mode'],
      carrierHz: r.carrierHz as number,
      beatStartHz: r.beatStartHz as number,
      beatEndHz: r.beatEndHz as number,
      completed: r.completed === true,
      note: typeof r.note === 'string' ? r.note.slice(0, 2000) : '',
    });
  }
  return out;
}
