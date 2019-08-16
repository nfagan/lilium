export class FrameTimerWithHistory {
  private lastTime: number;
  private iter: number;
  private minUpdatesToBegin: number;
  private numUpdates: number;
  private sampleSize: number;
  private deltas: Array<number>;

  constructor(minUpdatesToBegin: number, sampleSize: number) {
    this.lastTime = NaN;
    this.iter = 0;
    this.minUpdatesToBegin = minUpdatesToBegin;
    this.numUpdates = 0;
    this.sampleSize = sampleSize;
    this.deltas = [];
  }

  meanDelta(): number {
    let sum = 0;

    for (let i = 0; i < this.deltas.length; i++) {
      sum += this.deltas[i];
    }

    return sum / this.deltas.length;
  }

  update(currentTime: number): void {
    const delta = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (this.numUpdates >= this.minUpdatesToBegin) {
      this.deltas[this.iter++] = delta;
      this.iter %= this.sampleSize;
    }

    this.numUpdates++;
  }
}

export interface IStopWatch {
  elapsed(): number;
  elapsedSecs(): number;
  reset(): void;
}

export class AudioContextStopWatch implements IStopWatch {
  private startTime: number;
  private context: AudioContext;

  constructor(context: AudioContext) {
    this.startTime = context.currentTime;
    this.context = context;
  }

  elapsed(): number {
    return this.context.currentTime - this.startTime;
  }

  elapsedSecs(): number {
    return this.elapsed();
  }

  reset(): void {
    this.startTime = this.context.currentTime;
  }
}

export class Stopwatch implements IStopWatch {
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