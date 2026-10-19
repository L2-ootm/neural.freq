import { journeyBeatAt, journeyMinutes, MAX_JOURNEY_STEPS, MAX_STEP_MINUTES } from '../../engine/plan';
import { JOURNEY_TEMPLATES } from '../../engine/presets';
import { LIMITS } from '../../engine/types';
import { fmtFixed, fmtNumber, type Key } from '../i18n';
import { actions, t, useStore } from '../store';
import { Instrument } from '../components/Instrument';
import { Transport } from '../components/Transport';
import { Icon, Slider } from '../components/ui';

const W = 560;
const H = 220;
const PAD = { l: 40, r: 16, t: 14, b: 28 };

function Timeline() {
  const lang = useStore((s) => s.prefs.lang);
  const j = useStore((s) => s.journey);
  const elapsed = useStore((s) => (s.session?.kind === 'journey' ? (s.engine.live?.elapsedSec ?? 0) : -1));
  const total = journeyMinutes(j) * 60;
  const beats = [j.startHz, ...j.steps.map((s) => s.toHz)];
  const lo = Math.max(0, Math.floor(Math.min(...beats)) - 2);
  const hi = Math.ceil(Math.max(...beats)) + 2;
  const x = (sec: number) => PAD.l + (sec / total) * (W - PAD.l - PAD.r);
  const y = (hz: number) => PAD.t + (1 - (hz - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  let acc = 0;
  const pts = [`${x(0)},${y(j.startHz)}`];
  for (const s of j.steps) {
    acc += s.minutes * 60;
    pts.push(`${x(acc)},${y(s.toHz)}`);
  }
  const end = beats[beats.length - 1]!;
  const marker = elapsed >= 0 ? { cx: x(Math.min(elapsed, total)), cy: y(journeyBeatAt(j.startHz, j, elapsed)) } : null;

  return (
    <svg className="timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t('journey.timeline')}. ${t('journey.timeline.desc', { a: fmtNumber(lang, j.startHz), b: fmtNumber(lang, end) })}`}>
      {Array.from({ length: Math.floor(hi / 5) - Math.ceil(lo / 5) + 1 }, (_, i) => (Math.ceil(lo / 5) + i) * 5).map((hz) => (
        <g key={hz}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(hz)} y2={y(hz)} stroke="rgba(255,255,255,0.08)" />
          <text x={PAD.l - 8} y={y(hz) + 3} textAnchor="end">
            {hz}
          </text>
        </g>
      ))}
      <text x={PAD.l} y={H - 8}>
        0
      </text>
      <text x={W - PAD.r} y={H - 8} textAnchor="end">
        {fmtNumber(lang, total / 60)} min
      </text>
      <polyline points={pts.join(' ')} fill="none" stroke="rgb(55,228,170)" strokeWidth="2" strokeLinejoin="round" />
      {j.steps.map((s, i) => {
        const at = j.steps.slice(0, i + 1).reduce((a, q) => a + q.minutes * 60, 0);
        return <rect key={i} x={x(at) - 3} y={y(s.toHz) - 3} width="6" height="6" fill="#fff" />;
      })}
      <rect x={x(0) - 3} y={y(j.startHz) - 3} width="6" height="6" fill="#fff" />
      {marker && <circle cx={marker.cx} cy={marker.cy} r="5" fill="none" stroke="#fff" strokeWidth="1.5" />}
    </svg>
  );
}

function Editor() {
  const lang = useStore((s) => s.prefs.lang);
  const j = useStore((s) => s.journey);
  const status = useStore((s) => s.engine.status);
  const locked = status !== 'idle' && status !== 'error';
  const n1 = (v: number) => fmtFixed(lang, v, 1);
  const set = (next: typeof j) => actions.setJourney(next);

  return (
    <div className="stack">
      <section className="card" aria-labelledby="tpl-h">
        <div className="card-head">
          <h2 id="tpl-h">{t('journey.templates')}</h2>
        </div>
        <div className="actions">
          {JOURNEY_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="btn btn-quiet"
              disabled={locked}
              onClick={() => set({ startHz: tpl.startHz, steps: structuredClone(tpl.journey.steps) })}
            >
              {t(`journey.tpl.${tpl.id}` as Key)}
            </button>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="steps-h">
        <div className="card-head">
          <h2 id="steps-h">{t('journey.title')}</h2>
          <span className="chip num">{t('journey.total', { n: fmtNumber(lang, journeyMinutes(j)) })}</span>
        </div>
        <Slider
          label={t('journey.start')}
          value={j.startHz}
          min={LIMITS.beatHz.min}
          max={LIMITS.beatHz.max}
          step={0.5}
          text={`${n1(j.startHz)} Hz`}
          disabled={locked}
          onChange={(startHz) => set({ ...j, startHz })}
        />
        <ol className="steps" style={{ marginTop: 18 }}>
          {j.steps.map((s, i) => (
            <li className="step" key={i}>
              <div className="step-head">
                <span className="eyebrow">{t('journey.step', { n: i + 1 })}</span>
                {j.steps.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    style={{ minHeight: 36, padding: '4px 10px' }}
                    disabled={locked}
                    aria-label={t('journey.remove', { n: i + 1 })}
                    onClick={() => set({ ...j, steps: j.steps.filter((_, k) => k !== i) })}
                  >
                    <Icon name="x" />
                  </button>
                )}
              </div>
              <div className="step-fields">
                <Slider
                  label={t('journey.to')}
                  value={s.toHz}
                  min={LIMITS.beatHz.min}
                  max={LIMITS.beatHz.max}
                  step={0.5}
                  text={`${n1(s.toHz)} Hz`}
                  disabled={locked}
                  onChange={(toHz) => set({ ...j, steps: j.steps.map((q, k) => (k === i ? { ...q, toHz } : q)) })}
                />
                <div className="field">
                  <div className="field-head">
                    <label htmlFor={`min-${i}`}>{t('journey.minutes')}</label>
                  </div>
                  <input
                    id={`min-${i}`}
                    className="num-in num"
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    max={MAX_STEP_MINUTES}
                    step={0.5}
                    value={s.minutes}
                    disabled={locked}
                    onChange={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (!Number.isFinite(v)) return;
                      set({ ...j, steps: j.steps.map((q, k) => (k === i ? { ...q, minutes: Math.min(MAX_STEP_MINUTES, Math.max(0.5, v)) } : q)) });
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
        {j.steps.length < MAX_JOURNEY_STEPS && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={locked}
              onClick={() => set({ ...j, steps: [...j.steps, { toHz: j.steps[j.steps.length - 1]!.toHz, minutes: 5 }] })}
            >
              <Icon name="plus" />
              {t('journey.add')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export function Journey() {
  return (
    <>
      <div className="screen-head">
        <h1>{t('journey.title')}</h1>
        <p>{t('journey.intro')}</p>
      </div>
      <div className="journey-grid">
        <Editor />
        <div className="stack">
          <section className="card" aria-labelledby="tl-h">
            <div className="card-head">
              <h2 id="tl-h">{t('journey.timeline')}</h2>
            </div>
            <Timeline />
            <p className="help" style={{ marginTop: 8 }}>
              {t('journey.tuning')}
            </p>
          </section>
          <Instrument>
            <Transport kind="journey" />
          </Instrument>
        </div>
      </div>
    </>
  );
}
