import { actions, t, useStore, type SessionKind } from '../store';
import { Icon } from './ui';

export function ErrorLine() {
  const err = useStore((s) => s.engine.error);
  const status = useStore((s) => s.engine.status);
  if (status !== 'error' || !err) return null;
  return (
    <p className="err" role="alert">
      {err === 'unsupported' ? t('err.unsupported') : t('err.generic', { msg: err })}
    </p>
  );
}

export function Transport({ kind }: { kind: SessionKind }) {
  const status = useStore((s) => s.engine.status);
  const busy = status === 'starting' || status === 'stopping';
  const live = status === 'playing' || status === 'paused';
  const startLabel = kind === 'journey' ? t('tr.start') : t('tr.play');

  return (
    <>
      <ErrorLine />
      <div className="transport">
        {live || status === 'stopping' ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => actions.togglePause()}
              disabled={busy}
              aria-pressed={status === 'paused'}
            >
              <Icon name={status === 'paused' ? 'play' : 'pause'} />
              {status === 'paused' ? t('tr.resume') : t('tr.pause')}
            </button>
            <button type="button" className="btn btn-lg" onClick={() => void actions.stop()} disabled={status === 'stopping'}>
              <Icon name="stop" />
              {status === 'stopping' ? t('tr.stopping') : t('tr.stop')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={() => actions.requestStart(kind)} disabled={busy}>
            <Icon name="play" />
            {status === 'starting' ? t('tr.starting') : startLabel}
          </button>
        )}
      </div>
    </>
  );
}
