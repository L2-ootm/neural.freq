import { useEffect, useState } from 'react';
import { actions, getState, t, useStore } from './store';
import { LIMITS } from '../engine/types';
import { PRESETS } from '../engine/presets';

export function useReducedMotion(): boolean {
  const pref = useStore((s) => s.prefs.motion);
  const [sys, setSys] = useState(() => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'reduce' || (pref === 'system' && sys);
}

const isTyping = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && (el as HTMLInputElement).type !== 'range');
};

/** Space, arrows and brackets. Never steals keys from text fields, buttons or open dialogs. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = getState();
      if (s.dialog || isTyping(e.target)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const onRange = tag === 'INPUT' && (e.target as HTMLInputElement).type === 'range';
      if (e.key === ' ' && tag !== 'BUTTON' && !onRange) {
        if (s.tab !== 'play' && s.tab !== 'journey' && s.engine.status === 'idle') return;
        e.preventDefault();
        if (s.engine.status === 'idle') actions.requestStart(s.tab === 'journey' ? 'journey' : 'preset');
        else actions.togglePause();
        return;
      }
      if (onRange || s.tab !== 'play') return;
      const spec = s.draft.spec;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const d = e.key === 'ArrowRight' ? 0.5 : -0.5;
        actions.patchSpec({ beatHz: Math.min(LIMITS.beatHz.max, Math.max(LIMITS.beatHz.min, spec.beatHz + d)) });
      } else if (e.key === '[' || e.key === ']') {
        const d = e.key === ']' ? 5 : -5;
        actions.patchSpec({ carrierHz: Math.min(LIMITS.carrierHz.max, Math.max(LIMITS.carrierHz.min, spec.carrierHz + d)) });
      } else if (/^[1-5]$/.test(e.key)) {
        actions.selectPreset(PRESETS[Number(e.key) - 1]!.id);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

/** Keep the screen awake and expose lock-screen controls while audio is running. */
export function useSessionIntegrations(): void {
  const status = useStore((s) => s.engine.status);
  const presetId = useStore((s) => s.session?.presetId ?? 'custom');
  const lang = useStore((s) => s.prefs.lang);

  useEffect(() => {
    if (status !== 'playing' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [status]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: `neural.freq · ${presetId.startsWith('scene:') ? t(`scene.${presetId.slice(6)}.name` as Parameters<typeof t>[0]) : t(`preset.${presetId}` as Parameters<typeof t>[0])}`,
      artist: 'L2 Systems',
      album: 'neural.freq',
    });
    ms.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
    const set = (a: MediaSessionAction, fn: (() => void) | null) => {
      try {
        ms.setActionHandler(a, fn);
      } catch {
        /* action unsupported */
      }
    };
    set('play', () => actions.togglePause());
    set('pause', () => actions.togglePause());
    set('stop', () => void actions.stop());
    return () => {
      set('play', null);
      set('pause', null);
      set('stop', null);
    };
  }, [status, presetId, lang]);
}
