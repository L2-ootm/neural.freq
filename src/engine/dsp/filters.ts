/** One-pole low-pass. */
export class OnePole {
  private a: number;
  private y = 0;
  constructor(
    fc: number,
    private sr: number,
  ) {
    this.a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
  }
  setCutoff(fc: number): void {
    this.a = 1 - Math.exp((-2 * Math.PI * fc) / this.sr);
  }
  lp(x: number): number {
    this.y += this.a * (x - this.y);
    return this.y;
  }
  hp(x: number): number {
    return x - this.lp(x);
  }
}

/** RBJ band-pass biquad (constant 0 dB peak). Retune with set() at control rate. */
export class Biquad {
  private b0 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;
  constructor(
    private sr: number,
    fc: number,
    private q: number,
  ) {
    this.set(fc);
  }
  set(fc: number, q = this.q): void {
    const f = Math.min(fc, this.sr * 0.45);
    const w0 = (2 * Math.PI * f) / this.sr;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w0)) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.z2 - this.a1 * y;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}
