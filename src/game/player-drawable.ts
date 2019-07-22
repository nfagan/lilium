import { math, RenderContext, factory, Program, Material, Renderer, types, ICamera, Scene, Texture2D } from '../gl';
import { asyncTimeout, loadUint8Buffer } from '../util';
import { mat4 } from 'gl-matrix';

export class PlayerDrawableResources {
  private perlinNoiseUrl: string;
  private loadTimeoutMs: number;

  perlinNoise: Uint8Array;

  constructor(perlinNoiseUrl: string, loadTimeoutMs: number) {
    this.perlinNoiseUrl = perlinNoiseUrl;
    this.perlinNoise = new Uint8Array(1);
    this.loadTimeoutMs = loadTimeoutMs;
  }

  async load(cb: (err: Error) => void): Promise<void> {
    try {
      const noise = await asyncTimeout(() => loadUint8Buffer(this.perlinNoiseUrl), this.loadTimeoutMs);
      this.perlinNoise = noise;
    } catch (err) {
      cb(err);
    }
  }
}

function makePerlinNoiseTexture(gl: WebGLRenderingContext, bytes: Uint8Array): Texture2D {
  const numBytes = bytes.length;
  const imageDimension = Math.sqrt(numBytes);

  if (!math.isPow2(imageDimension)) {
    console.warn('Size of noise image must be power of 2.');
  }

  const repeated = new Uint8Array(numBytes * 4);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < numBytes; j++) {
      repeated[i*numBytes+j] = bytes[j];
    }
  }
  
  const tex = new Texture2D(gl);
  tex.wrapS = gl.CLAMP_TO_EDGE;
  tex.wrapT = gl.CLAMP_TO_EDGE;
  tex.minFilter = gl.LINEAR;
  tex.magFilter = gl.LINEAR;
  tex.internalFormat = gl.RGBA;
  tex.srcFormat = gl.RGBA;
  tex.level = 0;
  tex.border = 0;
  tex.srcType = gl.UNSIGNED_BYTE;
  tex.width = imageDimension;
  tex.height = imageDimension;

  tex.bindAndConfigure();
  tex.fillImage(repeated);

  return tex;
}

export class PlayerDrawable {
  isPlaying: boolean;

  private renderContext: RenderContext;
  private renderer: Renderer;
  private program: Program;
  private isCreated: boolean;
  private drawable: types.Drawable;
  private material: Material;
  private tmpMat4: mat4;
  private identifiers: types.ShaderIdentifierMap;

  constructor(renderContext: RenderContext, renderer: Renderer) {
    this.renderer = renderer;
    this.renderContext = renderContext;
    this.isCreated = false;
    this.drawable = null;
    this.program = null;
    this.tmpMat4 = mat4.create();
    this.material = this.makeMaterial();
    this.identifiers = types.DefaultShaderIdentifiers;
    this.isPlaying = true;
  }

  private makeMaterial(): Material {
    const mat = Material.NoLight();
    return mat
  }

  private makeProgram(mat: Material): Program {
    const prog = this.renderer.requireProgram(mat);
    return prog;
  }

  private makeDrawable(prog: Program): types.Drawable {
    const vaoResult = factory.vao.makeSphereVao(this.renderContext.gl, prog);
    const drawable = types.Drawable.indexed(this.renderContext, vaoResult.vao, vaoResult.numIndices);
    drawable.mode = vaoResult.drawMode;
    return drawable;
  }

  togglePlaying(): void {
    this.isPlaying = !this.isPlaying;
  }

  dispose(): void {
    if (this.isCreated) {
      //  Don't delete program, because it's owned by the renderer
      this.drawable.vao.dispose();

      this.program = null;
      this.drawable = null;
      this.isCreated = false;
    }
  }

  create(resources: PlayerDrawableResources): void {
    if (this.isCreated) {
      this.dispose();
    }

    // const tex = makePerlinNoiseTexture(this.renderContext.gl, resources.perlinNoise);
    // this.material.setUniformProperty('modelColor', tex);

    const prog = this.makeProgram(this.material);
    const drawable = this.makeDrawable(prog);

    this.drawable = drawable;
    this.program = prog;
    this.isCreated = true;
  }

  update(aabb: math.Aabb): void {
    if (!this.isCreated || !this.isPlaying) {
      return;
    }

    const midX = aabb.midX();
    const midY = aabb.midY();
    const midZ = aabb.midZ();

    const w = aabb.width();
    const h = aabb.height();
    const d = aabb.depth();
    
    mat4.identity(this.tmpMat4);

    const heightT = Math.sin(performance.now()/600);
    const heightFactor = heightT * heightT * heightT * heightT * 0.2 + 0.2;
    // const heightFactor = heightT * 0.2 + 0.2;

    this.tmpMat4[0] = w/2 * heightFactor + 0.5;
    this.tmpMat4[5] = h/2;
    this.tmpMat4[10] = d/2 * heightFactor + 0.5;

    this.tmpMat4[12] = midX;
    this.tmpMat4[13] = midY + heightFactor;
    this.tmpMat4[14] = midZ;
  }

  draw(view: mat4, proj: mat4, camera: ICamera, scene: Scene): void {
    if (!this.isCreated) {
      return;
    }

    const prog = this.renderer.requireProgram(this.material);

    this.renderContext.useProgram(prog);
    this.renderer.setTextures(this.material);

    this.material.setUniforms(prog);
    this.renderer.setModelViewProjection(prog, this.tmpMat4, view, proj);

    if (this.material.descriptor.lightingModel !== types.LightingModel.None) {
      this.renderer.setLightUniforms(prog, scene.lights, camera);
      mat4.invert(mat4.transpose(this.tmpMat4, this.tmpMat4), this.tmpMat4);
      prog.setMat4(this.identifiers.uniforms.inverseTransposeModel, this.tmpMat4)
    }

    this.renderContext.bindVao(this.drawable.vao);
    this.drawable.draw();
    this.material.clearIsNewSchema();

    this.renderer.unsetTextures(this.material);
  }
}