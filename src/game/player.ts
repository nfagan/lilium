import { vec3 } from 'gl-matrix';
import { VoxelGrid } from '../gl';

export class Player {
  public upVelocity: number;
  public readonly position: Array<number>;
  private voxelGrid: VoxelGrid;
  private tmpVec1: Array<number>;
  private tmpVec2: Array<number>;

  constructor(voxelGrid: VoxelGrid) {
    this.upVelocity = 0;
    this.position = [0, 0, 0];
    this.voxelGrid = voxelGrid;
    this.tmpVec1 = [0, 0, 0];
    this.tmpVec2 = [0, 0, 0];
  }

  move(vel: vec3 | Array<number>): void {
    for (let i = 0; i < 3; i++) {
      this.tmpVec1[i] = this.position[i] + vel[i];
    }
    this.tryMove(this.tmpVec1);
  }

  moveNeg(vel: vec3 | Array<number>): void {
    for (let i = 0; i < 3; i++) {
      this.tmpVec1[i] = this.position[i] - vel[i];
    }
    this.tryMove(this.tmpVec1);
  }

  private tryMove(toPos: vec3 | Array<number>): void {
    const grid = this.voxelGrid;
    const cellIdx = this.tmpVec2;
    let tmpY = toPos[1];
    toPos[1] = 0;

    grid.getCellIndexOfPoint(cellIdx, toPos);
    if (!grid.isFilled(cellIdx)) {
      // return;
    }

    toPos[1] = tmpY;

    for (let i = 0; i < 3; i++) {
      this.position[i] = toPos[i];
    }
  }
}