import { Shader } from './shader';
import * as types from './types';
import { mat4 } from 'gl-matrix';

type StringMap<T> = {
  [s: string]: T
};

export class Program {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram = null;
  private attributeLocations: StringMap<number>;
  private uniformLocations: StringMap<WebGLUniformLocation>;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.attributeLocations = {};
    this.uniformLocations = {}
  }

  private maybeGetCachedLocation<T>(map: StringMap<T>, kind: string, name: string, 
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
}