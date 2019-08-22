import { IRoutable } from './types';
import { clampGain } from './util';

export class Envelope implements IRoutable {
  private context: AudioContext;
  private gain: GainNode;

  attack: number;
  sustain: number;
  decay: number;
  release: number;

  constructor(context: AudioContext) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.setValueAtTime(1, context.currentTime);

    this.attack = 0.1;
    this.sustain = clampGain(0);
    this.decay = 0.75;
    this.release = 0.05;
  }

  connectRoutable(to: IRoutable): void {
    to.accept(this.gain);
  }

  connect(to: AudioNode): void {
    this.gain.connect(to);
  }

  disconnectFrom(node: AudioNode): void {
    this.gain.disconnect(node);
  }

  disconnect(): void {
    this.gain.disconnect();
  }

  accept(input: AudioNode): void {
    input.connect(this.gain);
  }

  reject(input: AudioNode): void {
    input.disconnect(this.gain);
  }

  trigger(when: number): void {
    const timeConstantMultiplier = 4;
    const minGain = clampGain(0);

    this.gain.gain.setValueAtTime(minGain, when);
    this.gain.gain.setTargetAtTime(1, when, this.attack/timeConstantMultiplier);
    this.gain.gain.setTargetAtTime(this.sustain, when + this.attack, this.decay/timeConstantMultiplier);
    this.gain.gain.setTargetAtTime(minGain, when + this.attack + this.decay, this.release/timeConstantMultiplier);
  }

  set(value: number, time: number): void {
    value = clampGain(value);
    this.gain.gain.setValueAtTime(value, time);
  }

  ramp(value: number, time: number): void {
    const ct = this.context.currentTime;
    const duration = Math.max(0.001, ct - time);
    const timeConstant = duration / 3;

    value = clampGain(value);
    this.gain.gain.setTargetAtTime(value, ct, timeConstant);
  }
}