import { debug, Program, Vao, math, ICamera, types, Texture2D } from '../src/gl';
import { Result, NumberSampler, asyncTimeout, loadAudioBufferSourceNode, loadImage } from '../src/util';
import { mat4 } from 'gl-matrix';
import * as particleSources from './shaders/debug-particles';
import { gameUtil } from '../src/game';

type Drawable = debug.Drawable;

type Drawables = {
  particles: Drawable
};

type Sounds = {
  noise: AudioBufferSourceNode
};

type Textures = {
  particle: Texture2D
};

type Programs = {
  particles: Program
};

type Sun = {
  position: types.Real3,
  color: types.Real3
};

type Particles = {
  numParticles: number,
  particleScale: number,
  particleGridScale: number,
  drawable: Drawable,
  translations: Float32Array,
  originalTranslations: Float32Array,
  rotations: Float32Array,
  alphas: Float32Array,
  alphaDeltas: Float32Array,
  noiseSamplers: Array<NumberSampler>
};

let PROGRAMS: Programs = null;
let PARTICLES: Particles = null;
let TEXTURES: Textures = null;

function createParticleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, particleSources.vertex, particleSources.fragment);
}

async function makeParticleTexture(gl: WebGLRenderingContext): Promise<Texture2D> {
  const img = await asyncTimeout(() => loadImage('/texture/circle-gradient2.png'), 10000);
  const tex = new Texture2D(gl);

  tex.minFilter = gl.LINEAR;
  tex.magFilter = gl.LINEAR;
  tex.wrapS = gl.CLAMP_TO_EDGE;
  tex.wrapT = gl.CLAMP_TO_EDGE;
  tex.level = 0;
  tex.srcFormat = gl.RGBA;
  tex.internalFormat = gl.RGBA;
  tex.srcType = gl.UNSIGNED_BYTE;
  tex.border = 0;

  tex.bind();
  tex.configure();
  tex.fillImageElement(img);

  return tex;
}

function makeParticles(gl: WebGLRenderingContext, prog: Program, positions: Float32Array, indices: Uint16Array, noiseSource: AudioBufferSourceNode): Particles {
  const xzScale = 10;
  const numParticles = 1000;
  const particleScale = 0.005;

  const translations: Array<number> = [];
  const rotations: Array<number> = [];
  const alphas: Array<number> = [];
  const alphaDeltas: Array<number> = [];

  for (let i = 0; i < numParticles; i++) {
    translations.push(Math.random() * xzScale - xzScale/2);
    translations.push(Math.random() * 4 + 2);
    translations.push(Math.random() * xzScale - xzScale);

    rotations.push(Math.random() * Math.PI * 2);
    rotations.push(Math.random() * Math.PI * 2);
    rotations.push(0);

    alphas.push(1);
    alphaDeltas.push(-1);
  }

  const translationData = new Float32Array(translations);
  const originalTranslationData = new Float32Array(translations);
  const alphaData = new Float32Array(alphas);
  const rotationData = new Float32Array(rotations);
  const alphaDeltaData = new Float32Array(alphaDeltas);
  const makeAttribute = types.makeAttribute;

  const vboDescriptors = [
    {name: 'position', attributes: [makeAttribute('a_position', gl.FLOAT, 3, 0)], data: positions},
    {name: 'translation', attributes: [makeAttribute('a_translation', gl.FLOAT, 3, 1)], data: translationData},
    {name: 'rotation', attributes: [makeAttribute('a_rotation', gl.FLOAT, 3, 1)], data: rotationData},
    {name: 'alpha', attributes: [makeAttribute('a_alpha', gl.FLOAT, 1, 1)], data: alphaData},
  ];
  const eboDescriptor = {name: 'indices', indices};
  const vao = Vao.fromDescriptors(gl, prog, vboDescriptors, eboDescriptor);

  const drawable: Drawable = {
    vao,
    drawFunction: gl => {
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      ext.drawElementsInstancedANGLE(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0, numParticles);
    },
    isInstanced: true,
    numActiveInstances: numParticles
  };

  const noiseSamplers = gameUtil.makeAudioBufferSamplers(numParticles, noiseSource);

  return {
    numParticles,
    particleScale,
    particleGridScale: xzScale,
    drawable,
    translations: translationData,
    originalTranslations: originalTranslationData,
    rotations: rotationData,
    alphas: alphaData,
    alphaDeltas: alphaDeltaData,
    noiseSamplers
  }
}

function makeDrawables(gl: WebGLRenderingContext, programs: Programs, sounds: Sounds): Result<[Drawables, Particles], string> {
  const quadPositions = debug.quadPositions();
  const quadIndices = debug.quadIndices();

  try {
    const particles = makeParticles(gl, programs.particles, quadPositions, quadIndices, sounds.noise);
    const drawableParticle = particles.drawable;

    return Result.Ok([{particles: drawableParticle}, particles]);
  } catch (err) {
    return Result.Err(err.message);
  }
}

async function makeTextures(gl: WebGLRenderingContext): Promise<Textures> {
  const particle = await makeParticleTexture(gl);
  return {particle};
}

async function makeSounds(ac: AudioContext): Promise<Sounds> {
  // const noiseUrl = '/sound/wind-a.m4a';
  const noiseUrl = '/sound/wind-a-short2.aac';
  const noiseSound = await asyncTimeout(() => loadAudioBufferSourceNode(ac, noiseUrl), 10000);
  return {noise: noiseSound};
}

function drawParticles(gl: WebGLRenderingContext, prog: Program, camera: ICamera, particles: Particles, sun: Sun, textures: Textures): void {
  const drawable = particles.drawable;

  drawable.vao.bind();

  const sz = particles.particleScale;

  prog.set3f('scaling', sz, sz, sz);
  prog.setVec3('sun_position', sun.position);
  prog.setVec3('sun_color', sun.color);

  prog.setVec3('camera_position', camera.position);
  prog.set3f('color', 1, 1, 1);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  drawable.drawFunction(gl);
  gl.enable(gl.CULL_FACE);
}

function updateParticles(gl: WebGLRenderingContext, particles: Particles, playerAabb: math.Aabb): void {
  const particleVao = particles.drawable.vao;
  const translations = particles.translations;
  const originalTranslations = particles.originalTranslations;
  const rotations = particles.rotations;
  const alphas = particles.alphas;
  const alphaDeltas = particles.alphaDeltas;

  const translationVbo = particleVao.getVbo('translation');
  const alphaVbo = particleVao.getVbo('alpha');
  const rotVbo = particleVao.getVbo('rotation');

  const noiseSamplers = particles.noiseSamplers;
  const numParticles = particles.numParticles;
  const twoPi = Math.PI * 2;

  for (let i = 0; i < numParticles; i++) {
    const noiseSample = noiseSamplers[i].nextSample();
    const halfNoiseSample = noiseSample - 0.5;
    const ind3 = i * 3;

    translations[ind3+1] += halfNoiseSample * 0.01;
    translations[ind3+2] += halfNoiseSample * 0.05 + 0.02;

    alphas[i] += alphaDeltas[i] * 0.01 * noiseSample;

    if (alphas[i] < 0) {
      alphas[i] = 0;
      alphaDeltas[i] = 1;

      translations[ind3] = originalTranslations[ind3] + playerAabb.midX();
      translations[ind3+1] = originalTranslations[ind3+1] + playerAabb.minY;
      translations[ind3+2] = originalTranslations[ind3+2] + playerAabb.midZ();

    } else if (alphas[i] > 1) {
      alphas[i] = 1;
      alphaDeltas[i] = -1;
    }

    rotations[ind3] += 0.01 * noiseSample * 2;
    rotations[ind3+1] += 0.005 * halfNoiseSample;

    for (let j = 0; j < 3; j++) {
      const rot = rotations[ind3 + j];

      if (rot > twoPi) {
        rotations[ind3+j] = 0;
      } else if (rot < 0) {
        rotations[ind3+j] = twoPi;
      }
    }
  }

  translationVbo.bind(gl);
  translationVbo.subData(gl, translations);

  alphaVbo.bind(gl);
  alphaVbo.subData(gl, alphas);

  rotVbo.bind(gl);
  rotVbo.subData(gl, rotations);
}

export async function init(gl: WebGLRenderingContext, ac: AudioContext): Promise<boolean> {
  try {
    PROGRAMS = {particles: createParticleProgram(gl).unwrap()};
    TEXTURES = await makeTextures(gl);
    PARTICLES = makeDrawables(gl, PROGRAMS, await makeSounds(ac)).unwrap()[1];
    return true;
  } catch (err) {
    console.error(err.message);
    return false;
  }
}

export function update(gl: WebGLRenderingContext, playerAabb: math.Aabb): boolean {
  const particles = PARTICLES;

  if (!particles) {
    console.warn('Did not yet initialize particles.');
    return false;
  }

  updateParticles(gl, particles, playerAabb);
  return true;
}

export function render(gl: WebGLRenderingContext, camera: ICamera, view: mat4, proj: mat4, sun: Sun): boolean {
  const programs = PROGRAMS;
  const textures = TEXTURES;
  const particles = PARTICLES;

  if (!particles || !textures || !programs) {
    console.warn('Did not yet initialize particles.');
    return false;
  }

  programs.particles.use();
  debug.setViewProjection(programs.particles, view, proj);

  drawParticles(gl, programs.particles, camera, particles, sun, textures);
  return true;
}