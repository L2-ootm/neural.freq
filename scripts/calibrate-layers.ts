// Prints the RMS of every soundscape layer at unity so LAYER_NORM can be set. Run: npx vite-node scripts/calibrate-layers.ts
import { createLayer, LAYER_IDS } from '../src/engine/dsp/ambient';

const sr = 48000;
const seconds = Number(process.argv[2] ?? 90);
for (const id of LAYER_IDS) {
  const layer = createLayer(id, sr, 0x5eed);
  const out = new Float64Array(2);
  let s = 0;
  let peak = 0;
  const n = seconds * sr;
  for (let i = 0; i < n; i++) {
    out[0] = 0;
    out[1] = 0;
    layer.next(out);
    s += out[0]! * out[0]! + out[1]! * out[1]!;
    peak = Math.max(peak, Math.abs(out[0]!), Math.abs(out[1]!));
  }
  const rms = Math.sqrt(s / (2 * n));
  console.log(`${id.padEnd(7)} rms ${rms.toFixed(4)}  norm ${(1 / rms).toFixed(4)}  peak/rms ${(peak * (1 / rms)).toFixed(1)}`);
}
