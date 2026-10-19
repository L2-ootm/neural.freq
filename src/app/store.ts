import { useSyncExternalStore } from 'react';
import { Engine, type EngineSnapshot, type SessionSummary } from '../engine/engine';
import { buildPlan, type Journey } from '../engine/plan';
import { MAX_LAYERS, type LayerId } from '../engine/dsp/ambient';
import { DEFAULT_PRESET_ID, JOURNEY_TEMPLATES, PRESETS, SCENES, presetSpec, type Preset, type Scene } from '../engine/presets';
import { clamp, LIMITS, sanitizeSpec, type Plan, type ToneSpec } from '../engine/types';
import { translate, type Key } from './i18n';
import { defaultPrefs, loadPrefs, SAFETY_VERSION, savePrefs, sessionsDb, clearPrefs, type Prefs } from './storage';
import type { SessionRecord } from './stats';

export type Tab = 'play' | 'journey' | 'history' | 'settings' | 'about';
export type PresetId = Preset['id'] | 'custom';
export type SessionKind = 'preset' | 'journey';

export interface Draft {
  presetId: PresetId;
  sceneId: Scene['id'] | null;
  spec: ToneSpec;
  timerMin: number;
}

export interface ActiveSession {
  kind: SessionKind;
  presetId: string;
  startedAt: number;
  plan: Plan;
}

export interface Toast {
  id: number;
  text: string;
}

export interface State {
  tab: Tab;
  prefs: Prefs;
  draft: Draft;
  journey: { startHz: number } & Journey;
  engine: EngineSnapshot;
  session: ActiveSession | null;
  history: SessionRecord[];
  historyError: boolean;
  dialog: null | 'safety' | 'confirmClear';
  pendingStart: SessionKind | null;
  toast: Toast | null;
  updateReady: boolean;
}

export const engine = new Engine();

const DEFAULT_BASE = { mix: { rain: -38 }, mode: 'binaural' } as const;

function initialDraft(prefs: Prefs): Draft {
  const p = PRESETS.find((x) => x.id === DEFAULT_PRESET_ID)!;
  return {
    presetId: p.id,
    sceneId: null,
    spec: sanitizeSpec(presetSpec(p, { ...DEFAULT_BASE, levelDb: prefs.levelDb }), prefs.ceilingDb),
    timerMin: 20,
  };
}

const firstTemplate = JOURNEY_TEMPLATES[0]!;

function init(): State {
  const prefs = loadPrefs();
  return {
    tab: 'play',
    prefs,
    draft: initialDraft(prefs),
    journey: { startHz: firstTemplate.startHz, steps: structuredClone(firstTemplate.journey.steps) },
    engine: engine.snapshot,
    session: null,
    history: [],
    historyError: false,
    dialog: null,
    pendingStart: null,
    toast: null,
    updateReady: false,
  };
}

let state: State = init();
const listeners = new Set<() => void>();

function set(patch: Partial<State> | ((s: State) => Partial<State>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  for (const fn of listeners) fn();
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => select(state),
  );
}

export const getState = (): State => state;

export const t = (key: Key, vars?: Record<string, string | number>): string => translate(state.prefs.lang, key, vars);

let toastId = 0;
export function toast(text: string): void {
  const id = ++toastId;
  set({ toast: { id, text } });
  setTimeout(() => {
    if (state.toast?.id === id) set({ toast: null });
  }, 5000);
}

engine.subscribe((snap) => set({ engine: snap }));

async function refreshHistory(): Promise<void> {
  try {
    set({ history: await sessionsDb.all(), historyError: false });
  } catch {
    set({ historyError: true });
  }
}

async function saveSummary(summary: SessionSummary): Promise<void> {
  const s = state.session;
  set({ session: null });
  if (!s || summary.playedSec < 5) return;
  const rec: SessionRecord = {
    id: `${s.startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: s.startedAt,
    playedSec: Math.round(summary.playedSec),
    kind: s.kind,
    presetId: s.presetId,
    mode: summary.spec.mode,
    carrierHz: summary.spec.carrierHz,
    beatStartHz: summary.beatStartHz,
    beatEndHz: Math.round(summary.beatEndHz * 100) / 100,
    completed: summary.completed,
    note: '',
  };
  try {
    await sessionsDb.put(rec);
    await refreshHistory();
    toast(t(summary.completed ? 'tr.ended' : 'tr.saved'));
  } catch {
    set({ historyError: true });
  }
}

engine.onEnded((summary) => void saveSummary(summary));

export const actions = {
  async boot(): Promise<void> {
    await refreshHistory();
  },

  setTab(tab: Tab): void {
    set({ tab });
  },

  setPrefs(patch: Partial<Prefs>): void {
    const prefs = { ...state.prefs, ...patch };
    prefs.ceilingDb = clamp(prefs.ceilingDb, LIMITS.ceilingDb.min, LIMITS.ceilingDb.max);
    prefs.levelDb = clamp(prefs.levelDb, LIMITS.levelDb.min, prefs.ceilingDb);
    savePrefs(prefs);
    const spec = sanitizeSpec(state.draft.spec, prefs.ceilingDb);
    set({ prefs, draft: { ...state.draft, spec } });
  },

  selectPreset(id: Preset['id']): void {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    const { levelDb, mix, mode } = state.draft.spec;
    const spec = sanitizeSpec(presetSpec(p, { levelDb, mix, mode }), state.prefs.ceilingDb);
    set({ draft: { ...state.draft, presetId: id, sceneId: null, spec } });
    if (isActive('preset')) engine.set({ beatHz: spec.beatHz, carrierHz: spec.carrierHz }, 1.5);
  },

  /** Change tuning. During a journey the beat is owned by the schedule and is ignored here. */
  patchSpec(patch: Partial<ToneSpec>, rampSec = 0.4): void {
    const journeyRunning = isActive('journey');
    const next = { ...patch };
    if (journeyRunning) delete next.beatHz;
    const spec = sanitizeSpec({ ...state.draft.spec, ...next }, state.prefs.ceilingDb);
    const touchesPreset = next.beatHz !== undefined || next.carrierHz !== undefined;
    const presetId = touchesPreset ? matchPreset(spec) : state.draft.presetId;
    const leavesScene = touchesPreset || next.mix !== undefined || next.mode !== undefined;
    set({ draft: { ...state.draft, spec, presetId, sceneId: leavesScene ? null : state.draft.sceneId } });
    if (isActive()) engine.set(next, rampSec);
  },

  /** Switch a layer on at `db` (or its current level), or off. At most MAX_LAYERS are active. */
  toggleLayer(id: LayerId, defaultDb = -40): void {
    const mix = { ...state.draft.spec.mix };
    if (mix[id] !== undefined) delete mix[id];
    else if (Object.keys(mix).length < MAX_LAYERS) mix[id] = defaultDb;
    else return;
    actions.patchSpec({ mix }, 1.5);
  },

  setLayerDb(id: LayerId, db: number): void {
    if (state.draft.spec.mix[id] === undefined) return;
    actions.patchSpec({ mix: { ...state.draft.spec.mix, [id]: db } }, 0.3);
  },

  applyScene(id: Scene['id']): void {
    const sc = SCENES.find((x) => x.id === id);
    if (!sc) return;
    const cur = state.draft.spec;
    const spec = sanitizeSpec({ mode: 'binaural', levelDb: cur.levelDb, carrierHz: sc.carrierHz, beatHz: sc.beatHz, mix: sc.mix }, state.prefs.ceilingDb);
    set({
      draft: { presetId: matchPreset(spec), sceneId: id, spec, timerMin: sc.timerMin },
      ...(sc.journey ? { journey: { startHz: sc.journey.startHz, steps: structuredClone(sc.journey.steps) }, tab: 'journey' as Tab } : {}),
    });
    if (isActive()) {
      const live: Partial<ToneSpec> = { carrierHz: spec.carrierHz, mix: spec.mix, mode: spec.mode };
      if (!isActive('journey')) live.beatHz = spec.beatHz;
      engine.set(live, 2);
    }
  },

  setTimer(min: number): void {
    set({ draft: { ...state.draft, timerMin: min } });
  },

  setJourney(j: { startHz: number } & Journey): void {
    set({ journey: j });
  },

  applyShared(spec: ToneSpec, timerMin: number, journey: Journey | null): void {
    const clean = sanitizeSpec(spec, state.prefs.ceilingDb);
    set({
      draft: { presetId: matchPreset(clean), sceneId: null, spec: clean, timerMin },
      journey: journey ? { startHz: clean.beatHz, steps: journey.steps } : state.journey,
      tab: journey ? 'journey' : 'play',
    });
  },

  requestStart(kind: SessionKind): void {
    if (state.engine.status === 'starting' || state.engine.status === 'stopping') return;
    if (state.prefs.safetyAck !== SAFETY_VERSION) {
      set({ dialog: 'safety', pendingStart: kind });
      return;
    }
    void actions.startSession(kind);
  },

  async startSession(kind: SessionKind): Promise<void> {
    const { draft, prefs, journey } = state;
    const spec = kind === 'journey' ? { ...draft.spec, beatHz: journey.startHz } : draft.spec;
    const plan = buildPlan({
      spec,
      journey: kind === 'journey' ? { steps: journey.steps } : null,
      timerMin: draft.timerMin,
      fadeInSec: prefs.fadeInSec,
      fadeOutSec: prefs.fadeOutSec,
      ceilingDb: prefs.ceilingDb,
    });
    const label = draft.sceneId ? `scene:${draft.sceneId}` : draft.presetId;
    set({ session: { kind, presetId: label, startedAt: Date.now(), plan } });
    await engine.start(plan);
    if (state.engine.status === 'error') set({ session: null });
  },

  acknowledgeSafety(): void {
    const prefs = { ...state.prefs, safetyAck: SAFETY_VERSION };
    savePrefs(prefs);
    const pending = state.pendingStart;
    set({ prefs, dialog: null, pendingStart: null });
    if (pending) void actions.startSession(pending);
  },

  openDialog(d: 'safety' | 'confirmClear'): void {
    set({ dialog: d, pendingStart: null });
  },

  closeDialog(): void {
    set({ dialog: null, pendingStart: null });
  },

  togglePause(): void {
    const st = state.engine.status;
    if (st === 'playing') void engine.pause();
    else if (st === 'paused') void engine.resume();
  },

  async stop(): Promise<void> {
    const summary = await engine.stop();
    if (summary) await saveSummary(summary);
  },

  async setNote(id: string, note: string): Promise<void> {
    const rec = state.history.find((r) => r.id === id);
    if (!rec || rec.note === note) return;
    const next = { ...rec, note: note.slice(0, 2000) };
    set({ history: state.history.map((r) => (r.id === id ? next : r)) });
    try {
      await sessionsDb.put(next);
    } catch {
      set({ historyError: true });
    }
  },

  async deleteSession(id: string): Promise<void> {
    set({ history: state.history.filter((r) => r.id !== id) });
    try {
      await sessionsDb.remove(id);
    } catch {
      set({ historyError: true });
    }
  },

  async importSessions(recs: SessionRecord[]): Promise<number> {
    await sessionsDb.putMany(recs);
    await refreshHistory();
    return recs.length;
  },

  async clearAll(): Promise<void> {
    await actions.stop();
    try {
      await sessionsDb.clear();
    } catch {
      /* nothing to clear */
    }
    clearPrefs();
    const prefs = defaultPrefs();
    set({ history: [], prefs, draft: initialDraft(prefs), dialog: null, historyError: false });
  },

  setUpdateReady(): void {
    set({ updateReady: true });
  },
};

function isActive(kind?: SessionKind): boolean {
  const st = state.engine.status;
  const live = st === 'playing' || st === 'paused' || st === 'starting';
  return live && (kind === undefined || state.session?.kind === kind);
}

function matchPreset(spec: ToneSpec): PresetId {
  const p = PRESETS.find((x) => x.beatHz === spec.beatHz && x.carrierHz === spec.carrierHz);
  return p ? p.id : 'custom';
}
