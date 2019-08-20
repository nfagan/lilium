import { clampGain, setOpposingValuesAtTime, exponentialRampToOpposingValuesAtTime } from '../util';
import { Effect, PropertyMap } from './effect';

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

export class Reverb extends Effect {
  private dryNode: GainNode;
  private wetNode: GainNode;
  private reverbNote: ConvolverNode;
  private time: number;
  private decay: number;

  constructor(context: AudioContext) {
    const wetNode = context.createGain();
    const dryNode = context.createGain();
    const reverbNode = context.createConvolver();
    const params = [wetNode.gain, dryNode.gain];

    const props: PropertyMap = {
      wetAmount: {
        validate: clampGain,
        set: setOpposingValuesAtTime(wetNode.gain, dryNode.gain),
        ramp: exponentialRampToOpposingValuesAtTime(wetNode.gain, dryNode.gain)
      }
    }

    super(context, params, props);

    this.reverbNote = reverbNode;
    this.dryNode = dryNode;
    this.wetNode = wetNode;

    this.time = 1;
    this.decay = 5;

    this.makeImpulse();
    this.route();
    this.set('wetAmount', 0.5, 0);
  }

  private makeImpulse(): void {
    const impulse = makeImpulseBuffer(this.context, this.time, this.decay);
    this.reverbNote.buffer = impulse;
  }

  private route(): void {
    this.inputNode.connect(this.dryNode);
    this.dryNode.connect(this.outputNode);

    this.inputNode.connect(this.reverbNote);
    this.reverbNote.connect(this.wetNode);
    this.wetNode.connect(this.outputNode);
  }
}