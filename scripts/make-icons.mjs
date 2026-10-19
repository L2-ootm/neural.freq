// Rasterizes the contour mark to PNG without dependencies (zlib only). Run: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [16, 22, 33];
const FG = [55, 228, 170];

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Cubic bezier pieces of the mark in a 32 unit box: M5 y c4-1 6-6 11-6 s7 4 11 3
function curve(y0) {
  const p = [];
  const seg = (a, b, c, d) => {
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      p.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
    }
  };
  seg([5, y0], [9, y0 - 1], [11, y0 - 6], [16, y0 - 6]);
  seg([16, y0 - 6], [21, y0 - 6], [23, y0 - 2], [27, y0 - 3]);
  return p;
}
const CURVES = [[21, 0.45], [16, 1], [11, 0.45]].map(([y, a]) => ({ pts: curve(y), a }));

function render(size, { inset, radius }) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = (size * (1 - 2 * inset)) / 32;
  const off = size * inset;
  const lw = 1.25 * scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = radius * size;
      const dx = Math.max(r - x, x - (size - 1 - r), 0), dy = Math.max(r - y, y - (size - 1 - r), 0);
      const inside = radius === 0 || Math.hypot(dx, dy) <= r;
      let col = BG;
      let alpha = inside ? 255 : 0;
      let best = 0;
      for (const c of CURVES) {
        let d = Infinity;
        for (const [px, py] of c.pts) d = Math.min(d, Math.hypot(x - (off + px * scale), y - (off + py * scale)));
        const cov = Math.max(0, Math.min(1, lw / 2 + 0.5 - d)) * c.a;
        best = Math.max(best, cov);
      }
      const o = (y * size + x) * 4;
      buf[o] = Math.round(col[0] + (FG[0] - col[0]) * best);
      buf[o + 1] = Math.round(col[1] + (FG[1] - col[1]) * best);
      buf[o + 2] = Math.round(col[2] + (FG[2] - col[2]) * best);
      buf[o + 3] = alpha;
    }
  }
  return buf;
}

for (const [name, size, opts] of [
  ['icon-192.png', 192, { inset: 0.04, radius: 0.09 }],
  ['icon-512.png', 512, { inset: 0.04, radius: 0.09 }],
  ['icon-maskable-512.png', 512, { inset: 0.18, radius: 0 }],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, render(size, opts)));
  console.log('wrote', name);
}
