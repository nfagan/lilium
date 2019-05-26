export class Measure {
  private audioContext: AudioContext;
  private bpm: number;
  private timeSignatureNumerator: number;
  private timeSignatureDenominator: number;
  private currentTime: number;
  private currentBeat: number;

  constructor(audioContext: AudioContext, bpm: number, timeSignatureNumerator: number, timeSignatureDenominator: number) {
    this.audioContext = audioContext;
    this.bpm = bpm;
    this.timeSignatureNumerator = timeSignatureNumerator;
    this.timeSignatureDenominator = timeSignatureDenominator;
    this.currentTime = audioContext.currentTime;
    this.currentBeat = 0;
  }
}