# Changelog

## 1.0.0 - 2026-10-18

Full rewrite of the Phase II prototype as a static PWA demo.

### Added

- Typed, framework-free DSP engine (`src/engine`) shared by the AudioWorklet, WAV export and tests.
- Binaural, monaural and isochronic modes.
- Eight scenes: Study, Deep work, Reading, Creative, Relax, Outdoors, Wind down, Night.
- Thirteen synthesized soundscape layers (rain, thunderstorm, ocean, wind, stream, fireplace, forest birds, night crickets, city traffic, fan, pink, brown, white), up to four at once, no audio files.
- Journey: up to four linear beat ramps with a timeline preview.
- Local history with notes, weekly chart, streak, JSON export and import, and delete-all.
- WAV export (up to 10 minutes) that matches live playback, including soundscapes.
- Share links that carry only tuning and duration.
- English and Brazilian Portuguese.
- Installable, offline-capable PWA with Media Session and Wake Lock integration.
- Unit and DSP tests, bundle budget check, banned-claims check, CI.

### Fixed (from the prototype)

- The induction sweep never reached its target (1-pole filter instead of a linear ramp).
- Manual beat and carrier settings were ignored on Play, and Pause/Resume reset the beat.
- The soft clipper was non-monotonic and discontinuous.
- Sessions were only logged on timer completion, and there was no Stop button.
- Sample rate was assumed to be 48 kHz.
- Safety gating and duration limits contradicted each other.

### Removed

- Electron (v29 is out of security support), sql.js (about 640 KB of WASM for a list of rows), the 19.5 kHz keep-alive tone and the unverified "comfort noise" claims.
- All health and performance claims from names, copy and data.
