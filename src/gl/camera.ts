import { mat4, vec3 } from 'gl-matrix';

export interface ICamera {
  makeViewMatrix(): mat4;
  move(deltas: vec3 | Array<number>): void;
  moveNeg(deltas: vec3 | Array<number>): void;
  rotate(dx: number, dy: number): void;
}