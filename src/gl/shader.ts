import * as types from './types'

export class Shader {
  private gl: WebGLRenderingContext;
  private shader: WebGLShader = null;

  constructor(gl: WebGLRenderingContext, type: types.Shader, source: string) {
    const glType = this.glShaderType(gl, type);
    const shader = gl.createShader(glType);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const errInfo = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);

      throw new Error('Failed to compile shader: ' + errInfo);
    }

    this.gl = gl;
    this.shader = shader;
  }

  attachTo(prog: WebGLProgram) {
    if (!this.isValid()) {
      throw new Error('Shader is invalid.');
    }

    this.gl.attachShader(prog, this.shader);
  }

  detachFrom(prog: WebGLProgram): void {
    this.gl.detachShader(prog, this.shader);
  }

  isValid(): boolean {
    return this.shader !== null;
  }

  dispose(): void {
    if (this.shader !== null) {
      this.gl.deleteShader(this.shader);
      this.shader = null;
    }
  }

  private glShaderType(gl: WebGLRenderingContext, kind: types.Shader): number {
    if (kind === types.Shader.Vertex) {
      return gl.VERTEX_SHADER;
    } else if (kind === types.Shader.Fragment) {
      return gl.FRAGMENT_SHADER;
    } else {
      throw new Error(`Internal error: Expected Vertex or Fragment shader type; got ${kind}`);
    }
  }
}