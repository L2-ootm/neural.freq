import { useRef, useState } from 'react';
import { fmtClock, fmtDateTime, fmtNumber, type Key } from '../i18n';
import { parseRecords, streak, totalSec, weekly } from '../stats';
import { actions, t, toast, useStore } from '../store';

function WeekChart() {
  const lang = useStore((s) => s.prefs.lang);
  const history = useStore((s) => s.history);
  const week = weekly(history, Date.now());
  const max = Math.max(1, ...week.map((d) => d.minutes));
  const summary = week
    .map((d) => `${new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(d.ts)}: ${Math.round(d.minutes)} min`)
    .join('; ');
  return (
    <div role="img" aria-label={`${t('hist.weekDesc')} ${summary}`}>
      <div className="bars">
        {week.map((d) => (
          <div className="bar" key={d.key}>
            <div className={`fill${d.minutes < 0.5 ? ' zero' : ''}`} style={{ height: `${Math.max(2, (d.minutes / max) * 100)}%` }} />
            <span aria-hidden="true">{new Intl.DateTimeFormat(lang, { weekday: 'narrow' }).format(d.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function History() {
  const lang = useStore((s) => s.prefs.lang);
  const history = useStore((s) => s.history);
  const storeError = useStore((s) => s.historyError);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(30);
  const now = Date.now();
  const total = totalSec(history);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'neural.freq', version: 1, sessions: history }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neuralfreq-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importJson = async (file: File) => {
    try {
      if (file.size > 20_000_000) throw new Error('too large');
      const recs = parseRecords(JSON.parse(await file.text()));
      if (!recs) throw new Error('invalid');
      toast(t('hist.imported', { n: await actions.importSessions(recs) }));
    } catch {
      toast(t('hist.importFail'));
    }
  };

  return (
    <>
      <div className="screen-head">
        <h1>{t('hist.title')}</h1>
        <p>{t('foot.privacy')}</p>
      </div>
      {storeError && (
        <p className="err" role="alert" style={{ margin: '0 0 16px' }}>
          {t('hist.storeError')}
        </p>
      )}
      <div className="two">
        <div className="stack">
          <section className="card" aria-label={t('hist.title')}>
            <div className="kpis">
              <div className="kpi">
                <div className="eyebrow">{t('hist.total')}</div>
                <div className="v num">{fmtClock(total)}</div>
              </div>
              <div className="kpi">
                <div className="eyebrow">{t('hist.sessions')}</div>
                <div className="v num">{history.length}</div>
              </div>
              <div className="kpi">
                <div className="eyebrow">{t('hist.streak')}</div>
                <div className="v num">{streak(history, now)}</div>
              </div>
            </div>
          </section>
          <section className="card" aria-labelledby="wk-h">
            <div className="card-head">
              <h2 id="wk-h">{t('hist.week')}</h2>
            </div>
            <WeekChart />
          </section>
          <section className="card" aria-label="Data">
            <div className="actions">
              <button type="button" className="btn btn-quiet" onClick={exportJson} disabled={history.length === 0}>
                {t('hist.export')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
                {t('hist.import')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => actions.openDialog('confirmClear')}>
                {t('hist.clear')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (f) void importJson(f);
                }}
              />
            </div>
          </section>
        </div>

        <section className="card" aria-labelledby="ls-h">
          <div className="card-head">
            <h2 id="ls-h">{t('hist.sessions')}</h2>
          </div>
          {history.length === 0 ? (
            <p className="help">{t('hist.empty')}</p>
          ) : (
            <ul className="list">
              {history.slice(0, shown).map((r) => (
                <li className="row" key={r.id}>
                  <div className="row-head">
                    <strong>
                      {r.presetId.startsWith('scene:')
                        ? t(`scene.${r.presetId.slice(6)}.name` as Key)
                        : r.kind === 'journey'
                          ? t('hist.journey')
                          : t(`preset.${r.presetId}` as Key)}
                    </strong>
                    <span className="num" style={{ color: 'var(--fg-1)' }}>
                      {fmtClock(r.playedSec)}
                    </span>
                  </div>
                  <div className="row-meta">
                    <span>{fmtDateTime(lang, r.startedAt)}</span>
                    <span className="num">
                      {fmtNumber(lang, r.beatStartHz)}
                      {r.beatEndHz !== r.beatStartHz ? ` → ${fmtNumber(lang, r.beatEndHz)}` : ''} Hz
                    </span>
                    <span className="num">{fmtNumber(lang, r.carrierHz, 0)} Hz</span>
                    <span>{t(`mode.${r.mode}` as Key)}</span>
                  </div>
                  <label className="sr" htmlFor={`note-${r.id}`}>
                    {t('hist.note')}
                  </label>
                  <textarea
                    id={`note-${r.id}`}
                    className="note"
                    rows={1}
                    maxLength={2000}
                    placeholder={t('hist.notePlaceholder')}
                    defaultValue={r.note}
                    onBlur={(e) => void actions.setNote(r.id, e.currentTarget.value)}
                  />
                  <div>
                    <button type="button" className="btn btn-quiet" style={{ minHeight: 36, padding: '4px 10px' }} onClick={() => void actions.deleteSession(r.id)}>
                      {t('hist.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {history.length > shown && (
            <button type="button" className="btn btn-quiet" style={{ marginTop: 12 }} onClick={() => setShown((n) => n + 30)}>
              +30
            </button>
          )}
        </section>
      </div>
    </>
  );
}
