import { debug, Program, Vao, math, types, RenderContext, Vbo, geometry } from '../gl';
import { NumberSampler, asyncTimeout, loadAudioBufferSourceNode } from '../util';
import * as programSources from './shaders/particles';
import * as wasm from './wasm/air-particles';
import * as wasmUtil from './wasm/util';
import { mat4 } from 'gl-matrix';
import { gameUtil } from '.';

export class AirParticleResources {
  private loadTimeout: number;
  private noiseUrl: string;
  private moduleMemory: WebAssembly.Memory;

  noiseSource: Float32Array;
  wasmModule: wasm.AirParticlesModule;

  constructor(loadTimeout: number, noiseUrl: string, moduleMemory: WebAssembly.Memory) {
    this.loadTimeout = loadTimeout;
    this.noiseUrl = noiseUrl;
    this.noiseSource = new Float32Array(1);
    this.moduleMemory = moduleMemory;
    this.wasmModule = null;
  }

  private async tryLoadModule(errCb: (err: Error) => void): Promise<void> {
    let mod: wasm.AirParticlesModule = null;

    try {
      mod = await asyncTimeout(() => wasm.loadModule(this.moduleMemory), this.loadTimeout);
    } catch (err) {
      errCb(err);
    }

    this.wasmModule = mod;
  }

  private async tryLoadNoise(audioContext: AudioContext, errCb: (err: Error) => void): Promise<void> {
    try {
      const noiseSource = await asyncTimeout(() => loadAudioBufferSourceNode(audioContext, this.noiseUrl), this.loadTimeout);
      this.noiseSource = gameUtil.getBufferSourceNodeChannelData(noiseSource);
    } catch (err) {
      errCb(err);
    }
  }

  async load(audioContext: AudioContext, errCb: (err: Error) => void): Promise<void> {
    await this.tryLoadNoise(audioContext, errCb);
    await this.tryLoadModule(errCb);
  }
}

export type AirParticleOptions = {
  numParticles: number,
  particleGridScale: number,
  particleScale: number,
  tryUseWasm: boolean
}

class AirParticleData {
  private numNoiseSamples: number;
  numParticles: number;

  noiseSamplers: Array<NumberSampler>;

  translations: Float32Array;
  offsets: Float32Array;
  rotations: Float32Array;
  alphas: Float32Array;
  alphaSigns: Float32Array;

  private noiseIndices: Int32Array;
  private playerPosition: Float32Array;

  private translationsPtr: number;
  private offsetsPtr: number;
  private rotationsPtr: number;
  private alphasPtr: number;
  private alphaSignsPtr: number;
  private noiseSourcePtr: number;
  private noiseIndicesPtr: number;
  private playerPositionPtr: number;

  private isCreated: boolean;
  private isWasm: boolean;
  private module: wasm.AirParticlesModule;

  constructor() {
    this.isCreated = false;
    this.isWasm = false;
  }

  create(isWasm: boolean, wasmModule: wasm.AirParticlesModule, numParticles: number, xzScale: number, noiseSource: Float32Array): void {
    if (this.isCreated) {
      this.dispose();
    }

    this.isWasm = isWasm;
    this.module = wasmModule;
    this.numParticles = numParticles;
    this.numNoiseSamples = noiseSource.length;

    if (this.isWasm) {
      this.createWasm(xzScale, noiseSource);
    } else {
      this.createJs(xzScale, noiseSource);
    }

    this.isCreated = true;
  }

  dispose(): void {
    if (this.isCreated) {
      if (this.isWasm) {
        this.disposeWasm();
      } else {
        this.disposeJs();
      }

      this.isCreated = false;
    }
  }

  private nullifyArrays(): void {
    this.translations = null;
    this.offsets = null;
    this.rotations = null;
    this.alphas = null;
    this.alphaSigns = null;
  }

  private disposeJs(): void {
    this.nullifyArrays();
  }

  private disposeWasm(): void {
    this.module._lilium_free_float_array(this.translationsPtr);
    this.module._lilium_free_float_array(this.offsetsPtr);
    this.module._lilium_free_float_array(this.rotationsPtr);
    this.module._lilium_free_float_array(this.alphasPtr);
    this.module._lilium_free_float_array(this.alphaSignsPtr);
    this.module._lilium_free_float_array(this.noiseSourcePtr);
    this.module._lilium_free_int32_array(this.noiseIndicesPtr);
    this.module._lilium_free_float_array(this.playerPositionPtr);

    this.nullifyArrays();
  }

  private initialize(numParticles: number, xzScale: number): void {
    for (let i = 0; i < numParticles; i++) {
      const offsetX = Math.random() * xzScale - xzScale/2;
      const offsetY = Math.random() * 4 + 2;
      const offsetZ = Math.random() * xzScale - xzScale;
      const ind3 = i * 3;

      this.offsets[ind3] = offsetX;
      this.offsets[ind3+1] = offsetY;
      this.offsets[ind3+2] = offsetZ;

      this.translations[ind3] = offsetX;
      this.translations[ind3+1] = offsetY;
      this.translations[ind3+2] = offsetZ;

      this.rotations[ind3] = Math.random() * Math.PI * 2;
      this.rotations[ind3+1] = Math.random() * Math.PI * 2;
      this.rotations[ind3+2] = 0;

      this.alphas[i] = 1;
      this.alphaSigns[i] = -1;
    }
  }

  private expectedToExceedWasmMemory(numParticles: number, noiseSource: Float32Array): boolean {
    const translationBytes = numParticles * 3 * 4;
    const offsetBytes = numParticles * 3 * 4;
    const rotationBytes = numParticles * 3 * 4;
    const alphaBytes = numParticles * 4;
    const alphaSignBytes = numParticles * 4;
    const noiseIndicesBytes = numParticles * 4;
    const noiseBytes = noiseSource.length * 4;
    const prospectiveUsage = translationBytes + offsetBytes + rotationBytes + alphaBytes + alphaSignBytes + noiseIndicesBytes + noiseBytes;

    return prospectiveUsage > this.module.wasmMemory.buffer.byteLength;
  }

  private createWasm(xzScale: number, noiseSource: Float32Array): void {
    const mod = this.module;
    const numParticles = this.numParticles;

    if (!mod) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('was module was null.');
      }
      this.createJs(xzScale, noiseSource);
      return; 
    }

    if (this.expectedToExceedWasmMemory(numParticles, noiseSource)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Insufficient memory for wasm implementation.');
      }
      this.createJs(xzScale, noiseSource);
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Using wasm implementation.');
    }

    this.translationsPtr = mod._lilium_new_float_array(numParticles * 3);
    this.offsetsPtr = mod._lilium_new_float_array(numParticles * 3);
    this.rotationsPtr = mod._lilium_new_float_array(numParticles * 3);
    this.alphasPtr = mod._lilium_new_float_array(numParticles);
    this.alphaSignsPtr = mod._lilium_new_float_array(numParticles);
    this.noiseIndicesPtr = mod._lilium_new_int32_array(numParticles);
    this.noiseSourcePtr = mod._lilium_new_float_array(noiseSource.length);
    this.playerPositionPtr = mod._lilium_new_float_array(3);

    const memory = mod.wasmMemory;

    this.translations = wasmUtil.makeFloat32Array(memory, this.translationsPtr, numParticles * 3);
    this.offsets = wasmUtil.makeFloat32Array(memory, this.offsetsPtr, numParticles * 3);
    this.rotations = wasmUtil.makeFloat32Array(memory, this.rotationsPtr, numParticles * 3);
    this.alphas = wasmUtil.makeFloat32Array(memory, this.alphasPtr, numParticles);
    this.alphaSigns = wasmUtil.makeFloat32Array(memory, this.alphaSignsPtr, numParticles);
    this.noiseIndices = wasmUtil.makeInt32Array(memory, this.noiseIndicesPtr, numParticles);
    this.playerPosition = wasmUtil.makeFloat32Array(memory, this.playerPositionPtr, 3);

    const wasmNoiseSource = wasmUtil.makeFloat32Array(memory, this.noiseSourcePtr, noiseSource.length);
    wasmNoiseSource.set(noiseSource);
    math.normalize01(wasmNoiseSource, wasmNoiseSource);

    gameUtil.makeRandomizedIndices(this.noiseIndices, noiseSource.length);

    this.initialize(numParticles, xzScale);
  }

  private createJs(xzScale: number, noiseSource: Float32Array): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('Using js implementation.');
    }

    const numParticles = this.numParticles;
    const numParticles3 = numParticles * 3;

    this.translations = new Float32Array(numParticles3);
    this.offsets = new Float32Array(numParticles3);
    this.rotations = new Float32Array(numParticles3);
    this.alphas = new Float32Array(numParticles);
    this.alphaSigns = new Float32Array(numParticles);
    this.noiseSamplers = gameUtil.makeNormalizedRandomizedSamplers(numParticles, noiseSource);

    this.initialize(numParticles, xzScale);
  }

  update(dt: number, playerAabb: math.Aabb, normX: number, normZ: number): void {
    if (this.isWasm) {
      this.updateWasm(dt, playerAabb, normX, normZ);
    } else {
      this.updateJs(dt, playerAabb, normX, normZ);
    }
  }

  private updateWasm(dt: number, playerAabb: math.Aabb, normX: number, normZ: number): void {
    const tp = this.translationsPtr;
    const op = this.offsetsPtr;
    const rp = this.rotationsPtr;
    const ap = this.alphasPtr;
    const asp = this.alphaSignsPtr;
    const numParticles = this.numParticles;
    const np = this.noiseSourcePtr;
    const nip = this.noiseIndicesPtr;
    const numNoiseSamples = this.numNoiseSamples;
    
    const dtRatio = math.dtSecRatio(dt);
    const dtFactor = Math.max(dtRatio, 1);

    const playerPosition = this.playerPosition;
    const pp = this.playerPositionPtr;

    playerPosition[0] = playerAabb.midX();
    playerPosition[1] = playerAabb.minY;
    playerPosition[2] = playerAabb.midZ();

    this.module._update(tp, op, rp, ap, asp, numParticles, np, nip, numNoiseSamples, normX, normZ, dtFactor, pp);
  }

  private updateJs(dt: number, playerAabb: math.Aabb, normX: number, normZ: number): void {
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
  private wasmModule: wasm.AirParticlesModule;
  private renderContext: RenderContext;
  private translationVbo: Vbo;
  private alphaVbo: Vbo;
  private rotationVbo: Vbo;
  private program: Program;
  private particleDirectionNormal: types.Real3;
  private isCreated: boolean;

  constructor(renderContext: RenderContext, noiseSource: Float32Array, wasmModule: wasm.AirParticlesModule) {
    this.renderContext = renderContext;
    this.noiseSource = noiseSource;
    this.wasmModule = wasmModule;
    this.particleScale = 0.005;
    this.particleColor = [1, 1, 1];
    this.particleDirectionNormal = [0, 0, 1];
    this.airParticleData = new AirParticleData();
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
    this.airParticleData.dispose();
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

    const airParticleData = this.airParticleData;
    airParticleData.create(options.tryUseWasm, this.wasmModule, numParticles, xzScale, this.noiseSource);

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