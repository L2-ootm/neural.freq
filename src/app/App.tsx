import { useEffect, useRef } from 'react';
import { decodeShare, tokenFromHash } from '../engine/share';
import { Dialogs } from './components/Dialogs';
import { Transport } from './components/Transport';
import { Mark, StatusChip } from './components/ui';
import { useReducedMotion, useSessionIntegrations, useShortcuts } from './hooks';
import { fmtClock, type Key } from './i18n';
import { About } from './screens/About';
import { History } from './screens/History';
import { Journey } from './screens/Journey';
import { Play } from './screens/Play';
import { Settings } from './screens/Settings';
import { actions, getState, t, toast, useStore, type Tab } from './store';

const TABS: Tab[] = ['play', 'journey', 'history', 'settings', 'about'];

function Header() {
  const tab = useStore((s) => s.tab);
  return (
    <header className="header">
      <div className="shell">
        <a className="brand" href="./" onClick={(e) => { e.preventDefault(); actions.setTab('play'); }}>
          <Mark />
          <span>{t('app.name')}</span>
        </a>
        <nav className="nav" aria-label={t('nav.main')}>
          {TABS.map((id) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => actions.setTab(id)}>
              {t(`nav.${id}` as Key)}
            </button>
          ))}
        </nav>
        <span className="chip-slot">
          <StatusChip />
        </span>
      </div>
    </header>
  );
}

function Dock() {
  const tab = useStore((s) => s.tab);
  const status = useStore((s) => s.engine.status);
  const live = useStore((s) => s.engine.live);
  const duration = useStore((s) => s.session?.plan.durationSec ?? 0);
  const show = tab !== 'play' && tab !== 'journey' && (status === 'playing' || status === 'paused' || status === 'stopping' || status === 'starting');

  useEffect(() => {
    document.documentElement.style.setProperty('--dock-h', show ? '72px' : '0px');
  }, [show]);
  if (!show) return null;
  const elapsed = live?.elapsedSec ?? 0;
  return (
    <div className="dock" role="region" aria-label={t('tr.dock')}>
      <div className="shell">
        <div className="grow">
          <span className="eyebrow">{t('tr.dock')}</span>
          <span className="num">{fmtClock(elapsed)}</span>
          {duration > 0 && <span className="num" style={{ color: 'var(--fg-3)' }}>/ {fmtClock(duration)}</span>}
        </div>
        <Transport kind="preset" />
      </div>
    </div>
  );
}

function Toasts() {
  const toastItem = useStore((s) => s.toast);
  const update = useStore((s) => s.updateReady);
  return (
    <div className="toasts">
      <div role="status" aria-live="polite">
        {toastItem && <div className="toast" key={toastItem.id}>{toastItem.text}</div>}
        {update && (
          <div className="toast" style={{ marginTop: 8 }}>
            {t('update.ready')}{' '}
            <button type="button" className="btn btn-quiet" style={{ minHeight: 36, padding: '4px 10px' }} onClick={() => location.reload()}>
              {t('update.reload')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function App() {
  const tab = useStore((s) => s.tab);
  const lang = useStore((s) => s.prefs.lang);
  const reduced = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useShortcuts();
  useSessionIntegrations();

  useEffect(() => {
    void actions.boot();
    const token = tokenFromHash(location.hash);
    if (token) {
      const shared = decodeShare(token, getState().prefs.ceilingDb);
      if (shared) {
        actions.applyShared(shared.spec, shared.timerMin, shared.journey);
        toast(t('share.loaded'));
      } else {
        toast(t('share.invalid'));
      }
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t('app.name')} · ${t('app.tagline')}`;
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduce' : 'full';
  }, [reduced]);

  // Move focus to the main region on tab change (not on first paint) for keyboard and screen-reader users.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        {t('app.skip')}
      </a>
      <Header />
      <main id="main" ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
        <div className="shell">
          {tab === 'play' && <Play />}
          {tab === 'journey' && <Journey />}
          {tab === 'history' && <History />}
          {tab === 'settings' && <Settings />}
          {tab === 'about' && <About />}
        </div>
      </main>
      <footer className="footer">
        <div className="shell">
          <p>{t('foot.disclaimer')}</p>
          <p>{t('foot.privacy')}</p>
        </div>
      </footer>
      <Dock />
      <Toasts />
      <Dialogs />
    </>
  );
}
