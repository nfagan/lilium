import { IRoutable, IEffect } from '../types';

export type PropertySetter = {
  validate: (a: number) => number,
  set: (a: number, t: number) => void,
  ramp: (a: number, t: number) => void
}

export type PropertyMap = {
  [key: string]: PropertySetter;
}

export abstract class Effect implements IRoutable, IEffect {
  protected context: AudioContext;
  private params: Array<AudioParam>;
  private properties: PropertyMap;

  protected inputNode: GainNode;
  protected outputNode: GainNode;

  constructor(context: AudioContext, params: Array<AudioParam>, properties: PropertyMap) {
    this.context = context;
    this.params = params;
    this.properties = properties;
    this.inputNode = context.createGain();
    this.outputNode = context.createGain();
  }

  private logUnrecognizedProperty(name: string): void {
    console.warn(`Unrecognized property "${name}".`);
  }

  set(name: string, to: number, when: number): void {
    const prop = this.properties[name];

    if (prop !== undefined) {
      prop.set(prop.validate(to), when);
    } else {
      this.logUnrecognizedProperty(name);
    }
  }

  ramp(name: string, to: number, when: number): void {
    const prop = this.properties[name];

    if (prop !== undefined) {
      prop.ramp(prop.validate(to), when);
    } else {
      this.logUnrecognizedProperty(name);
    }
  }

  accept(node: AudioNode): void {
    node.connect(this.inputNode);
  }

  connect(to: AudioNode): void {
    this.outputNode.connect(to);
  }

  connectRoutable(to: IRoutable): void {
    to.accept(this.outputNode);
  }

  cancelScheduledValues(after: number): void {
    for (let i = 0; i < this.params.length; i++) {
      this.params[i].cancelScheduledValues(after);
    }
  }
}