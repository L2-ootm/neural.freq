import { createLayer, LAYER_IDS, LAYER_NORM, type Layer, type LayerId } from './ambient';
import { Ramp } from './ramp';
import {
  clamp,
  dbToGain,
  LIMITS,
  OUTPUT_CEILING_DB,
  sanitizeSpec,
  type LiveState,
  type ToneSpec,
} from '../types';

const TWO_PI = Math.PI * 2;

/**
 * Sample-accurate tone generator. Pure: no Web Audio dependency, so the same code
 * runs in the AudioWorklet, in WAV export and in Node tests.
 *
 *  binaural   L = carrier - beat/2, R = carrier + beat/2 (dichotic; needs headphones)
 *  monaural   both ears = the two tones mixed; the beat is in the signal itself
 *  isochronic carrier gated by a smoothed pulse at the beat rate, both ears
 */
export class ToneCore {
  readonly sampleRate: number;
  private spec: ToneSpec;
  private readonly ceilingDb: number;

  private readonly carrier: Ramp;
  private readonly beat: Ramp;
  private readonly tone: Ramp;
  private readonly layerGain = new Map<LayerId, Ramp>();
  private readonly layers = new Map<LayerId, Layer>();
  private readonly frameBuf = new Float64Array(2);
  private readonly seed: number;
  private readonly fade = new Ramp(0);
  private beatQueue: { to: number; frames: number }[] = [];

  private phL = 0;
  private phR = 0;
  private phBeat = 0;
  private frames = 0;
  private endFrame = Infinity;
  private fadeOutFrames = 0;
  private fadingOut = false;
  private done = false;

  private readonly satC = dbToGain(OUTPUT_CEILING_DB);

  constructor(sampleRate: number, spec: ToneSpec, ceilingDb: number, seed = 0x5eed) {
    this.sampleRate = sampleRate;
    this.ceilingDb = ceilingDb;
    this.spec = sanitizeSpec(spec, ceilingDb);
    this.carrier = new Ramp(this.spec.carrierHz);
    this.beat = new Ramp(this.spec.beatHz);
    this.tone = new Ramp(dbToGain(this.spec.levelDb));
    this.seed = seed;
    for (const [id, db] of Object.entries(this.spec.mix)) this.setLayer(id as LayerId, dbToGain(db), 0);
  }

  get currentSpec(): ToneSpec {
    return this.spec;
  }

  /** Smoothly move to new parameters over `rampSec`. Mode changes apply immediately. */
  set(patch: Partial<ToneSpec>, rampSec: number): void {
    const next = sanitizeSpec({ ...this.spec, ...patch }, this.ceilingDb);
    const f = rampSec * this.sampleRate;
    if (patch.carrierHz !== undefined) this.carrier.to(next.carrierHz, f);
    if (patch.beatHz !== undefined) {
      this.beatQueue = [];
      this.beat.to(next.beatHz, f);
    }
    if (patch.levelDb !== undefined) this.tone.to(dbToGain(next.levelDb), f);
    if (patch.mix !== undefined) {
      for (const id of LAYER_IDS) {
        const db = next.mix[id];
        if (db !== undefined || this.layerGain.has(id)) this.setLayer(id, db === undefined ? 0 : dbToGain(db), f);
      }
    }
    this.spec = next;
  }

  /** Replace the beat schedule: linear ramps in Hz, played back to back from the current beat. */
  setBeatSchedule(segments: { toHz: number; seconds: number }[]): void {
    this.beatQueue = segments
      .filter((s) => s.seconds > 0)
      .map((s) => ({
        to: clamp(s.toHz, LIMITS.beatHz.min, LIMITS.beatHz.max),
        frames: Math.round(s.seconds * this.sampleRate),
      }));
    this.beat.to(this.beat.value, 0);
    this.advanceQueue();
  }

  private setLayer(id: LayerId, gain: number, frames: number): void {
    let r = this.layerGain.get(id);
    if (!r) {
      r = new Ramp(0);
      this.layerGain.set(id, r);
    }
    if (gain > 0 && !this.layers.has(id)) {
      this.layers.set(id, createLayer(id, this.sampleRate, this.seed + LAYER_IDS.indexOf(id) * 977));
    }
    r.to(gain, frames);
  }

  fadeIn(seconds: number): void {
    this.fadingOut = false;
    this.done = false;
    this.fade.to(1, seconds * this.sampleRate);
  }

  fadeOut(seconds: number): void {
    this.fadingOut = true;
    this.fade.to(0, seconds * this.sampleRate);
  }

  /** Reach silence at `totalSec` of elapsed time, starting the fade `fadeOutSec` earlier. */
  scheduleEnd(totalSec: number, fadeOutSec: number): void {
    this.endFrame = Math.round(totalSec * this.sampleRate);
    this.fadeOutFrames = Math.round(fadeOutSec * this.sampleRate);
  }

  get state(): LiveState {
    return {
      beatHz: this.beat.value,
      carrierHz: this.carrier.value,
      elapsedSec: this.frames / this.sampleRate,
      fade: this.fade.value,
      finished: this.done,
    };
  }

  private advanceQueue(): void {
    if (this.beat.active) return;
    const seg = this.beatQueue.shift();
    if (seg) {
      this.beat.to(seg.to, seg.frames);
      this.spec = { ...this.spec, beatHz: seg.to };
    }
  }

  /** Render `n` frames into outL/outR starting at `offset`. */
  render(outL: Float32Array, outR: Float32Array, offset: number, n: number): void {
    const sr = this.sampleRate;
    const mode = this.spec.mode;
    const satC = this.satC;

    for (let i = 0; i < n; i++) {
      if (!this.fadingOut && this.endFrame !== Infinity && this.frames >= this.endFrame - this.fadeOutFrames) {
        this.fadeOut(this.fadeOutFrames / sr);
      }
      if (!this.beat.active && this.beatQueue.length > 0) this.advanceQueue();

      const carrier = this.carrier.tick();
      const beat = this.beat.tick();
      const toneG = this.tone.tick();
      const f = this.fade.tick();
      const fadeG = f * f * (3 - 2 * f);

      let l: number;
      let r: number;
      if (mode === 'binaural') {
        this.phL += (carrier - beat * 0.5) / sr;
        this.phR += (carrier + beat * 0.5) / sr;
        l = Math.sin(TWO_PI * this.phL);
        r = Math.sin(TWO_PI * this.phR);
      } else if (mode === 'monaural') {
        this.phL += (carrier - beat * 0.5) / sr;
        this.phR += (carrier + beat * 0.5) / sr;
        l = r = 0.5 * (Math.sin(TWO_PI * this.phL) + Math.sin(TWO_PI * this.phR));
      } else {
        this.phL += carrier / sr;
        this.phBeat += beat / sr;
        const gate = clamp(0.5 + 1.5 * Math.sin(TWO_PI * this.phBeat), 0, 1);
        l = r = Math.sin(TWO_PI * this.phL) * gate;
      }
      if (this.phL >= 1) this.phL -= 1;
      if (this.phR >= 1) this.phR -= 1;
      if (this.phBeat >= 1) this.phBeat -= 1;

      l *= toneG;
      r *= toneG;

      for (const [id, ramp] of this.layerGain) {
        const g = ramp.tick();
        if (g > 1e-7) {
          const buf = this.frameBuf;
          buf[0] = 0;
          buf[1] = 0;
          this.layers.get(id)!.next(buf);
          const gg = g * LAYER_NORM[id];
          l += buf[0]! * gg;
          r += buf[1]! * gg;
        }
      }

      l *= fadeG;
      r *= fadeG;
      // Smooth, monotonic, bounded by satC. Transparent far below the ceiling.
      outL[offset + i] = satC * Math.tanh(l / satC);
      outR[offset + i] = satC * Math.tanh(r / satC);

      this.frames++;
      if (this.fadingOut && !this.fade.active && this.fade.value === 0) this.done = true;
    }
  }
}
