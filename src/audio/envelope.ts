import { IRoutable, ScheduledNote } from './types';
import { clampGain } from './util';

export class Envelope implements IRoutable {
  private context: AudioContext;
  private gain: GainNode;

  attack: number;
  sustain: number;
  decay: number;
  release: number;

  timeConstantMultiplier: number;

  constructor(context: AudioContext) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.setValueAtTime(0, context.currentTime);

    this.attack = 0.1;
    this.sustain = 0;
    this.decay = 0.75;
    this.release = 0.05;

    this.timeConstantMultiplier = 4;
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

  cancel(when: number): void {
    this.gain.gain.cancelScheduledValues(0);
    this.triggerRelease(when, this.release);
  }

  trigger(when: number): void {
    this.gain.gain.setTargetAtTime(1, when, this.attack/this.timeConstantMultiplier);
    this.gain.gain.setTargetAtTime(this.sustain, when + this.attack, this.decay/this.timeConstantMultiplier);
    this.triggerRelease(when + this.attack + this.decay, this.release);
  }

  triggerNotes(notes: Array<ScheduledNote>): void {
    const duration = this.duration();

    for (let i = 0; i < notes.length; i++) {
      const start = notes[i].startTime;

      if (i < notes.length-1) {
        const nextStart = notes[i+1].startTime;
        const offset = nextStart - start;

        if (offset >= 0 && offset < duration) {
          if (offset < this.attack) {
            // console.log('within attack');
            this.gain.gain.cancelScheduledValues(start);
            this.triggerAttack(start, this.attack);
            this.gain.gain.setTargetAtTime(0, start + offset, this.decay/this.timeConstantMultiplier);

          } else if (offset < this.attack + this.decay) {
            // console.log('within attack-decay');
            this.gain.gain.cancelScheduledValues(start);
            this.triggerAttack(start, this.attack);
            this.gain.gain.setTargetAtTime(0, start + this.attack, this.decay/this.timeConstantMultiplier);

          } else {
            // console.log('within attack-decay-release');
            this.gain.gain.cancelScheduledValues(start);
            this.triggerAttack(start, this.attack);
            this.gain.gain.setTargetAtTime(this.sustain, start + this.attack, this.decay/this.timeConstantMultiplier);
            this.gain.gain.setTargetAtTime(0, start + this.attack + this.decay, this.release/this.timeConstantMultiplier);
          }
        } else {
          this.trigger(start);
        }
      } else {
        this.trigger(start);
      }
    }
  }

  private duration(): number {
    return this.attack + this.decay + this.release;
  }

  private triggerRelease(when: number, releaseTime: number): void {
    this.gain.gain.setTargetAtTime(0, when, releaseTime/this.timeConstantMultiplier);
  }

  private triggerAttack(when: number, attackTime: number): void {
    this.gain.gain.setTargetAtTime(1, when, attackTime/this.timeConstantMultiplier);
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