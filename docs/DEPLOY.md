# Deploying the demo

The app is a static site: `dist/` after `npm run build`. HTTPS is required (AudioWorklet, service worker, Media Session, Wake Lock). Run `npm run verify` before every deploy; CI runs the same checks on every push to `main` and every pull request (`.github/workflows/ci.yml`).

## Cloudflare Workers static assets (production: neuralfreqlab.l2systems.com.br)

`wrangler.jsonc` serves `dist/` as Workers assets under the worker `neural-freq-lab`, with `public/_headers` applied (CSP, COOP, cache). The route has `custom_domain: true`, so wrangler creates the DNS record and certificate itself; the wrangler OAuth login lacks DNS write, and this is the programmatic path that works. Deploy: `npm run build && npx wrangler deploy`.

Cloudflare Web Analytics may be auto-injected on the zone. The CSP blocks that beacon (console error only, no request is made). Turn it off in the zone's Web Analytics settings to silence it.

## Vercel (preview mirror)

Project `neural-freq`, at `neural-freq.vercel.app`, connected to the GitHub repo. `vercel.json` carries the same headers. Deploy with `vercel deploy --prod`.

## Cloudflare Pages (alternative)

1. Connect the repo. Build command `npm run build`, output directory `dist`, Node 20 (`.nvmrc`).
2. `public/_headers` is copied to `dist/` and sets the CSP, COOP, CORP, Permissions-Policy and cache rules.
3. Add the custom domain (for example `neuralfreq.<l2-domain>`). Leave `BASE_PATH` unset for a domain root.

## Sub-path hosting

Set `BASE_PATH=/neural-freq/` at build time. The manifest and service worker use relative paths, so they work under a sub-path. Headers cannot be set on GitHub Pages; the CSP would have to move into a meta tag, which is weaker.

## Pre-launch checklist

- [ ] `npm run verify` is green (copy check, typecheck, tests, build, budgets).
- [ ] Open the deployed URL in Chrome, Edge, Firefox and Safari; play each mode.
- [ ] Lighthouse: performance >= 95, accessibility 100.
- [ ] DevTools Network during a session shows no third-party requests.
- [ ] Offline: reload with the network disabled after one visit.
- [ ] Clinician review of `docs/safety.md` copy; trademark search.
- [ ] Add an Open Graph image at `public/og.png` and the `og:image` tag once final art exists.
