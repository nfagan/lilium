import { PrimitiveTypedArray, NumericComponent } from './types';

export class Image {
  readonly data: PrimitiveTypedArray;
  readonly width: number;
  readonly height: number;
  readonly numComponents: number;
  readonly componentType: NumericComponent;

  constructor(data: PrimitiveTypedArray, width: number, height: number, numComponents: number, componentType: NumericComponent) {
    const numPixels = width * height * numComponents;

    if (numPixels !== data.length) {
      throw new Error(`Data of length ${data.length} do not correspond to given number of pixels ${numPixels}.`);
    }

    this.data = data;
    this.width = width;
    this.height = height;
    this.numComponents = numComponents;
    this.componentType = componentType;
  }
}