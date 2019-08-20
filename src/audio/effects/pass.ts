import { Effect } from './effect';

export class Pass extends Effect {
  constructor(context: AudioContext) {
    super(context, [], {});
    this.route();
  }

  private route(): void {
    this.inputNode.connect(this.outputNode);
  }
}