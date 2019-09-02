import { Vao, Vbo } from './vao';
import { Program } from './program';
import { Texture2D } from './texture';

export class RenderContext {
  gl: WebGLRenderingContext;
  extInstancedArrays: ANGLE_instanced_arrays;
  extOesVao: OES_vertex_array_object;
  extOesTextureFloat: OES_texture_float;

  private boundVao: Vao;
  private boundVbo: Vbo;
  private boundProgram: Program;
  private boundTexture2D: Texture2D;
  private numActiveTextures: number;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.getExtensions(gl);
    this.boundVao = null;
    this.boundVbo = null;
    this.boundProgram = null;
    this.boundTexture2D = null;
    this.numActiveTextures = 0;
  }

  pushActiveTexture2DAndBind(tex: Texture2D): boolean {
    if (!this.isBoundTexture2D(tex)) {
      tex.index = this.numActiveTextures++;
      tex.activateAndBind();
      this.boundTexture2D = tex;
      return true;
    } else {
      return false;
    }
  }

  popTexture2D(): void {
    this.numActiveTextures--;
  }

  private isBoundTexture2D(tex: Texture2D): boolean {
    return this.boundTexture2D !== null && this.boundTexture2D.id === tex.id;
  }

  bindTexture2D(tex: Texture2D): boolean {
    if (!this.isBoundTexture2D(tex)) {
      tex.bind();
      this.boundTexture2D = tex;
      return true;
    } else {
      return false;
    }
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
      {name: 'OES_vertex_array_object', property: 'extOesVao'},
      {name: 'OES_texture_float', property: 'extOesTextureFloat'}
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