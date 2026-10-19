# ADR 0002: Size budgets (gzip)

Enforced by `scripts/check-budget.mjs`, which runs as part of `npm run build`.

| Item | Budget | At 1.0.0 |
|---|---|---|
| App JS | 150 KB | about 76 KB |
| Worklet | 12 KB | about 6 KB |
| CSS | 15 KB | about 4 KB |
| Total first load | 200 KB | about 87 KB |
