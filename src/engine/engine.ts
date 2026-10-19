import workletUrl from './worklet/tone-processor.ts?worker&url';
import type { FromWorklet, ToWorklet } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { clamp, dbToGain, LIMITS, sanitizeSpec, type LiveState, type Plan, type ToneSpec } from './types';

export type EngineStatus = 'idle' | 'starting' | 'playing' | 'paused' | 'stopping' | 'error';

export interface SessionSummary {
  playedSec: number;
  spec: ToneSpec;
  beatStartHz: number;
  beatEndHz: number;
  completed: boolean;
}

export interface EngineSnapshot {
  status: EngineStatus;
  live: LiveState | null;
  error: string | null;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type Listener = (s: EngineSnapshot) => void;
type EndListener = (s: SessionSummary) => void;

const PAUSE_FADE_SEC = 0.6;
const RESUME_FADE_SEC = 1.5;

/**
 * Web Audio wrapper around the tone worklet. One AudioContext per instance.
 * The worklet is the only place audio is generated; this class never touches
 * oscillator AudioParams for tone parameters.
 */
export class Engine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private master: GainNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private analyserMix: AnalyserNode | null = null;
  private initPromise: Promise<void> | null = null;

  private snap: EngineSnapshot = { status: 'idle', live: null, error: null };
  private plan: Plan | null = null;
  private beatStartHz = 0;
  private intent: 'pause' | 'stop' | null = null;
  private waiters: (() => void)[] = [];
  private listeners = new Set<Listener>();
  private endListeners = new Set<EndListener>();
  private testing = false;

  get snapshot(): EngineSnapshot {
    return this.snap;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Fires when a session ends by reaching its duration (not by stop()). */
  onEnded(fn: EndListener): () => void {
    this.endListeners.add(fn);
    return () => this.endListeners.delete(fn);
  }

  get analysers(): { l: AnalyserNode; r: AnalyserNode; mix: AnalyserNode } | null {
    return this.analyserL && this.analyserR && this.analyserMix
      ? { l: this.analyserL, r: this.analyserR, mix: this.analyserMix }
      : null;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  private emit(patch: Partial<EngineSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn(this.snap);
  }

  /** Idempotent. Call from a user gesture so the context can start. */
  init(): Promise<void> {
    this.initPromise ??= this.build().catch((e: unknown) => {
      this.initPromise = null;
      const msg = e instanceof Error ? e.message : String(e);
      this.emit({ status: 'error', error: msg });
      throw e;
    });
    return this.initPromise;
  }

  private async build(): Promise<void> {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor || !('audioWorklet' in Ctor.prototype)) throw new Error('unsupported');
    const ctx = new Ctor({ latencyHint: 'playback' });
    await ctx.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(ctx, 'neural-freq-tone', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    const master = ctx.createGain();
    master.gain.value = 1;
    const split = ctx.createChannelSplitter(2);
    const mk = (fft: number, smooth: number) => {
      const a = ctx.createAnalyser();
      a.fftSize = fft;
      a.smoothingTimeConstant = smooth;
      return a;
    };
    const aL = mk(2048, 0);
    const aR = mk(2048, 0);
    const aMix = mk(8192, 0.8);

    node.connect(master);
    master.connect(ctx.destination);
    master.connect(split);
    split.connect(aL, 0);
    split.connect(aR, 1);
    master.connect(aMix);

    node.port.onmessage = (e: MessageEvent<FromWorklet>) => this.onMessage(e.data);
    ctx.onstatechange = () => {
      if (ctx.state === 'suspended' && this.snap.status === 'playing' && !this.intent) {
        this.emit({ status: 'paused' });
      }
    };

    this.ctx = ctx;
    this.node = node;
    this.master = master;
    this.analyserL = aL;
    this.analyserR = aR;
    this.analyserMix = aMix;
  }

  private post(m: DistributiveOmit<ToWorklet, 'v'>): void {
    this.node?.port.postMessage({ v: PROTOCOL_VERSION, ...m });
  }

  private onMessage(m: FromWorklet): void {
    if (m.type === 'state') {
      this.emit({ live: m.state });
    } else if (m.type === 'ended') {
      if (this.intent === 'pause') {
        this.intent = null;
        void this.ctx?.suspend().then(() => this.emit({ status: 'paused' }));
      } else {
        const completed = this.intent !== 'stop';
        const summary = this.summarize(completed);
        this.intent = null;
        void this.ctx?.suspend();
        this.emit({ status: 'idle' });
        for (const w of this.waiters.splice(0)) w();
        if (completed) for (const fn of this.endListeners) fn(summary);
      }
    }
  }

  private summarize(completed: boolean): SessionSummary {
    const live = this.snap.live;
    return {
      playedSec: live?.elapsedSec ?? 0,
      spec: this.plan?.spec ?? ({} as ToneSpec),
      beatStartHz: this.beatStartHz,
      beatEndHz: live?.beatHz ?? this.beatStartHz,
      completed,
    };
  }

  async start(plan: Plan): Promise<void> {
    if (this.snap.status === 'playing' || this.snap.status === 'starting') return;
    this.emit({ status: 'starting', error: null });
    try {
      await this.init();
      const ctx = this.ctx!;
      await ctx.resume();
      const spec = sanitizeSpec(plan.spec, plan.ceilingDb);
      this.plan = { ...plan, spec };
      this.beatStartHz = spec.beatHz;
      this.intent = null;
      const seed = (Math.random() * 0xffffffff) >>> 0;
      this.post({ type: 'init', spec, ceilingDb: plan.ceilingDb, seed });
      if (plan.segments.length > 0) this.post({ type: 'schedule', segments: plan.segments });
      if (plan.durationSec > 0) this.post({ type: 'end', totalSec: plan.durationSec, fadeOutSec: plan.fadeOutSec });
      this.post({ type: 'fadeIn', sec: plan.fadeInSec });
      this.emit({ status: 'playing', live: null });
    } catch (e) {
      this.emit({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  async pause(): Promise<void> {
    if (this.snap.status !== 'playing' || !this.ctx) return;
    this.intent = 'pause';
    this.post({ type: 'fadeOut', sec: PAUSE_FADE_SEC });
  }

  async resume(): Promise<void> {
    if (this.snap.status !== 'paused' || !this.ctx) return;
    await this.ctx.resume();
    this.post({ type: 'fadeIn', sec: RESUME_FADE_SEC });
    this.emit({ status: 'playing' });
  }

  /** Fade out and return what was played. Resolves once silent. */
  async stop(): Promise<SessionSummary | null> {
    const st = this.snap.status;
    if (st === 'idle' || st === 'error' || st === 'starting' || !this.plan) return null;
    if (st === 'paused') {
      const summary = this.summarize(false);
      this.emit({ status: 'idle' });
      return summary;
    }
    this.emit({ status: 'stopping' });
    this.intent = 'stop';
    const done = new Promise<void>((res) => this.waiters.push(res));
    this.post({ type: 'fadeOut', sec: clamp(this.plan.fadeOutSec, 0.3, LIMITS.fadeSec.max) });
    await done;
    return this.summarize(false);
  }

  /** Smoothed live parameter change. The UI keeps its own commanded values. */
  set(patch: Partial<ToneSpec>, rampSec = 0.4): void {
    if (!this.plan || this.snap.status === 'idle') return;
    this.plan = { ...this.plan, spec: sanitizeSpec({ ...this.plan.spec, ...patch }, this.plan.ceilingDb) };
    this.post({ type: 'set', patch, rampSec });
  }

  /** Short quiet test tone in one ear. Used by the headphone check. */
  async headphoneTone(side: 'left' | 'right'): Promise<void> {
    if (this.testing || this.snap.status === 'playing') return;
    this.testing = true;
    try {
      await this.init();
      const ctx = this.ctx!;
      await ctx.resume();
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      const g = ctx.createGain();
      const pan = ctx.createStereoPanner();
      pan.pan.value = side === 'left' ? -1 : 1;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(dbToGain(-36), t + 0.1);
      g.gain.setValueAtTime(dbToGain(-36), t + 0.9);
      g.gain.linearRampToValueAtTime(0, t + 1.1);
      osc.connect(g).connect(pan).connect(this.master!);
      osc.start(t);
      osc.stop(t + 1.2);
      await new Promise<void>((res) => {
        osc.onended = () => res();
      });
      osc.disconnect();
      if ((this.snap.status as EngineStatus) !== 'playing') void ctx.suspend();
    } finally {
      this.testing = false;
    }
  }

  async dispose(): Promise<void> {
    this.node?.disconnect();
    await this.ctx?.close();
    this.ctx = null;
    this.node = null;
    this.initPromise = null;
    this.plan = null;
    this.emit({ status: 'idle', live: null });
  }
}
