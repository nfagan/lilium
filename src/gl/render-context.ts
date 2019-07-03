import { Vao, Vbo } from './vao';
import { Program } from './program';

export class RenderContext {
  gl: WebGLRenderingContext;
  extInstancedArrays: ANGLE_instanced_arrays;
  extOesVao: OES_vertex_array_object;

  private boundVao: Vao;
  private boundVbo: Vbo;
  private boundProgram: Program;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.getExtensions(gl);
    this.boundVao = null;
    this.boundVbo = null;
    this.boundProgram = null;
  }

  bindVao(vao: Vao): boolean {
    if (this.boundVao === null || this.boundVao.id !== vao.id) {
      vao.bind();
      this.boundVao = vao;
      return true;
    } else {
      return false;
    }
  }

  bindVbo(vbo: Vbo): boolean {
    if (this.boundVbo === null || this.boundVbo.id !== vbo.id) {
      vbo.bind(this.gl);
      this.boundVbo = vbo;
      return true;
    } else {
      return false;
    }
  }

  useProgram(program: Program): boolean {
    if (this.boundProgram === null || this.boundProgram.id !== program.id) {
      program.use();
      this.boundProgram = program;
      return true;
    } else {
      return false;
    }
  }

  private getExtensions(gl: WebGLRenderingContext): void {
    const namesProperties: Array<{name: string, property: string}> = [
      {name: 'ANGLE_instanced_arrays', property: 'extInstancedArrays'},
      {name: 'OES_vertex_array_object', property: 'extOesVao'}
    ];

    const self = this;

    namesProperties.map(nameProp => {
      const ext = gl.getExtension(nameProp.name);

      if (!ext) {
        console.warn(`Missing extension: "${nameProp.name}".`);
      }

      (<any>self)[nameProp.property] = ext;
    });
  }
}