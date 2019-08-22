import { IRoutable } from './types';
import { Envelope } from './envelope';

export class Synth implements IRoutable {
  private context: AudioContext;
  private oscillator: OscillatorNode;
  private envelope: Envelope;
  private isConnected: boolean;
  private isStopped: boolean;

  constructor(context: AudioContext) {
    this.context = context;
    this.oscillator = this.context.createOscillator();
    this.envelope = new Envelope(context);
    this.oscillator.type = 'sine';
    this.envelope.accept(this.oscillator);
    this.isConnected = false;
    this.isStopped = false;
  }

  accept(input: AudioNode): void {
    throw new Error('Synth cannot accept input.');
  }

  connect(to: AudioNode): void {
    this.envelope.connect(to);
    this.isConnected = true;
  }

  connectRoutable(to: IRoutable): void {
    this.envelope.connectRoutable(to);
    this.isConnected = true;
  }

  disconnectFrom(node: AudioNode): void {
    if (this.isConnected) {
      this.envelope.reject(this.oscillator);
      this.envelope.disconnectFrom(node);
      this.isConnected = false;
    }
  }

  disconnect(): void {
    if (this.isConnected) {
      this.envelope.disconnect();
      this.isConnected = false;
    }
  }

  start(frequency: number, time: number): void {
    this.envelope.trigger(time);
    this.oscillator.frequency.setValueAtTime(frequency, time);
    this.oscillator.start(time);
  }

  cancel(time: number): void {
    this.envelope.ramp(0, time);
    this.stop(time);
  }

  stop(time: number): void {
    if (!this.isStopped) {
      this.oscillator.stop(time);
      this.isStopped = true;
    }
  }
}