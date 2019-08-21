import { Texture2D, math, debug, RenderContext, types, Vao, Program, ICamera } from '../gl';
import { asyncTimeout, loadAudioBufferSourceNode } from '../util';
import * as gameUtil from './util';
import * as grassProgramSources from './shaders/grass';
import * as wasm from './wasm';
import { mat4 } from 'gl-matrix';

export type GrassTile = {
  density: number,
  dimension: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number
};

export type GrassTextureOptions = {
  textureSize: number,
  tryUseWasm: boolean
};

class GrassTextureData {
  windPtr: number;
  velocityPtr: number;
  noisePtr: number;
  indicesPtr: number;

  wind: Uint8Array;
  velocity: Uint8Array;
  noise: Uint8Array;
  indices: Int32Array;

  private module: wasm.grass.GrassModule;
  private isCreated: boolean;
  private isWasm: boolean;

  private textureSize: number;
  private numPixels: number;
  private numNoiseSamples: number;
  private noiseSource: Float32Array;

  constructor(mod: wasm.grass.GrassModule) {
    this.module = mod;
    this.isCreated = false;
  }

  isJs(): boolean {
    return !this.isWasm;
  }

  updateWindWasm(windVx: number, windVz: number, decayAmt: number): void {
    const windPtr = this.windPtr;
    const velPtr = this.velocityPtr;
    const noisePtr = this.noisePtr;
    const indicesPtr = this.indicesPtr;
    const numPixels = this.numPixels;
    const numSamples = this.numNoiseSamples;

    this.module._fast_grass_update_wind(windPtr, velPtr, noisePtr, indicesPtr, numPixels, numSamples, windVx, windVz, decayAmt);
  }

  updateVelocityDisplacementWasm(playerAabb: math.Aabb, offsetX: number, offsetY: number, offsetZ: number, scaleX: number, scaleZ: number, bladeHeight: number, maxDim: number): void {
    const velPtr = this.velocityPtr;
    const textureSize = this.textureSize;

    const playerX = playerAabb.midX() - offsetX;
    const playerY = playerAabb.minY - offsetY;
    const playerZ = playerAabb.midZ() - offsetZ;
    const playerWidth = playerAabb.width();
    const playerDepth = playerAabb.depth();

    this.module._fast_grass_update_velocity_displacement(velPtr, textureSize, playerX, playerY, playerZ, playerWidth, playerDepth, scaleX, scaleZ, maxDim, bladeHeight);
  }

  create(isWasm: boolean, noiseSource: Float32Array, textureSize: number): void {
    if (this.isCreated) {
      this.dispose();
    }

    this.isWasm = isWasm;
    this.noiseSource = noiseSource;
    this.textureSize = textureSize;
    this.numPixels = textureSize * textureSize;
    this.numNoiseSamples = noiseSource.length;

    if (this.isWasm) {
      this.createWasm();
    } else {
      this.createJs();
    }

    this.isCreated = true;
  }

  private checkMemory(): boolean {
    const numBytes = this.module.wasmMemory.buffer.byteLength;
    const windBytes = this.numPixels * 4;
    const velBytes = this.numPixels * 4;
    const noiseBytes = this.noiseSource.length;
    const indicesBytes = this.numPixels * 4;  //  4 bytes for int32
    
    const prospectiveUsage = windBytes + velBytes + noiseBytes + indicesBytes;
    return prospectiveUsage > numBytes;
  }

  private createWasm(): void {
    console.log('Attempting to use wasm implementation.');

    const mod = this.module;
    const numPixels = this.numPixels;
    const numNoiseSamples = this.noiseSource.length;
    let message: string;
    let canCreate = false;

    if (!mod) {
      message = 'wasm module was null. Falling back to js implementation.'
    } else if (this.checkMemory()) {
      message = 'Insufficient memory to create wasm buffers. Falling back to js implementation.';
    } else {
      message = 'Using wasm implementation.';
      canCreate = true;
    }

    if (!canCreate) {
      console.warn(message);
      this.createJs();
      return;
    } else {
      console.log(message);
    }

    this.windPtr = mod._fast_grass_new_uint8_array(numPixels*4);
    this.velocityPtr = mod._fast_grass_new_uint8_array(numPixels*4);
    this.noisePtr = mod._fast_grass_new_uint8_array(numNoiseSamples);
    this.indicesPtr = mod._fast_grass_new_int32_array(numPixels);

    this.wind = wasm.util.makeUint8Array(mod.wasmMemory, this.windPtr, numPixels*4);
    this.velocity = wasm.util.makeUint8Array(mod.wasmMemory, this.velocityPtr, numPixels*4);
    this.noise = wasm.util.makeUint8Array(mod.wasmMemory, this.noisePtr, numNoiseSamples);
    this.indices = wasm.util.makeInt32Array(mod.wasmMemory, this.indicesPtr, numPixels);

    gameUtil.makeRandomizedIndices(this.indices, numNoiseSamples);

    this.floatNoiseToUint8Noise();

    this.module = mod;
    this.isCreated = true;
    this.isWasm = true;
  }

  private createJs(): void {
    console.log('Using js implementation.');

    this.wind = makeUint8TextureData(this.textureSize, 4);
    this.velocity = makeUint8TextureData(this.textureSize, 4);
    this.noise = new Uint8Array(this.noiseSource.length);

    this.floatNoiseToUint8Noise();

    this.isCreated = true;
    this.isWasm = false;
  }

  private floatNoiseToUint8Noise(): void {
    for (let i = 0; i < this.noiseSource.length; i++) {
      this.noise[i] = this.noiseSource[i] * 255;
    }
  }

  dispose(): void {
    if (this.isWasm) {
      this.disposeWasm();
    } else {
      this.disposeJs();
    }
  }

  private nullifyArrays(): void {
    this.wind = null;
    this.velocity = null;
    this.noise = null;
    this.indices = null;
  }

  private disposeJs(): void {
    this.nullifyArrays();
    this.isCreated = false;
  }

  private disposeWasm(): void {
    if (this.isCreated) {
      this.module._fast_grass_free_uint8_array(this.windPtr);
      this.module._fast_grass_free_uint8_array(this.velocityPtr);
      this.module._fast_grass_free_uint8_array(this.noisePtr);
      this.module._fast_grass_free_int32_array(this.indicesPtr);

      this.nullifyArrays();

      this.isCreated = false;
    }
  }
}

export class GrassTextureManager {
  private gl: WebGLRenderingContext;
  private textureSize: number;
  private isCreated: boolean;
  private windNoiseSource: Float32Array;
  private windNoiseIndices: Uint32Array;
  private grassData: GrassTextureData;

  velocityTexture: Texture2D;
  windTexture: Texture2D;
  grassTileInfo: GrassTile;

  offsetX: number;
  offsetY: number;
  offsetZ: number;

  decayAmount: number;
  windVx: number;
  windVz: number;

  constructor(gl: WebGLRenderingContext, grassTileInfo: GrassTile, windNoiseSource: Float32Array, grassData: GrassTextureData) {
    this.gl = gl;
    this.grassTileInfo = grassTileInfo;
    this.offsetX = grassTileInfo.offsetX;
    this.offsetY = grassTileInfo.offsetY;
    this.offsetZ = grassTileInfo.offsetZ;
    this.windVx = 0.2;
    this.windVz = 0.05;
    this.decayAmount = 1.1;
    this.windNoiseSource = windNoiseSource;
    this.grassData = grassData;
    this.isCreated = false;
  }

  dispose(): void {
    if (this.isCreated) {
      this.velocityTexture.dispose();
      this.windTexture.dispose();
      this.grassData.dispose();
      this.isCreated = false;
    }
  }

  create(options: GrassTextureOptions): void {
    if (this.isCreated) {
      this.dispose();
    }

    const textureSize = options.textureSize;
    const useWasm = options.tryUseWasm;

    math.normalize01(this.windNoiseSource, this.windNoiseSource);

    this.grassData.create(useWasm, this.windNoiseSource, textureSize);

    this.makeTextures(this.gl, textureSize);
    this.textureSize = textureSize;
    this.windNoiseIndices = new Uint32Array(this.windNoiseSource.length);
    this.makeWindNoiseIndices();

    this.isCreated = true;
  }

  private makeWindNoiseIndices(): void {
    gameUtil.makeRandomizedIndices(this.windNoiseIndices, this.windNoiseSource.length);
  }

  private makeTextures(gl: WebGLRenderingContext, textureSize: number): void {
    // const windTextureData = makeUint8TextureData(textureSize, 4);
    // const velocityTextureData = makeUint8TextureData(textureSize, 4);
    const windTextureData = this.grassData.wind;
    const velocityTextureData = this.grassData.velocity;

    const velocityTexture = makeVelocityTexture(gl, velocityTextureData, textureSize);
    const windTexture = makeWindTexture(gl, windTextureData, textureSize);

    this.velocityTexture = velocityTexture;
    this.windTexture = windTexture;
  }

  updateWasm(dt: number, playerAabb: math.Aabb, scaleX: number, scaleZ: number, bladeHeight: number): void {
    if (this.grassData.isJs()) {
      this.update(dt, playerAabb, scaleX, scaleZ, bladeHeight);
      return;
    }

    const dtScaleRatio = Math.max(math.dtSecRatio(dt), 1);

    const windVx = this.windVx;
    const windVz = this.windVz;
    const decayAmt = this.decayAmount * dtScaleRatio;
    const maxDim = this.grassTileInfo.dimension * this.grassTileInfo.density;

    this.grassData.updateWindWasm(windVx, windVz, decayAmt);
    this.grassData.updateVelocityDisplacementWasm(playerAabb, this.offsetX, this.offsetY, this.offsetZ, scaleX, scaleZ, bladeHeight, maxDim);

    this.velocityTexture.bind();
    this.velocityTexture.subImage(this.grassData.velocity);

    this.windTexture.bind();
    this.windTexture.subImage(this.grassData.wind);
  }

  update(dt: number, playerAabb: math.Aabb, scaleX: number, scaleZ: number, bladeHeight: number): void {
    if (!this.isCreated) {
      console.warn('Grass textures not yet created.');
      return;
    }

    const grassTileInfo = this.grassTileInfo;
    const windTexture = this.windTexture;
    const velocityTexture = this.velocityTexture;
    const windNoiseSource = this.windNoiseSource;
    const windNoiseSourceLength = windNoiseSource.length;

    const velocityTextureData = velocityTexture.data;
    const windTextureData = windTexture.data;
    const maxDim = grassTileInfo.dimension * grassTileInfo.density;

    const playerX = playerAabb.midX() - this.offsetX;
    const playerY = playerAabb.minY - this.offsetY;
    const playerZ = playerAabb.midZ() - this.offsetZ;
    const playerWidth = playerAabb.width();
    const playerDepth = playerAabb.depth();

    const fracLocX = playerX / maxDim;
    const fraclocZ = playerZ / maxDim;

    if (!checkTextures(windTexture, velocityTexture)) {
      return;
    }

    const texWidth = velocityTexture.width;
    const texHeight = velocityTexture.height;

    const fracWidth = math.clamp01((playerWidth * scaleX) / maxDim);
    const fracDepth = math.clamp01((playerDepth * scaleZ) / maxDim);

    const minX = math.clamp01(fracLocX - fracWidth/2);
    const minZ = math.clamp01(fraclocZ - fracDepth/2);

    let numPixelsX = Math.floor(texWidth * fracWidth);
    let numPixelsZ = Math.floor(texHeight * fracDepth);

    const startPixelX = Math.floor(minX * texWidth);
    const startPixelZ = Math.floor(minZ * texHeight);

    const midPixelX = (minX + fracWidth/2) * texWidth;
    const midPixelZ = (minZ + fracDepth/2) * texHeight;

    const dtScaleRatio = Math.max(math.dtSecRatio(dt), 1);

    const decayAmt = this.decayAmount * dtScaleRatio;

    const windVx = (this.windVx + 1) * 0.5 * 255;
    const windVz = (this.windVz + 1) * 0.5 * 255;

    const sampleIncrement = math.dtSecSampleIncrement(dt);

    const numPixelsTexture = windTextureData.length / windTexture.numComponentsPerPixel();

    for (let i = 0; i < numPixelsTexture; i++) {
      const index = (this.windNoiseIndices[i] + sampleIncrement) % windNoiseSourceLength;
      const sample = windNoiseSource[index];
      this.windNoiseIndices[i] = index;

      windTextureData[i*4+0] = windVx;
      windTextureData[i*4+1] = 0;
      windTextureData[i*4+2] = windVz;
      windTextureData[i*4+3] = 255 * sample;

      velocityTextureData[i*4+3] /= decayAmt;
    }

    const outOfBoundsXz = fracLocX > 1 || fracLocX < 0 || fraclocZ > 1 || fraclocZ < 0;
    const outOfBoundsY = playerY < 0 || playerY > bladeHeight;

    if (outOfBoundsXz || outOfBoundsY) {
      numPixelsX = 0;
      numPixelsZ = 0;
    }

    for (let i = 0; i < numPixelsX; i++) {
      for (let j = 0; j < numPixelsZ; j++) {
        const idxX = i + startPixelX;
        const idxZ = j + startPixelZ;

        const pixelIdx = idxZ * texWidth + idxX;
        const velTextureIdx = pixelIdx * 4;
        
        let dirX = (idxX - midPixelX) / (midPixelX - startPixelX);
        let dirZ = (idxZ - midPixelZ) / (midPixelZ - startPixelZ);

        const normX = (-dirX + 1) * 0.5;
        const normZ = (dirZ + 1) * 0.5;

        velocityTextureData[velTextureIdx+0] = normX * 255;
        velocityTextureData[velTextureIdx+1] = 0;
        velocityTextureData[velTextureIdx+2] = normZ * 255;
        velocityTextureData[velTextureIdx+3] = 100;
      }
    }

    velocityTexture.bind();
    velocityTexture.subImage(velocityTextureData);

    windTexture.bind();
    windTexture.subImage(windTextureData);
  }
}

export function makeGrassTileData(grassTileInfo: GrassTile, translations: Array<number>, rotations: Array<number>, uvs: Array<number>): void {
  const grassDim = grassTileInfo.dimension;
  const grassDensity = grassTileInfo.density;

  const maxDim = grassDim * grassDensity;

  for (let i = 0; i < grassDim; i++) {
    for (let j = 0; j < grassDim; j++) {
      const xAmt = Math.random();
      const yAmt = Math.random();

      const xPos = grassDim * xAmt * grassDensity;
      const zPos = grassDim * yAmt * grassDensity;

      translations.push(xPos);
      translations.push(0);
      translations.push(zPos);

      rotations.push(Math.random() * Math.PI * 2);

      uvs.push(xPos / maxDim);
      uvs.push(zPos / maxDim);
    }
  }
}

function makeUint8TextureData(textureSize: number, numComponents: number): Uint8Array {
  const numTexturePixels = textureSize * textureSize;
  return new Uint8Array(numTexturePixels * numComponents);
}

function makeWindTexture(gl: WebGLRenderingContext, textureData: Uint8Array, textureSize: number): Texture2D {
  const tex = new Texture2D(gl);

  tex.minFilter = gl.LINEAR;
  tex.magFilter = gl.LINEAR;
  tex.wrapS = gl.CLAMP_TO_EDGE;
  tex.wrapT = gl.CLAMP_TO_EDGE;

  tex.level = 0;
  tex.internalFormat = gl.RGBA;
  tex.width = textureSize;
  tex.height = textureSize;
  tex.border = 0;
  tex.srcFormat = gl.RGBA;
  tex.srcType = gl.UNSIGNED_BYTE;

  tex.bind();
  tex.configure();

  // const numComponentsPerPixel = tex.numComponentsPerPixel();
  // const numTexturePixels = textureSize * textureSize;
  // const textureData = new Uint8Array(numTexturePixels * numComponentsPerPixel);

  tex.fillImage(textureData);
  tex.data = textureData;

  return tex;
}

function makeVelocityTexture(gl: WebGLRenderingContext, textureData: Uint8Array, textureSize: number): Texture2D {
  const tex = new Texture2D(gl);

  tex.minFilter = gl.NEAREST;
  tex.magFilter = gl.NEAREST;
  tex.wrapS = gl.CLAMP_TO_EDGE;
  tex.wrapT = gl.CLAMP_TO_EDGE;
  tex.level = 0;
  tex.internalFormat = gl.RGBA;
  tex.width = textureSize;
  tex.height = textureSize;
  tex.border = 0;
  tex.srcFormat = gl.RGBA;
  tex.srcType = gl.UNSIGNED_BYTE;

  tex.bind();
  tex.configure();
  
  // const numTexturePixels = textureSize * textureSize;
  // const numComponentsPerPixel = tex.numComponentsPerPixel();
  // const textureData = new Uint8Array(numTexturePixels * numComponentsPerPixel);

  tex.fillImage(textureData);
  tex.data = textureData;

  return tex;
}

function checkTextures(windTexture: Texture2D, velocityTexture: Texture2D): boolean {
  const numComponentsPerPixel = windTexture.numComponentsPerPixel();

  if (numComponentsPerPixel !== 4) {
    console.warn('Expected wind and velocity textures to have 4 components per pixel.');
    return false;
  }

  if (numComponentsPerPixel !== velocityTexture.numComponentsPerPixel()) {
    console.warn('Expected wind and velocity textures to have the same format.');
    return false;
  }

  if (windTexture.width !== windTexture.height) {
    console.warn('Assumed texture would be square; instead dimensions were: ', windTexture.width, windTexture.height);
    return false;
  }

  if (velocityTexture.width !== windTexture.width || velocityTexture.width !== windTexture.height) {
    console.warn('Assumed velocity texture and wind texture would have same dimensions.');
    return false;
  }

  return true;
}

export type GrassModelOptions = {
  numSegments: number;
}

export class GrassDrawable {
  //  Should match the shader source.
  public readonly NUM_LIGHTS = 3;

  private renderContext: RenderContext;
  private isCreated: boolean;
  private modelOptions: GrassModelOptions;
  private tileOptions: GrassTile;
  private program: Program;
  private drawable: types.Drawable;
  private model: mat4;
  private inverseTransposeModel: mat4;
  private grassTextures: GrassTextureManager;
  private lightColors: Array<types.Real3>;
  private lightPositions: Array<types.Real3>;

  scale: Array<number>;
  color: Array<number>;

  constructor(renderContext: RenderContext, grassTextures: GrassTextureManager) {
    this.renderContext = renderContext;
    this.isCreated = false;
    this.model = mat4.create();
    this.inverseTransposeModel = mat4.create();
    this.scale = [0.05, 1, 1];
    this.color = [0.5, 1, 0.5];
    this.grassTextures = grassTextures;
    this.createLights();
  }

  private createLights(): void {
    this.lightColors = [];
    this.lightPositions = [];

    for (let i = 0; i < this.NUM_LIGHTS; i++) {
      this.lightColors.push([0, 0, 0]);
      this.lightPositions.push([0, 0, 0]);
    }
  }

  dispose(): void {
    if (this.isCreated) {
      this.drawable.vao.dispose();
      this.program.dispose();
      this.isCreated = false;
    }
  }

  private handleLights(sunPosition: types.Real3, sunColor: types.Real3, dim: number, offX: number, offZ: number): void {
    const lightPos = this.lightPositions;
    const lightColor = this.lightColors;

    for (let i = 0; i < 2; i++) {
      lightColor[i][0] = 1;
      lightColor[i][1] = 0.98;
      lightColor[i][2] = 0.8;
    }

    for (let i = 0; i < 3; i++) {
      lightPos[2][i] = sunPosition[i];
      lightColor[2][i] = sunColor[i];
    }

    lightPos[0][0] = 1 + offX;
    lightPos[0][1] = 3;
    lightPos[0][2] = 1 + offZ;

    lightPos[1][0] = dim + offX;
    lightPos[1][1] = 3;
    lightPos[1][2] = dim + offZ;
  }

  draw(cameraPosition: types.Real3, view: mat4, proj: mat4, sunPosition: types.Real3, sunColor: types.Real3): void {
    const renderContext = this.renderContext;
    const grassTextures = this.grassTextures;
    const grassProg = this.program;
    const gl = renderContext.gl;

    const dim = grassTextures.grassTileInfo.dimension * grassTextures.grassTileInfo.density;
    const offX = grassTextures.offsetX;
    const offY = grassTextures.offsetY;
    const offZ = grassTextures.offsetZ;

    const lightPos = this.lightPositions;
    const lightColor = this.lightColors;

    this.handleLights(sunPosition, sunColor, dim, offX, offZ);

    renderContext.useProgram(grassProg);
    debug.setViewProjection(grassProg, view, proj);

    renderContext.pushActiveTexture2DAndBind(grassTextures.windTexture);
    grassProg.setTexture('wind_texture', grassTextures.windTexture.index);
  
    renderContext.pushActiveTexture2DAndBind(grassTextures.velocityTexture);
    grassProg.setTexture('velocity_texture', grassTextures.velocityTexture.index);

    renderContext.popTexture2D();
    renderContext.popTexture2D();

    const model = this.model;
    const invTransModel = this.inverseTransposeModel;
    const scale = this.scale;

    mat4.identity(model);
    mat4.identity(invTransModel);
  
    mat4.scale(model, model, scale);
    mat4.transpose(invTransModel, model);
    mat4.invert(invTransModel, invTransModel);
  
    grassProg.setMat4('model', model);
    grassProg.setMat4('inv_trans_model', invTransModel);
    grassProg.setVec3('color', this.color);
    grassProg.setVec3('camera_position', cameraPosition);
    grassProg.set1i('invert_normal', 0);
    grassProg.set3f('origin_offset', offX, offY, offZ);
    grassProg.set1i('num_point_lights', lightPos.length);
  
    for (let i = 0; i < lightPos.length; i++) {
      grassProg.setVec3(`light_position[${i}]`, lightPos[i]);
      grassProg.setVec3(`light_color[${i}]`, lightColor[i]);
    }

    renderContext.bindVao(this.drawable.vao);

    gl.disable(gl.CULL_FACE);
    this.drawable.draw();
    gl.enable(gl.CULL_FACE);
  
    // gl.enable(gl.CULL_FACE);
    // gl.cullFace(gl.BACK);
    // this.drawable.draw();
  
    // grassProg.set1i('invert_normal', 1);
    // gl.cullFace(gl.FRONT);
    // this.drawable.draw();
  }

  create(modelOptions: GrassModelOptions): void {
    if (this.isCreated) {
      this.dispose();
    }

    this.modelOptions = Object.assign({}, modelOptions);

    const gl = this.renderContext.gl;

    this.program = Program.fromSources(gl, grassProgramSources.vertex, grassProgramSources.fragment);

    const numSegments = modelOptions.numSegments;
    const positions = debug.segmentedQuadPositions(numSegments);

    const translations: Array<number> = [];
    const rotations: Array<number> = [];
    const uvs: Array<number> = [];

    makeGrassTileData(this.grassTextures.grassTileInfo, translations, rotations, uvs);

    const vboDescriptors: Array<types.VboDescriptor> = [
      {name: 'position', attributes: [types.makeAttribute('a_position', gl.FLOAT, 3)], data: positions},
      {name: 'translation', attributes: [types.makeAttribute('a_translation', gl.FLOAT, 3, 1)], data: new Float32Array(translations)},
      {name: 'rotation', attributes: [types.makeAttribute('a_rotation', gl.FLOAT, 1, 1)], data: new Float32Array(rotations)},
      {name: 'uv', attributes: [types.makeAttribute('a_uv', gl.FLOAT, 2, 1)], data: new Float32Array(uvs)}
    ];

    const vao = Vao.fromDescriptors(gl, this.program, vboDescriptors);
    
    const numVerts = positions.length/3;
    const numInstances = translations.length/3;

    const drawable = new types.Drawable(this.renderContext, vao, (renderContext, drawable) => {
      const mode = drawable.mode;
      const first = drawable.offset;
      const count = drawable.count;
      const primCount = drawable.numActiveInstances;

      renderContext.extInstancedArrays.drawArraysInstancedANGLE(mode, first, count, primCount);
    });

    drawable.mode = gl.TRIANGLES;
    drawable.offset = 0;
    drawable.count = numVerts;
    drawable.numActiveInstances = numInstances;
    drawable.isInstanced = true;

    this.drawable = drawable;

    this.isCreated = true;
  }
}

export class GrassResources {
  private noiseUrl: string;
  private timeoutMs: number;
  private moduleMemory: WebAssembly.Memory;

  noiseSource: Float32Array;
  wasmModule: wasm.grass.GrassModule;

  constructor(timeoutMs: number, noiseUrl: string, wasmMemory: WebAssembly.Memory) {
    this.noiseSource = new Float32Array(1);
    this.noiseUrl = noiseUrl;
    this.timeoutMs = timeoutMs;
    this.wasmModule = null;
    this.moduleMemory = wasmMemory;
  }

  private extractBufferFromAudioNode(node: AudioBufferSourceNode): Float32Array {
    return gameUtil.getBufferSourceNodeChannelData(node);
  }

  private async loadModule(errCb: (err: Error) => void): Promise<wasm.grass.GrassModule> {
    let mod: wasm.grass.GrassModule = null;

    try {
      mod = await wasm.grass.loadModule(this.moduleMemory);
    } catch (err) {
      errCb(err);
    }

    return mod;
  }
  
  async load(audioContext: AudioContext, errCb: (err: Error) => void): Promise<void> {
    try {
      //  Load wind noise.
      const noiseNode = await asyncTimeout(() => loadAudioBufferSourceNode(audioContext, this.noiseUrl), this.timeoutMs);
      this.noiseSource = this.extractBufferFromAudioNode(noiseNode);

      //  Instantiate wasm grass module.
      this.wasmModule = await asyncTimeout(() => this.loadModule(errCb), this.timeoutMs);
    } catch (err) {
      errCb(err);
    }
  }
}

export class GrassComponent {
  isPlaying: boolean;

  grassTextures: GrassTextureManager;
  grassDrawable: GrassDrawable;

  private renderContext: RenderContext;
  private resources: GrassResources;
  
  constructor(renderContext: RenderContext, resources: GrassResources) {
    this.renderContext = renderContext;
    this.resources = resources;
    this.grassTextures = null;
    this.grassDrawable = null;
    this.isPlaying = true;
  }

  dispose(): void {
    if (this.grassTextures) {
      this.grassTextures.dispose();
    }

    if (this.grassDrawable) {
      this.grassDrawable.dispose();
    }
  }
  
  create(grassTileOptions: GrassTile, modelOptions: GrassModelOptions, grassTextureOptions: GrassTextureOptions): void {
    this.dispose();

    const renderContext = this.renderContext;
    const resources = this.resources;

    const grassModule = resources.wasmModule;
    const grassData = new GrassTextureData(grassModule);
    const grassTextures = new GrassTextureManager(renderContext.gl, grassTileOptions, resources.noiseSource, grassData);
    grassTextures.create(grassTextureOptions);

    const grassDrawable = new GrassDrawable(renderContext, grassTextures);
    grassDrawable.create(modelOptions);

    this.grassTextures = grassTextures;
    this.grassDrawable = grassDrawable;
  }

  togglePlaying(): void {
    this.isPlaying = !this.isPlaying;
  }

  updateWasm(dt: number, playerAabb: math.Aabb): void {
    this.grassTextures.updateWasm(dt, playerAabb, 1, 1, this.grassDrawable.scale[1]);
  }

  update(dt: number, playerAabb: math.Aabb): void {
    if (this.isPlaying) {
      const bladeHeight = this.grassDrawable.scale[1];
      this.grassTextures.update(dt, playerAabb, 1, 1, bladeHeight);
    }
  }

  draw(renderContext: RenderContext, camera: ICamera, view: mat4, proj: mat4, sunPosition: types.Real3, sunColor: types.Real3) {
    this.grassDrawable.draw(camera.position, view, proj, sunPosition, sunColor);
  }
}