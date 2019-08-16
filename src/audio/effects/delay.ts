import { clampGain, lowerBound, setValueAtTime, exponentialRampToValueAtTime, setOpposingValuesAtTime, exponentialRampToOpposingValuesAtTime } from '../util';
import { Effect, PropertyMap } from './effect';

//  https://github.com/alemangui/pizzicato/blob/master/src/Effects/Delay.js

export class Delay extends Effect {
  private dryNode: GainNode;
  private wetNode: GainNode;
  private delayNode: DelayNode;
  private feedbackNode: GainNode;

  constructor(context: AudioContext) {
    const wetNode = context.createGain();
    const dryNode = context.createGain();
    const feedbackNode = context.createGain();
    const delayNode = context.createDelay();
    const params = [wetNode.gain, dryNode.gain, feedbackNode.gain, delayNode.delayTime];

    const props: PropertyMap = {
      feedback: {
        validate: clampGain,
        set: setValueAtTime(feedbackNode.gain),
        ramp: exponentialRampToValueAtTime(feedbackNode.gain)
      },
      delayTime: {
        validate: a => lowerBound(a, 0.01),
        set: setValueAtTime(delayNode.delayTime),
        ramp: exponentialRampToValueAtTime(delayNode.delayTime)
      },
      wetAmount: {
        validate: clampGain,
        set: setOpposingValuesAtTime(wetNode.gain, dryNode.gain),
        ramp: exponentialRampToOpposingValuesAtTime(wetNode.gain, dryNode.gain)
      }
    }

    super(context, params, props);

    this.dryNode = dryNode;
    this.wetNode = wetNode;
    this.delayNode = delayNode;
    this.feedbackNode = feedbackNode;

    this.route();
    
    this.set('wetAmount', 0.5, 0);
    this.set('delayTime', 0.1, 0);
    this.set('feedback', 0, 0);
  }

  private route(): void {
    this.inputNode.connect(this.dryNode);
    this.dryNode.connect(this.outputNode);

    this.inputNode.connect(this.delayNode);
    this.delayNode.connect(this.feedbackNode);
    this.feedbackNode.connect(this.delayNode);
    
    this.delayNode.connect(this.wetNode);
    this.wetNode.connect(this.outputNode);
  }
}