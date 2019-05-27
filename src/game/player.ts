import { vec3 } from 'gl-matrix';
import { VoxelGrid } from '../gl';

export class Player {
  public upVelocity: number;
  public readonly position: vec3;
  private voxelGrid: VoxelGrid;
  private tmpVec1: vec3;
  private tmpVec2: vec3;

  constructor(voxelGrid: VoxelGrid) {
    this.upVelocity = 0;
    this.position = vec3.create();
    this.voxelGrid = voxelGrid;
    this.tmpVec1 = vec3.create();
    this.tmpVec2 = vec3.create();
  }

  move(vel: vec3 | Array<number>): void {
    vec3.add(this.tmpVec1, this.position, vel);
    this.tryMove(this.tmpVec1);
  }

  moveNeg(vel: vec3 | Array<number>): void {
    vec3.sub(this.tmpVec1, this.position, vel);
    this.tryMove(this.tmpVec1);
  }

  private tryMove(toPos: vec3 | Array<number>): void {
    const grid = this.voxelGrid;
    const cellIdx = this.tmpVec2;
    let tmpY = toPos[1];
    toPos[1] = 0;

    grid.getCellIndexOfPoint(cellIdx, toPos);
    if (!grid.isFilled(cellIdx)) {
      return;
    }

    toPos[1] = tmpY;

    for (let i = 0; i < 3; i++) {
      this.position[i] = toPos[i];
    }
  }
}