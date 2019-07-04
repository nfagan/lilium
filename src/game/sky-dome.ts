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
  const tex = new Texture2D(gl);

  tex.minFilter = gl.LINEAR;
  tex.magFilter = gl.LINEAR;
  tex.wrapS = gl.REPEAT;
  tex.wrapT = gl.REPEAT;
  tex.internalFormat = gl.RGBA;
  tex.srcFormat = gl.RGBA;
  tex.srcType = gl.UNSIGNED_BYTE;
  tex.level = 0;
  tex.border = 0;

  tex.width = img.width;
  tex.height = img.height;

  tex.bind();
  tex.configure();
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

    const attrs = [
      types.makeFloat3Attribute(gl, types.DefaultShaderIdentifiers.attributes.position),
      types.makeFloat2Attribute(gl, types.DefaultShaderIdentifiers.attributes.uv),
      types.makeFloat3Attribute(gl, types.DefaultShaderIdentifiers.attributes.normal),
    ];
  
    const sphereData = geometry.sphereInterleavedDataAndIndices();
    const vboDescriptor = types.makeAnonymousVboDescriptor(attrs, sphereData.vertexData)
    const eboDescriptor = types.makeAnonymousEboDescriptor(sphereData.indices);
  
    const mat = Material.NoLight();

    if (resources.skyImage) {
      const tex = makeSkyTexture(gl, resources.skyImage);
      mat.setUniformProperty('modelColor', tex);
    } else {
      mat.setUniformProperty('modelColor', [1, 1, 1]);
    }
  
    const prog = renderer.requireProgram(mat);
    const vao = Vao.fromDescriptors(gl, prog, [vboDescriptor], eboDescriptor);
  
    mat.removeUnusedUniforms(prog);
  
    const drawable = types.Drawable.fromProperties(renderContext, vao, types.DrawFunctions.indexed);
    drawable.mode = gl.TRIANGLE_STRIP;
    drawable.count = eboDescriptor.indices.length;
  
    const model = new Model(drawable, mat);

    this.model = model;
  }
}