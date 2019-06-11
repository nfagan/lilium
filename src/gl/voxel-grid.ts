import { vec3 } from 'gl-matrix';
import { Ray, Aabb, arrayMax } from './math';
import { rayIntersectsAabb } from './intersections';
import * as types from './types';

export class VoxelGrid {
  public readonly position: vec3;
  public readonly gridDimensions: vec3;
  public readonly cellDimensions: vec3;
  private maxDim: number;
  private intersectRay: Ray;
  private intersectAabb: Aabb;
  private intersectPoint: vec3;
  private isOccupied: Array<Array<Array<boolean>>>;
  private numFilledCells: number;

  constructor(pos: vec3 | Array<number>, gridDimensions: vec3 | Array<number>, cellDimensions: vec3 | Array<number>) {
    this.position = vec3.copy(vec3.create(), pos);
    this.gridDimensions = vec3.copy(vec3.create(), gridDimensions);
    this.cellDimensions = vec3.copy(vec3.create(), cellDimensions);
    this.maxDim = arrayMax(gridDimensions);
    this.intersectRay = new Ray();
    this.intersectAabb = this.makeAabb(gridDimensions);
    this.intersectPoint = vec3.create();
    this.isOccupied = [];
    this.numFilledCells = 0;
  }

  private makeAabb(gridDims: types.Real3): Aabb {
    return Aabb.fromValues(0, gridDims[0], 0, gridDims[1], 0, gridDims[2]);
  }

  subToInd(cell: types.Real3): number {
    const dims = this.gridDimensions;
    return cell[0] + (cell[1] * dims[0]) + (cell[2] * dims[0] * dims[1]);
  }

  getCellCenter(out: types.Real3, cellIdx: types.Real3): void {
    for (let i = 0; i < 3; i++) {
      const minCoord = cellIdx[i] * this.cellDimensions[i] + this.position[i];
      const halfSz = this.cellDimensions[i]/2;
      out[i] = minCoord + halfSz;
    }
  }

  getCellDimensions(out: types.Real3): void {
    for (let i = 0; i < 3; i++) {
      out[i] = this.cellDimensions[i];
    }
  }

  getCellIndexOfComponent(component: number, dim: number): number {
    if (dim < 0 || dim >= 3) {
      throw new Error(`Index ${dim} exceeds 3 dimensions.`);
    }
    return Math.floor((component - this.position[dim]) / this.cellDimensions[dim]);
  }

  getCellIndexOfPoint(outIdx: types.Real3, point: types.Real3): void {
    const pos = this.position;
    for (let i = 0; i < 3; i++) {
      outIdx[i] = Math.floor((point[i] - pos[i]) / this.cellDimensions[i]);
    }
  }

  getCellIndexOf3(outIdx: types.Real3, x: number, y: number, z: number): void {
    outIdx[0] = Math.floor((x - this.position[0]) / this.cellDimensions[0]);
    outIdx[1] = Math.floor((y - this.position[1]) / this.cellDimensions[1]);
    outIdx[2] = Math.floor((z - this.position[2]) / this.cellDimensions[2]);
  }

  isInBoundsVoxelIndex(cell: types.Real3): boolean {
    const gridDims = this.gridDimensions;

    const ix = cell[0];
    const iy = cell[1];
    const iz = cell[2];

    if (ix < 0 || ix > gridDims[0] || iy < 0 || iy > gridDims[1] || iz < 0 || iz > gridDims[2]) {
      return false;
    } else {
      return true;
    }
  }

  countFilled(): number {
    return this.numFilledCells;
  }

  markFilled(cell: types.Real3): void {
    const gridDims = this.gridDimensions;

    const ix = cell[0];
    const iy = cell[1];
    const iz = cell[2];

    if (ix < 0 || ix > gridDims[0] || iy < 0 || iy > gridDims[1] || iz < 0 || iz > gridDims[2]) {
      console.warn('Attempted to mark an out of bounds cell: ', ix, iy, iz);
      return;
    }

    if (this.isOccupied[ix] === undefined) {
      this.isOccupied[ix] = [];
    }
    
    if (this.isOccupied[ix][iy] === undefined) {
      this.isOccupied[ix][iy] = [];
    }

    const currFillState = this.isOccupied[ix][iy][iz];
    this.isOccupied[ix][iy][iz] = true;

    if (!currFillState) {
      //  If not already filled.
      this.numFilledCells++;
    }
  }

  markEmpty(cell: types.Real3): void {
    if (!this.isInBoundsVoxelIndex(cell)) {
      console.warn('Attempted to unmark an out of bounds cell: ', cell);
      return;
    }

    const ix = cell[0];
    const iy = cell[1];
    const iz = cell[2];

    if (this.isOccupied[ix] === undefined) {
      return;
    }

    if (this.isOccupied[ix][iy] === undefined) {
      return;
    }

    const currFillState = this.isOccupied[ix][iy][iz];
    this.isOccupied[ix][iy][iz] = false;

    if (currFillState === true) {
      //  If cell was filled.
      this.numFilledCells--;
    }
  }

  isFilledAdjacentY(cell: vec3 | Array<number>, shiftY: number): boolean {
    return this.isFilled3(cell[0], cell[1] + shiftY, cell[2]);
  }

  isFilled3(ix: number, iy: number, iz: number): boolean {
    const gridDims = this.gridDimensions;

    if (ix < 0 || ix > gridDims[0] || iy < 0 || iy > gridDims[1] || iz < 0 || iz > gridDims[2]) {
      return false;
    }

    if (this.isOccupied[ix] === undefined) {
      return false;
    }

    if (this.isOccupied[ix][iy] === undefined) {
      return false;
    }

    return this.isOccupied[ix][iy][iz] === true;
  }

  isFilled(cell: types.Real3): boolean {
    const ix = cell[0];
    const iy = cell[1];
    const iz = cell[2];

    return this.isFilled3(ix, iy, iz);
  }

  intersectingCell(outIdx: types.Real3, rayOrigin: vec3, rayDir: vec3): boolean {
    const gridDims = this.gridDimensions;
    const cellDims = this.cellDimensions;
    const pos = this.position;

    const ray = this.intersectRay.set(rayOrigin, rayDir);
    const gridAabb = this.intersectAabb;
  
    gridAabb.minX = Math.max(pos[0], rayOrigin[0]);
    gridAabb.maxX = Math.min(gridDims[0] * cellDims[0], rayOrigin[0]);
    gridAabb.minY = Math.max(pos[1], rayOrigin[1]);
    gridAabb.maxY = Math.min(gridDims[1] * cellDims[1], rayOrigin[1]);
    gridAabb.minZ = Math.max(pos[2], rayOrigin[2]);
    gridAabb.maxZ = Math.min(gridDims[2] * cellDims[2], rayOrigin[2]);
  
    const intersectRes = rayIntersectsAabb(ray, gridAabb);
    if (!intersectRes.intersects) {
      return false;
    }
  
    const p0 = ray.pointAt(this.intersectPoint, intersectRes.tMin);
    this.getCellIndexOfPoint(outIdx, p0);
  
    if (this.isFilled(outIdx)) {
      return true;
    }
  
    const maxIters = this.maxDim * this.maxDim;
  
    const sx = Math.sign(rayDir[0]);
    const sy = Math.sign(rayDir[1]);
    const sz = Math.sign(rayDir[2]);
  
    const xBound = (sx > 0 ? outIdx[0]+1 : outIdx[0]) * cellDims[0] + pos[0];
    const yBound = (sy > 0 ? outIdx[1]+1 : outIdx[1]) * cellDims[1] + pos[1];
    const zBound = (sz > 0 ? outIdx[2]+1 : outIdx[2]) * cellDims[2] + pos[2];
  
    const tx = Math.abs(cellDims[0] / rayDir[0]);
    const ty = Math.abs(cellDims[1] / rayDir[1]);
    const tz = Math.abs(cellDims[2] / rayDir[2]);
  
    let cx = (xBound - p0[0]) / rayDir[0];
    let cy = (yBound - p0[1]) / rayDir[1];
    let cz = (zBound - p0[2]) / rayDir[2];
  
    let ix = 0;
    let iy = 0;
    let iz = 0;
  
    for (let iter = 0; iter < maxIters; iter++) {
      if (cx < cy && cx < cz) {
        ix += sx;
        cx += tx;
      } else if (cy < cz) {
        iy += sy;
        cy += ty;
      } else {
        iz += sz;
        cz += tz;
      }
  
      const ixTest = outIdx[0] + ix;
      const iyTest = outIdx[1] + iy;
      const izTest = outIdx[2] + iz;
  
      if (this.isFilled3(ixTest, iyTest, izTest)) {
        outIdx[0] = ixTest;
        outIdx[1] = iyTest;
        outIdx[2] = izTest;
        return true;
      }
      
      iter++;
    }

    return false;
  }
}