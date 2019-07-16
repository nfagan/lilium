import { vec3 } from 'gl-matrix';
import * as types from './types';
import { BuiltinRealArray } from '../util';

export const EPSILON = 0.000001;

export function isPow2(num: number): boolean {
  //  https://www.geeksforgeeks.org/program-to-find-whether-a-no-is-power-of-two/
  return (num % 1 === 0) && num > 0 && (!(num & (num-1)));
}

export function distance3(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export function clamp<T>(v: T, minBound: T, maxBound: T): T {
  if (v < minBound) {
    return minBound;
  } else if (v > maxBound) {
    return maxBound;
  } else {
    return v;
  }
}

export function goldenRatio(): number {
  return (1 + Math.sqrt(5)) / 2;
}

export function clamp01(v: number): number {
  return clamp<number>(v, 0, 1);
}

export function sub3(out: types.Real3, a: types.Real3, b: types.Real3): void {
  for (let i = 0; i < 3; i++) {
    out[i] = a[i] - b[i];
  }
}

export function add3(out: types.Real3, a: types.Real3, b: types.Real3): void {
  for (let i = 0; i < 3; i++) {
    out[i] = a[i] + b[i];
  }
}

export function norm3(out: types.Real3, a: types.Real3): void {
  const len = Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
  if (len !== 0) {
    out[0] = a[0] / len;
    out[1] = a[1] / len;
    out[2] = a[2] / len;
  } else {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
}

export function scale3(out: types.Real3, a: types.Real3, by: number): void {
  for (let i = 0; i < 3; i++) {
    out[i] = a[i] * by;
  }
}

export function arrayMin(arr: BuiltinRealArray): number {
  let min = Infinity;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i];
    }
  }

  return min;
}

export function arrayMax(arr: BuiltinRealArray): number {
  let max = -Infinity;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }

  return max;
}

export function arrayScale(out: BuiltinRealArray, a: BuiltinRealArray, by: number): void {
  const len = Math.min(out.length, a.length);

  for (let i = 0; i < len; i++) {
    out[i] = a[i] * by;
  }
}

export function dtSecRatio(dt: number): number {
  return dt / (1/60);
}

export function dtSecSampleIncrement(dt: number): number {
  return Math.max(Math.ceil((dt / (1/60))), 1);
}

export function dtSecScale(dt: number, value: number): number {
  return (dt / (1/60)) * value;
}

export function dtSecScaleInv(dt: number, value: number): number {
  return (1 / (dt / (1/60))) * value;
}

export function normalize01(out: BuiltinRealArray, a: BuiltinRealArray): void {
  const minValue = arrayMin(a);
  const maxValue = arrayMax(a);
  const len = Math.min(out.length, a.length);
  const minMaxRange = maxValue - minValue;

  for (let i = 0; i < len; i++) {
    out[i] = (a[i] - minValue) / minMaxRange;
  }
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

  set(origin: types.Real3, direction: types.Real3): Ray {
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

  midX(): number {
    return this.minX + this.width()/2;
  }

  midY(): number {
    return this.minY + this.height()/2;
  }

  midZ(): number {
    return this.minZ + this.depth()/2;
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

  moveTo(pos: vec3 | Array<number>): void {
    this.moveTo3(pos[0], pos[1], pos[2]);
  }

  moveTo3(x: number, y: number, z: number): void {
    const w = this.width();
    const h = this.height();
    const d = this.depth();

    this.minX = x;
    this.minY = y;
    this.minZ = z;

    this.maxX = x + w;
    this.maxY = y + h;
    this.maxZ = z + d;
  }

  moveToY(y: number): void {
    const h = this.height();

    this.minY = y;
    this.maxY = y + h;
  }

  assign(aabb: Aabb): void {
    this.minX = aabb.minX;
    this.maxX = aabb.maxX;
    this.minY = aabb.minY;
    this.maxY = aabb.maxY;
    this.minZ = aabb.minZ;
    this.maxZ = aabb.maxZ;
  }

  static copy(out: Aabb, a: Aabb): Aabb {
    out.assign(a);
    return out;
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