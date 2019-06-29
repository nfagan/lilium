import { math, types } from '../gl';

export class Player {
  public readonly aabb: math.Aabb;

  constructor(dims: types.Real3) {
    this.aabb = new math.Aabb();
    this.aabb.minX = 0;
    this.aabb.minY = 0;
    this.aabb.minZ = 0;

    this.aabb.maxX = dims[0];
    this.aabb.maxY = dims[1];
    this.aabb.maxZ = dims[2];
  }
}