import { useState } from 'react';
import { MAX_LAYERS, type LayerId } from '../../engine/dsp/ambient';
import { PRESETS, SCENES } from '../../engine/presets';
import { LIMITS } from '../../engine/types';
import { fmtFixed, fmtNumber, type Key } from '../i18n';
import { actions, t, useStore } from '../store';
import { LayerGlyph } from '../components/Glyph';
import { Instrument } from '../components/Instrument';
import { Transport } from '../components/Transport';
import { Segmented, Slider, Tabs } from '../components/ui';

const TIMERS = [5, 10, 20, 30, 45, 60, 0];

const GROUPS: { id: 'nature' | 'places' | 'noise'; layers: LayerId[] }[] = [
  { id: 'nature', layers: ['rain', 'storm', 'ocean', 'wind', 'stream', 'forest', 'night', 'fire'] },
  { id: 'places', layers: ['city', 'fan'] },
  { id: 'noise', layers: ['pink', 'brown', 'white'] },
];

const DEFAULT_DB: Partial<Record<LayerId, number>> = { pink: -46, brown: -42, white: -52, wind: -46, night: -40, forest: -38 };

function SceneGrid() {
  const lang = useStore((s) => s.prefs.lang);
  const sceneId = useStore((s) => s.draft.sceneId);
  return (
    <section className="scenes-wrap" aria-labelledby="scenes-h">
      <div className="scenes-head">
        <h2 id="scenes-h">{t('scenes.title')}</h2>
        <p className="help">{t('scenes.sub')}</p>
      </div>
      <ul className="scenes">
        {SCENES.map((sc) => (
          <li key={sc.id}>
            <button type="button" className="scene" aria-pressed={sceneId === sc.id} onClick={() => actions.applyScene(sc.id)}>
              <span className="scene-name">{t(`scene.${sc.id}.name` as Key)}</span>
              <span className="scene-desc">{t(`scene.${sc.id}.desc` as Key)}</span>
              <span className="scene-foot">
                <span className="num">
                  {sc.journey ? `${fmtFixed(lang, sc.journey.startHz, 0)}→${fmtFixed(lang, sc.journey.steps[sc.journey.steps.length - 1]!.toHz, 0)}` : fmtFixed(lang, sc.beatHz, 0)} Hz
                </span>
                <span className="glyphs">
                  {(Object.keys(sc.mix) as LayerId[]).map((id) => (
                    <LayerGlyph key={id} id={id} size={16} />
                  ))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TonePanel() {
  const lang = useStore((s) => s.prefs.lang);
  const ceiling = useStore((s) => s.prefs.ceilingDb);
  const spec = useStore((s) => s.draft.spec);
  const presetId = useStore((s) => s.draft.presetId);
  const session = useStore((s) => s.session);
  const status = useStore((s) => s.engine.status);
  const active = status === 'playing' || status === 'paused' || status === 'starting';
  const journeyRunning = active && session?.kind === 'journey';
  const n1 = (v: number) => fmtFixed(lang, v, 1);
  const sel = PRESETS.findIndex((p) => p.id === presetId);
  const current = PRESETS[sel];

  return (
    <div className="panel-body">
      <div className="field">
        <span className="lbl" id="band-l" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
          {t('presets.title')}
        </span>
        <div className="bands" role="radiogroup" aria-labelledby="band-l">
          {PRESETS.map((p, i) => (
            <button
              key={p.id}
              id={`preset-${p.id}`}
              type="button"
              role="radio"
              className="band"
              aria-checked={p.id === presetId}
              tabIndex={p.id === presetId || (sel < 0 && i === 0) ? 0 : -1}
              onClick={() => actions.selectPreset(p.id)}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                e.stopPropagation();
                const n = PRESETS[(Math.max(sel, 0) + d + PRESETS.length) % PRESETS.length]!;
                actions.selectPreset(n.id);
                queueMicrotask(() => document.getElementById(`preset-${n.id}`)?.focus());
              }}
            >
              <span className="name">{t(`preset.${p.id}` as Key)}</span>
              <span className="hz num">{fmtNumber(lang, p.beatHz)} Hz</span>
            </button>
          ))}
        </div>
        <p className="help">
          {current ? `${t(`preset.band.${current.id}` as Key)} · ${current.band[0]}–${current.band[1]} Hz. ${t(`preset.note.${current.id}` as Key)}` : t('preset.custom')}
        </p>
      </div>

      <div className="field">
        <span className="lbl" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
          {t('mode.title')}
        </span>
        <Segmented
          label={t('mode.title')}
          value={spec.mode}
          onChange={(mode) => actions.patchSpec({ mode })}
          options={(['binaural', 'monaural', 'isochronic'] as const).map((m) => ({ value: m, label: t(`mode.${m}` as Key) }))}
        />
        <p className="help">{t(`mode.${spec.mode}.desc` as Key)}</p>
      </div>

      <Slider
        label={t('ctl.beat')}
        value={spec.beatHz}
        min={LIMITS.beatHz.min}
        max={LIMITS.beatHz.max}
        step={0.5}
        text={`${n1(spec.beatHz)} Hz`}
        onChange={(beatHz) => actions.patchSpec({ beatHz })}
        disabled={journeyRunning}
      />
      <Slider
        label={t('ctl.carrier')}
        value={spec.carrierHz}
        min={LIMITS.carrierHz.min}
        max={LIMITS.carrierHz.max}
        step={5}
        text={`${fmtNumber(lang, spec.carrierHz, 0)} Hz`}
        onChange={(carrierHz) => actions.patchSpec({ carrierHz })}
      />
      <Slider
        label={t('ctl.level')}
        value={spec.levelDb}
        min={LIMITS.levelDb.min}
        max={ceiling}
        step={1}
        text={`${spec.levelDb} dB`}
        onChange={(levelDb) => actions.patchSpec({ levelDb })}
        help={`${t('ctl.level.help')} ${t('ctl.ceiling', { db: ceiling })}.`}
      />
    </div>
  );
}

function SoundPanel() {
  const ceiling = useStore((s) => s.prefs.ceilingDb);
  const mix = useStore((s) => s.draft.spec.mix);
  const ids = Object.keys(mix) as LayerId[];
  const full = ids.length >= MAX_LAYERS;

  return (
    <div className="panel-body">
      <p className="help">{t('sound.help', { n: MAX_LAYERS })}</p>
      {GROUPS.map((g) => (
        <div className="field" key={g.id}>
          <span className="eyebrow" id={`grp-${g.id}`}>
            {t(`sound.group.${g.id}` as Key)}
          </span>
          <div className="tiles" role="group" aria-labelledby={`grp-${g.id}`}>
            {g.layers.map((id) => {
              const on = mix[id] !== undefined;
              return (
                <button key={id} type="button" className="tile" aria-pressed={on} disabled={!on && full} onClick={() => actions.toggleLayer(id, DEFAULT_DB[id] ?? -38)}>
                  <LayerGlyph id={id} />
                  <span>{t(`layer.${id}` as Key)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {full && <p className="help">{t('sound.full')}</p>}

      <div className="field">
        <div className="field-head">
          <span className="eyebrow">{t('sound.mix')}</span>
          {ids.length > 0 && (
            <button type="button" className="btn btn-quiet" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => actions.patchSpec({ mix: {} }, 1.5)}>
              {t('sound.clear')}
            </button>
          )}
        </div>
        {ids.length === 0 ? (
          <p className="help">{t('sound.mixEmpty')}</p>
        ) : (
          ids.map((id) => (
            <Slider
              key={id}
              label={t('sound.level', { name: t(`layer.${id}` as Key) })}
              value={mix[id]!}
              min={LIMITS.mixDb.min}
              max={ceiling}
              step={1}
              text={`${mix[id]} dB`}
              onChange={(db) => actions.setLayerDb(id, db)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionPanel() {
  const timer = useStore((s) => s.draft.timerMin);
  return (
    <div className="panel-body">
      <div className="field">
        <span className="lbl" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
          {t('ctl.timer')}
        </span>
        <Segmented
          label={t('ctl.timer')}
          value={timer}
          onChange={(m) => actions.setTimer(m)}
          options={TIMERS.map((m) => ({ value: m, label: m === 0 ? t('ctl.timer.open') : t('ctl.timer.min', { n: m }) }))}
        />
      </div>
      <p className="help">{t('ctl.hint')}</p>
    </div>
  );
}

type PanelId = 'tone' | 'sound' | 'session';

function Panel() {
  const [tab, setTab] = useState<PanelId>('tone');
  const count = useStore((s) => Object.keys(s.draft.spec.mix).length);
  return (
    <section className="card panel" aria-label={t('ctl.title')}>
      <Tabs
        label={t('ctl.title')}
        value={tab}
        onChange={(id) => setTab(id as PanelId)}
        tabs={[
          { id: 'tone', label: t('tab.tone') },
          { id: 'sound', label: count > 0 ? `${t('tab.sound')} · ${count}` : t('tab.sound') },
          { id: 'session', label: t('tab.session') },
        ]}
      />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'tone' && <TonePanel />}
        {tab === 'sound' && <SoundPanel />}
        {tab === 'session' && <SessionPanel />}
      </div>
    </section>
  );
}

export function Play() {
  return (
    <>
      <div className="screen-head">
        <h1>{t('nav.play')}</h1>
        <p>{t('app.tagline')}</p>
      </div>
      <SceneGrid />
      <div className="play-grid">
        <div className="stage">
          <Instrument>
            <Transport kind="preset" />
          </Instrument>
        </div>
        <Panel />
      </div>
    </>
  );
}
