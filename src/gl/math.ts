import { vec3 } from 'gl-matrix';

export const EPSILON = 0.000001;

export function arrayMax(arr: Float32Array | Array<number>): number {
  let max = -Infinity;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }

  return max;
}

export function distance3(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export function sub3(out: Array<number> | vec3, a: Array<number> | vec3, b: Array<number> | vec3): void {
  for (let i = 0; i < 3; i++) {
    out[i] = a[i] - b[i];
  }
}

export function add3(out: Array<number> | vec3, a: Array<number> | vec3, b: Array<number> | vec3): void {
  for (let i = 0; i < 3; i++) {
    out[i] = a[i] + b[i];
  }
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

  toString(): string {
    return `x0:${this.minX}, x1:${this.maxX}, y0:${this.minY}, y1:${this.maxY}, z0:${this.minZ}, z1:${this.maxZ}`;
  }

  width(): number {
    return this.maxX - this.minX;
  }

  height(): number {
    return this.maxY - this.minY;
  }

  depth(): number {
    return this.maxZ - this.minZ;
  }

  move(by: vec3 | Array<number>): void {
    this.move3(by[0], by[1], by[2]);
  }

  move3(byX: number, byY: number, byZ: number): void {
    this.minX += byX;
    this.maxX += byX;

    this.minY += byY;
    this.maxY += byY;

    this.minZ += byZ;
    this.maxZ += byZ;
  }

  assign(aabb: Aabb): void {
    this.minX = aabb.minX;
    this.maxX = aabb.maxX;
    this.minY = aabb.minY;
    this.maxY = aabb.maxY;
    this.minZ = aabb.minZ;
    this.maxZ = aabb.maxZ;
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

  static fromOriginDimensions(origin: vec3 | Array<number>, dims: vec3 | Array<number>): Aabb {
    const aabb = new Aabb();
    
    aabb.minX = origin[0];
    aabb.maxX = origin[0] + dims[0];
    aabb.minY = origin[1];
    aabb.maxY = origin[1] + dims[1];
    aabb.minZ = origin[2];
    aabb.maxZ = origin[2] + dims[2];

    return aabb;
  }
}