import { Keyboard } from '../../gl';

export class Button {
  private pressed: boolean;

  constructor() {
    this.pressed = false;
  }

  press(): void {
    this.pressed = true;
  }

  release(): void {
    this.pressed = false;
  }

  isPressed(): boolean {
    return this.pressed;
  }

  clearIfPressed(): boolean {
    const pressed = this.pressed;
    this.pressed = false;
    return pressed;
  }

  static bindToKey(keyboard: Keyboard, key: number, listenerId?: string): Button {
    const button = new Button();
    
    if (listenerId !== undefined) {
      keyboard.addListener(key, listenerId, () => button.press());
    } else {
      keyboard.addAnonymousListener(key, () => button.press());
    }

    return button;
  }
}