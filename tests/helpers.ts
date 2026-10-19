import { ToneCore } from '../src/engine/dsp/tone-core';
import type { ToneSpec } from '../src/engine/types';

export const baseSpec: ToneSpec = {
  mode: 'binaural',
  carrierHz: 200,
  beatHz: 10,
  levelDb: -18,
  mix: {},
};

export function render(core: ToneCore, seconds: number): { l: Float32Array; r: Float32Array } {
  const n = Math.round(seconds * core.sampleRate);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const block = 128;
  for (let o = 0; o < n; o += block) core.render(l, r, o, Math.min(block, n - o));
  return { l, r };
}

/** Frequency estimate from positive-going zero crossings (valid for a clean sine). */
export function zeroCrossFreq(x: Float32Array, sr: number, from = 0, to = x.length): number {
  const times: number[] = [];
  for (let i = Math.max(1, from); i < to; i++) {
    const a = x[i - 1]!;
    const b = x[i]!;
    if (a < 0 && b >= 0) times.push(i - 1 + -a / (b - a));
  }
  if (times.length < 3) return 0;
  return ((times.length - 1) * sr) / (times[times.length - 1]! - times[0]!);
}

export function rms(x: Float32Array): number {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}

/** Power at frequency f by single-bin DFT. */
export function power(x: Float32Array, sr: number, f: number): number {
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * f) / sr;
  for (let i = 0; i < x.length; i++) {
    re += x[i]! * Math.cos(w * i);
    im -= x[i]! * Math.sin(w * i);
  }
  return (re * re + im * im) / (x.length * x.length);
}

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k);
        const s = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * c - im[b]! * s;
        const ti = re[b]! * s + im[b]! * c;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

/** Welch PSD estimate: Hann window, 50% overlap. Returns power per bin (0..N/2). */
export function welch(x: Float32Array, size = 4096): Float64Array {
  const psd = new Float64Array(size / 2 + 1);
  const win = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  let count = 0;
  for (let o = 0; o + size <= x.length; o += size / 2) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = x[o + i]! * win[i]!;
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) psd[k] = psd[k]! + re[k]! ** 2 + im[k]! ** 2;
    count++;
  }
  for (let k = 0; k < psd.length; k++) psd[k] = psd[k]! / count;
  return psd;
}

/** Mean PSD between lo and hi Hz. */
export function bandMean(psd: Float64Array, sr: number, lo: number, hi: number): number {
  const size = (psd.length - 1) * 2;
  const a = Math.floor((lo * size) / sr);
  const b = Math.ceil((hi * size) / sr);
  let s = 0;
  for (let k = a; k <= b; k++) s += psd[k]!;
  return s / (b - a + 1);
}
