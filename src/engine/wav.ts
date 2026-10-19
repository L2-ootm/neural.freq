import { ToneCore } from './dsp/tone-core';
import { Rng } from './dsp/noise';
import { sanitizeSpec, type Plan } from './types';

export const WAV_MAX_SECONDS = 600;

/** Render a plan to a 16-bit stereo WAV with TPDF dither, using the same DSP as live playback. */
export async function renderWav(
  plan: Plan,
  seconds: number,
  sampleRate = 48000,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const total = Math.round(Math.min(seconds, WAV_MAX_SECONDS) * sampleRate);
  const spec = sanitizeSpec(plan.spec, plan.ceilingDb);
  const core = new ToneCore(sampleRate, spec, plan.ceilingDb, 0x5eed);
  if (plan.segments.length > 0) core.setBeatSchedule(plan.segments);
  core.scheduleEnd(total / sampleRate, plan.fadeOutSec);
  core.fadeIn(plan.fadeInSec);

  const header = 44;
  const buf = new ArrayBuffer(header + total * 4);
  const view = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  view.setUint32(4, 36 + total * 4, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, total * 4, true);

  const dither = new Rng(0xd17e);
  const block = 16384;
  const l = new Float32Array(block);
  const r = new Float32Array(block);
  let pos = header;
  for (let done = 0; done < total; done += block) {
    const n = Math.min(block, total - done);
    core.render(l, r, 0, n);
    for (let i = 0; i < n; i++) {
      for (const x of [l[i]!, r[i]!]) {
        const d = (dither.next() + dither.next()) * 0.5; // TPDF, +-1 LSB
        const q = Math.round(x * 32767 + d);
        view.setInt16(pos, q > 32767 ? 32767 : q < -32768 ? -32768 : q, true);
        pos += 2;
      }
    }
    onProgress?.((done + n) / total);
    await new Promise((res) => setTimeout(res, 0));
  }
  return new Blob([buf], { type: 'audio/wav' });
}
