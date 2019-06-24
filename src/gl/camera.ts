import { mat4, vec3 } from 'gl-matrix';

export interface ICamera {
  readonly position: vec3;

  makeViewMatrix(): mat4;
  makeProjectionMatrix(): mat4;

  move(deltas: vec3 | Array<number>): void;
  moveNeg(deltas: vec3 | Array<number>): void;
  rotate(dx: number, dy: number): void;
  
  setAspect(ratio: number): void;
  setNear(near: number): void;
  setFar(far: number): void;

  getFront(out: vec3): vec3;
  getRight(out: vec3): vec3;
}