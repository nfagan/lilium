import * as types from '../util';

interface TextureBase {
  id: number;
};

class _TextureSet<T extends TextureBase> {
  private textures: Map<number, T>

  constructor() {
    this.textures = new Map();
  }

  addTexture(tex: T): void {
    this.textures.set(tex.id, tex);
  }

  removeTexture(tex: T): void {
    this.textures.delete(tex.id);
  }

  completeSet(): IterableIterator<T> {
    return this.textures.values();
  }

  useTextures(cb: (value: T) => void): void {
    this.textures.forEach(cb);
  }

  size(): number {
    return this.textures.size;
  }
}

export class Texture2DSet extends _TextureSet<Texture2D> {
  constructor() {
    super();
  }
}

export class Texture2D implements TextureBase {
  private gl: WebGLRenderingContext;
  readonly id: number;

  minFilter: number;
  magFilter: number;
  wrapS: number;
  wrapT: number;
  level: number;
  width: number;
  height: number;
  border: number;
  internalFormat: number;
  srcFormat: number;
  srcType: number;
  texture: WebGLTexture;
  index: number;
  data: types.PrimitiveTypedArray;

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
    this.id = Texture2D.ID++;
  }

  bind(): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
  }

  bindAndConfigure(): void {
    this.bind();
    this.configure();
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

  dispose(): void {
    this.gl.deleteTexture(this.texture);
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

  static linearRepeatRGBA(gl: WebGLRenderingContext, size?: number): Texture2D {
    const tex = new Texture2D(gl);

    tex.minFilter = gl.LINEAR;
    tex.magFilter = gl.LINEAR;
    tex.wrapS = gl.REPEAT;
    tex.wrapT = gl.REPEAT;
    tex.internalFormat = gl.RGBA;
    tex.srcFormat = gl.RGBA;
    tex.srcType = gl.UNSIGNED_BYTE;
    tex.level = 0;
    tex.border = 0;

    if (size !== undefined) {
      tex.width = size;
      tex.height = size;
    }

    return tex;
  }

  static linearRepeatAlpha(gl: WebGLRenderingContext, size: number): Texture2D {
    const tex = new Texture2D(gl);

    tex.minFilter = gl.LINEAR;
    tex.magFilter = gl.LINEAR;
    tex.wrapS = gl.REPEAT;
    tex.wrapT = gl.REPEAT;
    tex.internalFormat = gl.ALPHA;
    tex.srcFormat = gl.ALPHA;
    tex.srcType = gl.UNSIGNED_BYTE;
    tex.level = 0;
    tex.border = 0;

    tex.width = size;
    tex.height = size;

    return tex;
  }

  static nearestEdgeClampedRGBA(gl: WebGLRenderingContext, size: number): Texture2D {
    const tex = new Texture2D(gl);

    tex.minFilter = gl.NEAREST;
    tex.magFilter = gl.NEAREST;
    tex.wrapS = gl.CLAMP_TO_EDGE;
    tex.wrapT = gl.CLAMP_TO_EDGE;
    tex.level = 0;
    tex.internalFormat = gl.RGBA;
    tex.width = size;
    tex.height = size;
    tex.border = 0;
    tex.srcFormat = gl.RGBA;
    tex.srcType = gl.UNSIGNED_BYTE;

    return tex;
  }

  static nearestEdgeClampedAlpha(gl: WebGLRenderingContext, size: number): Texture2D {
    const tex = new Texture2D(gl);

    tex.minFilter = gl.NEAREST;
    tex.magFilter = gl.NEAREST;
    tex.wrapS = gl.CLAMP_TO_EDGE;
    tex.wrapT = gl.CLAMP_TO_EDGE;
    tex.level = 0;
    tex.internalFormat = gl.ALPHA;
    tex.width = size;
    tex.height = size;
    tex.border = 0;
    tex.srcFormat = gl.ALPHA;
    tex.srcType = gl.UNSIGNED_BYTE;

    return tex;
  }

  private static ID: number = 0;
}