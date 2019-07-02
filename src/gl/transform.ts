import { mat4 } from 'gl-matrix';
import * as types from './types';

export class Transform {
  matrix: mat4;

  constructor() {
    this.matrix = mat4.create();
  }

  translate(to: types.Real3): void {
    mat4.translate(this.matrix, this.matrix, to as any);
  }
}