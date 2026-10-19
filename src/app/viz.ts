/** Canvas drawing for the instrument panel. Pure functions over a 2D context. */

const ACCENT = '55, 228, 170';

function hash(i: number, j: number, seed: number): number {
  const x = Math.sin(i * 127.1 + j * 311.7 + seed * 13) * 43758.5453;
  return x - Math.floor(x);
}
const smooth = (t: number): number => t * t * (3 - 2 * t);

function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x: number, y: number, seed: number): number {
  let s = 0;
  let a = 1;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < 3; i++) {
    s += noise2(x * f, y * f, seed + i) * a;
    norm += a;
    a *= 0.55;
    f *= 2;
  }
  return s / norm;
}

const LEVELS = [0.34, 0.42, 0.5, 0.58, 0.66, 0.74];

/** Resting contour terrain. `energy` (0..1) lifts the field slowly; `t` is seconds. */
export function drawTerrain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, energy: number): void {
  ctx.clearRect(0, 0, w, h);
  const cols = 64;
  const rows = Math.max(12, Math.round((cols * h) / w));
  const cw = w / (cols - 1);
  const ch = h / (rows - 1);
  const field = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i / cols;
      const y = (j / rows) * (h / w);
      field[j * cols + i] = fbm(x * 5 + t * 0.012, y * 5 - t * 0.008, 7) + (energy - 0.5) * 0.12 * Math.sin(x * 6 + t * 0.05);
    }
  }
  ctx.lineWidth = 1;
  LEVELS.forEach((lv, k) => {
    const major = k % 3 === 1;
    ctx.strokeStyle = `rgba(${ACCENT}, ${major ? 0.34 : 0.17})`;
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const tl = field[j * cols + i]!;
        const tr = field[j * cols + i + 1]!;
        const bl = field[(j + 1) * cols + i]!;
        const br = field[(j + 1) * cols + i + 1]!;
        const code = (tl > lv ? 1 : 0) | (tr > lv ? 2 : 0) | (br > lv ? 4 : 0) | (bl > lv ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const x0 = i * cw;
        const y0 = j * ch;
        const T: [number, number] = [x0 + (cw * (lv - tl)) / (tr - tl || 1e-9), y0];
        const R: [number, number] = [x0 + cw, y0 + (ch * (lv - tr)) / (br - tr || 1e-9)];
        const B: [number, number] = [x0 + (cw * (lv - bl)) / (br - bl || 1e-9), y0 + ch];
        const L: [number, number] = [x0, y0 + (ch * (lv - tl)) / (bl - tl || 1e-9)];
        const seg = (a: [number, number], b: [number, number]) => {
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        };
        switch (code) {
          case 1:
          case 14:
            seg(L, T);
            break;
          case 2:
          case 13:
            seg(T, R);
            break;
          case 3:
          case 12:
            seg(L, R);
            break;
          case 4:
          case 11:
            seg(B, R);
            break;
          case 5:
            seg(L, T);
            seg(B, R);
            break;
          case 6:
          case 9:
            seg(T, B);
            break;
          case 7:
          case 8:
            seg(L, B);
            break;
          case 10:
            seg(L, B);
            seg(T, R);
            break;
        }
      }
    }
    ctx.stroke();
  });
}

/** Rising-edge trigger so the trace stays steady between frames. */
function trigger(x: Float32Array): number {
  const limit = x.length >> 1;
  for (let i = 1; i < limit; i++) if (x[i - 1]! < 0 && x[i]! >= 0) return i;
  return 0;
}

export function drawScope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  l: Float32Array,
  r: Float32Array,
  active: boolean,
): void {
  ctx.clearRect(0, 0, w, h);
  const mid = h / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  if (!active) return;

  let peak = 1e-4;
  for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
  const gain = (h * 0.34) / peak;
  const n = 1024;
  const traces: [Float32Array, string][] = [
    [r, 'rgba(255,255,255,0.78)'],
    [l, `rgba(${ACCENT}, 1)`],
  ];
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  for (const [x, color] of traces) {
    const start = trigger(x);
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < n && start + i < x.length; i++) {
      const px = (i / (n - 1)) * w;
      const py = mid - x[start + i]! * gain;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

export const SPEC_MIN_HZ = 40;
export const SPEC_MAX_HZ = 2000;
export const specX = (hz: number): number => Math.log(hz / SPEC_MIN_HZ) / Math.log(SPEC_MAX_HZ / SPEC_MIN_HZ);

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  db: Float32Array,
  sampleRate: number,
  markers: number[],
  active: boolean,
): void {
  ctx.clearRect(0, 0, w, h);
  const binHz = sampleRate / (db.length * 2);
  if (active) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let px = 0; px <= w; px += 2) {
      const hz = SPEC_MIN_HZ * Math.pow(SPEC_MAX_HZ / SPEC_MIN_HZ, px / w);
      const k = Math.min(db.length - 1, Math.round(hz / binHz));
      const v = Math.min(1, Math.max(0, (db[k]! + 110) / 80));
      ctx.lineTo(px, h - v * (h - 6));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = `rgba(${ACCENT}, 0.16)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${ACCENT}, 0.9)`;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  for (const hz of markers) {
    if (hz < SPEC_MIN_HZ || hz > SPEC_MAX_HZ) continue;
    const x = Math.round(specX(hz) * w) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
