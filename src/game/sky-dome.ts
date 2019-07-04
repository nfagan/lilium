import { Material, Texture2D, Model, RenderContext, types, geometry, Vao, Renderer } from '../gl';
import { asyncTimeout, loadImage } from '../util';

export class SkyDomeResources {
  private skyImageUrl: string;
  private loadTimeout: number;

  skyImage: HTMLImageElement;

  constructor(textureUrl: string, loadTimeout: number) {
    this.skyImageUrl = textureUrl;
    this.loadTimeout = loadTimeout;
    this.skyImage = null;
  }

  async load(cb: (err: Error) => void): Promise<void> {
    const textureUrl = this.skyImageUrl;

    try {
      const skyImage = await asyncTimeout(() => loadImage(textureUrl), this.loadTimeout);
      this.skyImage = skyImage;
    } catch (err) {
      cb(err);
    }
  }
}

function makeSkyTexture(gl: WebGLRenderingContext, img: HTMLImageElement): Texture2D {
  const tex = Texture2D.linearRepeatRGBA(gl);

  tex.width = img.width;
  tex.height = img.height;

  tex.bindAndConfigure();
  tex.fillImageElement(img);

  return tex;
}

export class SkyDomeDrawable {
  model: Model;

  private isCreated: boolean;

  constructor() {
    this.model = null;
    this.isCreated = false;
  }

  dispose(): void {
    if (this.isCreated) {
      this.model.drawable.vao.dispose();
      this.model = null;
    }
    this.isCreated = false;
  }

  create(renderer: Renderer, renderContext: RenderContext, resources: SkyDomeResources): void {
    if (this.isCreated) {
      this.dispose();
    }

    const gl = renderContext.gl;  
    const sphereData = geometry.sphereInterleavedDataAndIndices();  
    const mat = Material.NoLight();

    if (resources.skyImage) {
      mat.setUniformProperty('modelColor', makeSkyTexture(gl, resources.skyImage));
    } else {
      mat.setUniformProperty('modelColor', [1, 1, 1]);
    }
  
    const prog = renderer.requireProgram(mat);
    mat.removeUnusedUniforms(prog);

    const attrs = [types.BuiltinAttribute.Position, types.BuiltinAttribute.Uv, types.BuiltinAttribute.Normal];
    const vao = Vao.fromSimpleInterleavedFloatData(gl, prog, sphereData.vertexData, attrs, sphereData.indices);

    const drawable = types.Drawable.indexed(renderContext, vao, sphereData.indices.length);
    drawable.mode = gl.TRIANGLE_STRIP;
    const model = new Model(drawable, mat);

    this.model = model;
  }
}