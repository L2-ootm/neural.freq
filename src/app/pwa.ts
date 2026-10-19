import { actions, t, toast } from './store';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const subs = new Set<() => void>();

export const install = {
  available: (): boolean => deferred !== null,
  subscribe(fn: () => void): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  async prompt(): Promise<void> {
    if (!deferred) return;
    const ev = deferred;
    deferred = null;
    subs.forEach((f) => f());
    await ev.prompt();
    await ev.userChoice;
  },
};

export function registerPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    subs.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    subs.forEach((f) => f());
  });

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        const hadController = navigator.serviceWorker.controller !== null;
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed') {
              if (hadController) actions.setUpdateReady();
              else toast(t('offline.ready'));
            }
          });
        });
      })
      .catch(() => undefined);
  });
}
