import { Shader } from './shader';
import * as types from './types';
import { mat4 } from 'gl-matrix';
import { shaderBuilder, Texture2D } from '.';

export class Program {
  private static ID: number = 0;

  private gl: WebGLRenderingContext;
  private program: WebGLProgram = null;
  private attributeLocations: types.StringMap<number>;
  private uniformLocations: types.StringMap<WebGLUniformLocation>;

  readonly id: number;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.attributeLocations = {};
    this.uniformLocations = {};
    this.id = Program.ID++;
  }

  private maybeGetCachedLocation<T>(map: types.StringMap<T>, kind: string, name: string, 
    locGetter: () => T, locValidator: (v: T) => boolean, forceQuery: boolean): T {
    if (this.program === null) {
      throw new Error(`Cannot get ${kind} from invalid or unattached program.`);
    }

    let potentialLoc = map[name];
    
    if (!forceQuery && potentialLoc !== undefined) {
      return potentialLoc;
    } else {
      potentialLoc = locGetter();
      if (locValidator(potentialLoc)) {
        map[name] = potentialLoc;
      }
      
      return potentialLoc;
    }
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  getAttributeLocation(name: string, forceQuery: boolean = false): number {
    const self = this;
    const locGetter = () => self.gl.getAttribLocation(self.program, name);
    const locValidator = (loc: number) => loc !== -1
    
    return this.maybeGetCachedLocation(this.attributeLocations, 'attribute', name, locGetter, locValidator, forceQuery);
  }

  getUniformLocation(name: string, forceQuery: boolean = false): WebGLUniformLocation {
    const self = this;
    const locGetter = () => self.gl.getUniformLocation(self.program, name);
    const locValidator = (loc: WebGLUniformLocation) => loc !== null;

    return this.maybeGetCachedLocation(this.uniformLocations, 'uniform', name, locGetter, locValidator, forceQuery);
  }

  private setUniformFromComponents(identifier: string, type: types.GLSLTypes, value: types.UniformSettable): void {
    switch (type) {
      case 'float':
        this.set1f(identifier, value as number);
        break;
      case 'sampler2D': {
        const tex = value as Texture2D;
        this.set1i(identifier, tex.index);
        break;
      }
      case 'vec3':
        this.setVec3(identifier, value as types.Real3);
        break;
      case 'mat4':
        this.setMat4(identifier, value as mat4);
        break;
      default:
        console.warn(`No uniform-setting function for type: ${type}.`);
    }
  }

  isUniform(name: string): boolean {
    return this.getUniformLocation(name) !== null;
  }

  setUniform(uniform: types.UniformValue): void {
    this.setUniformFromComponents(uniform.identifier, uniform.type, uniform.value);
  }

  setArrayUniform(uniform: types.UniformValue, atIndex: number): void {
    const identifier = `${uniform.identifier}[${atIndex}]`;
    this.setUniformFromComponents(identifier, uniform.type, uniform.value);
  }

  setMat4(name: string, value: mat4): void {
    const loc = this.getUniformLocation(name);

    if (loc === null) {
      console.warn(`Unrecognized uniform "${name}".`);
      return;
    }

    this.gl.uniformMatrix4fv(loc, false, value);
  }

  set3f(name: string, x: number, y: number, z: number): void {
    const loc = this.getUniformLocation(name);

    if (loc === null) {
      console.warn(`Unrecognized uniform "${name}".`);
      return;
    }

    this.gl.uniform3f(loc, x, y, z);
  }

  set1f(name: string, x: number): void {
    const loc = this.getUniformLocation(name);

    if (loc === null) {
      console.warn(`Unrecognized uniform "${name}".`);
      return;
    }

    this.gl.uniform1f(loc, x);
  }

  set1i(name: string, x: number): void {
    const loc = this.getUniformLocation(name);

    if (loc === null) {
      console.warn(`Unrecognized uniform "${name}".`);
      return;
    }

    this.gl.uniform1i(loc, x);
  }

  setTexture(name: string, index: number): void {
    this.set1i(name, index);
  }

  setVec3(name: string, value: types.Real3): void {
    this.set3f(name, value[0], value[1], value[2]);
  }

  attachShadersAndFinalize(shaders: Array<Shader>): void {
    if (shaders.length === 0) {
      throw new Error('Expected 1 or more shader in program; got 0.');
    }

    const gl = this.gl;
    const program = gl.createProgram();

    for (let i = 0; i < shaders.length; i++) {
      shaders[i].attachTo(program);
    }

    gl.linkProgram(program);

    for (let i = 0; i < shaders.length; i++) {
      // shaders[i].detachFrom(program);
      shaders[i].dispose();
    }

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const errInfo = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      
      throw new Error('Failed to link shader program: ' + errInfo);
    }

    this.program = program;
  }

  dispose(): void {
    if (this.program !== null) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
  }

  isValid(): boolean {
    return this.program !== null;
  }

  static fromSources(gl: WebGLRenderingContext, vertSource: string, fragSource: string): Program {
    const vertShader = new Shader(gl, types.Shader.Vertex, vertSource);
    const fragShader = new Shader(gl, types.Shader.Fragment, fragSource);
    const prog = new Program(gl);
  
    prog.attachShadersAndFinalize([vertShader, fragShader]);

    return prog;
  }

  static fromSchemas(gl: WebGLRenderingContext, vertSchema: types.ShaderSchema, fragSchema: types.ShaderSchema): Program {
    const vertSource = shaderBuilder.shaderSchemaToString(vertSchema);
    const fragSource = shaderBuilder.shaderSchemaToString(fragSchema);
    return Program.fromSources(gl, vertSource, fragSource);
  }
}