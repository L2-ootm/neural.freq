// Fails the build when gzip sizes exceed the budgets in docs/adr/0002-budgets.md.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';

const BUDGET = { appJs: 150, worklet: 12, css: 15, total: 200 }; // KB gzip
const dir = new URL('../dist/assets/', import.meta.url);
const kb = (f) => gzipSync(readFileSync(new URL(f, dir))).length / 1024;

const files = readdirSync(dir);
const sizes = { appJs: 0, worklet: 0, css: 0 };
for (const f of files) {
  if (f.endsWith('.css')) sizes.css += kb(f);
  else if (f.endsWith('.js')) sizes[/tone-processor/.test(f) ? 'worklet' : 'appJs'] += kb(f);
}
const html = gzipSync(readFileSync(new URL('../dist/index.html', import.meta.url))).length / 1024;
const total = sizes.appJs + sizes.worklet + sizes.css + html;

let failed = false;
const row = (name, val, max) => {
  const ok = val <= max;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(10)} ${val.toFixed(1).padStart(6)} KB gzip / ${max} KB`);
};
row('app js', sizes.appJs, BUDGET.appJs);
row('worklet', sizes.worklet, BUDGET.worklet);
row('css', sizes.css, BUDGET.css);
row('total', total, BUDGET.total);
if (failed) process.exit(1);
