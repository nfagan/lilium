import { math, collision, VoxelGrid } from '../gl';
import * as types from '../util';
import { MultiJumpHandler } from '.';

function checkIfGrounded(aabb: math.Aabb, grid: VoxelGrid, collisionResult: collision.VoxelGridCollisionResult, vy: number): boolean {
  const y = aabb.minY;
  const isTopFace = collisionResult.isTopFace();
  const cellCrit = Math.abs(y) % grid.cellDimensions[1] < math.EPSILON;
  const collisionVoxel = collisionResult.voxelIndex;

  if (cellCrit && vy < 0 && isTopFace) {
    if (grid.isFilledAdjacentY(collisionVoxel, 1)) {
      console.warn('Caught on voxel: ', collisionVoxel);
    }
    return true;
  }

  return false;
}

export class PlayerMovement {
  private grid: VoxelGrid;
  private gridCollider: collision.VoxelGridCollider;
  private gridCollisionResult: collision.VoxelGridCollisionResult;
  private multiJumpHandler: MultiJumpHandler;
  private velocity: Array<number>;
  private isOnGround: boolean;
  private triedJump: boolean;
  private readonly maxYVelocity: number = 2;
  private readonly jumpSpeed: number = 0.3;
  private readonly xzMovementSpeed: number = 0.15;
  private readonly xzVelocityDecayFactor: number = 1.1;
  private readonly fallSpeed: number = 0.01;

  constructor(grid: VoxelGrid) {
    this.grid = grid;
    this.gridCollider = new collision.VoxelGridCollider(grid);
    this.gridCollisionResult = new collision.VoxelGridCollisionResult();
    this.velocity = [0, 0, 0];
    this.isOnGround = true;
    this.triedJump = false;
    this.multiJumpHandler = new MultiJumpHandler(2);
  }

  update(dt: number, playerAabb: math.Aabb): void {
    const velocity = this.velocity;

    this.handleJump(dt);
    this.updateVelocity(dt, velocity);
    this.updateAabb(dt, playerAabb, velocity);
    this.resetVelocity(dt, velocity);
  }

  private updateVelocity(dt: number, vel: Array<number>): void {
    const dtSpeed = math.dtSecScale(dt, this.xzMovementSpeed);

    const tmpYVelocity = vel[1];
    vel[1] = 0;

    math.norm3(vel, vel);
    math.scale3(vel, vel, dtSpeed);

    vel[1] = tmpYVelocity;
  }

  private resetVelocity(dt: number, velocity: Array<number>): void {
    velocity[0] = 0;
    velocity[2] = 0;
  }

  private fall(dt: number): void {
    const fallSpeed = math.dtSecScale(dt, this.fallSpeed);
    this.velocity[1] -= fallSpeed;
  }

  private handleJump(dt: number): void {  
    if (this.triedJump && this.canJump()) {
      this.jump();
    }
  
    if (this.velocity[1] !== 0) {
      this.fall(dt);
    }
  
    if (Math.abs(this.velocity[1]) > this.maxYVelocity) {
      this.velocity[1] = this.maxYVelocity * Math.sign(this.velocity[1]);
    }
    
    this.triedJump = false;
  }

  tryJump(): void {
    this.triedJump = true;
  }

  canJump(): boolean {
    return this.isOnGround || this.multiJumpHandler.canJump();
  }

  addVelocity(inDirection: types.BuiltinRealArray): void {
    math.add3(this.velocity, this.velocity, inDirection);
  }

  private jump(): void {
    this.velocity[1] = this.jumpSpeed;
    this.isOnGround = false;
    this.multiJumpHandler.jump();
  }

  private ground(): void {
    this.velocity[1] = 0;
    this.isOnGround = true;
    this.multiJumpHandler.ground();
  }

  private updateAabb(dt: number, playerAabb: math.Aabb, velocity: Array<number>): void {
    const grid = this.grid;
    const collisionResult = this.gridCollisionResult;
    const gridCollider = this.gridCollider;
  
    gridCollider.moveAabb(collisionResult, playerAabb, playerAabb, velocity);
  
    const isBotFace = collisionResult.isBottomFace();
    const isPlayerGrounded = checkIfGrounded(playerAabb, grid, collisionResult, velocity[1]);
  
    if (isPlayerGrounded) {
      this.ground();
    } else if (isBotFace) {
      this.velocity[1] = -math.EPSILON;
    }
  
    //  Hack -- If, after moving a small amount, we do not collide with a voxel below, add fall velocity.
    gridCollider.collidesWithAabb3(collisionResult, playerAabb, 0, -0.01, 0);
    if (!collisionResult.collided) {
      this.fall(dt);
      this.isOnGround = false;
    } else {
      this.ground();
    }
  
    //  If we fell too far, reset.
    if (playerAabb.minY < -20) {
      playerAabb.moveTo3(0, 20, 0);
    }
  }
}