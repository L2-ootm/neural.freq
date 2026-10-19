# neural.freq

An audio lab for focus and relaxation. Build, hear and log your own binaural sessions, with synthesized soundscapes. Runs entirely in the browser; nothing leaves your device.

Version 1.0.0 ([changelog](CHANGELOG.md)). A demo by L2 Systems. Not a medical device. See [docs/safety.md](docs/safety.md).

## What it does

- **Tone engine.** Binaural, monaural or isochronic beats from 0.5 to 40 Hz on a 100 to 500 Hz carrier. Five starting bands (delta, theta, alpha, beta, gamma). The screen shows what the audio engine is actually running.
- **Scenes.** Eight one-tap setups: Study, Deep work, Reading, Creative, Relax, Outdoors, Wind down, Night. Each sets beat, carrier, soundscape and timer.
- **Soundscape.** Thirteen layers synthesized in the audio thread: rain, thunderstorm, ocean, wind, stream, fireplace, forest birds, night crickets, city traffic, fan, pink, brown and white noise. Mix up to four. No audio files.
- **Journey.** Up to four linear beat ramps in one session, each up to 60 minutes, with a timeline preview. Each ramp reaches its target exactly when it ends. Starting templates: Wind down, Settle, Lift.
- **History.** Stored in IndexedDB on this device only. Notes, a 7-day chart, day streak, JSON export and import, delete all.
- **WAV export.** Up to 10 minutes, rendered by the same DSP as live playback, soundscapes included.
- **Share links.** `#s=` fragments that carry only tuning and duration. Decoded values are validated and clamped.
- **PWA.** Installable, offline after first load, lock-screen controls (Media Session), screen kept awake while playing (Wake Lock).
- **Languages.** English and Brazilian Portuguese. The default follows the browser language; change it in Settings.

## Keyboard

| Key | Action |
|---|---|
| Space | Start, or pause and resume. Ignored while a button or slider has focus. |
| Left, Right | Beat down or up 0.5 Hz (Play screen). |
| `[`, `]` | Carrier down or up 5 Hz (Play screen). |
| `1` to `5` | Select a band preset: delta, theta, alpha, beta, gamma (Play screen). |

## Quick start

Needs Node 20 or newer (see `.nvmrc`) and a current Chrome, Edge, Firefox or Safari. Use stereo headphones for binaural mode.

```bash
npm install
npm run dev        # http://localhost:5173
npm run verify     # copy check, typecheck, tests, build, size budgets
npm run preview    # serve dist/ on http://localhost:4173
```

| Script | Does |
|---|---|
| `dev` | Vite dev server. |
| `build` | Typecheck, production build to `dist/`, gzip size budgets. |
| `typecheck` | `tsc --noEmit`, strict TypeScript. |
| `test` | Vitest, 42 tests, no browser needed. |
| `check:copy` | Fails on banned medical and performance terms (see [docs/safety.md](docs/safety.md)). |
| `verify` | `check:copy`, `typecheck`, `test`, `build`. Same checks as CI. |
| `icons` | Runs `scripts/make-icons.mjs` for the PWA icons. |
| `preview` | Serves `dist/` locally. |

## Architecture

```
src/engine/                framework-free audio core; DOM only in the Web Audio wrapper
  dsp/tone-core.ts         sample-accurate generator: oscillators, ramps, fades, mix, output limiter
  dsp/ambient.ts           soundscape layers (13 layers, up to 4 active)
  dsp/noise.ts             Kellet pink, brown, white (calibrated to equal RMS)
  dsp/filters.ts           one-pole and biquad filters
  dsp/ramp.ts              linear beat ramps
  worklet/tone-processor.ts  AudioWorkletProcessor around ToneCore
  engine.ts                AudioContext graph, play, pause, resume, stop, analysers
  protocol.ts              versioned, validated worklet messages
  types.ts                 ToneSpec, engine limits, defaults
  plan.ts presets.ts share.ts wav.ts
src/app/                   React UI: App, screens, components, store, i18n, storage, PWA glue
  store.ts hooks.ts storage.ts stats.ts viz.ts pwa.ts i18n.ts
src/sw.js                  service worker template; cache name and precache list are injected at build
scripts/                   check-budget.mjs, check-copy.mjs, make-icons.mjs, calibrate-layers.ts
tests/                     Vitest: DSP and model tests
public/                    manifest, icons, robots.txt, _headers (CSP and security headers)
docs/                      safety, research, deployment, ADRs, history
```

The same `ToneCore` runs in the worklet, in WAV export and in tests, so what you hear, export and verify is one code path. All time-based behavior is derived from the context sample rate.

Runtime dependencies: React and React DOM only. Build and test: Vite 5, TypeScript 5.6, Vitest 2.

Gzip size budgets, enforced by `npm run build` ([docs/adr/0002-budgets.md](docs/adr/0002-budgets.md)):

| Item | Budget | Current |
|---|---|---|
| App JS | 150 KB | about 76 KB |
| Worklet | 12 KB | about 6 KB |
| CSS | 15 KB | about 4 KB |
| Total first load | 200 KB | about 87 KB |

## Verification

`npm run verify` runs in CI (`.github/workflows/ci.yml`) on every push to `main` and every pull request.

The 42 tests cover per-ear frequencies at 44.1 and 48 kHz, ramp endpoints, fades, the output ceiling, the monotonic saturator, noise calibration and slopes, every soundscape layer (finite, bounded, audible, deterministic, spectral character), protocol validation, share links and WAV headers.

The last recorded browser pass (Chrome) covered the full flow, axe accessibility checks with zero violations on every screen, no horizontal overflow at 390 px, no third-party requests, and offline reload. It is not part of `npm run verify`.

Not measured here: real output on headphones (loudness, response) and Safari or Firefox playback. See [docs/DEPLOY.md](docs/DEPLOY.md) for the launch checklist.

## Privacy and security

- No accounts. The app makes no third-party requests.
- Preferences are stored in localStorage. History is stored in IndexedDB. Both stay on the device.
- Share links and imported files are untrusted input. They are size-limited, schema-validated and range-clamped (`src/engine/share.ts`, `src/engine/protocol.ts`, `src/app/stats.ts`).
- Security headers (CSP, COOP, CORP, Permissions-Policy) are in `public/_headers` and `vercel.json`.
- Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Deployment

The app is a static site: `npm run build` produces `dist/`. HTTPS is required (AudioWorklet, service worker, Media Session, Wake Lock). Supported targets are Cloudflare Workers static assets (`wrangler.jsonc`), Vercel (`vercel.json`) and Cloudflare Pages. Sub-path hosting uses `BASE_PATH`. Details: [docs/DEPLOY.md](docs/DEPLOY.md).

## Contributing

- Run `npm run verify` before opening a pull request. It must pass.
- User-facing copy makes no medical, health or performance claims. `check:copy` enforces the banned-term list; the full wording rules are in [docs/safety.md](docs/safety.md).
- Bump `SAFETY_VERSION` in `src/app/storage.ts` when the consent text changes.
- Record architecture decisions as ADRs in [docs/adr](docs/adr/).
- Add a [CHANGELOG](CHANGELOG.md) entry for user-visible changes.

## Docs

[changelog](CHANGELOG.md) · [security](SECURITY.md) · [safety and wording rules](docs/safety.md) · [evidence notes](docs/research.md) · [deployment](docs/DEPLOY.md) · [ADRs](docs/adr/)

## License

Code: MIT ([LICENSE](LICENSE)). Copy and documentation: CC BY 4.0. Third-party attributions are in [NOTICE](NOTICE). The names "neural.freq" and "L2 Systems" are not licensed.
