import { Material, Texture2D, Model, RenderContext, types, Renderer, factory } from '../gl';
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
  modelColorTexture: Texture2D;

  private isCreated: boolean;

  constructor() {
    this.model = null;
    this.modelColorTexture = null;
    this.isCreated = false;
  }

  dispose(): void {
    if (this.isCreated) {
      this.model.drawable.vao.dispose();
      this.model = null;
      this.modelColorTexture = null;
    }
    this.isCreated = false;
  }

  create(renderer: Renderer, renderContext: RenderContext, resources: SkyDomeResources): void {
    if (this.isCreated) {
      this.dispose();
    }

    const gl = renderContext.gl;
    const mat = Material.NoLight();

    if (resources.skyImage) {
      const modelColorTexture = makeSkyTexture(gl, resources.skyImage);
      mat.setUniformProperty('modelColor', modelColorTexture);
      this.modelColorTexture = modelColorTexture;
    } else {
      mat.setUniformProperty('modelColor', [1, 1, 1]);
    }
  
    const prog = renderer.requireProgram(mat);
    mat.removeUnusedUniforms(prog);

    const vaoResult = factory.vao.makeSphereVao(renderContext.gl, prog);
    const drawable = types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
    drawable.mode = vaoResult.drawMode;
    const model = new Model(drawable, mat);

    this.model = model;
  }
}