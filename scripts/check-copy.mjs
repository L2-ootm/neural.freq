// Fails when user-facing copy makes medical or performance claims (docs/safety.md, wording rules).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const BANNED = /healing|heals?\b|peak cognition|deep sleep|regenerat|therap|insomnia|anxiety|anxious|depress|\badhd\b|\bcures?\b|brain training|reprogram|clinical|hippocamp|prefrontal|vagus|physical restoration/i;
const ALLOWED = [/does not diagnose, treat or prevent/gi, /no diagnostica, trata nem previne/gi, /n[aã]o diagnostica, trata nem previne/gi, /diagnose, treat or prevent/gi, /diagnosticar, tratar nem prevenir/gi];
const ROOTS = ['src', 'public', 'index.html', 'README.md', 'docs/safety.md', 'CHANGELOG.md'];
const EXT = new Set(['.ts', '.tsx', '.html', '.md', '.json', '.webmanifest', '.js', '.css']);

function* walk(p) {
  const s = statSync(p);
  if (s.isDirectory()) for (const f of readdirSync(p)) yield* walk(join(p, f));
  else if (EXT.has(extname(p))) yield p;
}

let bad = 0;
for (const root of ROOTS) {
  let st;
  try { st = statSync(root); } catch { continue; }
  for (const f of st.isDirectory() ? walk(root) : [root]) {
    let text = readFileSync(f, 'utf8');
    for (const a of ALLOWED) text = text.replace(a, '');
    text.split('\n').forEach((line, i) => {
      const m = BANNED.exec(line);
      if (m) {
        bad++;
        console.error(`${f}:${i + 1}: banned term "${m[0]}"`);
      }
    });
  }
}
if (bad) process.exit(1);
console.log('copy check: ok');
