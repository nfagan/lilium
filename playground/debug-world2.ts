import { debug, Keyboard, Keys, Program, FollowCamera, Vao, VoxelGrid, collision, MousePicker, math, types, 
  Texture2D, parse, RenderContext } from '../src/gl';
import { Result, Stopwatch, loadAudioBuffer, loadImage, loadText, asyncTimeout } from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as simpleSources from './shaders/debug-simple';
import * as grassSources from './shaders/debug-grass2';
import * as voxelGridSources from './shaders/voxel-grid-lighting';
import * as skySources from './shaders/debug-sky';
import { PlayerMovement, Player, GrassTextureManager, GrassTile, makeGrassTileData, gameUtil, AirParticles, AirParticleResources } from '../src/game';
import * as particles from './particles';

const MOUSE_STATE = debug.makeDebugMouseState();
const KEYBOARD = new Keyboard();

type Drawable = debug.Drawable;
type InstancedDrawable = Drawable & {
  tmpEmptyArray: Float32Array
};

type Sun = {
  position: types.Real3,
  color: types.Real3
};

type Drawables = {
  quad: Drawable,
  cube: Drawable,
  instancedCube: InstancedDrawable,
  grassQuad: Drawable,
  skySphere: Drawable,
  tree: Drawable
};

type Textures = {
  grassTextureManager: GrassTextureManager,
  skyColor: Texture2D
}

type Sounds = {
  wind: AudioBufferSourceNode
};

type Programs = {
  simple: Program,
  instanced: Program,
  grass: Program,
  sky: Program
};

type VoxelGridInfo = {
  grid: VoxelGrid,
  gridCollider: collision.VoxelGridCollider,
  gridCollisionResult: collision.VoxelGridCollisionResult,
  maxNumCells: number,
  filled: Array<number>,
  colors: Array<number>,
  sub2ind: Map<number, number>,
  lastLinearInd: number,
  lastVoxel: Array<number>,
  lastColor: Array<number>
};

const enum VoxelManipulationStates {
  Selecting,
  Creating,
  Deleting
}

type GameState = {
  voxelManipulationState: VoxelManipulationStates,
  voxelClicked: boolean,
  playerJumped: boolean,
  frameTimer: Stopwatch,
  sun: Sun,
  dprIndex: number,
  dprs: types.Real3,
  lastDpr: number,
  airParticleComponent: AirParticles
};

const GAME_STATE: GameState = {
  voxelManipulationState: VoxelManipulationStates.Selecting,
  voxelClicked: false,
  playerJumped: false,
  frameTimer: new Stopwatch(),
  sun: {
    position: [50, 20, 50],
    color: [1, 1, 1]
  },
  dprIndex: 1,
  dprs: [0, 0, 0],
  lastDpr: -1,
  airParticleComponent: null
};

function createInstancedProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, voxelGridSources.vertex, voxelGridSources.fragment);
}

function createSkyProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, skySources.vertex, skySources.fragment);
}

function createGrassProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, grassSources.vertex, grassSources.fragment);
}

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, simpleSources.vertex, simpleSources.fragment);
}

async function loadWindSound(audioContext: AudioContext): Promise<AudioBufferSourceNode> {
  const soundUrl = '/sound/lf_noise_short.m4a';
  const buffer = await asyncTimeout(() => loadAudioBuffer(audioContext, soundUrl), 10000);
  return buffer;
}

async function loadModels(): Promise<parse.Obj> {
  const url = '/model/tree2.obj';
  const src = await asyncTimeout(() => loadText(url), 10000);
  return new parse.Obj(src);
}

async function makeSounds(audioContext: AudioContext): Promise<Sounds> {
  const wind = await loadWindSound(audioContext);
  return {wind};
}

function makeGrassQuad(gl: WebGLRenderingContext, prog: Program, grassTileInfo: GrassTile): Drawable {
  const numSegments = 8;
  const positions = debug.segmentedQuadPositions(numSegments);

  const translations: Array<number> = [];
  const rotations: Array<number> = [];
  const uvs: Array<number> = [];

  makeGrassTileData(grassTileInfo, translations, rotations, uvs);

  const vboDescriptors: Array<types.VboDescriptor> = [
    {name: 'position', attributes: [types.makeAttribute('a_position', gl.FLOAT, 3)], data: positions},
    {name: 'translation', attributes: [types.makeAttribute('a_translation', gl.FLOAT, 3, 1)], data: new Float32Array(translations)},
    {name: 'rotation', attributes: [types.makeAttribute('a_rotation', gl.FLOAT, 1, 1)], data: new Float32Array(rotations)},
    {name: 'uv', attributes: [types.makeAttribute('a_uv', gl.FLOAT, 2, 1)], data: new Float32Array(uvs)}
  ];

  const vao = Vao.fromDescriptors(gl, prog, vboDescriptors);
  
  const numVerts = positions.length/3;
  const numInstances = translations.length/3;

  return {
    vao,
    drawFunction: gl => {
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, numVerts, numInstances);
    },
    isInstanced: true,
    numActiveInstances: numInstances
  };
}

function makeDrawable(gl: WebGLRenderingContext, prog: Program, 
  positions: Float32Array, indices: Uint16Array, numTriangles: number): Drawable {
  
  const vboDescriptors = [{
    name: 'position',
    attributes: [types.makeAttribute('a_position', gl.FLOAT, 3)],
    data: positions
  }];

  const eboDescriptor = {name: 'indices', indices};

  const vao = Vao.fromDescriptors(gl, prog, vboDescriptors, eboDescriptor);

  return {
    vao,
    drawFunction: gl => gl.drawElements(gl.TRIANGLES, numTriangles, gl.UNSIGNED_SHORT, 0),
    isInstanced: false
  };
}

function makeSkySphere(gl: WebGLRenderingContext, prog: Program, data: Float32Array, indices: Uint16Array): Drawable {
  const vboDescriptors = [{
    name: 'data',
    attributes: [
      types.makeAttribute('a_position', gl.FLOAT, 3), 
      types.makeAttribute('a_uv', gl.FLOAT, 2),
      types.makeAttribute('a_normal', gl.FLOAT, 3)
    ],
    data
  }];

  const eboDescriptor = {name: 'indices', indices};

  const vao = Vao.fromDescriptors(gl, prog, vboDescriptors, eboDescriptor);
  const numTris = indices.length;

  return {
    vao,
    drawFunction: gl => gl.drawElements(gl.TRIANGLE_STRIP, numTris, gl.UNSIGNED_SHORT, 0),
    isInstanced: false
  };
}

function makeInstancedDrawable(gl: WebGLRenderingContext, prog: Program, positions: Float32Array, 
  indices: Uint16Array, numTriangles: number, maxNumInstances: number): InstancedDrawable {
  const emptyFloatArray = new Float32Array(maxNumInstances * 3); //  * (x, y, z) or (r, g, b)

  const vboDescriptors = [{
    name: 'position',
    attributes: [types.makeAttribute('a_position', gl.FLOAT, 3, 0), types.makeAttribute('a_normal', gl.FLOAT, 3, 0)],
    data: positions
  },{
    name: 'color',
    attributes: [types.makeAttribute('a_color', gl.FLOAT, 3, 1)],
    data: emptyFloatArray
  },{
    name: 'translation',
    attributes: [types.makeAttribute('a_translation', gl.FLOAT, 3, 1)],
    data: emptyFloatArray
  }];

  const eboDescriptor = {name: 'indices', indices};

  const vao = Vao.fromDescriptors(gl, prog, vboDescriptors, eboDescriptor);

  const drawable: InstancedDrawable = {
    vao: vao,
    drawFunction: null,
    isInstanced: true,
    numTriangles: numTriangles,
    numActiveInstances: 0,
    tmpEmptyArray: new Float32Array(3)
  };

  const drawFunc = (gl: WebGLRenderingContext) => {
    const numTris = drawable.numTriangles;
    const numInstances = drawable.numActiveInstances;

    if (numInstances === 0) {
      return;
    }

    const ext = gl.getExtension('ANGLE_instanced_arrays');
    ext.drawElementsInstancedANGLE(gl.TRIANGLES, numTris, gl.UNSIGNED_SHORT, 0, numInstances);
  }
  
  drawable.drawFunction = drawFunc;

  return drawable;
}

function makeDrawables(gl: WebGLRenderingContext, programs: Programs, maxNumInstances: number, grassTileInfo: GrassTile, treeObj: parse.Obj): Result<Drawables, string> {
  const cubePos = debug.cubePositions();
  const cubeInds = debug.cubeIndices();
  const cubeInterleavedData = debug.cubeInterleavedPositionsNormals();
  const sphereData = debug.sphereInterleavedDataAndIndices();

  const prog = programs.simple;
  const instancedProg = programs.instanced;
  const grassProg = programs.grass;
  const skyProg = programs.sky;

  try {
    const cube = makeDrawable(gl, prog, cubePos, cubeInds, 36);
    const quad = makeDrawable(gl, prog, debug.quadPositions(), debug.quadIndices(), 6);
    const instancedCube = makeInstancedDrawable(gl, instancedProg, cubeInterleavedData, cubeInds, 36, maxNumInstances);
    const grassQuad = makeGrassQuad(gl, grassProg, grassTileInfo);
    const skySphere = makeSkySphere(gl, skyProg, sphereData.vertexData, sphereData.indices);
    const tree = makeDrawableFromObj(gl, prog, treeObj);

    return Result.Ok({cube, quad, instancedCube, grassQuad, skySphere, tree});
  } catch (err) {
    return Result.Err(err.message);
  }
}

function makeDrawableFromObj(gl: WebGLRenderingContext, prog: Program, obj: parse.Obj): Drawable {
  const pos = new Float32Array(obj.positions);
  const inds = new Uint16Array(obj.positionIndices);

  return makeDrawable(gl, prog, pos, inds, inds.length);
}

function makeGrassTextures(gl: WebGLRenderingContext, windSound: AudioBufferSourceNode, yCellDim: number): GrassTextureManager {
  const grassTileInfo: GrassTile = {
    density: 0.1,
    dimension: 200,
    offsetX: 2,
    offsetY: yCellDim,
    offsetZ: 2
  };

  const textureSize = 256;
  const windNoise = gameUtil.getBufferSourceNodeChannelData(windSound);

  const grassTextures = new GrassTextureManager(gl, grassTileInfo, windNoise);
  grassTextures.create({textureSize});

  return grassTextures;
}

async function makeSkyTexture(gl: WebGLRenderingContext): Promise<Texture2D> {
  const img = await asyncTimeout(() => loadImage('/texture/sky4.png'), 10000);
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

function encloseGrass(grassTextures: GrassTextureManager, voxelGridInfo: VoxelGridInfo): void {
  const dim = grassTextures.grassTileInfo.density * grassTextures.grassTileInfo.dimension;
  const offX = grassTextures.offsetX;
  const offZ = grassTextures.offsetZ;
  const height = 2;

  const indices = [0, 0, 0];

  voxelGridInfo.grid.getCellIndexOf3(indices, offX, 0, offZ);

  const minX = indices[0] - 1;
  const minZ = indices[2] - 1;

  voxelGridInfo.grid.getCellIndexOf3(indices, offX + dim, 0, offZ + dim);

  const maxX = indices[0];
  const maxZ = indices[2];

  const numX = maxX - minX;
  const numZ = maxZ - minZ;

  for (let i = 0; i < numX; i++) {
    for (let j = 0; j < height; j++) {
      indices[0] = i + minX;
      indices[1] = 1 + j;
      indices[2] = minZ;
      addVoxelCell(voxelGridInfo, indices);

      indices[2] = maxZ;
      addVoxelCell(voxelGridInfo, indices);
    }
  }

  for (let i = 0; i < numZ; i++) {
    for (let j = 0; j < height; j++) {
      indices[0] = minX;
      indices[1] = 1 + j;
      indices[2] = i + minZ;
      addVoxelCell(voxelGridInfo, indices);

      indices[0] = maxX;
      addVoxelCell(voxelGridInfo, indices);
    }
  }

  for (let i = 0; i < height; i++) {
    indices[0] = maxX;
    indices[1] = i + 1;
    indices[2] = maxZ;

    addVoxelCell(voxelGridInfo, indices);
  }
}

async function render(gl: WebGLRenderingContext, audioContext: AudioContext) {
  const camera = debug.makeFollowCamera(gl);

  const simpleProgResult = createSimpleProgram(gl);
  const instancedProgResult = createInstancedProgram(gl);
  const grassProgResult = createGrassProgram(gl);
  const skyProgResult = createSkyProgram(gl);
  const renderContext = new RenderContext(gl);

  if (debug.checkError(simpleProgResult) || 
      debug.checkError(instancedProgResult) ||
      debug.checkError(grassProgResult) ||
      debug.checkError(skyProgResult)) {
    return;
  }

  particles.init(gl, audioContext);

  const airParticleResources = new AirParticleResources(10000, '/sound/wind-a-short2.aac');
  await airParticleResources.load(audioContext, err => {
    console.log(err);
  });

  const airParticles = new AirParticles(renderContext, airParticleResources.noiseSource);
  airParticles.create({numParticles: 1000, particleGridScale: 10, particleScale: 0.005});
  GAME_STATE.airParticleComponent = airParticles;

  const gridDim = 50;
  const cellDims = [2, 0.5, 2];
  const nFilled = gridDim;
  const maxNumInstances = gridDim * gridDim * 2;
  const voxelGrid = makeVoxelGrid([gridDim, gridDim, gridDim], cellDims, nFilled, maxNumInstances);

  const sounds = await makeSounds(audioContext);
  const grassTextures = makeGrassTextures(gl, sounds.wind, cellDims[1]);

  encloseGrass(grassTextures, voxelGrid)

  // const playerDims = [0.51, 0.51, 0.51];
  const playerDims = [1.01, 1.01, 1.01];
  const player = new Player(playerDims);
  const playerMovement = new PlayerMovement(voxelGrid.grid);

  player.aabb.moveTo3(8, 8, 8);

  const programs: Programs = {
    simple: simpleProgResult.unwrap(),
    instanced: instancedProgResult.unwrap(),
    grass: grassProgResult.unwrap(),
    sky: skyProgResult.unwrap()
  };

  const textures: Textures = {
    grassTextureManager: grassTextures,
    skyColor: await makeSkyTexture(gl)
  };

  const treeObj = await loadModels();

  const drawableRes = makeDrawables(gl, programs, maxNumInstances, grassTextures.grassTileInfo, treeObj);
  if (debug.checkError(drawableRes)) {
    return;
  }
  const drawables = drawableRes.unwrap();

  function renderer() {
    renderLoop(gl, programs, camera, player, playerMovement, drawables, voxelGrid, textures);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function mouseRay(out: vec3, gl: WebGLRenderingContext, view: mat4, projection: mat4): boolean {
  const x = MOUSE_STATE.lastX;
  const y = MOUSE_STATE.lastY;
  const w = gl.canvas.clientWidth;
  const h = gl.canvas.clientHeight;

  if (x === null) {
    return false;
  }

  const mousePicker = new MousePicker();
  mousePicker.ray(out, x, y, view, projection, w, h);

  return true;
}

function drawDebugComponents(gl: WebGLRenderingContext, prog: Program, drawables: Drawables, player: Player): void {
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;

  drawables.cube.vao.bind();
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);

  const playerAabb = player.aabb;
  debug.drawAabb(gl, prog, model, playerAabb, [0, 0, 1], cubeDrawFunc);

  gl.disable(gl.CULL_FACE);
  drawables.quad.vao.bind();
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);
  gl.enable(gl.CULL_FACE);
}

function drawSelectedVoxel(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, voxelGridInfo: VoxelGridInfo): void {
  const cellCenter = vec3.create();
  const useCellDims = vec3.create();
  const lastLinearIdx = voxelGridInfo.lastLinearInd;

  for (let i = 0; i < 3; i++) {
    cellCenter[i] = voxelGridInfo.filled[i + lastLinearIdx];
    const szOffset = 0.05;
    useCellDims[i] = voxelGridInfo.grid.cellDimensions[i] / 2 + szOffset;
  }

  drawable.vao.bind();
  voxelGridInfo.grid.getCellCenter(cellCenter, cellCenter);
  debug.drawAt(gl, prog, mat4.create(), cellCenter, useCellDims, [1, 1, 1], drawable.drawFunction);
}

function drawInstancedVoxelGrid(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, 
  drawables: Drawables, sun: Sun, voxelGridInfo: VoxelGridInfo, view: mat4, proj: mat4): void {
  programs.simple.use();

  if (voxelGridInfo.lastLinearInd !== null) {
    drawSelectedVoxel(gl, programs.simple, drawables.cube, voxelGridInfo);
  }
  
  const instancedProg = programs.instanced;
  const cellDims = voxelGridInfo.grid.cellDimensions;

  instancedProg.use();
  debug.setViewProjection(programs.instanced, view, proj);
  instancedProg.set3f('scale', cellDims[0]/2, cellDims[1]/2, cellDims[2]/2);

  instancedProg.setVec3('sun_color', sun.color);
  instancedProg.setVec3('sun_position', sun.position);
  instancedProg.setVec3('camera_position', camera.position);

  drawables.instancedCube.vao.bind();
  drawables.instancedCube.drawFunction(gl);
}

function drawSun(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, sun: Sun): void {
  drawable.vao.bind();
  debug.drawAt(gl, prog, mat4.create(), sun.position, 1.0, sun.color, drawable.drawFunction);
}

function drawTree(gl: WebGLRenderingContext, prog: Program, tree: Drawable): void {
  tree.vao.bind();
  debug.drawAt(gl, prog, mat4.create(), [10, 0.5, 10], 0.5, [0, 0.5, 1], tree.drawFunction);
}

function drawSky(gl: WebGLRenderingContext, prog: Program, skySphere: Drawable, 
  skyTexture: Texture2D, view: mat4, proj: mat4, grid: VoxelGrid): void {
  prog.use();
  skySphere.vao.bind();

  const centerPoint = [0, 0, 0];
  const sz = grid.gridDimensions[0] * 2;
  const model = mat4.create();

  grid.getWorldCenter(centerPoint);
  centerPoint[1] = 0;

  debug.setViewProjection(prog, view, proj);
  mat4.translate(model, model, centerPoint);
  mat4.scale(model, model, [sz, sz, sz]);
  prog.setMat4('model', model);

  gl.activeTexture(gl.TEXTURE0);
  skyTexture.bind();
  prog.set1i('color_texture', 0);

  skySphere.drawFunction(gl);
}

function drawGrass(gl: WebGLRenderingContext, prog: Program, camera: FollowCamera, 
  drawables: Drawables, grassTextures: GrassTextureManager, lightPos: Array<types.Real3>, lightColor: Array<types.Real3>): void {
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
  prog.set3f('origin_offset', grassTextures.offsetX, grassTextures.offsetY, grassTextures.offsetZ);

  for (let i = 0; i < lightPos.length; i++) {
    prog.setVec3(`light_position[${i}]`, lightPos[i]);
    prog.setVec3(`light_color[${i}]`, lightColor[i]);
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
  drawables: Drawables, grassTextures: GrassTextureManager, sun: Sun, view: mat4, proj: mat4): void {

  const dim = grassTextures.grassTileInfo.dimension * grassTextures.grassTileInfo.density;
  const offX = grassTextures.offsetX;
  const offZ = grassTextures.offsetZ;

  const lightPos = [[1+offX, 3, 1+offZ], [dim+offX, 3, dim+offZ], sun.position];
  const lightColor = [[1, 0.98, 0.8], [1, 0.98, 0.8], sun.color];
  const grassProg = programs.grass;

  grassProg.use();
  debug.setViewProjection(programs.grass, view, proj);

  grassTextures.windTexture.activateAndBind();
  grassProg.setTexture('wind_texture', grassTextures.windTexture.index);

  grassTextures.velocityTexture.activateAndBind();
  grassProg.setTexture('velocity_texture', grassTextures.velocityTexture.index);

  drawGrass(gl, programs.grass, camera, drawables, grassTextures, lightPos, lightColor);
}

function makeVoxelGrid(gridDims: vec3 | Array<number>, cellDims: vec3 | Array<number>, initialDim: number, maxNumCells: number): VoxelGridInfo {
  const grid = new VoxelGrid([0, 0, 0], gridDims, cellDims);

  const gridInfo: VoxelGridInfo = {
    grid: grid,
    gridCollisionResult: new collision.VoxelGridCollisionResult(),
    gridCollider: new collision.VoxelGridCollider(grid),
    maxNumCells,
    filled: [],
    colors: [],
    sub2ind: new Map<number, number>(),
    lastLinearInd: null,
    lastVoxel: [],
    lastColor: []
  };

  const toAdd = [0, 0, 0];

  for (let i = 0; i < initialDim; i++) {
    for (let j = 0; j < initialDim; j++) {
      toAdd[0] = i;
      toAdd[2] = j;

      if (!gridInfo.grid.isFilled(toAdd)) {
        addVoxelCell(gridInfo, toAdd);
      }
    }
  }

  const rows = 0;
  const cols = 1;
  const height = 6;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < height; k++) {
        toAdd[0] = i;
        toAdd[1] = k + 1;
        toAdd[2] = j;

        addVoxelCell(gridInfo, toAdd);
      }
    }
  }

  return gridInfo;
}

function addVoxelCell(voxelGridInfo: VoxelGridInfo, atIdx: types.Real3, playerAabb?: math.Aabb): void {
  const grid = voxelGridInfo.grid;
  if (!grid.isInBoundsVoxelIndex(atIdx)) {
    console.log('Out of range index: ', atIdx);
    return;
  }

  if (grid.isFilled(atIdx)) {
    console.log('Already exists: ', atIdx);
    return;
  }

  grid.markFilled(atIdx);

  //  Hack -- test to see if collission occurs with this new
  //  cell. If so, unmark it, and return.
  if (playerAabb !== undefined) {
    const collider = voxelGridInfo.gridCollider;
    const collisionResult = voxelGridInfo.gridCollisionResult;

    collider.collidesWithAabb3(collisionResult, playerAabb, 0, 0, 0);

    if (collisionResult.collided) {
      console.log('Not adding cell because it overlaps with player: ', atIdx);
      grid.markEmpty(atIdx);
      return;
    }
  }

  const currIdx = voxelGridInfo.filled.length;

  for (let i = 0; i < 3; i++) {
    voxelGridInfo.filled.push(atIdx[i]);
    voxelGridInfo.colors.push(Math.random());
  }

  voxelGridInfo.sub2ind.set(grid.subToInd(atIdx), currIdx);
}

function clearVoxelSelection(voxelGridInfo: VoxelGridInfo): void {
  if (voxelGridInfo.lastLinearInd !== null) {
    for (let i = 0; i < 3; i++) {
      voxelGridInfo.colors[i+voxelGridInfo.lastLinearInd] = voxelGridInfo.lastColor[i];
    }
    voxelGridInfo.lastLinearInd = null;
  }
}

function handleSelectedColors(voxelGridInfo: VoxelGridInfo, currIdx: number): void {
  for (let i = 0; i < 3; i++) {
    voxelGridInfo.lastColor[i] = voxelGridInfo.colors[currIdx+i];
    voxelGridInfo.colors[currIdx+i] = 1;
  }
}

function handleVoxelSelection(voxelGridInfo: VoxelGridInfo, gl: WebGLRenderingContext, camera: FollowCamera, view: mat4, proj: mat4) {
  const rayDir = vec3.create();
  const rayOrigin = camera.position;
  const grid = voxelGridInfo.grid;
  clearVoxelSelection(voxelGridInfo);

  const success = mouseRay(rayDir, gl, view, proj);
  if (!success) {
    return;
  }

  const cellIdx = vec3.create();
  const intersects = grid.intersectingCell(cellIdx, rayOrigin, rayDir);
  if (!intersects) {
    return;
  }

  const currIdx = voxelGridInfo.sub2ind.get(grid.subToInd(cellIdx));
  handleSelectedColors(voxelGridInfo, currIdx);

  voxelGridInfo.lastLinearInd = currIdx;
  for (let i = 0; i < 3; i++) {
    voxelGridInfo.lastVoxel[i] = cellIdx[i];
  }

  if (GAME_STATE.voxelClicked) {
    GAME_STATE.voxelManipulationState = VoxelManipulationStates.Creating;
  }
}

function handleVoxelAddition(voxelGridInfo: VoxelGridInfo, playerAabb: math.Aabb, forwardDir: types.Real3): void {
  if (voxelGridInfo.lastLinearInd === null) {
    return;
  }

  let ix = voxelGridInfo.lastVoxel[0];
  let iy = voxelGridInfo.lastVoxel[1];
  let iz = voxelGridInfo.lastVoxel[2];

  let markedKey: number = -1;

  const amtX = forwardDir[0];
  const amtZ = forwardDir[2];

  const mapping = [0, 1, 2];
  const inds = [ix, iy, iz];
  const signs = [1, 1, 1];
  let isReverse: boolean = false;
  
  if (Math.abs(amtX) > Math.abs(amtZ)) {
    mapping[0] = 2;
    mapping[2] = 0;
    isReverse = Math.sign(amtX) === -1;
  } else {
    isReverse = Math.sign(amtZ) === -1;
  }

  if (isReverse) {
    signs[0] = 1;
    signs[2] = -1;
  } else {
    signs[0] = -1;
    signs[2] = 1;
  }

  if (KEYBOARD.isDown(Keys.w)) {
    inds[mapping[2]] -= signs[2];
    markedKey = Keys.w;
  } else if (KEYBOARD.isDown(Keys.s)) {
    inds[mapping[2]] += signs[2];
    markedKey = Keys.s;
  } else if (KEYBOARD.isDown(Keys.a)) {
    inds[mapping[0]] -= signs[0];
    markedKey = Keys.a;
  } else if (KEYBOARD.isDown(Keys.d)) {
    inds[mapping[0]] += signs[0];
    markedKey = Keys.d;
  } else if (KEYBOARD.isDown(Keys.q)) {
    inds[1]++;
    markedKey = Keys.q;
  } else if (KEYBOARD.isDown(Keys.z)) {
    inds[1]--;
    markedKey = Keys.z;
  }

  const anyMarked = markedKey !== -1;

  if (anyMarked) {
    addVoxelCell(voxelGridInfo, inds, playerAabb);
    GAME_STATE.voxelManipulationState = VoxelManipulationStates.Selecting;
    KEYBOARD.markUp(markedKey);
  }
}

function updateVoxelInstances(gl: WebGLRenderingContext, voxelGridInfo: VoxelGridInfo, instancedCube: InstancedDrawable): void {
  const grid = voxelGridInfo.grid;
  const numFilled = grid.countFilled();
  const numActiveInstances = instancedCube.numActiveInstances;
  const cellDims = grid.cellDimensions;
  const filled = voxelGridInfo.filled;

  if (numFilled === numActiveInstances) {
    return;
  } else if (numFilled < numActiveInstances) {
    //  @TODO: Handle this case via a removeVoxelCell() function or similar.
    console.warn('Fewer filled cells than active instances.');
    return;
  } else if (numFilled >= voxelGridInfo.maxNumCells) {
    console.log(`Maximum num cells (${voxelGridInfo.maxNumCells}) reached.`);
    return;
  }

  const numToUpdate = numFilled - numActiveInstances;
  const offsetFilled = numActiveInstances * 3;
  const byteOffset = offsetFilled * Float32Array.BYTES_PER_ELEMENT;

  const instanceVao = instancedCube.vao;
  const translationVbo = instanceVao.getVbo('translation');
  const colorVbo = instanceVao.getVbo('color');

  let tmpArray: Float32Array = null;
  if (numToUpdate === 1) {
    //  Don't create a new array for only a single addition.
    tmpArray = instancedCube.tmpEmptyArray;
  } else {
    tmpArray = new Float32Array(numToUpdate * 3);
  }

  for (let i = 0; i < numToUpdate; i++) {
    for (let j = 0; j < 3; j++) {
      const linearIdx = i*3 + j;
      const minDim = filled[linearIdx + offsetFilled] * cellDims[j];
      const midDim = minDim + cellDims[j]/2;
      tmpArray[linearIdx] = midDim;
    }
  }

  translationVbo.bind(gl);
  translationVbo.subData(gl, tmpArray, byteOffset);

  for (let i = 0; i < numToUpdate; i++) {
    // tmpArray[i*3+0] = Math.random() * 0.8 + 0.1;
    // tmpArray[i*3+1] = Math.random() * 0.8 + 0.1;
    // tmpArray[i*3+2] = Math.random() * 0.8 + 0.1;

    tmpArray[i*3+0] = 0;
    tmpArray[i*3+1] = 0.45;
    tmpArray[i*3+2] = 0.2;
  }
  
  colorVbo.bind(gl);
  colorVbo.subData(gl, tmpArray, byteOffset);

  instancedCube.numActiveInstances = numFilled;
}

function updatePlayerPosition(dt: number, playerAabb: math.Aabb, playerMovement: PlayerMovement, camera: FollowCamera): void {
  if (KEYBOARD.isDown(Keys.space)) {
    GAME_STATE.playerJumped = true;
    KEYBOARD.markUp(Keys.space);
  }

  const front = vec3.create();
  const right = vec3.create();

  camera.getFront(front);
  camera.getRight(right);
  
  const velocity = [0, 0, 0];

  if (GAME_STATE.playerJumped) {
    playerMovement.tryJump();
    GAME_STATE.playerJumped = false;
  }

  front[1] = 0;
  vec3.normalize(front, front);

  if (KEYBOARD.isDown(Keys.w)) math.sub3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.s)) math.add3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.a)) math.sub3(velocity, velocity, right);
  if (KEYBOARD.isDown(Keys.d)) math.add3(velocity, velocity, right);

  playerMovement.addVelocity(velocity);
  playerMovement.update(dt, playerAabb);
}

function updateCamera(dt: number, camera: FollowCamera, playerAabb: math.Aabb) {
  const target = [playerAabb.midX(), playerAabb.midY(), playerAabb.midZ()];
  debug.updateFollowCamera(dt, camera, target, MOUSE_STATE, KEYBOARD);
}

function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, 
  player: Player, playerMovement: PlayerMovement, drawables: Drawables, voxelGridInfo: VoxelGridInfo, textures: Textures): void {
  const frameTimer = GAME_STATE.frameTimer;
  const dt = Math.max(frameTimer.elapsedSecs(), 1/60);
  const sun = GAME_STATE.sun;
  const grassTextures = textures.grassTextureManager;
  const dpr = getDpr();

  if (dpr !== GAME_STATE.lastDpr) {
    debug.beginRender(gl, camera, dpr, true);
    GAME_STATE.lastDpr = dpr;
  } else {
    debug.beginRender(gl, camera, dpr);
  }

  if (GAME_STATE.voxelManipulationState !== VoxelManipulationStates.Creating) {
    updatePlayerPosition(dt, player.aabb, playerMovement, camera);
    updateCamera(dt, camera, player.aabb);
  }

  const simpleProg = programs.simple;
  simpleProg.use();

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  switch (GAME_STATE.voxelManipulationState) {
    case VoxelManipulationStates.Selecting:
      handleVoxelSelection(voxelGridInfo, gl, camera, view, proj);
      break;
    case VoxelManipulationStates.Creating:
      const front = vec3.create();
      camera.getFront(front);
      handleVoxelAddition(voxelGridInfo, player.aabb, front);
      break;
  }

  debug.setViewProjection(simpleProg, view, proj);
  // drawDebugComponents(gl, simpleProg, drawables, player);
  drawables.cube.vao.bind();
  debug.drawAabb(gl, simpleProg, mat4.create(), player.aabb, [0, 0, 1], drawables.cube.drawFunction);

  drawSun(gl, simpleProg, drawables.cube, sun);
  // drawTree(gl, simpleProg, drawables.tree);

  updateVoxelInstances(gl, voxelGridInfo, drawables.instancedCube);
  drawInstancedVoxelGrid(gl, programs, camera, drawables, sun, voxelGridInfo, view, proj);

  grassTextures.update(dt, player.aabb, 1, 1, 1);
  handleGrassDrawing(gl, programs, camera, drawables, grassTextures, sun, view, proj);

  drawSky(gl, programs.sky, drawables.skySphere, textures.skyColor, view, proj, voxelGridInfo.grid);

  particles.update(gl, player.aabb);
  particles.render(gl, camera, view, proj, sun);

  // GAME_STATE.airParticleComponent.update(dt, player.aabb);
  // GAME_STATE.airParticleComponent.draw(camera.position, view, proj, sun.position, sun.color);

  // particles.update(gl, player.aabb);
  // particles.render(gl, camera, view, proj, sun);

  GAME_STATE.voxelClicked = false;
  frameTimer.reset();

  // while (frameTimer.elapsedSecs() < 1/30) {
  //   //
  // }
}

function getDpr(): number {
  if (GAME_STATE.dprs[2] === 0) {
    GAME_STATE.dprs[0] = 0.75;
    GAME_STATE.dprs[1] = 1;
    GAME_STATE.dprs[2] = window.devicePixelRatio || 1;
  } else {
    if (KEYBOARD.isDown(Keys.k)) {
      KEYBOARD.markUp(Keys.k);

      GAME_STATE.dprIndex++;

      if (GAME_STATE.dprIndex >= GAME_STATE.dprs.length) {
        GAME_STATE.dprIndex = 0;
      }
    }
  }

  return GAME_STATE.dprs[GAME_STATE.dprIndex];
}

function initializeGameStateListeners(gl: WebGLRenderingContext) {
  gl.canvas.addEventListener('click', () => {
    GAME_STATE.voxelClicked = true;
  });
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
  initializeGameStateListeners(gl);
  render(gl, audioContext);
}