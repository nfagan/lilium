import { Texture2D, math } from '../gl';
import { NumberSampler } from '../util';

export type GrassTile = {
  density: number,
  dimension: number
};

export class GrassTextureManager {
  private gl: WebGLRenderingContext;
  private windAudioSamplers: Array<NumberSampler>;
  private textureSize: number;
  private grassBladeHeight: number;

  velocityTexture: Texture2D;
  windTexture: Texture2D;
  grassTileInfo: GrassTile;

  offsetX: number;
  offsetY: number;
  offsetZ: number;

  decayAmount: number;
  windVx: number;
  windVz: number;

  constructor(gl: WebGLRenderingContext, grassTileInfo: GrassTile, bladeHeight: number, textureSize: number, windAudioSource: AudioBufferSourceNode) {
    this.gl = gl;
    this.grassTileInfo = grassTileInfo;
    this.textureSize = textureSize;
    this.makeTextures(gl, textureSize);
    this.windAudioSamplers = makeWindAudioSamplers(textureSize * textureSize, windAudioSource);
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetZ = 0;
    this.windVx = 0.2;
    this.windVz = 0.05;
    this.decayAmount = 1.1;
    this.grassBladeHeight = bladeHeight;
  }

  private makeTextures(gl: WebGLRenderingContext, textureSize: number): void {
    const velocityTexture = makeVelocityTexture(gl, textureSize);
    const windTexture = makeWindTexture(gl, textureSize);

    windTexture.index = 0;
    velocityTexture.index = 1;

    this.velocityTexture = velocityTexture;
    this.windTexture = windTexture;
  }

  update(playerAabb: math.Aabb, scaleX: number, scaleZ: number): void {
    const grassTileInfo = this.grassTileInfo;
    const windAudioSamplers = this.windAudioSamplers;
    const windTexture = this.windTexture;
    const velocityTexture = this.velocityTexture;

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

    const decayAmt = this.decayAmount;
    const windVx = this.windVx;
    const windVz = this.windVz;

    const numPixelsTexture = windTextureData.length / windTexture.numComponentsPerPixel();

    for (let i = 0; i < numPixelsTexture; i++) {
      const sample = windAudioSamplers[i].nextSample();

      const vx = (windVx + 1) * 0.5;
      const vz = (windVz + 1) * 0.5;

      windTextureData[i*4+0] = 255 * vx;
      windTextureData[i*4+1] = 0;
      windTextureData[i*4+2] = 255 * vz;
      windTextureData[i*4+3] = 255 * sample;

      velocityTextureData[i*4+3] /= decayAmt;
    }

    const outOfBoundsXz = fracLocX > 1 || fracLocX < 0 || fraclocZ > 1 || fraclocZ < 0;
    const outOfBoundsY = playerY < 0 || playerY > this.grassBladeHeight;

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

function makeWindAudioSamplers(numSamplers: number, bufferSource: AudioBufferSourceNode): Array<NumberSampler> {
  //  https://blog.demofox.org/2017/05/29/when-random-numbers-are-too-random-low-discrepancy-sequences/

  const buffer = bufferSource.buffer;
  const channelData = buffer.getChannelData(0);
  const samplers: Array<NumberSampler> = [];
  
  math.normalize01(channelData, channelData);

  const gr = math.goldenRatio();
  let value = Math.random();
  
  for (let i = 0; i < numSamplers; i++) {
    const sampler = new NumberSampler(channelData);
    // sampler.seek(0.4 + i/numSamplers/2);
    // sampler.seek(Math.random());
    value += gr;
    value %= 1.0;

    sampler.seek(value);
    samplers.push(sampler);
  }

  return samplers;
}

function makeWindTexture(gl: WebGLRenderingContext, textureSize: number): Texture2D {
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

  const numComponentsPerPixel = tex.numComponentsPerPixel();
  const numTexturePixels = textureSize * textureSize;
  const textureData = new Uint8Array(numTexturePixels * numComponentsPerPixel);

  tex.fillImage(textureData);
  tex.data = textureData;

  return tex;
}

function makeVelocityTexture(gl: WebGLRenderingContext, textureSize: number): Texture2D {
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
  
  const numTexturePixels = textureSize * textureSize;
  const numComponentsPerPixel = tex.numComponentsPerPixel();
  const textureData = new Uint8Array(numTexturePixels * numComponentsPerPixel);

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