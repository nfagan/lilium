import { math } from '../gl';
import { Stopwatch } from '../util'
import { vec3 } from 'gl-matrix';

export class Player {
  public upVelocity: number = 0;
  public isOnGround: boolean = true;
  public alwaysAllowJump: boolean = false;
  public readonly aabb: math.Aabb;
  private jumpStopwatch: Stopwatch;
  private nJumps: number = 0;
  private readonly doubleJumpTimeoutMs: number = 350;

  constructor(dims: vec3 | Array<number>) {
    this.aabb = new math.Aabb();
    this.aabb.minX = 0;
    this.aabb.minY = 0;
    this.aabb.minZ = 0;

    this.aabb.maxX = dims[0];
    this.aabb.maxY = dims[1];
    this.aabb.maxZ = dims[2];

    this.jumpStopwatch = new Stopwatch();
  }

  canJump(): boolean {
    return this.alwaysAllowJump || this.isOnGround || this.canDoubleJump();
  }

  private canDoubleJump(): boolean {
    return this.nJumps < 2 && this.jumpStopwatch.elapsed() < this.doubleJumpTimeoutMs;
  }

  jump(): void {
    this.upVelocity = 0.3;
    this.isOnGround = false;
    this.nJumps++;
    this.jumpStopwatch.reset();
  }

  ground(): void {
    this.upVelocity = 0;
    this.isOnGround = true;
    this.nJumps = 0;
  }
}