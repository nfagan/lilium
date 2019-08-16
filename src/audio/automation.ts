import { Sequence } from './sequence';
import { mix, smoothStep, smootherStep } from './util';

type AutomationSample = {
  value: number,
  relativeTime: number
}

export class Automation {
  readonly sequence: Sequence;
  private samplePoints: Array<AutomationSample>;

  smoothFunction: (t: number) => number;

  constructor(sequence: Sequence) {
    this.sequence = sequence;
    this.samplePoints = [];
    this.smoothFunction = smootherStep;
  }

  addSample(value: number, relativeTime: number): void {
    this.samplePoints.push({value, relativeTime});
    this.samplePoints.sort((a, b) => a.relativeTime - b.relativeTime);
  }

  getSamplePoints(): Array<AutomationSample> {
    return this.samplePoints;
  }

  removeMeasure(index: number): void {
    const numSamples = this.numSamples();
    let offset = 0;

    for (let i = 0; i < numSamples; i++) {
      const point = this.samplePoints[i-offset];
      const measure = Math.floor(point.relativeTime);

      if (measure === index) {
        this.samplePoints.splice(i-offset, 1);
        offset++;
      } else if (measure > index) {
        //  Shift samples down.
        const frac = point.relativeTime - measure;
        point.relativeTime = measure-1 + frac;
      }
    }
  }

  removeSample(cond: (sample: AutomationSample) => boolean): void {
    const numSamples = this.numSamples();
    let offset = 0;

    for (let i = 0; i < numSamples; i++) {
      const point = this.samplePoints[i-offset];

      if (cond(point)) {
        this.samplePoints.splice(i-offset, 1);
        offset++;
      }
    }
  }

  mergeSamplesWithinDistance(minDist: number): void {
    let offset = 0;
    const numSamples = this.numSamples();

    for (let i = 0; i < numSamples-1; i++) {
      const p0 = this.samplePoints[i-offset];
      const p1 = this.samplePoints[i+1-offset];
      const t0 = p0.relativeTime;
      const t1 = p1.relativeTime;

      if (t1 - t0 < minDist) {
        const newTime = (t0 + t1) / 2;
        const newValue = (p0.value + p1.value) / 2;

        p0.relativeTime = newTime;
        p0.value = newValue;

        this.samplePoints.splice(i+1-offset, 1);

        offset++;
      }
    }
  }

  numSamples(): number {
    return this.samplePoints.length;
  }

  getValueAt(relativeTime: number): number {
    relativeTime = this.sequence.boundRelativeTime(relativeTime);

    const numSamples = this.numSamples();
    if (numSamples === 0) {
      return 0;
    }

    let index0 = numSamples-1;

    for (let i = numSamples-1; i >= 0; i--) {
      const p0 = this.samplePoints[i];

      if (p0.relativeTime === relativeTime) {
        return p0.value;

      } else if (p0.relativeTime < relativeTime) {
        index0 = i;
        break;
      }
    }

    const index1 = (index0 + 1) % numSamples;

    if (index0 === index1) {
      return this.samplePoints[index0].value;
    }

    const p0 = this.samplePoints[index0];
    const p1 = this.samplePoints[index1];

    const t0 = p0.relativeTime;
    const t1 = p1.relativeTime;

    const dist01 = this.sequence.relativeNoteDistance(t0, t1);
    const distToStart = this.sequence.relativeNoteDistance(t0, relativeTime);
    let t = distToStart / dist01;
    
    if (isNaN(t)) {
      // console.warn('t was NaN.');
      t = 0;
    } else if (t < 0) {
      // console.warn('t < 0: ', t);
      t = 0;
    } else if (t > 1) {
      // console.warn('t > 1: ', t, distToStart, relativeTime, dist01, index0, index1);
      t = 1;
    }

    return mix(p0.value, p1.value, this.smoothFunction(t));
  }
}