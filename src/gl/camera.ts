import { mat4, vec3 } from 'gl-matrix';
import { types } from '.';

export interface ICamera {
  readonly position: vec3;

  makeViewMatrix(): mat4;
  makeProjectionMatrix(): mat4;

  move(deltas: types.Real3): void;
  moveNeg(deltas: types.Real3): void;
  rotate(dx: number, dy: number): void;
  
  setAspect(ratio: number): void;
  setNear(near: number): void;
  setFar(far: number): void;

  getFront(out: types.Real3): void;
  getRight(out: types.Real3): void;
}