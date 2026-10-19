/** Linear ramp of a scalar, advanced one sample at a time. Reaches its target exactly. */
export class Ramp {
  value: number;
  target: number;
  private step = 0;
  private left = 0;

  constructor(initial: number) {
    this.value = initial;
    this.target = initial;
  }

  /** Move to `to` over `frames` samples (0 = immediately). */
  to(to: number, frames: number): void {
    this.target = to;
    if (frames <= 0) {
      this.value = to;
      this.left = 0;
      this.step = 0;
      return;
    }
    this.left = Math.round(frames);
    this.step = (to - this.value) / this.left;
  }

  get active(): boolean {
    return this.left > 0;
  }

  /** Advance one sample and return the new value. */
  tick(): number {
    if (this.left > 0) {
      this.left--;
      this.value = this.left === 0 ? this.target : this.value + this.step;
    }
    return this.value;
  }
}
