# ADR 0001: PWA instead of Electron

Status: accepted, 2026-10-18.

Electron 29 is out of security support, its session logging depended on a malformed WASM path, and nothing in the product needs native APIs. A PWA installs on desktop and mobile, works offline, and removes the desktop build pipeline. Revisit with Tauri only if system-level audio routing or a tray icon becomes a requirement.

Also decided:

- No UI-state library: a small external store with `useSyncExternalStore`.
- No PWA plugin: a short service worker generated from the bundle (`vite.config.ts`, `src/sw.js`).
- No ESLint or Prettier dependency yet: strict TypeScript with `noUnused*` covers the same class of issues. Add them if more contributors join.
- IndexedDB written directly instead of sql.js.
- System font stack instead of web fonts (no third-party requests, smaller first load).
- Soundscapes are synthesized, not sampled: no licensing, no download size, deterministic and testable, identical in WAV export.
