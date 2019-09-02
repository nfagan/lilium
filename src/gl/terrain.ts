import * as math from './math';
import { NumericComponent, Image } from '../util';

export interface IHeightMap {
  normalizedValueAtNormalizedXz(x: number, z: number): number;
  setInterpolationExtent(extent: number): void;
}

export class ImageHeightMap implements IHeightMap {
  private image: Image;
  private data: Uint8Array;
  private min: number;
  private max: number;
  private interpolationExtent: number;

  constructor(image: Image) {
    if (image.componentType !== NumericComponent.Uint8) {
      throw new Error('ImageHeightMap requires Uint8 image.');
    }

    this.image = image;
    this.data = image.data as Uint8Array;
    this.min = math.arrayMin(this.data);
    this.max = math.arrayMax(this.data);
    this.interpolationExtent = 0;
  }

  setInterpolationExtent(extent: number): void {
    this.interpolationExtent = math.clamp01(extent);
  }

  private interpolate(xPixel: number, zPixel: number, componentIndex: number): number {
    const interpX = Math.floor((this.image.width-1) * this.interpolationExtent);
    const interpZ = Math.floor((this.image.height-1) * this.interpolationExtent);

    const minPixelX = math.clamp(xPixel - Math.floor(interpX/2), 0, this.image.width-1);
    const maxPixelX = math.clamp(minPixelX + interpX, 0, this.image.width-1);

    const minPixelZ = math.clamp(zPixel - Math.floor(interpZ/2), 0, this.image.height-1);
    const maxPixelZ = math.clamp(zPixel + interpZ, 0, this.image.height-1);

    let actualValue = this.getPixelValue(xPixel, zPixel, componentIndex);
    let iters = 1;
    
    for (let i = minPixelX; i < maxPixelX; i++) {
      for (let j = minPixelZ; j < maxPixelZ; j++) {

        if (i !== xPixel && j !== zPixel) {
          const nearby = this.getPixelValue(i, j, componentIndex);
          actualValue = (actualValue * iters + nearby) / ++iters;
        }
      }
    }

    return actualValue;
  }

  private getPixelValue(xPixel: number, zPixel: number, componentIndex: number): number {
    const w = this.image.width;
    const numComponents = this.image.numComponents;
    return this.data[zPixel*numComponents*w + xPixel*numComponents + componentIndex];
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

    let value: number;

    if (this.interpolationExtent === 0) {
      value = this.getPixelValue(xPixel, zPixel, componentIndex);
    } else {
      value = this.interpolate(xPixel, zPixel, componentIndex);
    }
    
    const result = (value - this.min) / (this.max - this.min);

    return (isNaN(result) || !isFinite(result)) ? 0 : result;
  }
}