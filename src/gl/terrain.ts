import * as math from './math';
import { NumericComponent, Image } from '../util';

export interface IHeightMap {
  normalizedValueAtNormalizedXz(x: number, z: number): number;
}

export class ImageHeightMap implements IHeightMap {
  private image: Image;
  private data: Uint8Array;
  private min: number;
  private max: number;

  constructor(image: Image) {
    if (image.componentType !== NumericComponent.Uint8) {
      throw new Error('ImageHeightMap requires Uint8 image.');
    }

    this.image = image;
    this.data = image.data as Uint8Array;
    this.min = math.arrayMin(this.data);
    this.max = math.arrayMax(this.data);
  }

  normalizedValueAtNormalizedXz(x: number, z: number, componentIndex?: number): number {
    if (this.data.length === 0) {
      return 0;
    }

    const numComponents = this.image.numComponents;

    if (componentIndex === undefined) {
      componentIndex = 0;
    } else {
      componentIndex = math.clamp(componentIndex, 0, numComponents-1);
    }

    x = math.clamp01(x);
    z = math.clamp01(z);

    const xPixel = Math.floor(x * (this.image.width-1));
    const zPixel = Math.floor(z * (this.image.height-1));

    const h = this.image.height;
    const value = this.data[xPixel*numComponents*h + zPixel*numComponents + componentIndex];
    const result = (value - this.min) / (this.max - this.min);

    return (isNaN(result) || !isFinite(result)) ? 0 : result;
  }
}