export class WebAudioContext {
  private audioContext: AudioContext;

  constructor() {
    const audioContextConstructor = window.AudioContext || ((<any>window).webkitAudioContext) || undefined;

    if (audioContextConstructor === undefined) {
      throw new Error('Web audio is not supported.');
    }

    this.audioContext = new AudioContext();
  }
}