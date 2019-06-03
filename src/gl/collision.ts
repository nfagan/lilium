import { VoxelGrid } from './voxel-grid';
import { Aabb } from './math';
import { vec3 } from 'gl-matrix';

export class VoxelGridCollisionResult {
  public collided: boolean = false;
  public instant: number = 0;
  public normal: Array<number>;
  public face: number;
  public voxelIndex: Array<number>;

  constructor() {
    this.normal = [0, 0, 0];
    this.voxelIndex = [0, 0, 0];
  }

  reset() {
    for (let i = 0; i < 3; i++) {
      this.normal[i] = 0;
      this.voxelIndex[i] = -1;
    }

    this.collided = false;
    this.instant = 0;
    this.face = -1;
  }

  isXFace(): boolean {
    return this.face === 0 || this.face === 1;
  }

  isYFace(): boolean {
    return this.face === 2 || this.face === 3;
  }

  isBottomFace(): boolean {
    return this.face === 2;
  }

  isTopFace(): boolean {
    return this.face === 3;
  }

  isZFace(): boolean {
    return this.face === 4 || this.face === 5;
  }
};

export class VoxelGridCollider {
  private grid: VoxelGrid;
  private collisionResult: VoxelGridCollisionResult;
  private intersectAabb: Aabb;
  private intersectIdx: Array<number>;
  private slideAabb: Aabb;
  private slideVelocity: Array<number>

  constructor(grid: VoxelGrid) {
    this.grid = grid;
    this.collisionResult = new VoxelGridCollisionResult();
    this.intersectIdx = [0, 0, 0];
    this.intersectAabb = new Aabb();
    this.slideAabb = new Aabb();
    this.slideVelocity = [0, 0, 0];
  }

  private calculateComponentInstant(vel: number, gridMin: number, gridMax: number, testMin: number, testMax: number): number {
    if (vel > 0) {
      return (gridMin - testMax) / vel;
    } else if (vel < 0) {
      return (gridMax - testMin) / vel;
    } else {
      return -Infinity;
    }
  }

  private calculateNormalComponent(vel: number): number {
    return vel === 0 ? 0 : vel > 0 ? -1 : 1;
  }

  private calculateFaceIndex(vel: number, minComponent: number): number {
    if (vel === 0) {
      //  no face.
      return -1;
    } else if (vel < 0) {
      //  +face
      return minComponent + 1;
    } else {
      //  -face
      return minComponent;
    }
  }

  collidesWithAabb3(outResult: VoxelGridCollisionResult, testAabb: Aabb, vx: number, vy: number, vz: number): void {
    const grid = this.grid;

    const intersectIdx = this.intersectIdx;
    const intersectAabb = this.intersectAabb;
    const pos = grid.position;
    const cellDims = grid.cellDimensions;

    const tMinX = Math.min(testAabb.minX, testAabb.minX + vx);
    const tMinY = Math.min(testAabb.minY, testAabb.minY + vy);
    const tMinZ = Math.min(testAabb.minZ, testAabb.minZ + vz);
    //
    const tMaxX = Math.max(testAabb.maxX, testAabb.maxX + vx);
    const tMaxY = Math.max(testAabb.maxY, testAabb.maxY + vy);
    const tMaxZ = Math.max(testAabb.maxZ, testAabb.maxZ + vz);

    grid.getCellIndexOf3(intersectIdx, tMinX, tMinY, tMinZ);
    
    const minIdxX = intersectIdx[0];
    const minIdxY = intersectIdx[1];
    const minIdxZ = intersectIdx[2];

    grid.getCellIndexOf3(intersectIdx, tMaxX, tMaxY, tMaxZ);

    const maxIdxX = intersectIdx[0];
    const maxIdxY = intersectIdx[1];
    const maxIdxZ = intersectIdx[2];

    intersectAabb.minX = minIdxX * cellDims[0] + pos[0];
    intersectAabb.minY = minIdxY * cellDims[1] + pos[1];
    intersectAabb.minZ = minIdxZ * cellDims[2] + pos[2];

    intersectAabb.maxX = Infinity;
    intersectAabb.maxY = Infinity;
    intersectAabb.maxZ = Infinity;

    const numSpanningX = maxIdxX - minIdxX;
    const numSpanningY = maxIdxY - minIdxY;
    const numSpanningZ = maxIdxZ - minIdxZ;

    let foundIntersection: boolean = false;
    let minT = Infinity;
    let normIdx = 0;
    let normSign = 0;
    let collidedFace = -1;

    for (let i = 0; i <= numSpanningX; i++) {
      for (let j = 0; j <= numSpanningY; j++) {
        for (let k = 0; k <= numSpanningZ; k++) {
          const ix = minIdxX + i;
          const iy = minIdxY + j;
          const iz = minIdxZ + k;

          if (!grid.isFilled3(ix, iy, iz)) {
            continue;
          }

          const minX = ix * cellDims[0] + pos[0];
          const minY = iy * cellDims[1] + pos[1];
          const minZ = iz * cellDims[2] + pos[2];

          const maxX = minX + cellDims[0];
          const maxY = minY + cellDims[1];
          const maxZ = minZ + cellDims[2];

          const hitX = tMinX < maxX && tMaxX > minX;
          const hitY = tMinY < maxY && tMaxY > minY;
          const hitZ = tMinZ < maxZ && tMaxZ > minZ;
          const intersects = hitX && hitY && hitZ;

          if (!intersects) {
            continue;
          }

          foundIntersection = true;

          const tx = this.calculateComponentInstant(vx, minX, maxX, testAabb.minX, testAabb.maxX);
          const ty = this.calculateComponentInstant(vy, minY, maxY, testAabb.minY, testAabb.maxY);
          const tz = this.calculateComponentInstant(vz, minZ, maxZ, testAabb.minZ, testAabb.maxZ);

          let currentMinT = Infinity;
          let currentNormIdx = 0;
          let currentNormSign = 0;
          let currentCollidedFace = -1;

          if (tx >= 0 && tx < currentMinT) {
            currentMinT = tx;
            currentNormIdx = 2;
            // currentNormSign = Math.sign(vx);
            currentNormSign = this.calculateNormalComponent(vx);
            currentCollidedFace = this.calculateFaceIndex(vx, 0);
          }

          if (ty >= 0 && ty < currentMinT) {
            currentMinT = ty;
            currentNormIdx = 1;
            // currentNormSign = Math.sign(vy);
            currentNormSign = this.calculateNormalComponent(vy);
            currentCollidedFace = this.calculateFaceIndex(vy, 2);
          }

          if (tz >= 0 && tz < currentMinT) {
            currentMinT = tz;
            currentNormIdx = 0;
            // currentNormSign = Math.sign(vz);
            currentNormSign = this.calculateNormalComponent(vz);
            currentCollidedFace = this.calculateFaceIndex(vz, 4);
          }

          if (currentMinT < minT) {
            minT = currentMinT;
            normIdx = currentNormIdx;
            normSign = currentNormSign;
            collidedFace = currentCollidedFace;

            outResult.voxelIndex[0] = ix;
            outResult.voxelIndex[1] = iy;
            outResult.voxelIndex[2] = iz;
          }
        }
      }
    }

    for (let i = 0; i < 3; i++) {
      outResult.normal[i] = 0;
    }

    if (!foundIntersection) {
      outResult.instant = 1;
      outResult.collided = false;
      outResult.face = -1;
      return;
    }

    outResult.collided = true;
    outResult.normal[normIdx] = normSign;
    outResult.face = collidedFace;

    if (minT === Infinity) {
      outResult.instant = 0;
    } else {
      outResult.instant = minT;
    }
  }

  moveAabb(outCollisionResult: VoxelGridCollisionResult, outAabb: Aabb, inAabb: Aabb, velocity: vec3 | Array<number>): void {
    const vx = velocity[0];
    const vy = velocity[1];
    const vz = velocity[2];
    
    outCollisionResult.reset();
    this.collidesWithAabb3(outCollisionResult, inAabb, vx, vy, vz);

    if (!outCollisionResult.collided) {
      outAabb.assign(inAabb);
      outAabb.move(velocity);
      return;
    }

    const t = outCollisionResult.instant;
    const remainingT = 1 - t;

    outAabb.assign(inAabb);
    outAabb.move3(vx * t, vy * t, vz * t);

    const slideAmt = vec3.dot(outCollisionResult.normal, velocity) * remainingT;
    const slideVx = outCollisionResult.normal[0] * slideAmt;
    const slideVz = outCollisionResult.normal[2] * slideAmt;

    if (!outCollisionResult.isYFace()) {
      const slideVy = vy * remainingT;
      const collisionResult = this.collisionResult;

      collisionResult.reset();
      this.collidesWithAabb3(collisionResult, outAabb, 0, slideVy, 0);

      const yInstant = collisionResult.instant;
      outAabb.move3(0, slideVy * yInstant, 0);

      collisionResult.reset();
      this.collidesWithAabb3(collisionResult, outAabb, slideVx, 0, slideVz);
      const slideT = collisionResult.instant;

      outAabb.move3(slideVx * slideT, 0, slideVz * slideT);
    } else {
      const collisionResult = this.collisionResult;

      collisionResult.reset();
      this.collidesWithAabb3(collisionResult, outAabb, slideVx, 0, slideVz);
      const slideT = collisionResult.instant;

      outAabb.move3(slideVx * slideT, 0, slideVz * slideT);
    }
  }
}