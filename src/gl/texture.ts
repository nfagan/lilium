import * as types from '../util';

export class Texture2D {
  private gl: WebGLRenderingContext;
  public minFilter: number;
  public magFilter: number;
  public wrapS: number;
  public wrapT: number;
  public level: number;
  public width: number;
  public height: number;
  public border: number;
  public internalFormat: number;
  public srcFormat: number;
  public srcType: number;
  public texture: WebGLTexture;
  public index: number;
  public data: types.PrimitiveTypedArray;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.minFilter = gl.NEAREST;
    this.magFilter = gl.NEAREST;
    this.wrapS = gl.CLAMP_TO_EDGE;
    this.wrapT = gl.CLAMP_TO_EDGE;
    this.level = 0;
    this.width = 0;
    this.height = 0;
    this.border = 0;
    this.internalFormat = gl.RGBA;
    this.srcFormat = gl.RGBA;
    this.srcType = gl.UNSIGNED_BYTE;
    this.texture = gl.createTexture();
    this.index = 0;
    this.data = null;
  }

  bind(): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
  }

  activate(): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + this.index);
  }

  activateAndBind(): void {
    this.activate();
    this.bind();
  }

  configure(): void {
    const gl = this.gl;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.wrapT);
  }

  fillImage(data: types.PrimitiveTypedArray): void {
    const level = this.level;
    const internalFormat = this.internalFormat;
    const width = this.width;
    const height = this.height;
    const border = this.border;
    const srcFormat = this.srcFormat;
    const srcType = this.srcType;
    const gl = this.gl;

    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, data);
  }

  fillImageElement(data: HTMLImageElement, assignDimensions: boolean = true): void {
    const gl = this.gl;
    const level = this.level;

    gl.texImage2D(gl.TEXTURE_2D, level, this.internalFormat, this.srcFormat, this.srcType, data);

    if (assignDimensions) {
      this.width = data.width;
      this.height = data.height;
    }
  }

  subImage(data: types.PrimitiveTypedArray): void {
    const width = this.width;
    const height = this.height;
    const format = this.srcFormat;
    const type = this.srcType;
    const gl = this.gl;
    const level = this.level;

    gl.texSubImage2D(gl.TEXTURE_2D, level, 0, 0, width, height, format, type, data);
  }

  numComponentsPerPixel(): number {
    switch (this.srcFormat) {
      case this.gl.LUMINANCE_ALPHA:
        return 2;
      case this.gl.ALPHA:
      case this.gl.LUMINANCE:
        return 1;
      case this.gl.RGB:
        return 3;
      case this.gl.RGBA:
        return 4;
      default:
        console.warn('Unrecognized source format.');
        return 0;
    }
  }
}