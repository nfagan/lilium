import * as uuid from 'uuid/v4';

export const Keys: {[key: string]: number} = {
  w: 87,
  a: 65,
  s: 83,
  d: 68,
  c: 67,
  e: 69,
  f: 70,
  g: 71,
  h: 72,
  i: 73,
  j: 74,
  k: 75,
  l: 76,
  n: 78,
  o: 79,
  q: 81,
  r: 82,
  t: 84,
  u: 85,
  v: 86,
  y: 89,
  z: 90,
  space: 32,
  leftShift: 16,
  left: 37,
  right: 39,
  up: 38,
  down: 40
};

type KeyListenerMap = {
  [s: number]: {[s: string]: () => void}
};

export class Keyboard {
  private keyState: {[s: number]: boolean};
  private keyPressListeners: KeyListenerMap;
  private keyReleaseListeners: KeyListenerMap;

  constructor() {
    this.keyState = {};
    this.keyPressListeners = {};
    this.keyReleaseListeners = {};
    this.configureListeners();
  }

  isDown(key: number): boolean {
    return this.keyState[key] === true;
  }

  markDown(key: number): void {
    this.keyState[key] = true;
  }

  markUp(key: number): void {
    this.keyState[key] = false;
  }

  addAnonymousListener(forKey: number, cb: () => void): void {
    this.addListener(forKey, uuid(), cb);
  }

  addAnonymousReleaseListener(forKey: number, cb: () => void): void {
    this.addReleaseListener(forKey, uuid(), cb);
  }

  addListener(forKey: number, name: string, cb: () => void): void {
    const listeners = this.getPressListenersMap(forKey);
    listeners[name] = cb;
  }

  addReleaseListener(forKey: number, name: string, cb: () => void): void {
    const listeners = this.getReleaseListenersMap(forKey);
    listeners[name] = cb;
  }

  private triggerKeyPressListeners(forKey: number): void {
    this.triggerListeners(this.keyPressListeners, forKey);
  }

  private triggerKeyReleaseListeners(forKey: number): void {
    this.triggerListeners(this.keyReleaseListeners, forKey);
  }

  private triggerListeners(kind: KeyListenerMap, forKey: number): void {
    const listeners = kind[forKey];

    if (listeners === undefined) {
      return;
    }

    const listenerNames = Object.keys(listeners);

    for (let i = 0; i < listenerNames.length; i++) {
      listeners[listenerNames[i]]();
    }
  }

  private getPressListenersMap(forKey: number): {[s: string]: () => void} {
    return this.getListenerMap(this.keyPressListeners, forKey);
  }

  private getReleaseListenersMap(forKey: number): {[s: string]: () => void} {
    return this.getListenerMap(this.keyReleaseListeners, forKey);
  }

  private getListenerMap(kind: KeyListenerMap, forKey: number): {[s: string]: () => void} {
    const maybeMap = kind[forKey];

    if (maybeMap === undefined) {
      kind[forKey] = {};
      return kind[forKey];
    } else {
      return maybeMap;
    }
  }

  private configureListeners(): void {
    const self = this;
    
    window.addEventListener('keydown', e => {
      self.markDown(e.which);
      self.triggerKeyPressListeners(e.which);
    });

    window.addEventListener('keyup', e => {
      self.markUp(e.which)
      self.triggerKeyReleaseListeners(e.which);
    });
  }
}