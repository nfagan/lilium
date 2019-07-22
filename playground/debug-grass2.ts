import { debug, Keyboard, Keys, Program, FollowCamera, Vao, Vbo, Ebo, 
  BufferDescriptor, types, math, parse } from '../src/gl';
import { Result, loadText, loadImage, PrimitiveTypedArray, loadAudioBufferSourceNode } from '../src/util';
import { vec3, mat4, glMatrix } from 'gl-matrix';
import * as simpleSources from './shaders/debug-simple';
import * as grassSources from './shaders/debug-grass2';
import { NumberSampler } from '../src/audio/audio-sampler';

const MOUSE_STATE: {x: number, y: number, lastX: number, lastY: number, clicked: boolean, down: boolean} = {
  x: null,
  y: null,
  lastX: null,
  lastY: null,
  clicked: false,
  down: false,
};

const KEYBOARD = new Keyboard();
let DEBUG_AABB: math.Aabb = null;

type Drawable = {
  vao: Vao,
  drawFunction: types.DrawFunction,
  isInstanced: boolean,
  numTriangles?: number,
  numActiveInstances?: number
};

type Sounds = {
  wind: AudioBufferSourceNode
};

type GrassTile = {
  density: number,
  dimension: number
};

type Drawables = {
  quad: Drawable,
  cube: Drawable,
  grassQuad: Drawable,
  model: Drawable
};

type Programs = {
  simple: Program,
  grass: Program
};

type Texture2D = {
  texture: WebGLTexture,
  data: PrimitiveTypedArray
  width: number,
  height: number,
  format: number,
  type: number,
  numComponentsPerPixel: number
};

type Textures = {
  velocity: Texture2D,
  amount: Texture2D,
  wind: Texture2D,
  grassColor: Texture2D
};

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, simpleSources.vertex, simpleSources.fragment);
}

function createGrassProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, grassSources.vertex, grassSources.fragment);
}

async function makeSounds(audioContext: AudioContext): Promise<Sounds> {
  const wind = await loadWindSound(audioContext);
  return {
    wind
  };
}

function makeWindAudioSamplers(numSamplers: number, bufferSource: AudioBufferSourceNode): Array<NumberSampler> {
  const buffer = bufferSource.buffer;
  const channelData = buffer.getChannelData(0);
  const samplers: Array<NumberSampler> = [];
  
  math.normalize01(channelData, channelData);
  
  for (let i = 0; i < numSamplers; i++) {
    const sampler = new NumberSampler(channelData);
    sampler.seek(0.4 + i/numSamplers/2);
    samplers.push(sampler);
  }

  return samplers;
}

function makeDrawableFromObj(gl: WebGLRenderingContext, prog: Program, obj: parse.Obj): Drawable {
  const pos = new Float32Array(obj.positions);
  const inds = new Uint16Array(obj.positionIndices);

  return makeDrawable(gl, prog, pos, inds, inds.length);
}

function makeWindTexture(gl: WebGLRenderingContext, textureSize: number): Texture2D {
  const tex = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const numTexturePixels = textureSize * textureSize;

  const level = 0;
  const internalFormat = gl.RGBA;
  const width = textureSize;
  const height = textureSize;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const textureData = new Uint8Array(numTexturePixels * 4);

  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, textureData);

  return {
    texture: tex,
    data: textureData,
    width: textureSize,
    height: textureSize,
    format: srcFormat,
    type: srcType,
    numComponentsPerPixel: 4
  }
}

function makeAmountDeformationTexture(gl: WebGLRenderingContext, textureSize: number): Texture2D {
  const tex = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const numTexturePixels = textureSize * textureSize;

  const level = 0;
  const internalFormat = gl.ALPHA;
  const width = textureSize;
  const height = textureSize;
  const border = 0;
  const srcFormat = gl.ALPHA;
  const srcType = gl.UNSIGNED_BYTE;
  const textureData = new Uint8Array(numTexturePixels);

  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, textureData);

  return {
    texture: tex,
    data: textureData,
    width: textureSize,
    height: textureSize,
    format: srcFormat,
    type: srcType,
    numComponentsPerPixel: 1
  }
}

function makeGrassColorTexture(gl: WebGLRenderingContext, grassImage: HTMLImageElement): Texture2D {
  const tex = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;

  gl.texImage2D(gl.TEXTURE_2D, 0, srcFormat, srcFormat, srcType, grassImage);

  return {
    texture: tex,
    data: null,
    width: grassImage.width,
    height: grassImage.height,
    format: srcFormat,
    type: srcType,
    numComponentsPerPixel: 4
  }
}

function makeVelocityDeformationTexture(gl: WebGLRenderingContext, textureSize: number): Texture2D {
  const tex = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const numTexturePixels = textureSize * textureSize;

  const level = 0;
  const internalFormat = gl.RGBA;
  const width = textureSize;
  const height = textureSize;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const textureData = new Uint8Array(numTexturePixels * 4);

  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, textureData);

  return {
    texture: tex,
    data: textureData,
    width: textureSize,
    height: textureSize,
    format: srcFormat,
    type: srcType,
    numComponentsPerPixel: 4
  }
}

async function makeDrawables(gl: WebGLRenderingContext, progs: Programs, grassTileInfo: GrassTile): Promise<Result<Drawables, string>> {
  const cubePos = debug.cubePositions();
  const cubeInds = debug.cubeIndices();

  const modelSrc = await loadModels();

  const prog = progs.simple;
  const grassProg = progs.grass;

  try {
    const cube = makeDrawable(gl, prog, cubePos, cubeInds, 36);
    const quad = makeDrawable(gl, prog, debug.quadPositions(), debug.quadIndices(), 6);
    const grassQuad = makeGrassQuad(gl, grassProg, grassTileInfo);
    const modelDrawable = makeDrawableFromObj(gl, prog, modelSrc);

    return Result.Ok({cube, quad, grassQuad, model: modelDrawable});
  } catch (err) {
    return Result.Err(err.message);
  }
}

function makeDrawable(gl: WebGLRenderingContext, prog: Program, 
  positions: Float32Array, indices: Uint16Array, numTriangles: number): Drawable {
  const descriptor = new BufferDescriptor();
  descriptor.addAttribute({name: 'a_position', size: 3, type: gl.FLOAT});
  descriptor.getAttributeLocations(prog);

  const vao = new Vao(gl);

  vao.bind();
  vao.attachVbo('position', new Vbo(gl, descriptor, positions));
  vao.attachEbo('indices', new Ebo(gl, indices));
  vao.unbind();

  return {
    vao: vao,
    drawFunction: gl => gl.drawElements(gl.TRIANGLES, numTriangles, gl.UNSIGNED_SHORT, 0),
    isInstanced: false
  };
}

function makeGrassTileInfo(): GrassTile {
  const grassDim = 100;
  const grassDensity = 0.1;

  return {
    density: grassDensity,
    dimension: grassDim
  };
}

function makeGrassQuad(gl: WebGLRenderingContext, prog: Program, grassTileInfo: GrassTile): Drawable {
  const numSegments = 8;
  const grassDim = grassTileInfo.dimension;
  const grassDensity = grassTileInfo.density;

  const positions = debug.segmentedQuadPositions(numSegments);

  const posDescriptor = new BufferDescriptor();
  posDescriptor.addAttribute({name: 'a_position', size: 3, type: gl.FLOAT});
  posDescriptor.getAttributeLocations(prog);

  const translationDescriptor = new BufferDescriptor();
  translationDescriptor.addAttribute({name: 'a_translation', size: 3, type: gl.FLOAT, divisor: 1});
  translationDescriptor.getAttributeLocations(prog);

  const rotationDescriptor = new BufferDescriptor();
  rotationDescriptor.addAttribute({name: 'a_rotation', size: 1, type: gl.FLOAT, divisor: 1});
  rotationDescriptor.getAttributeLocations(prog);

  const uvDescriptor = new BufferDescriptor();
  uvDescriptor.addAttribute({name: 'a_uv', size: 2, type: gl.FLOAT, divisor: 1});
  uvDescriptor.getAttributeLocations(prog);

  const translations: Array<number> = [];
  const rotations: Array<number> = [];
  const uvs: Array<number> = [];

  const maxDim = grassDim * grassDensity;

  for (let i = 0; i < grassDim; i++) {
    for (let j = 0; j < grassDim; j++) {
      const xPos = grassDim * Math.random() * grassDensity;
      const zPos = grassDim * Math.random() * grassDensity;

      translations.push(xPos);
      translations.push(0);
      translations.push(zPos);

      rotations.push(Math.random() * Math.PI * 2);

      uvs.push(xPos / maxDim);
      uvs.push(zPos / maxDim);
    }
  }
  
  const vao = new Vao(gl);
  const numVerts = positions.length/3;
  const numInstances = translations.length/3;

  vao.bind();
  vao.attachVbo('position', new Vbo(gl, posDescriptor, positions));
  vao.attachVbo('translation', new Vbo(gl, translationDescriptor, new Float32Array(translations)));
  vao.attachVbo('rotation', new Vbo(gl, rotationDescriptor, new Float32Array(rotations)));
  vao.attachVbo('uv', new Vbo(gl, uvDescriptor, new Float32Array(uvs)));
  vao.unbind();

  return {
    vao,
    drawFunction: gl => {
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, numVerts, numInstances);
    },
    isInstanced: false
  };
}

function makeCamera(gl: WebGLRenderingContext): FollowCamera {
  const camera = new FollowCamera();

  camera.followDistance = 10;
  camera.rotate(0, 0);
  camera.setAspect(gl.canvas.clientWidth / gl.canvas.clientHeight);
  camera.setNear(0.1);
  camera.setFar(1000);
  camera.setFieldOfView(45 * Math.PI/180);
  camera.move([0, 0.5, 0]);
  camera.maxPolar = Infinity;

  return camera;
}

function makeTextures(gl: WebGLRenderingContext, texSize: number, grassImage: HTMLImageElement): Textures {
  return {
    velocity: makeVelocityDeformationTexture(gl, texSize),
    amount: makeAmountDeformationTexture(gl, texSize),
    wind: makeWindTexture(gl, texSize),
    grassColor: makeGrassColorTexture(gl, grassImage)
  };
}

async function loadModels(): Promise<parse.Obj> {
  const url = '/model/tree1.obj';
  const src = await loadText(url);
  
  return new parse.Obj(src);
}

async function loadGrassImage(): Promise<HTMLImageElement> {  
  return loadImage('/texture/leaf3.png');
}

function loadWindSound(audioContext: AudioContext): Promise<AudioBufferSourceNode> {
  return loadAudioBufferSourceNode(audioContext, '/sound/lf_noise_short.m4a');
}

async function render(gl: WebGLRenderingContext, audioContext: AudioContext) {
  const camera = makeCamera(gl);
  let programs: Programs = null;
  let drawables: Drawables = null;

  const grassTileInfo = makeGrassTileInfo();
  const sounds = await makeSounds(audioContext);

  try {
    programs = {
      simple: debug.unwrapResult(createSimpleProgram(gl)),
      grass: debug.unwrapResult(createGrassProgram(gl))
    };
    drawables = debug.unwrapResult(await makeDrawables(gl, programs, grassTileInfo));
  } catch (err) {
    console.error(err.message);
    return;
  }

  const texSize = 256;
  const grassImage = await loadGrassImage();
  const textures = makeTextures(gl, texSize, grassImage);
  const samplers = makeWindAudioSamplers(texSize * texSize, sounds.wind);

  function renderer() {
    renderLoop(gl, programs, camera, textures, drawables, grassTileInfo, samplers);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function updatePlayerMovement(velocity: types.Real3, camera: FollowCamera): void {
  const front = camera.getFront(vec3.create());
  const right = camera.getRight(vec3.create());
  // const mvSpeed = 0.05;
  const mvSpeed = 0.1;

  front[1] = 0;
  vec3.normalize(front, front);

  vec3.scale(front, front, mvSpeed);
  vec3.scale(right, right, mvSpeed);

  if (KEYBOARD.isDown(Keys.w)) math.sub3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.s)) math.add3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.a)) math.sub3(velocity, velocity, right);
  if (KEYBOARD.isDown(Keys.d)) math.add3(velocity, velocity, right);
}

function updateCamera(camera: FollowCamera, velocity: types.Real3) {
  camera.move(velocity as vec3);

  if (KEYBOARD.isDown(Keys.leftShift) || MOUSE_STATE.down) {
    camera.rotate(MOUSE_STATE.x * 0.01, MOUSE_STATE.y * 0.01);
  }

  MOUSE_STATE.x *= 0.75;
  MOUSE_STATE.y *= 0.75;

  if (Math.abs(MOUSE_STATE.x) < math.EPSILON) {
    MOUSE_STATE.x = 0;
  }
  if (Math.abs(MOUSE_STATE.y) < math.EPSILON) {
    MOUSE_STATE.y = 0;
  }
}

function updateTexture2DData(gl: WebGLRenderingContext, texture: Texture2D): void {
  const format = texture.format;
  const type = texture.type;
  const tex = texture.texture;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texture.width, texture.height, format, type, texture.data);
}

function getWindVelocity(out: types.Real3): void {
  if (KEYBOARD.isDown(Keys.left)) out[0] = -1;
  if (KEYBOARD.isDown(Keys.right)) out[0] = 1;
  if (KEYBOARD.isDown(Keys.down)) out[2] = -1;
  if (KEYBOARD.isDown(Keys.up)) out[2] = 1;
}

function updateDeformationTextures(gl: WebGLRenderingContext, textures: Textures, 
playerVelocity: types.Real3, playerPosition: types.Real3, playerDims: types.Real3, 
grassTileInfo: GrassTile, windAudioSamplers: Array<NumberSampler>): void {
  const maxDim = grassTileInfo.dimension * grassTileInfo.density;
  const fracLocX = playerPosition[0] / maxDim;
  const fraclocZ = playerPosition[2] / maxDim;

  if (fracLocX > 1 || fracLocX < 0 || fraclocZ > 1 || fraclocZ < 0) {
    return;
  }

  const scaleX = 1;
  const scaleZ = 1;

  const normVelocity = vec3.normalize(vec3.create(), playerVelocity as vec3);

  const velocityTexture = textures.velocity;
  const velocityTextureData = velocityTexture.data;

  const amountTexture = textures.amount;
  const amountTextureData = amountTexture.data;

  const windTexture = textures.wind;
  const windTextureData = windTexture.data;

  const texWidth = velocityTexture.width;
  const texHeight = velocityTexture.height;

  if (texWidth !== texHeight) {
    console.warn('Assumed texture would be square; instead dimensions were: ', texWidth, texHeight);
    return;
  }

  if (texWidth !== amountTexture.width || texWidth !== amountTexture.height) {
    console.warn('Assumed velocity texture and amount texture would have same dimensions.');
    return;
  }

  if (texWidth !== windTexture.width || texWidth !== windTexture.width) {
    console.warn('Assumed velocity texture and wind texture would have same dimensions.');
    return;
  }

  if (texWidth * texWidth !== windAudioSamplers.length) {
    console.warn(`Expected ${texWidth*texWidth} samplers; got ${windAudioSamplers.length}`);
    return;
  }

  const fracWidth = math.clamp01((playerDims[0] * scaleX) / maxDim);
  const fracDepth = math.clamp01((playerDims[2] * scaleZ) / maxDim);

  const minX = math.clamp01(fracLocX - fracWidth/2);
  const minZ = math.clamp01(fraclocZ - fracDepth/2);

  const numPixelsX = Math.floor(velocityTexture.width * fracWidth);
  const numPixelsZ = Math.floor(velocityTexture.height * fracDepth);

  const startPixelX = Math.floor(minX * velocityTexture.width);
  const startPixelZ = Math.floor(minZ * velocityTexture.height);

  const midPixelX = (minX + fracWidth/2) * velocityTexture.width;
  const midPixelZ = (minZ + fracDepth/2) * velocityTexture.height;

  const vx = math.clamp(normVelocity[0], -1, 1);
  const vz = math.clamp(normVelocity[2], -1, 1);
  const decayAmt = 1.1;

  const vx01 = (vx + 1) * 0.5;
  const vz01 = (vz + 1) * 0.5;

  const windVx = 0.05;
  const windVz = 0.05;

  // const windVelocity = [0.05, 0, 0.05];
  // getWindVelocity(windVelocity);
  // const windVx = windVelocity[0];
  // const windVz = windVelocity[2];
  const numPixelsTexture = windTextureData.length/4;

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

  updateTexture2DData(gl, velocityTexture);
  // updateTexture2DData(gl, amountTexture);
  updateTexture2DData(gl, windTexture);
}

function beginRender(gl: WebGLRenderingContext, camera: FollowCamera): void {
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  if (gl.canvas.width !== gl.canvas.clientWidth || gl.canvas.height !== gl.canvas.clientHeight) {
    const dpr = window.devicePixelRatio || 1;
    gl.canvas.width = gl.canvas.clientWidth * dpr;
    gl.canvas.height = gl.canvas.clientHeight * dpr;
    camera.setAspect(gl.canvas.clientWidth / gl.canvas.clientHeight);
  }

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.cullFace(gl.FRONT);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function drawDebugComponents(gl: WebGLRenderingContext, prog: Program, target: types.Real3, playerScale: types.Real3, drawables: Drawables): void {
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;

  drawables.cube.vao.bind();
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);

  if (DEBUG_AABB !== null) {
    debug.drawAabb(gl, prog, model, DEBUG_AABB, [0, 1, 0], cubeDrawFunc);
  }

  const useDims = [playerScale[0]/2, playerScale[1]/2, playerScale[2]/2];
  debug.drawAt(gl, prog, model, target, useDims, [1, 1, 1], cubeDrawFunc);

  gl.disable(gl.CULL_FACE);
  drawables.quad.vao.bind();
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);
}

function drawGroundPlane(gl: WebGLRenderingContext, prog: Program, plane: Drawable, grassTileInfo: GrassTile): void {
  const model = mat4.create();
  const dim = grassTileInfo.dimension * grassTileInfo.density;

  mat4.rotateX(model, model, glMatrix.toRadian(90));
  mat4.scale(model, model, [dim/2 + 0.5, dim/2 + 0.5, 1]);

  model[12] = dim/2;
  model[13] = 1;
  model[14] = dim/2;

  const drawFunc = plane.drawFunction;

  plane.vao.bind();
  prog.setMat4('model', model);
  prog.set3f('color', 0, 0.45, 0.2);

  drawFunc(gl);
}

function drawLights(gl: WebGLRenderingContext, prog: Program, cube: Drawable, 
  lightPos: Array<types.Real3>, lightColor: Array<types.Real3>): void {
  cube.vao.bind();
  for (let i = 0; i < lightPos.length; i++) {
    debug.drawAt(gl, prog, mat4.create(), lightPos[i], 0.25, lightColor[i], cube.drawFunction);
  }
}

function drawGrass(gl: WebGLRenderingContext, prog: Program, camera: FollowCamera, 
  drawables: Drawables, lightPos: Array<types.Real3>, lightColor: Array<types.Real3>): void {
  const model = mat4.create();
  const invTransModel = mat4.create();
  const scale = [0.05, 1, 1];

  mat4.scale(model, model, scale);
  mat4.transpose(invTransModel, model);
  mat4.invert(invTransModel, invTransModel);

  prog.setMat4('model', model);
  prog.setMat4('inv_trans_model', invTransModel);
  prog.set3f('color', 0.5, 1, 0.5);
  prog.setVec3('camera_position', camera.position);
  prog.set1i('invert_normal', 0);
  prog.set3f('origin_offset', 0, 0, 0);

  for (let i = 0; i < lightPos.length; i++) {
    prog.setVec3(`light_position[${i}]`, lightPos[i] as vec3);
    prog.set3f(`light_color[${i}]`, 1, 1, 1);
  }

  prog.set1i('num_point_lights', lightPos.length);

  drawables.grassQuad.vao.bind();

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  drawables.grassQuad.drawFunction(gl);

  prog.set1i('invert_normal', 1);
  gl.cullFace(gl.FRONT);
  drawables.grassQuad.drawFunction(gl);
}

function handleGrassDrawing(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, 
  drawables: Drawables, textures: Textures, view: mat4, proj: mat4): void {
  const lightPos = [[1, 3, 1], [10, 3, 10]];
  const lightColor = [[1, 0.98, 0.8], [1, 0.98, 0.8]];
  const grassProg = programs.grass;

  drawLights(gl, programs.simple, drawables.cube, lightPos, lightColor);

  grassProg.use();
  debug.setViewProjection(programs.grass, view, proj);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.wind.texture);
  grassProg.set1i('wind_texture', 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, textures.velocity.texture);
  grassProg.set1i('velocity_texture', 1);

  drawGrass(gl, programs.grass, camera, drawables, lightPos, lightColor);
}

function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, textures: Textures, 
  drawables: Drawables, grassTileInfo: GrassTile, windAudioSamplers: Array<NumberSampler>): void {
  beginRender(gl, camera);

  const velocity = [0, 0, 0];
  const playerDims = [0.75, 1, 0.75];

  updatePlayerMovement(velocity, camera);
  updateCamera(camera, velocity);
  updateDeformationTextures(gl, textures, velocity, camera.target, playerDims, grassTileInfo, windAudioSamplers);

  const simpleProg = programs.simple;
  simpleProg.use();

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  debug.setViewProjection(simpleProg, view, proj);
  drawDebugComponents(gl, simpleProg, camera.target, playerDims, drawables);

  drawGroundPlane(gl, simpleProg, drawables.quad, grassTileInfo);

  handleGrassDrawing(gl, programs, camera, drawables, textures, view, proj);
}

export function main() {
  const glResult = debug.createCanvasAndContext(document.body);
  if (debug.checkError(glResult)) {
    return;
  }
  const gl = glResult.unwrap();
  const audioContext = new (window.AudioContext || (<any>window).webkitAudioContext)();

  debug.setupDocumentBody(MOUSE_STATE);
  debug.createTouchControls(KEYBOARD);
  
  render(gl, audioContext);
}