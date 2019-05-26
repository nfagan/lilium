import { vec3 } from 'gl-matrix';

export function arrayMax(arr: Float32Array | Array<number>): number {
  let max = -Infinity;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }

  return max;
}

export function arrayMin(arr: Float32Array | Array<number>): number {
  let min = Infinity;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i];
    }
  }

  return min;
}

export class Ray {
  origin: vec3;
  direction: vec3;

  constructor() {
    this.origin = vec3.create();
    this.direction = vec3.create();
  }

  pointAt(out: vec3, t: number): vec3 {
    vec3.copy(out, this.direction);
    vec3.scale(out, out, t);
    vec3.add(out, this.origin, out);
    return out;
  }

  set(origin: vec3, direction: vec3): Ray {
    for (let i = 0; i < 3; i++) {
      this.origin[i] = origin[i];
      this.direction[i] = direction[i];
    }
    return this;
  }

  static fromOriginDirection(origin: vec3, direction: vec3): Ray {
    const ray = new Ray();
    ray.set(origin, direction);
    return ray;
  }
}

export class Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;

  constructor() {
    this.minX = NaN;
    this.maxX = NaN;
    this.minY = NaN;
    this.maxY = NaN;
    this.minZ = NaN;
    this.maxZ = NaN;
  }

  static fromValues(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): Aabb {
    const aabb = new Aabb();
    
    aabb.minX = minX;
    aabb.maxX = maxX;
    aabb.minY = minY;
    aabb.maxY = maxY;
    aabb.minZ = minZ;
    aabb.maxZ = maxZ;

    return aabb;
  }
}