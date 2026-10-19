import type { LayerId } from '../../engine/dsp/ambient';

/** 24px line glyphs, 1.5 stroke, matching the Lucide-style icon rules of the L2 system. */
const PATHS: Record<LayerId, string> = {
  pink: 'M5 15v3M8 10v8M11 6v12M14 9v9M17 12v6M20 15v3',
  brown: 'M4 8v10M7 11v7M10 13v5M13 14v4M16 15v3M19 16v2',
  white: 'M5 8v10M8 6v12M11 9v9M14 5v13M17 7v11M20 10v8',
  rain: 'M7 14a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 14H7zM9 17l-1 3M13 17l-1 3M17 17l-1 3',
  storm: 'M7 13a4 4 0 0 1 .5-7 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 13M12.5 11l-2.5 4h3.5l-2.5 5',
  ocean: 'M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  wind: 'M3 9h10a3 3 0 1 0-3-3M3 14h14a3 3 0 1 1-3 3M3 19h6',
  stream: 'M4 9c3-3 5 3 8 0s5 3 8 0M4 15c3-3 5 3 8 0s5 3 8 0',
  fire: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  forest: 'M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5',
  night: 'M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z',
  city: 'M4 21V9h6v12M10 21V4h6v17M16 21v-9h4v9M6 12h2M6 15h2M12 8h2M12 11h2M12 14h2',
  fan: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M12 10.5C11 6 13 3.5 15.5 4.5 17 5.5 15 9.5 12 10.5M13.5 12c4.5-1 7 1 6.5 3.5-.5 1.7-4.5 1-6.5-1.5M12 13.5c1 4.5-1 7-3.5 6-1.6-.6-1-4.6 1.5-6.5M10.5 12C6 13 3.5 11 4.5 8.5c.6-1.5 4.6-1 6.5 1.5',
};

export function LayerGlyph({ id, size = 20 }: { id: LayerId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[id]} />
    </svg>
  );
}
