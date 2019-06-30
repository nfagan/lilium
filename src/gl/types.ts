import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import { BuiltinRealArray, PrimitiveTypedArray } from '../util';
import { Vao, RenderContext, types, Program, Texture2D } from '.';

export namespace typeTest {
  export function isNumber(a: any): a is number {
    return typeof a === 'number';
  }
  export function isArray(a: any): a is Array<any> {
    return Array.isArray(a);
  }
  export function isArrayOfNumber(a: any): a is Array<number> {
    return isArray(a) && (a.length === 0 || isNumber(a[0]));
  }
  export function isTexture2D(a: any): a is Texture2D {
    return a instanceof Texture2D;
  }
  export function isFloat32Array(a: any): a is Float32Array {
    return a instanceof Float32Array;
  }
}

export const ShaderLimits = {
  maxNumUniformDirectionalLights: 3,
  maxNumUniformPointLights: 3
};

type ShaderAttributeMap = {
  position: string,
  normal: string,
  uv: string
};

type ShaderVaryingMap = {
  position: string,
  normal: string,
  uv: string,
};

type ShaderUniformMap = {
  model: string,
  view: string,
  projection: string,
  cameraPosition: string,
  directionalLightColors: string,
  directionalLightPositions: string,
  pointLightColors: string,
  pointLightPositions: string,
  modelColor: string,
  ambientConstant: string,
  diffuseConstant: string,
  specularConstant: string,
  specularPower: string
};

export type ShaderTemporaryMap = {
  worldPosition: GLSLVariable
  normal: GLSLVariable,
  normalToCamera: GLSLVariable,
  lightContribution: GLSLVariable,
  ambientConstant: GLSLVariable,
  diffuseConstant: GLSLVariable,
  specularConstant: GLSLVariable,
  specularPower: GLSLVariable,
  modelColor: GLSLVariable
};

export type ShaderIdentifierMap = {
  attributes: ShaderAttributeMap,
  varyings: ShaderVaryingMap,
  uniforms: ShaderUniformMap,
  temporaries: ShaderTemporaryMap,
}

export const DefaultShaderIdentifiers: ShaderIdentifierMap = {
  attributes: {
    position: 'a_position',
    normal: 'a_normal',
    uv: 'a_uv'
  },
  varyings: {
    position: 'v_position',
    normal: 'v_normal',
    uv: 'v_uv',
  },
  uniforms: {
    model: 'model',
    view: 'view',
    projection: 'projection',
    cameraPosition: 'camera_position',
    directionalLightColors: 'directional_light_colors',
    directionalLightPositions: 'directional_light_positions',
    pointLightColors: 'point_light_colors',
    pointLightPositions: 'point_light_positions',
    modelColor: 'model_color',
    ambientConstant: 'ambient_constant',
    diffuseConstant: 'diffuse_constant',
    specularConstant: 'specular_constant',
    specularPower: 'specular_power',
  },
  temporaries: {
    worldPosition: {identifier: 'world_position', type: 'vec3'},
    normal: {identifier: 'normal', type: 'vec3'},
    normalToCamera: {identifier: 'normal_to_camera', type: 'vec3'},
    lightContribution: {identifier: 'light_contribution', type: 'vec3'},
    ambientConstant: {identifier: 'ka', type: 'float'},
    diffuseConstant: {identifier: 'kd', type: 'float'},
    specularConstant: {identifier: 'ks', type: 'float'},
    specularPower: {identifier: 'spec_pow', type: 'float'},
    modelColor: {identifier: 'use_color', type: 'vec3'}
  }
};

export const RequiredPhongLightingTemporaries: Array<keyof ShaderTemporaryMap> = [
  'ambientConstant', 'diffuseConstant', 'specularConstant', 'specularPower', 'modelColor'
];

export const RequiredNoLightingTemporaries: Array<keyof ShaderTemporaryMap> = ['modelColor'];

export type LightingModel = 'phong' | 'none';

export type UniformSettable = number | FloatN | Texture2D;

export class UniformValue {
  private typeChanged: boolean;

  identifier: string;
  value: UniformSettable;
  type: GLSLTypes;
  channels?: number;

  constructor(identifier: string, value: UniformSettable, type: GLSLTypes, channels?: number) {
    this.identifier = identifier;
    this.value = value;
    this.type = type;
    this.channels = channels;
    this.typeChanged = true;
  }

  isNewType(): boolean {
    return this.typeChanged;
  }

  clearIsNewType(): void {
    this.typeChanged = false;
  }

  set(to: UniformSettable, numChannels?: number): void {
    const newType = glslTypeFromUniformSettableValue(to);
    this.typeChanged = this.type !== newType;
    this.value = to;
    this.type = newType;

    if (numChannels !== undefined) {
      this.channels = numChannels;
    }
  }
};

export function makeUniformValue(name: string, value: UniformSettable, type: GLSLTypes, channels?: number): UniformValue {
  return new UniformValue(name, value, type, channels);
}

export function makeUniformFloatValue(name: string, value: number): UniformValue {
  return new UniformValue(name, value, 'float');
}

export function makeUniformFloat3Value(name: string, value: Float3): UniformValue {
  return new UniformValue(name, value, 'vec3');
}

export type MaterialDescriptor = {
  receivesShadow: boolean,
  castsShadow: boolean,
  lightingModel: LightingModel,
  uniforms: {[key: string]: UniformValue}
};

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

export type Float4 = BuiltinRealArray | vec4 | mat4;
export type Float3 = Float4 | vec3;
export type Float2 = Float3 | vec2;
export type FloatN = Float2;

export type GLSLPrecision = 'lowp' | 'mediump' | 'highp';
export type GLSLTypes = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat2' | 'mat3' | 'mat4' | 'sampler2D';
export type GLSLVariable = {
  identifier: string,
  type: GLSLTypes
};

export function makeGLSLVariable(identifier: string, type: GLSLTypes): GLSLVariable {
  return {identifier, type};
}

export function glslTypeFromAttributeDescriptor(gl: WebGLRenderingContext, attr: AttributeDescriptor): GLSLTypes {
  if (attr.type === gl.FLOAT) {
    return glslFloatTypeFromNumComponents(attr.size);
  } else {
    console.warn(`Unsupported type: ${attr.type}`);
    return 'float';
  }
}

export function glslFloatTypeFromNumComponents(numComponents: number): GLSLTypes {
  switch (numComponents) {
    case 1:
      return 'float';
    case 2:
      return 'vec2';
    case 3:
      return 'vec3';
    case 4:
      return 'vec4';
    default:
      console.warn(`Unsupported size: ${numComponents}`);
      return 'float';
  }
}

export function glslTypeFromUniformSettableValue(value: UniformSettable): GLSLTypes {
  if (typeTest.isNumber(value)) {
    return 'float'
  } else if (typeTest.isTexture2D(value)) {
    return 'sampler2D';
  } else if (typeTest.isArrayOfNumber(value) || typeTest.isFloat32Array(value)) {
    if (value.length === 0) {
      console.error('Empty array ???');
      return 'float';
    } else if (value.length === 1) {
      return 'float';
    } else if (value.length === 2) {
      return 'vec2';
    } else if (value.length === 3) {
      return 'vec3';
    } else if (value.length === 4) {
      return 'vec4';
    } else if (value.length === 9) {
      return 'mat3';
    } else {
      return 'mat4';
    }
  } else {
    console.error('No known GLSL type for value: ' + value);
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

export function makeFloatAttribute(gl: WebGLRenderingContext, name: string, size: number, divisor?: number): AttributeDescriptor {
  return makeAttribute(name, gl.FLOAT, size, divisor);
}

export function makeFloat3Attribute(gl: WebGLRenderingContext, name: string, divisor?: number): AttributeDescriptor {
  return makeFloatAttribute(gl, name, 3, divisor);
}

export function makeVboDescriptor(name: string, attributes: Array<AttributeDescriptor>, data: PrimitiveTypedArray, drawType?: number): VboDescriptor {
  return {name, attributes, data, drawType};
}

export function makeAnonymousVboDescriptor(attributes: Array<AttributeDescriptor>, data: PrimitiveTypedArray, drawType?: number): VboDescriptor {
  let useName = attributes.length === 0 ? 'a' : attributes[0].name;
  return {name: useName, attributes, data, drawType};
}

export function makeAnonymousEboDescriptor(indices: Uint16Array): EboDescriptor {
  return {name: 'indices', indices};
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

  private hasIdentifierLinearSearch(name: string, inArr: Array<GLSLVariable>): boolean {
    for (let i = 0; i < inArr.length; i++) {
      if (inArr[i].identifier === name) {
        return true;
      }
    }

    return false;
  }

  hasVarying(name: string): boolean {
    return this.hasIdentifierLinearSearch(name, this.varyings);
  }

  hasUniform(name: string): boolean {
    return this.hasIdentifierLinearSearch(name, this.uniforms);
  }

  hasAttribute(name: string): boolean {
    return this.hasIdentifierLinearSearch(name, this.attributes);
  }

  addUniform(identifier: string, type: GLSLTypes): ShaderSchema {
    this.uniforms.push({identifier, type});
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

  requireAttribute(identifier: string, type: GLSLTypes): ShaderSchema {
    if (!this.hasAttribute(identifier)) {
      this.addAttribute(identifier, type);
    }
    return this;
  }

  requireVarying(identifier: string, type: GLSLTypes): ShaderSchema {
    if (!this.hasVarying(identifier)) {
      this.addVarying(identifier, type);
    }
    return this;
  }

  requireUniform(identifier: string, type: GLSLTypes): ShaderSchema {
    if (!this.hasUniform(identifier)) {
      this.addUniform(identifier, type);
    }
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