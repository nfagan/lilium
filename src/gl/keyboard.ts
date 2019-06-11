export const Keys = {
  w: 87,
  a: 65,
  s: 83,
  d: 68,
  q: 81,
  z: 90,
  space: 32,
  leftShift: 16,
  left: 37,
  right: 39,
  up: 38,
  down: 40
};

export class Keyboard {
  private keyState: {[s: number]: boolean};
  private keyPressListeners: {
    [s: number]: {[s: string]: () => void}
  }

  constructor() {
    this.keyState = {};
    this.keyPressListeners = {};
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

  addListener(forKey: number, name: string, cb: () => void) {
    const listeners = this.getListenersMap(forKey);
    listeners[name] = cb;
  }

  private triggerKeyPressListeners(forKey: number): void {
    const listeners = this.keyPressListeners[forKey];

    if (listeners === undefined) {
      return;
    }

    const listenerNames = Object.keys(listeners);

    for (let i = 0; i < listenerNames.length; i++) {
      listeners[listenerNames[i]]();
    }
  }

  private getListenersMap(forKey: number): {[s: string]: () => void} {
    const maybeMap = this.keyPressListeners[forKey];

    if (maybeMap === undefined) {
      this.keyPressListeners[forKey] = {};
      return this.keyPressListeners[forKey];
    } else {
      return maybeMap;
    }
  }

  private configureListeners(): void {
    const self = this;
    
    window.addEventListener('keydown', (e) => {
      self.markDown(e.which);
      self.triggerKeyPressListeners(e.which);
    });

    window.addEventListener('keyup', e => self.markUp(e.which));
  }
}