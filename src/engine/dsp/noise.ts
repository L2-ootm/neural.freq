/** Deterministic noise sources. Each generator is calibrated to the same RMS (NOISE_RMS). */

export type NoiseKind = 'pink' | 'brown' | 'white';

/** Target RMS of every generator output, before the user noise gain. */
export const NOISE_RMS = 1;

/** xorshift32 returning a float in [-1, 1). Deterministic per seed. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  /** Uniform float in [0, 1). */
  u(): number {
    return (this.next() + 1) / 2;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 2147483648 - 1;
  }
}

export interface NoiseSource {
  next(): number;
}

/**
 * Paul Kellet's "refined" pink filter (seven one-pole stages on white noise).
 * Coefficients are published for 44.1 kHz; the slope at other rates is verified in tests.
 */
export class PinkNoise implements NoiseSource {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;
  constructor(private rng: Rng) {}
  next(): number {
    const w = this.rng.next();
    this.b0 = 0.99886 * this.b0 + w * 0.0555179;
    this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.969 * this.b2 + w * 0.153852;
    this.b3 = 0.8665 * this.b3 + w * 0.3104856;
    this.b4 = 0.55 * this.b4 + w * 0.5329522;
    this.b5 = -0.7616 * this.b5 - w * 0.016898;
    const out = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362;
    this.b6 = w * 0.115926;
    return out * PINK_SCALE;
  }
}

/** Leaky-integrated white noise (about -6 dB/octave), DC-bounded. */
export class BrownNoise implements NoiseSource {
  private y = 0;
  constructor(private rng: Rng) {}
  next(): number {
    const w = this.rng.next();
    this.y = (this.y + 0.02 * w) / 1.02;
    return this.y * BROWN_SCALE;
  }
}

export class WhiteNoise implements NoiseSource {
  constructor(private rng: Rng) {}
  next(): number {
    return this.rng.next() * WHITE_SCALE;
  }
}

// Calibration constants (RMS measured over 2^20 samples; see tests/noise.test.ts).
const PINK_SCALE = 0.5704;
const BROWN_SCALE = 17.5;
const WHITE_SCALE = 1.7321;

export function makeNoise(kind: NoiseKind, seed: number): NoiseSource {
  const rng = new Rng(seed);
  switch (kind) {
    case 'pink':
      return new PinkNoise(rng);
    case 'brown':
      return new BrownNoise(rng);
    case 'white':
      return new WhiteNoise(rng);
  }
}
