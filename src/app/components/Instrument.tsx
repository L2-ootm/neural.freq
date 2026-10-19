import { useEffect, useRef, type ReactNode } from 'react';
import { engine, getState, t, useStore } from '../store';
import type { LayerId } from '../../engine/dsp/ambient';
import { fmtClock, fmtFixed, type Key } from '../i18n';
import { LayerGlyph } from './Glyph';
import { useReducedMotion } from '../hooks';
import { drawScope, drawSpectrum, drawTerrain, specX } from '../viz';

const TICKS = [50, 100, 200, 500, 1000, 2000];

function fitCanvas(c: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(c.clientWidth));
  const h = Math.max(1, Math.round(c.clientHeight));
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr;
    c.height = h * dpr;
  }
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** Frequencies of the two tones for the markers and readouts, per mode. */
export function toneFreqs(mode: string, carrier: number, beat: number): [number, number] {
  return mode === 'isochronic' ? [carrier, carrier] : [carrier - beat / 2, carrier + beat / 2];
}

export function Instrument({ children }: { children?: ReactNode }) {
  const lang = useStore((s) => s.prefs.lang);
  const status = useStore((s) => s.engine.status);
  const live = useStore((s) => s.engine.live);
  const spec = useStore((s) => s.draft.spec);
  const sceneId = useStore((s) => s.draft.sceneId);
  const duration = useStore((s) => s.session?.plan.durationSec ?? 0);
  const idleBeat = useStore((s) => (s.tab === 'journey' ? s.journey.startHz : s.draft.spec.beatHz));
  const reduced = useReducedMotion();

  const terrainRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);

  const running = status === 'playing' || status === 'stopping';
  const active = status !== 'idle' && status !== 'error';

  useEffect(() => {
    const terrain = terrainRef.current;
    const scope = scopeRef.current;
    const spectrum = specRef.current;
    if (!terrain || !scope || !spectrum) return;

    const bufL = new Float32Array(2048);
    const bufR = new Float32Array(2048);
    let raf = 0;
    let lastTerrain = -1e9;
    let lastFast = -1e9;
    let energy = 0.5;
    const t0 = performance.now();
    const fastMs = reduced ? 200 : 33;
    const terrainMs = reduced ? 1e12 : 100;

    const frame = (now: number, force = false) => {
      const an = engine.analysers;
      const fast = force || now - lastFast >= fastMs;
      const slowTerrain = force || now - lastTerrain >= terrainMs;

      if (fast) {
        lastFast = now;
        let l = bufL;
        let r = bufR;
        let db = new Float32Array(0);
        if (an && running) {
          an.l.getFloatTimeDomainData(bufL);
          an.r.getFloatTimeDomainData(bufR);
          db = new Float32Array(an.mix.frequencyBinCount);
          an.mix.getFloatFrequencyData(db);
          let s = 0;
          for (let i = 0; i < bufL.length; i++) s += bufL[i]! * bufL[i]!;
          energy += (Math.min(1, Math.sqrt(s / bufL.length) * 6) - energy) * 0.1;
        } else {
          l = new Float32Array(0);
          r = new Float32Array(0);
        }
        const sc = fitCanvas(scope);
        if (sc) drawScope(sc.ctx, sc.w, sc.h, l, r, running && l.length > 0);
        const sp = fitCanvas(spectrum);
        if (sp) {
          const lv = getState().engine.live;
          const d = getState().draft.spec;
          const [a, b] = toneFreqs(d.mode, lv?.carrierHz ?? d.carrierHz, lv?.beatHz ?? d.beatHz);
          drawSpectrum(sp.ctx, sp.w, sp.h, db.length ? db : new Float32Array(8), engine.sampleRate, [a, b], running && db.length > 0);
        }
      }
      if (slowTerrain) {
        lastTerrain = now;
        const tc = fitCanvas(terrain);
        if (tc) drawTerrain(tc.ctx, tc.w, tc.h, (now - t0) / 1000, energy);
      }
    };

    frame(performance.now(), true);
    const loop = (now: number) => {
      if (!document.hidden) frame(now);
      raf = requestAnimationFrame(loop);
    };
    if (active && running) raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => frame(performance.now(), true));
    ro.observe(terrain);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [running, active, reduced]);

  const shown = active && live ? { beat: live.beatHz, carrier: live.carrierHz } : { beat: idleBeat, carrier: spec.carrierHz };
  const [fa, fb] = toneFreqs(spec.mode, shown.carrier, shown.beat);
  const elapsed = live && active ? live.elapsedSec : 0;
  const remaining = duration > 0 ? Math.max(0, duration - elapsed) : null;
  const n1 = (v: number) => fmtFixed(lang, v, 1);

  const labelA = spec.mode === 'binaural' ? t('rd.left') : spec.mode === 'isochronic' ? t('rd.carrier') : t('rd.toneA');
  const labelB = spec.mode === 'binaural' ? t('rd.right') : spec.mode === 'isochronic' ? t('rd.pulse') : t('rd.toneB');
  const valB = spec.mode === 'isochronic' ? `${n1(shown.beat)}` : n1(fb);

  return (
    <section className="card instrument" aria-label={t('viz.label')}>
      <div className="viz">
        <canvas ref={terrainRef} aria-hidden="true" />
        <canvas ref={scopeRef} aria-hidden="true" />
      </div>
      <div className="spec">
        <canvas ref={specRef} aria-hidden="true" />
      </div>
      <div className="ticks" aria-hidden="true">
        {TICKS.map((hz) => (
          <span key={hz} style={{ left: `${specX(hz) * 100}%` }}>
            {hz >= 1000 ? `${hz / 1000}k` : hz}
          </span>
        ))}
      </div>
      <div className="readout">
        <div className="readout-main">
          <div>
            <div className="eyebrow">{t('rd.beat')}</div>
            <div className="big num" aria-label={`${t('rd.beat')} ${n1(shown.beat)} Hz`}>
              {n1(shown.beat)}
              <small>Hz</small>
            </div>
          </div>
          <div className="eyebrow" aria-hidden="true">
            {active ? t('rd.live') : t('rd.commanded')}
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="eyebrow">{labelA}</span>
            <span className="v num">
              {n1(fa)} <small>Hz</small>
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">{labelB}</span>
            <span className="v num">
              {valB} <small>Hz</small>
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t('rd.elapsed')}</span>
            <span className="v num">{fmtClock(elapsed)}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t('rd.remaining')}</span>
            <span className="v num">{remaining === null ? (active ? t('rd.open') : '--:--') : fmtClock(remaining)}</span>
          </div>
        </div>
        <div className="setup" role="group" aria-label={t('setup.label')}>
          {sceneId && <span className="chip chip-accent">{t(`scene.${sceneId}.name` as Key)}</span>}
          <span className="chip">{t(`mode.${spec.mode}` as Key)}</span>
          {(Object.keys(spec.mix) as LayerId[]).map((id) => (
            <span className="chip" key={id}>
              <LayerGlyph id={id} size={13} />
              {t(`layer.${id}` as Key)}
            </span>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}
