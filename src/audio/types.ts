export const enum Quantization {
  Whole,
  Half,
  Quarter
}

export function copyTimeSignature(ts: TimeSignature): TimeSignature {
  return new TimeSignature(ts.numerator, ts.denominator);
}

export class TimeSignature {
  readonly numerator: number;
  readonly denominator: number;

  constructor(num: number = 4, denom: number = 4) {
    this.numerator = num;
    this.denominator = denom;
  }

  private noteFactor(): number {
    return this.denominator / 4;
  }

  durationSecs(numMeasures: number, atBpm: number): number {
    return this.numerator / (atBpm / 60) / this.noteFactor() * numMeasures;
  }
};

export type Note = {
  semitone: number,
  durationSecs: number
}

export function makeNote(semitone: number, durationSecs: number = 0): Note {
  return {semitone, durationSecs};
}

export type NoteCancelFunction = () => void;
export type NoteOnFunction = (audioContext: AudioContext, note: Note, startTime: number, sequenceRelativeStartTime: number) => NoteCancelFunction;