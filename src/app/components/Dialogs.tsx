import { useState } from 'react';
import { actions, engine, t, useStore } from '../store';
import { Dialog } from './Dialog';

function SafetyBody() {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState<'left' | 'right' | null>(null);
  const playing = useStore((s) => s.engine.status === 'playing');

  const test = async (side: 'left' | 'right') => {
    setBusy(side);
    try {
      await engine.headphoneTone(side);
    } catch {
      /* the engine reports unsupported browsers when playback is requested */
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h2 id="safety-h">{t('safe.title')}</h2>
      <p>{t('safe.lead')}</p>
      <ul>
        <li>{t('safe.i1')}</li>
        <li>{t('safe.i2')}</li>
        <li>{t('safe.i3')}</li>
        <li>{t('safe.i4')}</li>
        <li>{t('safe.i5')}</li>
      </ul>
      <div className="hp">
        <span className="eyebrow">{t('safe.hp')}</span>
        <p className="help">{t('safe.hp.help')}</p>
        <div className="actions">
          <button type="button" className="btn btn-quiet" disabled={busy !== null || playing} onClick={() => void test('left')}>
            {t('safe.hp.left')}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy !== null || playing} onClick={() => void test('right')}>
            {t('safe.hp.right')}
          </button>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.currentTarget.checked)} />
        <span>{t('safe.check')}</span>
      </label>
      <p className="help">{t('safe.medical')}</p>
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => actions.acknowledgeSafety()}>
          {t('safe.continue')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => actions.closeDialog()}>
          {t('safe.cancel')}
        </button>
      </div>
    </>
  );
}

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  return (
    <>
      <Dialog open={dialog === 'safety'} onClose={() => actions.closeDialog()} labelledBy="safety-h" warn>
        <SafetyBody />
      </Dialog>
      <Dialog open={dialog === 'confirmClear'} onClose={() => actions.closeDialog()} labelledBy="clear-h">
        <h2 id="clear-h">{t('hist.clearConfirmTitle')}</h2>
        <p>{t('hist.clearConfirmBody')}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => void actions.clearAll()}>
            {t('hist.clear')}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => actions.closeDialog()}>
            {t('common.cancel')}
          </button>
        </div>
      </Dialog>
    </>
  );
}
