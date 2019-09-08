import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import { BuiltinRealArray, PrimitiveTypedArray } from '../util';
import { Vao, RenderContext, Program, Texture2D } from '.';

export type StringMap<T> = {
  [k: string]: T
};

export namespace typeTest {
  export function isShaderComponentPlug(a: any): a is ShaderComponentPlug {
    return a instanceof ShaderComponentPlug;
  }
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

export const enum BuiltinAttribute {
  Position,
  Normal,
  Uv
};

export function builtinAttributeToIdentifier(attr: BuiltinAttribute, identifiers?: ShaderIdentifierMap): string {
  if (identifiers === undefined) {
    identifiers = DefaultShaderIdentifiers;
  }

  switch (attr) {
    case BuiltinAttribute.Position:
      return identifiers.attributes.position;
    case BuiltinAttribute.Normal:
      return identifiers.attributes.normal;
    case BuiltinAttribute.Uv:
      return identifiers.attributes.uv;
    default:
      console.warn(`Unhandled attribute: ${attr}.`);
      return '';
  }
}

export function numComponentsInBuiltinAttribute(attr: BuiltinAttribute): number {
  switch (attr) {
    case BuiltinAttribute.Position:
      return 3;
    case BuiltinAttribute.Normal:
      return 3;
    case BuiltinAttribute.Uv:
      return 2;
    default:
      console.warn(`Unhandled attribute: ${attr}.`);
      return 0;
  }
}

export function builtinAttributeToDescriptor(gl: WebGLRenderingContext, attr: BuiltinAttribute, identifiers?: ShaderIdentifierMap): AttributeDescriptor {
  const ident = builtinAttributeToIdentifier(attr);
  const size = numComponentsInBuiltinAttribute(attr);
  return makeAttribute(ident, gl.FLOAT, size, 0);
}

export const ShaderLimits = {
  maxNumUniformDirectionalLights: 3,
  maxNumUniformPointLights: 3
};

export const enum ShaderDataSource {
  Attribute = 0,
  Varying,
  Uniform,
  Temporary,
};

export function makeConcreteComponentPlug(source: GLSLVariable, sourceType: ShaderDataSource, samplerSource?: ShaderComponentPlug): ShaderComponentPlug {
  const plug = new ShaderComponentPlug();
  plug.setConcreteSource(source, sourceType, samplerSource);
  return plug;
}

export function makeTemporaryComponentPlug(source: GLSLVariable, samplerSource?: ShaderComponentPlug): ShaderComponentPlug {
  const plug = new ShaderComponentPlug();
  plug.setConcreteSource(source, ShaderDataSource.Temporary, samplerSource);
  return plug;
}

export function makeAttributeComponentPlug(source: GLSLVariable, samplerSource?: ShaderComponentPlug): ShaderComponentPlug {
  const plug = new ShaderComponentPlug();
  plug.setConcreteSource(source, ShaderDataSource.Attribute, samplerSource);
  return plug;
}

export class ShaderComponentPlug {
  readonly id: number;
  private source: GLSLVariable | ShaderComponentPlug;
  private sourceType: ShaderDataSource;
  private samplerSource?: ShaderComponentPlug;

  constructor() {
    this.id = ShaderComponentPlug.ID++;
    this.source = null;
  }

  connectTo(source: ShaderComponentPlug): void {
    if (this.hasCyclicReference(source)) {
      throw new Error('Connecting this source would create a cyclic dependency between components.');
    }

    source.source = this;
  }

  setConcreteSource(source: GLSLVariable, sourceType: ShaderDataSource, samplerSource?: ShaderComponentPlug): void {
    this.source = source;
    this.sourceType = sourceType;
    this.samplerSource = samplerSource;
  }

  getSource(): GLSLVariable {
    this.assertHasSource();
    return this.getRootPlug().source as GLSLVariable;
  }

  getSourceType(): ShaderDataSource {
    this.assertHasSource();
    return this.getRootPlug().sourceType;
  }

  getSamplerSource(): ShaderComponentPlug {
    this.assertHasSource();
    return this.getRootPlug().samplerSource;
  }

  private getRootPlug(): ShaderComponentPlug {
    let prev: ShaderComponentPlug = this;
    let src = this.source;

    while (ShaderComponentPlug.isShaderComponentPlug(src)) {
      prev = src as ShaderComponentPlug;
      src = (<ShaderComponentPlug>src).source;
    }

    return prev;
  }

  private assertHasSource(): void {
    if (this.source === null) {
      throw new Error('No source has yet been set.');
    }
  }

  private static isShaderComponentPlug(source: GLSLVariable | ShaderComponentPlug): boolean {
    return source instanceof ShaderComponentPlug;
  }

  private hasCyclicReference(source: GLSLVariable | ShaderComponentPlug): boolean {
    const isPlug = ShaderComponentPlug.isShaderComponentPlug;

    if (!isPlug(source) || !isPlug(this.source)) {
      return false;
    }

    let newSource = source as ShaderComponentPlug;
    let selfSource = this.source as ShaderComponentPlug;
    
    const visitedIds: {[k: number]: number} = {};
    
    while (isPlug(selfSource)) {
      visitedIds[selfSource.id] = 0;
      selfSource = selfSource.source as ShaderComponentPlug;
    }

    while (isPlug(newSource)) {
      if (visitedIds[newSource.id] !== undefined) {
        return true;
      }
      visitedIds[newSource.id] = 0;
      newSource = newSource.source as ShaderComponentPlug;
    }

    return false;
  }

  private static ID: number = 0;
}

export type ShaderComponentOutlets = StringMap<GLSLVariable>;
export type ShaderComponentPlugs = StringMap<ShaderComponentPlug>;
export type ShaderComponentStatics = StringMap<ShaderComponentPlug>;

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
  inverseTransposeModel: string,
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
  specularPower: string,
  roughness: string,
  metallic: string
};

export type ShaderTemporaryMap = {
  worldPosition: GLSLVariable,
  projectivePosition: GLSLVariable,
  normal: GLSLVariable,
  position: GLSLVariable,
  normalToCamera: GLSLVariable,
  lightContribution: GLSLVariable,
  ambientConstant: GLSLVariable,
  diffuseConstant: GLSLVariable,
  specularConstant: GLSLVariable,
  specularPower: GLSLVariable,
  modelColor: GLSLVariable,
  fragColor: GLSLVariable,
  cameraPosition: GLSLVariable,
  uv: GLSLVariable,
  roughness: GLSLVariable,
  metallic: GLSLVariable,
  directionalLightPositions: GLSLVariable,
  directionalLightColors: GLSLVariable,
  pointLightPositions: GLSLVariable,
  pointLightColors: GLSLVariable,
};

export type ShaderIdentifierMap = {
  attributes: ShaderAttributeMap,
  varyings: ShaderVaryingMap,
  uniforms: ShaderUniformMap,
  temporaries: ShaderTemporaryMap,
}

export function makeDefaultShaderIdentifiers(): ShaderIdentifierMap {
  return {
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
      inverseTransposeModel: 'inv_trans_model',
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
      roughness: 'roughness',
      metallic: 'metallic'
    },
    temporaries: {
      worldPosition: {identifier: 'world_position', type: 'vec4'},
      projectivePosition: {identifier: 'projective_position', type: 'vec4'},
      normal: {identifier: 'normal', type: 'vec3'},
      position: {identifier: 'position', type: 'vec3'},
      normalToCamera: {identifier: 'normal_to_camera', type: 'vec3'},
      cameraPosition: {identifier: 'tmp_camera_position', type: 'vec3'},
      lightContribution: {identifier: 'light_contribution', type: 'vec3'},
      ambientConstant: {identifier: 'ka', type: 'float'},
      diffuseConstant: {identifier: 'kd', type: 'float'},
      specularConstant: {identifier: 'ks', type: 'float'},
      specularPower: {identifier: 'spec_pow', type: 'float'},
      modelColor: {identifier: 'use_color', type: 'vec3'},
      fragColor: {identifier: 'frag_color', type: 'vec4'},
      uv: {identifier: 'uv', type: 'vec2'},
      roughness: {identifier: 'tmp_roughness', type: 'float'},
      metallic: {identifier: 'tmp_metallic', type: 'float'},
      directionalLightPositions: {identifier: 'tmp_directional_light_pos', type: 'vec3', isArray: true, arraySize: ShaderLimits.maxNumUniformDirectionalLights},
      directionalLightColors: {identifier: 'tmp_directional_light_color', type: 'vec3', isArray: true, arraySize: ShaderLimits.maxNumUniformDirectionalLights},
      pointLightPositions: {identifier: 'tmp_point_light_pos', type: 'vec3', isArray: true, arraySize: ShaderLimits.maxNumUniformPointLights},
      pointLightColors: {identifier: 'tmp_point_light_colors', type: 'vec3', isArray: true, arraySize: ShaderLimits.maxNumUniformPointLights},
    }
  };
}

export const DefaultShaderIdentifiers = makeDefaultShaderIdentifiers();

export const enum LightingModel {
  Phong,
  Physical,
  None
};

export const enum Lights {
  Directional,
  Point
};

export type UniformSettable = number | FloatN | Texture2D;

export class UniformValue {
  private typeChanged: boolean;

  identifier: string;
  value: UniformSettable;
  type: GLSLTypes;
  channels?: number;
  allowNewType: boolean;

  constructor(identifier: string, value: UniformSettable, type: GLSLTypes, channels?: number) {
    this.identifier = identifier;
    this.value = value;
    this.type = type;
    this.channels = channels;
    this.typeChanged = true;
    this.allowNewType = true;
  }

  isTexture(): boolean {
    return this.type === 'sampler2D';
  }

  isNewType(): boolean {
    return this.typeChanged;
  }

  clearIsNewType(): void {
    this.typeChanged = false;
  }

  disallowNewType(): UniformValue {
    this.allowNewType = false;
    return this;
  }

  set(to: UniformSettable, numChannels?: number): void {
    const newType = glslTypeFromUniformSettableValue(to);
    const isNewType = this.type !== newType;

    if (isNewType && !this.allowNewType) {
      console.error(`Cannot overwrite value of original type "${this.type}" with value of new type "${newType}".`);
    }

    this.typeChanged = isNewType;
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
  type: GLSLTypes,
  isArray?: boolean,
  arraySize?: number
};

export function isGLSLVector(type: GLSLTypes): boolean {
  switch (type) {
    case 'vec2':
    case 'vec3':
    case 'vec4':
      return true;
    default:
      return false;
  }
}

export function makeAnonymousGLSLVariable(type: GLSLTypes, isArray?: boolean, arraySize?: number): GLSLVariable {
  return {identifier: '', type, isArray, arraySize};
}

export function makeGLSLVariable(identifier: string, type: GLSLTypes, isArray?: boolean, arraySize?: number): GLSLVariable {
  return {identifier, type, isArray, arraySize};
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

export function makeFloat2Attribute(gl: WebGLRenderingContext, name: string, divisor?: number): AttributeDescriptor {
  return makeFloatAttribute(gl, name, 2, divisor);
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
  type: Shader;
  version: string;
  precision: GLSLPrecision
  attributes: Array<GLSLVariable>;
  varyings: Array<GLSLVariable>;
  uniforms: Array<GLSLVariable>;
  temporaries: Array<GLSLVariable>;
  head: Array<() => string>;
  body: Array<() => string>;

  constructor(type: Shader) {
    this.type = type;
    this.version = '';
    this.precision = 'highp';
    this.attributes = [];
    this.varyings = [];
    this.uniforms = [];
    this.temporaries = [];
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

  hasTemporary(name: string): boolean {
    return this.hasIdentifierLinearSearch(name, this.temporaries);
  }

  hasStatic(name: string): boolean {
    return this.hasVarying(name) || this.hasUniform(name) || this.hasAttribute(name);
  }

  private addUniform(value: GLSLVariable): ShaderSchema {
    this.uniforms.push(value);
    return this;
  }

  private addVarying(value: GLSLVariable): ShaderSchema {
    this.varyings.push(value);
    return this;
  }

  private addAttribute(value: GLSLVariable): ShaderSchema {
    this.attributes.push(value);
    return this;
  }

  requireTemporaryIfNotStatic(value: GLSLVariable): ShaderSchema {
    if (!this.hasStatic(value.identifier)) {
      this.requireTemporary(value);
    }

    return this;
  }

  requireTemporary(value: GLSLVariable): ShaderSchema {
    if (!this.hasTemporary(value.identifier)) {
      this.temporaries.push(value);
    }
    return this;
  }

  requireAttribute(value: GLSLVariable): ShaderSchema {
    if (!this.hasAttribute(value.identifier)) {
      this.addAttribute(value);
    }
    return this;
  }

  requireVarying(value: GLSLVariable): ShaderSchema {
    if (!this.hasVarying(value.identifier)) {
      this.addVarying(value);
    }
    return this;
  }

  requireUniform(value: GLSLVariable): ShaderSchema {
    if (!this.hasUniform(value.identifier)) {
      this.addUniform(value);
    }
    return this;
  }

  requireInput(value: GLSLVariable): ShaderSchema {
    switch (this.type) {
      case Shader.Vertex:
        this.requireAttribute(value);
        break;
      case Shader.Fragment:
        this.requireVarying(value);
        break;
    }
    return this;
  }

  requireOutput(value: GLSLVariable): ShaderSchema {
    switch (this.type) {
      case Shader.Vertex:
        this.requireVarying(value);
        break;
      case Shader.Fragment:
        console.error(`Fragment shader outputs are not supported. Ignoring "${value.identifier}".`);
        break;
    }
    return this;
  }

  requireBySourceType(value: GLSLVariable, type: ShaderDataSource): ShaderSchema {
    switch (type) {
      case ShaderDataSource.Attribute:
        this.requireAttribute(value);
        break;
      case ShaderDataSource.Varying:
        this.requireVarying(value);
        break;
      case ShaderDataSource.Uniform:
        this.requireUniform(value);
        break;
      case ShaderDataSource.Temporary:
        this.requireTemporary(value);
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

  static Vertex(): ShaderSchema {
    return new ShaderSchema(Shader.Vertex);
  }

  static Fragment(): ShaderSchema {
    return new ShaderSchema(Shader.Fragment);
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

  export function arraysInstanced(rc: RenderContext, drawable: Drawable): void {
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

  static indexed(renderContext: RenderContext, vao: Vao, numIndices: number): Drawable {
    const drawFunc = DrawFunctions.indexed;
    const drawable = Drawable.fromProperties(renderContext, vao, drawFunc);
    drawable.count = numIndices;

    return drawable;
  }

  static indexedInstanced(renderContext: RenderContext, vao: Vao, numIndices: number, numInstances: number): Drawable {
    const drawFunc = DrawFunctions.indexedInstanced;

    const drawable = Drawable.fromProperties(renderContext, vao, drawFunc);
    drawable.count = numIndices;
    drawable.numActiveInstances = numInstances;
    drawable.isInstanced = true;

    return drawable;
  }

  static fromProperties(renderContext: RenderContext, vao: Vao, drawFunction: DrawFunction, mode?: number, count?: number, type?: number, offset?: number, isInstanced?: boolean, numActiveInstances?: number): Drawable {
    const drawable = new Drawable(renderContext, vao, drawFunction);
    drawable.assignPropsIfDefined(mode, count, type, offset, isInstanced, numActiveInstances);
    return drawable;
  }
};