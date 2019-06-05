export class Stopwatch {
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  elapsed(): number {
    return performance.now() - this.startTime;
  }

  reset(): void {
    this.startTime = performance.now();
  }
}

export class StatTimer {
  private expectTick: boolean;
  private iter: number;
  private minTime: number;
  private maxTime: number;
  private meanTime: number;
  private startTime: number;

  constructor() {
    this.expectTick = true;
    this.iter = 0;
    this.meanTime = NaN;
    this.minTime = NaN;
    this.maxTime = NaN;
    this.startTime = NaN;
  }

  private currentTime(): number {
    return performance.now();
  }

  display(): void {
    console.log(`N: ${this.iter}; Mean: ${this.meanTime}; Min: ${this.minTime}; Max: ${this.maxTime}`);
  }

  tock(): void {
    if (this.expectTick) {
      console.warn('Expected tick before tock.');
      return;
    }

    this.expectTick = !this.expectTick;
    const delta = this.currentTime() - this.startTime;

    if (this.iter === 0) {
      this.meanTime = delta;
      this.minTime = delta;
      this.maxTime = delta;
    } else {
      this.meanTime = (this.meanTime * this.iter + delta) / (this.iter + 1);

      if (delta < this.minTime) {
        this.minTime = delta;
      }
      if (delta > this.maxTime) {
        this.maxTime = delta;
      }
    }

    this.iter++;
  }

  tick(): void {
    if (!this.expectTick) {
      console.warn('Expected tock after tick.');
      this.expectTick = true;
    }

    this.startTime = this.currentTime();
    this.expectTick = !this.expectTick;
  }
}