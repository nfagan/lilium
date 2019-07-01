import * as types from './types';
import { Material } from './material';
import { Transform } from './transform';

export class Model {
  drawable: types.Drawable;
  material: Material;
  transform: Transform;

  constructor(drawable: types.Drawable, material: Material) {
    this.drawable = drawable;
    this.material = material;
    this.transform = new Transform();
  }
}