import { Keyboard, Keys, math } from '../../gl';

export class DirectionalInput {
  private plusX: number;
  private minusX: number;
  private plusZ: number;
  private minusZ: number;

  invertX: boolean;
  invertZ: boolean;

  constructor() {
    this.minusX = 0;
    this.plusX = 0;
    this.minusZ = 0;
    this.plusZ = 0;
    this.invertX = false;
    this.invertZ = false;
  }

  setForwards(amount: number): void {
    this.plusZ = math.clamp01(amount);
  }

  setBackwards(amount: number): void {
    this.minusZ = math.clamp01(amount);
  }

  setLeft(amount: number): void {
    this.minusX = math.clamp01(amount);
  }

  setRight(amount: number): void {
    this.plusX = math.clamp01(amount);
  }

  forwards(amount: number): void {
    this.minusZ = 0;
    this.plusZ = math.clamp01(amount);
  }

  backwards(amount: number): void {
    this.minusZ = math.clamp01(amount);
    this.plusZ = 0;
  }

  left(amount: number): void {
    this.minusX = math.clamp01(amount);
    this.plusX = 0;
  }

  right(amount: number): void {
    this.minusX = 0;
    this.plusX = math.clamp01(amount);
  }

  x(amount: number): void {
    amount = math.clamp(amount, -1, 1);

    if (amount < 0) {
      this.minusX = Math.abs(amount);
      this.plusX = 0;
    } else {
      this.minusX = 0;
      this.plusX = amount;
    }
  }

  z(amount: number): void {
    amount = math.clamp(amount, -1, 1);

    if (amount < 0) {
      this.minusZ = Math.abs(amount);
      this.plusZ = 0;
    } else {
      this.minusZ = 0;
      this.plusZ = amount;
    }
  }

  getX(): number {
    const x = -this.minusX + this.plusX;

    if (this.invertX) {
      return -x;
    } else {
      return x;
    }
  }

  getZ(): number {
    const z = -this.minusZ + this.plusZ;

    if (this.invertZ) {
      return -z;
    } else {
      return z;
    }
  }

  static fromKeyboard(keyboard: Keyboard): DirectionalInput {
    const input = new DirectionalInput();

    keyboard.addListener(Keys.d, 'right', () => input.setRight(1));
    keyboard.addReleaseListener(Keys.d, 'right', () => input.setRight(0));
    //
    keyboard.addListener(Keys.a, 'left', () => input.setLeft(1));
    keyboard.addReleaseListener(Keys.a, 'left', () => input.setLeft(0));
    //
    keyboard.addListener(Keys.w, 'forwards', () => input.setForwards(1));
    keyboard.addReleaseListener(Keys.w, 'forwards', () => input.setForwards(0));
    //
    keyboard.addListener(Keys.s, 'backwards', () => input.setBackwards(1));
    keyboard.addReleaseListener(Keys.s, 'backwards', () => input.setBackwards(0));

    return input;
  }
}