import { debug, Program, Vao, math, types, RenderContext, Vbo, geometry } from '../gl';
import { NumberSampler, asyncTimeout, loadAudioBufferSourceNode } from '../util';
import * as programSources from './shaders/particles';
import { mat4 } from 'gl-matrix';
import { gameUtil } from '.';

export class AirParticleResources {
  private loadTimeout: number;
  private noiseUrl: string;

  noiseSource: Float32Array;

  constructor(loadTimeout: number, noiseUrl: string) {
    this.loadTimeout = loadTimeout;
    this.noiseUrl = noiseUrl;
    this.noiseSource = new Float32Array(1);
  }

  async load(audioContext: AudioContext, errCb: (err: Error) => void): Promise<void> {
    try {
      const noiseSource = await asyncTimeout(() => loadAudioBufferSourceNode(audioContext, this.noiseUrl), this.loadTimeout);
      this.noiseSource = gameUtil.getBufferSourceNodeChannelData(noiseSource);
    } catch (err) {
      errCb(err);
    }
  }
}

export type AirParticleOptions = {
  numParticles: number,
  particleGridScale: number,
  particleScale: number
}

class AirParticleData {
  numParticles: number;

  noiseSamplers: Array<NumberSampler>;

  translations: Float32Array;
  offsets: Float32Array;
  rotations: Float32Array;
  alphas: Float32Array;
  alphaSigns: Float32Array;

  constructor(numParticles: number, xzScale: number, noiseSource: Float32Array) {
    const numParticles3 = numParticles * 3;

    const translations = new Float32Array(numParticles3);
    const offsets = new Float32Array(numParticles3);
    const rotations = new Float32Array(numParticles3);
    const alphas = new Float32Array(numParticles);
    const alphaSigns = new Float32Array(numParticles);

    for (let i = 0; i < numParticles; i++) {
      const offsetX = Math.random() * xzScale - xzScale/2;
      const offsetY = Math.random() * 4 + 2;
      const offsetZ = Math.random() * xzScale - xzScale;
      const ind3 = i * 3;

      offsets[ind3] = offsetX;
      offsets[ind3+1] = offsetY;
      offsets[ind3+2] = offsetZ;

      translations[ind3] = offsetX;
      translations[ind3+1] = offsetY;
      translations[ind3+2] = offsetZ;

      rotations[ind3] = Math.random() * Math.PI * 2;
      rotations[ind3+1] = Math.random() * Math.PI * 2;
      rotations[ind3+2] = 0;

      alphas[i] = 1;
      alphaSigns[i] = -1;
    }

    this.translations = translations;
    this.offsets = offsets;
    this.rotations = rotations;
    this.alphas = alphas;
    this.alphaSigns = alphaSigns;
    this.numParticles = numParticles;

    this.noiseSamplers = gameUtil.makeNormalizedRandomizedSamplers(numParticles, noiseSource);
  }

  update(dt: number, playerAabb: math.Aabb, normX: number, normZ: number) {
    const translations = this.translations;
    const offsets = this.offsets;
    const rotations = this.rotations;
    const alphas = this.alphas;
    const alphaSigns = this.alphaSigns;
    const numParticles = this.numParticles;
    const noiseSamplers = this.noiseSamplers;

    const dtRatio = math.dtSecRatio(dt);
    const sampleIncrement = math.dtSecSampleIncrement(dt);
    const dtFactor = Math.max(dtRatio, 1);

    const twoPi = Math.PI * 2;

    for (let i = 0; i < numParticles; i++) {
      const noiseSample = noiseSamplers[i].nthNextSample(sampleIncrement);
      const halfNoiseSample = noiseSample - 0.5;
      const ind3 = i * 3;

      translations[ind3+0] += (halfNoiseSample * 0.05 + 0.02) * normX * dtFactor;
      translations[ind3+1] += halfNoiseSample * 0.01 * dtFactor;
      translations[ind3+2] += (halfNoiseSample * 0.05 + 0.02) * normZ * dtFactor;

      alphas[i] += alphaSigns[i] * 0.01 * noiseSample * dtFactor;

      if (alphas[i] < 0) {
        alphas[i] = 0;
        alphaSigns[i] = 1;

        translations[ind3] = offsets[ind3] + playerAabb.midX();
        translations[ind3+1] = offsets[ind3+1] + playerAabb.minY;
        translations[ind3+2] = offsets[ind3+2] + playerAabb.midZ();

      } else if (alphas[i] > 1) {
        alphas[i] = 1;
        alphaSigns[i] = -1;
      }

      rotations[ind3] += 0.01 * noiseSample * 2 * dtFactor;
      rotations[ind3+1] += 0.005 * halfNoiseSample * dtFactor;

      for (let j = 0; j < 3; j++) {
        const rot = rotations[ind3 + j];

        if (rot > twoPi) {
          rotations[ind3+j] = 0;
        } else if (rot < 0) {
          rotations[ind3+j] = twoPi;
        }
      }
    }
  }
}

export class AirParticles {
  particleScale: number;
  particleColor: types.Real3;
  isPlaying: boolean;

  private options: AirParticleOptions;
  private airParticleData: AirParticleData;
  private drawable: types.Drawable;
  private noiseSource: Float32Array;
  private renderContext: RenderContext;
  private translationVbo: Vbo;
  private alphaVbo: Vbo;
  private rotationVbo: Vbo;
  private program: Program;
  private particleDirectionNormal: types.Real3;
  private isCreated: boolean;

  constructor(renderContext: RenderContext, noiseSource: Float32Array) {
    this.renderContext = renderContext;
    this.noiseSource = noiseSource;
    this.particleScale = 0.005;
    this.particleColor = [1, 1, 1];
    this.particleDirectionNormal = [0, 0, 1];
    this.isCreated = false;
    this.isPlaying = true;
  }

  togglePlaying(): void {
    this.isPlaying = !this.isPlaying;
  }

  setParticleDirection(direction: types.Real3): void {
    math.norm3(this.particleDirectionNormal, direction);
  }

  dispose(): void {
    if (!this.isCreated) {
      return;
    }

    this.drawable.vao.dispose();
    this.program.dispose();
    this.isCreated = false;
  }

  update(dt: number, playerAabb: math.Aabb): void {
    if (!this.isPlaying) {
      return;
    }

    if (!this.isCreated) {
      console.warn('Air particles not yet created.');
      return;
    }

    const gl = this.renderContext.gl;
    const translationVbo = this.translationVbo;
    const alphaVbo = this.alphaVbo;
    const rotVbo = this.rotationVbo;

    const normX = this.particleDirectionNormal[0];
    const normZ = this.particleDirectionNormal[2];

    this.airParticleData.update(dt, playerAabb, normX, normZ);

    translationVbo.bind(gl);
    translationVbo.subData(gl, this.airParticleData.translations);

    alphaVbo.bind(gl);
    alphaVbo.subData(gl, this.airParticleData.alphas);

    rotVbo.bind(gl);
    rotVbo.subData(gl, this.airParticleData.rotations);
  }

  create(options: AirParticleOptions): void {
    if (this.isCreated) {
      this.dispose();
    }

    this.options = Object.assign({}, options);
    this.particleScale = options.particleScale;

    const xzScale = options.particleGridScale;
    const numParticles = options.numParticles;
    const gl = this.renderContext.gl;

    this.program = Program.fromSources(gl, programSources.vertex, programSources.fragment);

    const positions = geometry.quadPositions();
    const indices = geometry.quadIndices();

    const airParticleData = new AirParticleData(numParticles, xzScale, this.noiseSource);
    const translations = airParticleData.translations;
    const rotations = airParticleData.rotations;
    const alphas = airParticleData.alphas;
    
    const vboDescriptors = [
      {name: 'position', attributes: [types.makeAttribute('a_position', gl.FLOAT, 3, 0)], data: positions},
      {name: 'translation', attributes: [types.makeAttribute('a_translation', gl.FLOAT, 3, 1)], data: translations},
      {name: 'rotation', attributes: [types.makeAttribute('a_rotation', gl.FLOAT, 3, 1)], data: rotations},
      {name: 'alpha', attributes: [types.makeAttribute('a_alpha', gl.FLOAT, 1, 1)], data: alphas},
    ];

    const eboDescriptor = {name: 'indices', indices};
    const vao = Vao.fromDescriptors(gl, this.program, vboDescriptors, eboDescriptor);

    const drawable = new types.Drawable(this.renderContext, vao, (rc, drawable) => {
      const ext = rc.extInstancedArrays;
      const mode = drawable.mode;
      const count = drawable.count;
      const offset = drawable.offset;
      const type = drawable.type;
      const numActiveInstances = drawable.numActiveInstances;

      ext.drawElementsInstancedANGLE(mode, count, type, offset, numActiveInstances);
    });

    drawable.mode = gl.TRIANGLES;
    drawable.count = indices.length;
    drawable.type = gl.UNSIGNED_SHORT;
    drawable.offset = 0;
    drawable.numActiveInstances = numParticles;
    drawable.isInstanced = true;

    this.drawable = drawable;

    this.translationVbo = vao.getVbo('translation');
    this.alphaVbo = vao.getVbo('alpha');
    this.rotationVbo = vao.getVbo('rotation');

    this.airParticleData = airParticleData;

    this.isCreated = true;
  }

  draw(cameraPosition: types.Real3, view: mat4, proj: mat4, sunPosition: types.Real3, sunColor: types.Real3): void {
    if (!this.isCreated) {
      console.warn('Air particles not yet created.');
      return;
    }

    const drawable = this.drawable;
    const prog = this.program;
    const renderContext = this.renderContext;
    const gl = renderContext.gl;

    renderContext.useProgram(prog);
    debug.setViewProjection(prog, view, proj);
    renderContext.bindVao(drawable.vao);

    const sz = this.particleScale;

    prog.set3f('scaling', sz, sz, sz);
    prog.setVec3('sun_position', sunPosition);
    prog.setVec3('sun_color', sunColor);

    prog.setVec3('camera_position', cameraPosition);
    prog.setVec3('color', this.particleColor);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);

    drawable.draw();
  }
}