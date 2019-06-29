export function asyncTimeout<T>(func: () => Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let responded = false;

    func().then(v => {
      if (!responded) {
        responded = true;
        resolve(v);
      }
    });

    setTimeout(() => {
      if (!responded) {
        responded = true;
        reject(new Error(`Failed to resolve promise in ${milliseconds} ms.`));
      }
    }, milliseconds);
  });
}

export class Stopwatch {
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  elapsed(): number {
    return performance.now() - this.startTime;
  }

  elapsedSecs(): number {
    return this.elapsed() / 1e3;
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