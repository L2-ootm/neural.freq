import { ToneCore } from '../dsp/tone-core';
import { parseToWorklet, type FromWorklet } from '../protocol';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/** Telemetry cadence in render quanta (16 * 128 frames = about 43 ms at 48 kHz). */
const TELEMETRY_EVERY = 16;

class ToneProcessor extends AudioWorkletProcessor {
  private core: ToneCore | null = null;
  private quanta = 0;
  private ended = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const m = parseToWorklet(e.data);
      if (!m) return;
      switch (m.type) {
        case 'init':
          this.core = new ToneCore(sampleRate, m.spec, m.ceilingDb, m.seed);
          this.ended = false;
          break;
        case 'set':
          this.core?.set(m.patch, m.rampSec);
          break;
        case 'schedule':
          this.core?.setBeatSchedule(m.segments);
          break;
        case 'fadeIn':
          this.ended = false;
          this.core?.fadeIn(m.sec);
          break;
        case 'fadeOut':
          this.core?.fadeOut(m.sec);
          break;
        case 'end':
          this.core?.scheduleEnd(m.totalSec, m.fadeOutSec);
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const l = out?.[0];
    const r = out?.[1];
    if (!this.core || !l || !r) return true;
    this.core.render(l, r, 0, l.length);

    const post = (m: FromWorklet) => this.port.postMessage(m);
    if (++this.quanta % TELEMETRY_EVERY === 0) post({ v: 1, type: 'state', state: this.core.state });
    if (this.core.state.finished && !this.ended) {
      this.ended = true;
      post({ v: 1, type: 'state', state: this.core.state });
      post({ v: 1, type: 'ended' });
    }
    return true;
  }
}

registerProcessor('neural-freq-tone', ToneProcessor as unknown as new () => AudioWorkletProcessor);
