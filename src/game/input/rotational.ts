export class RotationalInput {
  private currX: number;
  private currY: number;
  private lastX: number;
  private lastY: number;
  private dx: number;
  private dy: number;
  private firstUpdate: boolean;

  invertX: boolean;
  invertY: boolean;

  constructor() {
    this.lastX = 0;
    this.lastY = 0;
    this.dx = 0;
    this.dy = 0;
    this.currX = 0;
    this.currY = 0;
    this.invertX = false;
    this.invertY = false;
    this.firstUpdate = true;
  }

  update(): void {
    if (!this.firstUpdate) {
      this.dx = this.currX - this.lastX;
      this.dy = this.currY - this.lastY;
    }

    this.lastX = this.currX;
    this.lastY = this.currY;
    this.firstUpdate = false;
  }

  set(x: number, y: number): void {
    this.currX = x;
    this.currY = y;
  }

  setX(x: number): void {
    this.currX = x;
  }

  setY(y: number): void {
    this.currY = y;
  }

  deltaX(): number {
    if (this.invertX) {
      return -this.dx;
    } else {
      return this.dx;
    }
  }

  deltaY(): number {
    if (this.invertY) {
      return -this.dy;
    } else {
      return this.dy;
    }
  }

  x(): number {
    return this.currX;
  }

  y(): number {
    return this.currY;
  }

  bindToMouseMove(el: HTMLElement): void {
    const self = this;

    el.addEventListener('mousemove', e => {
      self.set(e.clientX, e.clientY);
    });
  }

  bindToTouchMove(el: HTMLElement): void {
    const self = this;

    el.addEventListener('touchmove', e => {
      const touches = e.touches;

      if (touches.length > 0) {
        self.set(touches[0].clientX, touches[0].clientY);
      }
    });
  }
}