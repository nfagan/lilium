import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import { BuiltinRealArray, PrimitiveTypedArray } from '../util';
import { Vao, RenderContext } from '.';
import { Program } from '.';

export type AttributeDescriptor = {
  name: string,
  size: number,
  location?: number,
  type: number,
  divisor?: number
};

export const enum Shader {
  Vertex,
  Fragment 
};

export type Real4 = BuiltinRealArray | vec4 | mat4;
export type Real3 = Real4 | vec3;
export type Real2 = Real3 | vec2;
export type RealN = Real2;

export type LightingModels = 'phong';

export type GLSLPrecision = 'lowp' | 'mediump' | 'highp';
export type GLSLTypes = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat2' | 'mat3' | 'mat4' | 'sampler2D';
export type GLSLVariable = {
  identifier: string,
  type: GLSLTypes
};

export function glslTypeFromAttributeDescriptor(gl: WebGLRenderingContext, attr: AttributeDescriptor): GLSLTypes {
  if (attr.type === gl.FLOAT) {
    switch (attr.size) {
      case 1:
        return 'float';
      case 2:
        return 'vec2';
      case 3:
        return 'vec3';
      case 4:
        return 'vec4';
      default:
        console.warn(`Unsupported size: ${attr.size}`);
        return 'float';
    }
  } else {
    console.warn(`Unsupported type: ${attr.type}`);
    return 'float';
  }
}

export function componentTypeFromGLSLType(gl: WebGLRenderingContext, type: GLSLTypes): number {
  switch (type) {
    case 'float':
    case 'vec2':
    case 'vec3':
    case 'vec4':
    case 'mat2':
    case 'mat3':
    case 'mat4':
      return gl.FLOAT;
    case 'sampler2D':
      return gl.INT;
    default:
      console.warn(`No registered component type for ${type}.`);
      return gl.FLOAT;
  }
}

export function numComponentsInGLSLType(type: GLSLTypes): number {
  switch (type) {
    case 'float':
    case 'sampler2D':
      return 1;
    case 'vec2':
      return 2;
    case 'vec3':
      return 3;
    case 'vec4':
      return 4;
    case 'mat2':
      return 4;
    case 'mat3':
      return 9;
    case 'mat4':
      return 16;
    default:
      console.warn(`No known component number for ${type}.`);
      return 1;
  }
}

export function makeAttributeWithGLSLType(gl: WebGLRenderingContext, name: string, type: GLSLTypes, divisor?: number): AttributeDescriptor {
  return {name, type: componentTypeFromGLSLType(gl, type), size: numComponentsInGLSLType(type), divisor};
}

export function makeAttribute(name: string, type: number, size: number, divisor?: number): AttributeDescriptor {
  return {name, type, size, divisor};
}

export function makeVboDescriptor(name: string, attributes: Array<AttributeDescriptor>, data: PrimitiveTypedArray, drawType?: number): VboDescriptor {
  return {name, attributes, data, drawType};
}

export function makeEboDescriptor(name: string, indices: Uint16Array): EboDescriptor {
  return {name, indices};
}

export type VboDescriptor = {
  name: string,
  attributes: Array<AttributeDescriptor>,
  data: PrimitiveTypedArray,
  drawType?: number
};

export type EboDescriptor = {
  name: string,
  indices: Uint16Array
};

export class BufferDescriptor {
  private attributes: Array<AttributeDescriptor>;

  constructor() {
    this.attributes = [];
  }

  getAttributes(): Array<AttributeDescriptor> {
    return this.attributes.slice();
  }

  getAttributeLocations(prog: Program): void {
    for (let i = 0; i < this.attributes.length; i++) {
      this.attributes[i].location = prog.getAttributeLocation(this.attributes[i].name);
    }
  }

  addAttribute(attr: AttributeDescriptor): void {
    if (this.attributes.length > 0 && this.attributes[0].type !== attr.type) {
      throw new Error('Attribute types must match between attributes.');
    }

    this.attributes.push(attr);
  }

  numComponents(): number {
    let sz = 0;

    for (let i = 0; i < this.attributes.length; i++) {
      sz += this.attributes[i].size;
    }

    return sz;
  }
}

export class ShaderSchema {
  version: string;
  precision: GLSLPrecision
  attributes: Array<GLSLVariable>;
  varyings: Array<GLSLVariable>;
  uniforms: Array<GLSLVariable>;
  head: Array<() => string>;
  body: Array<() => string>;

  constructor() {
    this.version = '';
    this.precision = 'highp';
    this.attributes = [];
    this.varyings = [];
    this.uniforms = [];
    this.head = [];
    this.body = [];
  }

  addUniform(identifier: string, type: GLSLTypes): ShaderSchema {
    this.uniforms.push({identifier, type});
    return this;
  }

  addModelViewProjectionUniforms(): ShaderSchema {
    this.addUniform('model', 'mat4');
    this.addUniform('view', 'mat4');
    this.addUniform('projection', 'mat4');
    return this;
  }

  addVarying(identifier: string, type: GLSLTypes): ShaderSchema {
    this.varyings.push({identifier, type});
    return this;
  }

  addAttribute(identifier: string, type: GLSLTypes): ShaderSchema {
    this.attributes.push({identifier, type});
    return this;
  }

  addAttributeFromAttributeDescriptor(gl: WebGLRenderingContext, attr: AttributeDescriptor): ShaderSchema {
    this.attributes.push({identifier: attr.name, type: glslTypeFromAttributeDescriptor(gl, attr)});
    return this;
  }

  addAttributesFromVboDescriptor(gl: WebGLRenderingContext, descriptor: VboDescriptor): ShaderSchema {
    for (let i = 0; i < descriptor.attributes.length; i++) {
      this.addAttributeFromAttributeDescriptor(gl, descriptor.attributes[i]);
    }
    return this;
  }

  addAttributesFromVboDescriptors(gl: WebGLRenderingContext, descriptors: Array<VboDescriptor>): ShaderSchema {
    for (let i = 0; i < descriptors.length; i++) {
      this.addAttributesFromVboDescriptor(gl, descriptors[i]);
    }
    
    return this;
  }
};

export type DrawableVisitor<T> = (renderContext: RenderContext, drawable: T) => void;
export type DrawFunction = (renderContext: RenderContext, drawable: Drawable) => void;

class DrawableBase<T> {
  renderContext: RenderContext;
  drawFunction: DrawableVisitor<T>

  constructor(renderContext: RenderContext, drawFunction: DrawableVisitor<T>) {
    this.renderContext = renderContext;
    this.drawFunction = drawFunction;
  }
}

export namespace DrawFunctions {
  export function indexed(rc: RenderContext, drawable: Drawable): void {
    rc.gl.drawElements(drawable.mode, drawable.count, drawable.type, drawable.offset);
  }

  export function arrays(rc: RenderContext, drawable: Drawable): void {
    rc.gl.drawArrays(drawable.mode, drawable.offset, drawable.count);
  }

  export function indexedInstanced(rc: RenderContext, drawable: Drawable): void {
    rc.extInstancedArrays.drawElementsInstancedANGLE(drawable.mode, drawable.count, 
      drawable.type, drawable.offset, drawable.numActiveInstances);
  }

  export function indexedArrays(rc: RenderContext, drawable: Drawable): void {
    rc.extInstancedArrays.drawArraysInstancedANGLE(drawable.mode, drawable.offset,
      drawable.count, drawable.numActiveInstances);
  }
}

export class Drawable extends DrawableBase<Drawable> {
  vao: Vao;
  mode: number;
  count: number;
  type: number;
  offset: number;
  isInstanced: boolean;
  numActiveInstances: number;

  constructor(renderContext: RenderContext, vao: Vao, drawFunction: DrawableVisitor<Drawable>) {
    super(renderContext, drawFunction);
    this.vao = vao;
    this.mode = renderContext.gl.TRIANGLES;
    this.count = 0;
    this.type = renderContext.gl.UNSIGNED_SHORT;
    this.offset = 0;
    this.isInstanced = false;
    this.numActiveInstances = 0;
  }

  draw(): void {
    this.drawFunction(this.renderContext, this);
  }

  private assignPropsIfDefined(mode: number, count: number, type: number, offset: number, isInstanced: boolean, numActiveInstances: number): void {
    if (mode !== undefined) {
      this.mode = mode;
    }

    if (count !== undefined) {
      this.count = count;
    }

    if (type !== undefined) {
      this.type = type;
    }

    if (offset !== undefined) {
      this.offset = offset;
    }

    if (isInstanced !== undefined) {
      this.isInstanced = isInstanced;
    }

    if (numActiveInstances !== undefined) {
      this.numActiveInstances = numActiveInstances;
    }
  }

  static fromProperties(renderContext: RenderContext, vao: Vao, drawFunction: DrawFunction, mode?: number, count?: number, type?: number, offset?: number, isInstanced?: boolean, numActiveInstances?: number): Drawable {
    const drawable = new Drawable(renderContext, vao, drawFunction);
    drawable.assignPropsIfDefined(mode, count, type, offset, isInstanced, numActiveInstances);
    return drawable;
  }
};