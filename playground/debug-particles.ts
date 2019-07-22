import { debug, Keyboard, Keys, Program, FollowCamera, Vao, math, makeAttribute, ICamera, types, Texture2D } from '../src/gl';
import { Result, NumberSampler, asyncTimeout, loadAudioBufferSourceNode, loadImage } from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as simpleSources from './shaders/debug-simple';
import * as particleSources from './shaders/debug-particles';

const MOUSE_STATE = debug.makeDebugMouseState();
const KEYBOARD = new Keyboard();

type Drawable = debug.Drawable;

type Drawables = {
  quad: Drawable,
  cube: Drawable,
  particles: Drawable
};

type Sounds = {
  noise: AudioBufferSourceNode
};

type Textures = {
  particle: Texture2D
};

type Programs = {
  simple: Program,
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

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, simpleSources.vertex, simpleSources.fragment);
}

function createParticleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, particleSources.vertex, particleSources.fragment);
}

async function makeParticleTexture(gl: WebGLRenderingContext): Promise<Texture2D> {
  const img = await asyncTimeout(() => loadImage('/texture/circle-gradient2.png'), 1000);
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
  const numParticles = 500;
  const particleScale = 0.01;

  const translations: Array<number> = [];
  const rotations: Array<number> = [];
  const alphas: Array<number> = [];
  const alphaDeltas: Array<number> = [];

  for (let i = 0; i < numParticles; i++) {
    translations.push(Math.random() * xzScale - xzScale/2);
    translations.push(Math.random() * 4 + 1);
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

  const noiseSamplers = debug.makeAudioBufferSamplers(numParticles, noiseSource);

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

function makeDrawable(gl: WebGLRenderingContext, prog: Program, positions: Float32Array, indices: Uint16Array): Drawable {
  const vboDescriptors = [{
    name: 'position',
    attributes: [makeAttribute('a_position', gl.FLOAT, 3)],
    data: positions
  }];

  const eboDescriptor = {name: 'indices', indices};
  const vao = Vao.fromDescriptors(gl, prog, vboDescriptors, eboDescriptor);

  return {
    vao,
    drawFunction: gl => gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0),
    isInstanced: false
  };
}

function makeDrawables(gl: WebGLRenderingContext, programs: Programs, sounds: Sounds): Result<[Drawables, Particles], string> {
  const cubePos = debug.cubePositions();
  const cubeInds = debug.cubeIndices();
  const quadPositions = debug.quadPositions();
  const quadIndices = debug.quadIndices();

  try {
    const cube = makeDrawable(gl, programs.simple, cubePos, cubeInds);
    const quad = makeDrawable(gl, programs.simple, quadPositions, quadIndices);
    const particles = makeParticles(gl, programs.particles, quadPositions, quadIndices, sounds.noise);
    const drawableParticle = particles.drawable;

    return Result.Ok([{cube, quad, particles: drawableParticle}, particles]);
  } catch (err) {
    return Result.Err(err.message);
  }
}

async function makeTextures(gl: WebGLRenderingContext): Promise<Textures> {
  const particle = await makeParticleTexture(gl);
  return {particle};
}

async function makeSounds(ac: AudioContext): Promise<Sounds> {
  // const noiseUrl = '/sound/lf_noise_short.m4a';
  const noiseUrl = '/sound/wind-a-short2.aac';
  const noiseSound = await asyncTimeout(() => loadAudioBufferSourceNode(ac, noiseUrl), 1000);
  return {noise: noiseSound};
}

async function render(gl: WebGLRenderingContext, ac: AudioContext) {
  const camera = debug.makeFollowCamera(gl);
  camera.maxPolar = Math.PI;

  const simpleProgResult = createSimpleProgram(gl);
  const particleProgResult = createParticleProgram(gl);

  if (debug.checkError(simpleProgResult) ||
      debug.checkError(particleProgResult)) {
    return;
  }

  const playerDims = [1.01, 1.01, 1.01];
  const playerAabb = math.Aabb.fromOriginDimensions([0, 0, 0], playerDims);

  const programs: Programs = {
    simple: simpleProgResult.unwrap(),
    particles: particleProgResult.unwrap()
  };

  const sounds: Sounds = await makeSounds(ac);
  const textures: Textures = await makeTextures(gl);

  const drawableRes = makeDrawables(gl, programs, sounds);
  if (debug.checkError(drawableRes)) {
    return;
  }

  const sun: Sun = {
    position: [0, 10, 0],
    color: [1, 1, 1]
  };

  const drawableAggregate = drawableRes.unwrap();
  const drawables = drawableAggregate[0];
  const particles: Particles = drawableAggregate[1];

  function renderer() {
    renderLoop(gl, programs, camera, playerAabb, drawables, particles, sun, textures);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function updatePlayerPosition(dt: number, playerAabb: math.Aabb, camera: ICamera): void {
  const front = camera.getFront(vec3.create());
  const right = camera.getRight(vec3.create());
  
  const velocity = [0, 0, 0];

  front[1] = 0;
  vec3.normalize(front, front);

  if (KEYBOARD.isDown(Keys.w)) math.sub3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.s)) math.add3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.a)) math.sub3(velocity, velocity, right);
  if (KEYBOARD.isDown(Keys.d)) math.add3(velocity, velocity, right);

  vec3.normalize(<any>velocity, velocity);
  vec3.scale(<any>velocity, velocity, 0.2);

  playerAabb.move(velocity);
}

function updateCamera(dt: number, camera: FollowCamera, playerAabb: math.Aabb) {
  const target = [playerAabb.midX(), playerAabb.midY(), playerAabb.midZ()];
  debug.updateFollowCamera(dt, camera, target, MOUSE_STATE, KEYBOARD);
}

function drawPlayer(gl: WebGLRenderingContext, prog: Program, aabb: math.Aabb, drawable: Drawable): void {
  drawable.vao.bind();
  debug.drawAabb(gl, prog, mat4.create(), aabb, [0, 0, 0.25], drawable.drawFunction);
}

function drawGround(gl: WebGLRenderingContext, prog: Program, drawable: Drawable): void {
  drawable.vao.bind();
  gl.disable(gl.CULL_FACE);
  debug.drawGroundPlane(gl, prog, mat4.create(), 10, drawable, [0, 0.15, 0.25]);
  gl.enable(gl.CULL_FACE);
}

function drawParticles(gl: WebGLRenderingContext, prog: Program, camera: ICamera, particles: Particles, sun: Sun, textures: Textures): void {
  const drawable = particles.drawable;

  drawable.vao.bind();

  const sz = particles.particleScale;

  prog.set3f('scaling', sz, sz, sz);
  prog.setVec3('sun_position', sun.position);
  prog.setVec3('sun_color', sun.color);

  prog.setVec3('camera_position', camera.position);
  prog.set3f('color', 1, 1, 0.25);

  textures.particle.index = 0;
  textures.particle.activateAndBind();
  prog.setTexture('particle_texture', 0);

  // gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  drawable.drawFunction(gl);
  gl.enable(gl.CULL_FACE);
}

function drawSun(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, sun: Sun): void {
  drawable.vao.bind();
  debug.drawAt(gl, prog, mat4.create(), sun.position, 1, sun.color, drawable.drawFunction);
}

function drawDebugComponents(gl: WebGLRenderingContext, prog: Program, drawables: Drawables): void {
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;

  drawables.cube.vao.bind();
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);

  gl.disable(gl.CULL_FACE);
  drawables.quad.vao.bind();
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);
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

  for (let i = 0; i < numParticles; i++) {
    const noiseSample = noiseSamplers[i].nextSample();
    const halfNoiseSample = noiseSample - 0.5;

    const ind3 = i*3;

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

    rotations[i*3] += 0.01 * noiseSample * 2;
    rotations[i*3+1] += 0.005 * halfNoiseSample;

    for (let j = 0; j < 3; j++) {
      const rot = rotations[ind3 + j];

      if (rot > Math.PI*2) {
        rotations[ind3+j] = 0;
      } else if (rot < 0) {
        rotations[ind3+j] = Math.PI*2;
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

function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, playerAabb: math.Aabb, 
  drawables: Drawables, particles: Particles, sun: Sun, textures: Textures): void {
  const dt = 1/60;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  debug.beginRender(gl, camera, 1);

  updatePlayerPosition(dt, playerAabb, camera);
  updateCamera(dt, camera, playerAabb);
  updateParticles(gl, particles, playerAabb);

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  programs.simple.use();
  debug.setViewProjection(programs.simple, view, proj);

  // drawDebugComponents(gl, programs.simple, drawables);
  drawPlayer(gl, programs.simple, playerAabb, drawables.cube);
  drawGround(gl, programs.simple, drawables.quad);
  drawSun(gl, programs.simple, drawables.cube, sun);

  programs.particles.use();
  debug.setViewProjection(programs.particles, view, proj);

  drawParticles(gl, programs.particles, camera, particles, sun, textures);
}

export function main() {
  const glResult = debug.createCanvasAndContext(document.body);
  if (debug.checkError(glResult)) {
    return;
  }
  const gl = glResult.unwrap();
  const ac = new (window.AudioContext || (<any>window).webkitAudioContext)();

  debug.setupDocumentBody(MOUSE_STATE);
  debug.createTouchControls(KEYBOARD);

  render(gl, ac);
}