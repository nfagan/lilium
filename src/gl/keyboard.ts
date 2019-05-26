export class Keyboard {
  private keyState: {[s: string]: boolean};
  private keyPressListeners: {
    [s: string]: {[s: string]: () => void}
  }

  constructor() {
    this.keyState = {};
    this.keyPressListeners = {};
    this.configureListeners();
  }

  isDown(key: string): boolean {
    return this.keyState[key] === true;
  }

  markDown(key: string): void {
    this.keyState[key] = true;
  }

  markUp(key: string): void {
    this.keyState[key] = false;
  }

  addListener(forKey: string, name: string, cb: () => void) {
    const listeners = this.getListenersMap(forKey);
    listeners[name] = cb;
  }

  private triggerKeyPressListeners(forKey: string): void {
    const listeners = this.keyPressListeners[forKey];

    if (listeners === undefined) {
      return;
    }

    const listenerNames = Object.keys(listeners);

    for (let i = 0; i < listenerNames.length; i++) {
      listeners[listenerNames[i]]();
    }
  }

  private getListenersMap(forKey: string): {[s: string]: () => void} {
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
      self.markDown(e.key);
      self.triggerKeyPressListeners(e.key);
    });

    window.addEventListener('keyup', e => self.markUp(e.key));
  }
}