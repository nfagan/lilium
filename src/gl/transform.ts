import { mat4 } from 'gl-matrix';

export class Transform {
  matrix: mat4;

  constructor() {
    this.matrix = mat4.create();
  }
}