import { BuiltinRealArray } from '../util';

export class NumberSampler {
  private buffer: BuiltinRealArray;
  private sampleIndex: number;
  private numSamples: number;

  constructor(buffer: BuiltinRealArray) {
    this.buffer = buffer;
    this.sampleIndex = 0;
    this.numSamples = buffer.length;
  }

  randomizeSampleIndex(): void {
    if (this.numSamples === 0) {
      return;
    }

    this.sampleIndex = Math.floor(Math.random() * (this.numSamples-1));
  }

  incrementSampleIndex(): void {
    this.sampleIndex++;
    if (this.sampleIndex >= this.numSamples) {
      this.sampleIndex = 0;
    }
  }

  seek(to: number): void {
    if (this.numSamples === 0) {
      return;
    }

    to = to < 0 ? 0 : to > 1 ? 1 : to;

    this.sampleIndex = Math.floor((this.numSamples-1) * to);
  }

  nextSample(): number {
    const sample = this.buffer[this.sampleIndex];
    this.incrementSampleIndex();
    return sample;
  }
}