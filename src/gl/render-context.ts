export class RenderContext {
  public gl: WebGLRenderingContext;
  public extInstancedArrays: ANGLE_instanced_arrays;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.getExtensions();
  }

  private getExtensions(): void {
    const gl = this.gl;

    const extName = 'ANGLE_instanced_arrays';
    const extInstancedArrays = gl.getExtension(extName);
    if (!extInstancedArrays) {
      console.warn(`Missing extension: "${extName}".`);
    }

    this.extInstancedArrays = extInstancedArrays;
  }
}