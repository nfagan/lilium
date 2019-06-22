import { Stopwatch } from '../util';

export class MultiJumpHandler {
  private jumpStopwatch: Stopwatch;
  private nJumps: number = 0;
  private readonly doubleJumpTimeoutMs: number = 350;
  private readonly maxNumJumps: number;

  constructor(maxNumJumps: number) {
    this.jumpStopwatch = new Stopwatch();
    this.maxNumJumps = maxNumJumps;
  }

  canJump(): boolean {
    return this.nJumps < this.maxNumJumps && this.jumpStopwatch.elapsed() < this.doubleJumpTimeoutMs;
  }

  jump(): void {
    this.nJumps++;
    this.jumpStopwatch.reset();
  }

  ground(): void {
    this.nJumps = 0;
  }
}