import { DEFAULT_CEILING_DB, DEFAULT_LEVEL_DB } from '../engine/types';
import { detectLang, type Lang } from './i18n';
import type { SessionRecord } from './stats';

/** Bump when the safety text changes materially; users must re-acknowledge. */
export const SAFETY_VERSION = 1;

export interface Prefs {
  lang: Lang;
  ceilingDb: number;
  levelDb: number;
  fadeInSec: number;
  fadeOutSec: number;
  motion: 'system' | 'reduce' | 'full';
  safetyAck: number | null;
}

export const defaultPrefs = (): Prefs => ({
  lang: detectLang(),
  ceilingDb: DEFAULT_CEILING_DB,
  levelDb: DEFAULT_LEVEL_DB,
  fadeInSec: 4,
  fadeOutSec: 4,
  motion: 'system',
  safetyAck: null,
});

const PREFS_KEY = 'neuralfreq.prefs.v1';

export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return d;
    const o = JSON.parse(raw) as Partial<Prefs>;
    const n = (v: unknown, fb: number, lo: number, hi: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : fb;
    return {
      lang: o.lang === 'pt-BR' || o.lang === 'en' ? o.lang : d.lang,
      ceilingDb: n(o.ceilingDb, d.ceilingDb, -30, -9),
      levelDb: n(o.levelDb, d.levelDb, -60, -9),
      fadeInSec: n(o.fadeInSec, d.fadeInSec, 0, 30),
      fadeOutSec: n(o.fadeOutSec, d.fadeOutSec, 0, 30),
      motion: o.motion === 'reduce' || o.motion === 'full' ? o.motion : 'system',
      safetyAck: typeof o.safetyAck === 'number' ? o.safetyAck : null,
    };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: preferences last for this tab only */
  }
}

const DB_NAME = 'neuralfreq';
const STORE = 'sessions';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('indexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
      t.onerror = () => reject(t.error ?? new Error('transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export const sessionsDb = {
  async all(): Promise<SessionRecord[]> {
    const rows = ((await tx<SessionRecord[]>('readonly', (s) => s.getAll())) ?? []) as SessionRecord[];
    return rows.sort((a, b) => b.startedAt - a.startedAt);
  },
  async put(r: SessionRecord): Promise<void> {
    await tx('readwrite', (s) => s.put(r));
  },
  async putMany(rs: SessionRecord[]): Promise<void> {
    await tx('readwrite', (s) => {
      for (const r of rs) s.put(r);
    });
  },
  async remove(id: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(id));
  },
  async clear(): Promise<void> {
    await tx('readwrite', (s) => s.clear());
  },
};

export function clearPrefs(): void {
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch {
    /* ignore */
  }
}
