# Security

neural.freq is a static, client-only app. It makes no network calls after the initial load, stores data only in the browser (IndexedDB and localStorage), and ships no third-party scripts.

Report a vulnerability by email to the maintainers listed on the L2 Systems site. Please do not open a public issue for security reports. Expect an acknowledgement within a few days.

Scope notes:

- Share links (`#s=...`) are untrusted input. They are size-limited, schema-validated and range-clamped before use (`src/engine/share.ts`, `src/engine/protocol.ts`).
- Imported history files are validated record by record (`src/app/stats.ts`).
- Deployment headers (CSP, COOP, Permissions-Policy) live in `public/_headers`.
