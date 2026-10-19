import { useState, useSyncExternalStore } from 'react';
import { buildPlan } from '../../engine/plan';
import { shareUrl } from '../../engine/share';
import { LIMITS } from '../../engine/types';
import { renderWav, WAV_MAX_SECONDS } from '../../engine/wav';
import { fmtNumber, LANGS, type Key } from '../i18n';
import { install } from '../pwa';
import { getState, actions, t, toast, useStore } from '../store';
import { Segmented, Slider } from '../components/ui';

function Install() {
  const available = useSyncExternalStore(install.subscribe, install.available);
  return (
    <div className="field">
      <span className="lbl" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
        {t('set.install')}
      </span>
      <p className="help">{available ? t('set.install.help') : t('set.install.done')}</p>
      <div>
        <button type="button" className="btn btn-quiet" disabled={!available} onClick={() => void install.prompt()}>
          {t('set.install')}
        </button>
      </div>
    </div>
  );
}

function Share() {
  const copy = async () => {
    const s = getState();
    const journey = s.tab === 'journey' ? { steps: s.journey.steps } : null;
    const spec = journey ? { ...s.draft.spec, beatHz: s.journey.startHz } : s.draft.spec;
    const withBeat = shareUrl({ spec, timerMin: s.draft.timerMin, journey });
    try {
      await navigator.clipboard.writeText(withBeat);
      toast(t('set.share.copied'));
    } catch {
      window.prompt(t('set.share'), withBeat);
    }
  };
  return (
    <div className="field">
      <span className="lbl" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
        {t('set.share')}
      </span>
      <p className="help">{t('set.share.help')}</p>
      <div>
        <button type="button" className="btn btn-quiet" onClick={() => void copy()}>
          {t('set.share')}
        </button>
      </div>
    </div>
  );
}

function ExportAudio() {
  const [minutes, setMinutes] = useState(10);
  const [progress, setProgress] = useState<number | null>(null);

  const go = async () => {
    const s = getState();
    const plan = buildPlan({
      spec: s.draft.spec,
      journey: null,
      timerMin: minutes,
      fadeInSec: s.prefs.fadeInSec,
      fadeOutSec: s.prefs.fadeOutSec,
      ceilingDb: s.prefs.ceilingDb,
    });
    setProgress(0);
    try {
      const blob = await renderWav(plan, minutes * 60, 48000, (f) => setProgress(f));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `neuralfreq-${s.draft.spec.mode}-${s.draft.spec.beatHz}hz-${minutes}min.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="field">
      <span className="lbl" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
        {t('set.export')}
      </span>
      <p className="help">{t('set.export.help')}</p>
      <Slider
        label={t('set.export.min')}
        value={minutes}
        min={1}
        max={WAV_MAX_SECONDS / 60}
        step={1}
        text={`${minutes} min`}
        disabled={progress !== null}
        onChange={setMinutes}
      />
      <div>
        <button type="button" className="btn btn-quiet" disabled={progress !== null} onClick={() => void go()}>
          {progress === null ? t('set.export.go') : t('set.export.busy', { n: Math.round(progress * 100) })}
        </button>
      </div>
    </div>
  );
}

export function Settings() {
  const lang = useStore((s) => s.prefs.lang);
  const p = useStore((s) => s.prefs);

  return (
    <>
      <div className="screen-head">
        <h1>{t('set.title')}</h1>
      </div>
      <div className="two">
        <div className="stack">
          <section className="card" aria-labelledby="g-h">
            <div className="card-head">
              <h2 id="g-h">{t('set.language')}</h2>
            </div>
            <Segmented
              label={t('set.language')}
              value={p.lang}
              onChange={(l) => actions.setPrefs({ lang: l })}
              options={LANGS.map((l) => ({ value: l, label: l === 'en' ? 'English' : 'Português' }))}
            />
            <div style={{ height: 18 }} />
            <div className="field">
              <span className="lbl" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
                {t('set.motion')}
              </span>
              <Segmented
                label={t('set.motion')}
                value={p.motion}
                onChange={(motion) => actions.setPrefs({ motion })}
                options={(['system', 'reduce', 'full'] as const).map((m) => ({ value: m, label: t(`set.motion.${m}` as Key) }))}
              />
              <p className="help">{t('set.motion.help')}</p>
            </div>
          </section>

          <section className="card" aria-labelledby="l-h">
            <div className="card-head">
              <h2 id="l-h">{t('ctl.level')}</h2>
            </div>
            <Slider
              label={t('set.ceiling')}
              value={p.ceilingDb}
              min={LIMITS.ceilingDb.min}
              max={LIMITS.ceilingDb.max}
              step={1}
              text={`${p.ceilingDb} dB`}
              help={t('set.ceiling.help')}
              onChange={(ceilingDb) => actions.setPrefs({ ceilingDb })}
            />
            <Slider
              label={t('set.level')}
              value={p.levelDb}
              min={LIMITS.levelDb.min}
              max={p.ceilingDb}
              step={1}
              text={`${p.levelDb} dB`}
              onChange={(levelDb) => actions.setPrefs({ levelDb })}
            />
            <Slider
              label={t('set.fadeIn')}
              value={p.fadeInSec}
              min={0}
              max={30}
              step={1}
              text={t('set.seconds', { n: fmtNumber(lang, p.fadeInSec, 0) })}
              onChange={(fadeInSec) => actions.setPrefs({ fadeInSec })}
            />
            <Slider
              label={t('set.fadeOut')}
              value={p.fadeOutSec}
              min={0}
              max={30}
              step={1}
              text={t('set.seconds', { n: fmtNumber(lang, p.fadeOutSec, 0) })}
              onChange={(fadeOutSec) => actions.setPrefs({ fadeOutSec })}
            />
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="t-h">
            <div className="card-head">
              <h2 id="t-h">{t('nav.settings')}</h2>
            </div>
            <Install />
            <Share />
            <ExportAudio />
            <div className="field">
              <div>
                <button type="button" className="btn btn-quiet" onClick={() => actions.openDialog('safety')}>
                  {t('set.safety')}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
