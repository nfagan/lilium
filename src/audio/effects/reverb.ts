import { clampGain } from '../util';
import { IRoutable, IEffect } from '../types';

//  https://github.com/alemangui/pizzicato/blob/master/src/Effects/Reverb.js

function makeImpulseBuffer(context: AudioContext, time: number, decay: number): AudioBuffer {
  const len = context.sampleRate * time;
  const impulse = context.createBuffer(2, len, context.sampleRate);

  for (let i = 0; i < 2; i++) {
    const channel = impulse.getChannelData(i);
    
    for (let j = 0; j < len; j++) {
      const factor = 1 - j/len;
      channel[j] = (Math.random() * 2 - 1) * Math.pow(factor, decay);
    }
  }

  return impulse;
}

export class Reverb implements IRoutable, IEffect {
  private inputNode: GainNode;
  private outputNode: GainNode;
  private dryNode: GainNode;
  private wetNode: GainNode;
  private reverbNote: ConvolverNode;
  private context: AudioContext;

  private time: number;
  private decay: number;

  constructor(context: AudioContext) {
    this.context = context;
    this.inputNode = context.createGain();
    this.outputNode = context.createGain();
    this.reverbNote = context.createConvolver();
    this.dryNode = context.createGain();
    this.wetNode = context.createGain();

    this.time = 1;
    this.decay = 5;

    this.makeImpulse();
    this.route();
    this.setWetAmount(0.5, 0);
  }

  private makeImpulse(): void {
    const impulse = makeImpulseBuffer(this.context, this.time, this.decay);
    this.reverbNote.buffer = impulse;
  }

  setWetAmount(to: number, when: number): void {
    to = clampGain(to);
    this.wetNode.gain.setValueAtTime(to, when);
    this.dryNode.gain.setValueAtTime(1-to, when);
  }

  private route(): void {
    this.inputNode.connect(this.dryNode);
    this.dryNode.connect(this.outputNode);

    this.inputNode.connect(this.reverbNote);
    this.reverbNote.connect(this.wetNode);
    this.wetNode.connect(this.outputNode);
  }

  accept(node: AudioNode): void {
    node.connect(this.inputNode);
  }

  connect(to: AudioNode): void {
    this.outputNode.connect(to);
  }

  connectEffect(to: IRoutable): void {
    to.accept(this.outputNode);
  }

  cancelScheduledValues(after: number): void {
    this.wetNode.gain.cancelScheduledValues(after);
    this.dryNode.gain.cancelScheduledValues(after);
  }
}