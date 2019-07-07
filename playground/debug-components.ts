import * as wgl from '../src/gl';
import { PlayerMovement, Player, WorldGrid, GrassTile, 
  GrassModelOptions, GrassTextureOptions, GrassComponent, GrassResources, gameUtil, 
  AirParticles, AirParticleResources, PlayerMoveControls, Controller, input, ImageQualityManager, getDpr, FatalError, WorldGridDrawable, 
  WorldGridComponent, SkyDomeDrawable, SkyDomeResources, AirParticleOptions } from '../src/game';
import { Stopwatch, loadText, asyncTimeout, tryExtractErrorMessage, loadImage } from '../src/util';
import { mat4, glMatrix } from 'gl-matrix';

type Game = {
  mouse: wgl.debug.DebugMouseState,
  keyboard: wgl.Keyboard,
  airParticleComponent: AirParticles,
  grassComponent: GrassComponent,
  playerMovement: PlayerMovement,
  controller: Controller,
  moveControls: PlayerMoveControls,
  worldGrid: WorldGridComponent,
  player: Player,
  playerDrawable: wgl.Model,
  frameTimer: Stopwatch,
  sunPosition: Array<number>,
  sunColor: Array<number>,
  airParticleOptions: AirParticleOptions,
  grassTileOptions: GrassTile,
  grassModelOptions: GrassModelOptions,
  grassTextureOptions: GrassTextureOptions,
  imageQualityManager: ImageQualityManager,
  scene: wgl.Scene
};

const GAME: Game = {
  mouse: wgl.debug.makeDebugMouseState(),
  keyboard: new wgl.Keyboard(),
  airParticleComponent: null,
  grassComponent: null,
  playerMovement: null,
  controller: null,
  moveControls: null,
  worldGrid: null,
  player: null,
  playerDrawable: null,
  frameTimer: null,
  sunPosition: [50, 20, 50],
  sunColor: [1, 1, 1],
  airParticleOptions: {
    numParticles: 1000, 
    particleGridScale: 10,
    particleScale: 0.0075
  },
  grassTileOptions: {
    density: 0.1,
    dimension: 300,
    offsetX: 2,
    offsetY: 0,
    offsetZ: 2
  },
  grassModelOptions: {numSegments: 3},
  grassTextureOptions: {textureSize: 256},
  imageQualityManager: new ImageQualityManager(),
  scene: new wgl.Scene()
};

// async function makeFlower(renderer: wgl.Renderer, renderContext: wgl.RenderContext): Promise<wgl.Model> {
//   const gl = renderContext.gl;

//   const flowerTexture = await asyncTimeout(() => loadImage('/texture/lilac.png'), 5e3);
//   const tex = wgl.Texture2D.linearRepeatRGBA(gl);
//   tex.wrapS = gl.CLAMP_TO_EDGE;
//   tex.wrapT = gl.CLAMP_TO_EDGE;

//   tex.bind();
//   tex.configure();
//   tex.fillImageElement(flowerTexture);

//   const mat = wgl.Material.NoLight();
//   mat.setUniformProperty('modelColor', tex);
//   const prog = renderer.requireProgram(mat);

//   const vaoResult = wgl.factory.vao.makeQuadUvVao(gl, prog);
//   const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);

//   const model = new wgl.Model(drawable, mat);
//   model.transform.translate([10, 0, 10]);
//   mat4.rotateZ(model.transform.matrix, model.transform.matrix, glMatrix.toRadian(180));
//   model.transform.scale(10);

//   return model;
// }

function makeWorldGrid(renderContext: wgl.RenderContext): WorldGridComponent {
  const gridDim = 50;
  const cellDims = [2, 0.5, 2];
  const maxNumInstances = gridDim * gridDim * 2;

  const grid = new wgl.VoxelGrid([0, 0, 0], [gridDim, gridDim, gridDim], cellDims);
  const worldGrid = new WorldGrid(grid, maxNumInstances);
  const floorDim = Math.floor(gridDim/2);

  const worldGridDrawable = new WorldGridDrawable(grid, renderContext, worldGrid.maxNumFilledCells);
  worldGridDrawable.create();

  const gridComponent = new WorldGridComponent(worldGrid, worldGridDrawable);
  gridComponent.fillGround(floorDim, floorDim);

  const dim = GAME.grassTileOptions.density * GAME.grassTileOptions.dimension;
  const offX = GAME.grassTileOptions.offsetX;
  const offZ = GAME.grassTileOptions.offsetZ;
  gridComponent.encloseSquare(dim, offX, offZ, 2);

  return gridComponent;
}

function makeLight(renderer: wgl.Renderer, renderContext: wgl.RenderContext, lightPos: wgl.types.Real3, lightColor: wgl.types.Real3): wgl.Model {
  const gl = renderContext.gl;

  const mat = wgl.Material.NoLight();
  mat.setUniformProperty('modelColor', lightColor);
  const prog = renderer.requireProgram(mat);

  const vaoResult = wgl.factory.vao.makeCubeVao(gl, prog);
  const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);

  const model = new wgl.Model(drawable, mat);
  model.transform.translate(lightPos);
  return model;
}

async function makeSkyDome(renderer: wgl.Renderer, renderContext: wgl.RenderContext): Promise<wgl.Model> {
  const resources = new SkyDomeResources('/texture/sky4.png', 5e3);
  await resources.load(err => console.log(err));

  const skyDrawable = new SkyDomeDrawable();
  skyDrawable.create(renderer, renderContext, resources);

  skyDrawable.model.transform.translate([10, 2, 10]);
  skyDrawable.model.transform.scale(100);

  return skyDrawable.model;
}

async function makePlayerDrawable(renderer: wgl.Renderer, renderContext: wgl.RenderContext): Promise<wgl.Model> {
  const modelUrl = '/model/character2:character3.obj';
  const modelObj = await asyncTimeout(() => loadText(modelUrl), 5e3);
  const parse = new wgl.parse.Obj(modelObj);

  // const mat = wgl.Material.Phong();
  const mat = wgl.Material.Physical();
  mat.setUniformProperty('modelColor', [1, 1, 0.2]);
  mat.setUniformProperty('metallic', 3);
  mat.setUniformProperty('roughness', 1);

  const prog = renderer.requireProgram(mat);
  const vaoResult = wgl.factory.vao.makeCubeVao(renderContext.gl, prog);
  const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);

  const model = new wgl.Model(drawable, mat);
  model.transform.translate([10, 1.5, 10]);
  return model;
}

function makeController(keyboard: wgl.Keyboard): Controller {
  const jumpButton = input.Button.bindToKey(keyboard, wgl.Keys.space, 'jump');
  const directionalInput = input.DirectionalInput.fromKeyboard(keyboard);
  directionalInput.invertZ = true;
  const rotationalInput = new input.RotationalInput();
  rotationalInput.bindToMouseMove(document.body);
  rotationalInput.bindToTouchMove(document.body);

  return new Controller(jumpButton, directionalInput, rotationalInput);
}

function updateCamera(dt: number, camera: wgl.FollowCamera, playerAabb: wgl.math.Aabb, game: Game) {
  const target = [playerAabb.midX(), playerAabb.midY(), playerAabb.midZ()];
  wgl.debug.updateFollowCamera(dt, camera, target, game.mouse, game.keyboard);
}

function handleQuality(keyboard: wgl.Keyboard, qualityManager: ImageQualityManager): boolean {
  if (keyboard.isDown(wgl.Keys.k)) {
    qualityManager.cycleQuality();
    keyboard.markUp(wgl.Keys.k);
    return true;
  }
  return false;
}

function gameLoop(renderer: wgl.Renderer, renderContext: wgl.RenderContext, audioContext: AudioContext, camera: wgl.FollowCamera, game: Game) {
  const frameTimer = game.frameTimer;
  const dt = Math.max(frameTimer.elapsedSecs(), 1/60);
  const playerAabb = game.player.aabb;

  game.controller.update();
  game.moveControls.update(dt, camera, playerAabb);

  updateCamera(dt, camera, playerAabb, game);

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  if (handleQuality(game.keyboard, game.imageQualityManager)) {
    //
  }

  const imQuality = game.imageQualityManager;
  wgl.debug.beginRender(renderContext.gl, camera, getDpr(imQuality.getQuality()), imQuality.needsUpdate());
  imQuality.clearNeedsUpdate();

  const sunPos = game.sunPosition;
  const sunColor = game.sunColor;

  renderer.render(game.scene, camera, view, proj);

  game.worldGrid.gridDrawable.update();
  game.worldGrid.gridDrawable.draw(view, proj, camera.position, GAME.scene);

  game.grassComponent.update(dt, playerAabb);
  game.airParticleComponent.update(dt, playerAabb);

  game.grassComponent.render(renderContext, camera, view, proj, sunPos, sunColor);
  game.airParticleComponent.draw(camera.position, view, proj, sunPos, sunColor);

  frameTimer.reset();
}

function fatalError(cause: string): FatalError {
  return new FatalError(cause, document.body);
}

export async function main() {
  const glResult = wgl.debug.createCanvasAndContext(document.body);
  if (wgl.debug.checkError(glResult)) {
    fatalError('Failed to initialize rendering context: ' + glResult.unwrapErr());
    return;
  }

  const gl = glResult.unwrap();
  const renderContext = new wgl.RenderContext(gl);

  let audioContext: AudioContext = null;

  try {
    audioContext = new (window.AudioContext || (<any>window).webkitAudioContext)();
  } catch (err) {
    fatalError('Failed to initialize audio context: ' + tryExtractErrorMessage(err));
    return;
  }

  const controller = makeController(GAME.keyboard);
  const renderer = new wgl.Renderer(renderContext);

  wgl.debug.setupDocumentBody(GAME.mouse);
  const touchElements = wgl.debug.createTouchControls(GAME.keyboard);
  gameUtil.makeTouchControls(controller, touchElements);

  const camera = wgl.debug.makeFollowCamera(renderContext.gl);

  const gridComponent = makeWorldGrid(renderContext);

  const airParticleResources = new AirParticleResources(5 * 1e3, '/sound/wind-a-short2.aac');
  await airParticleResources.load(audioContext, err => { console.log(err); });

  const airParticles = new AirParticles(renderContext, airParticleResources.noiseSource);
  airParticles.create(GAME.airParticleOptions);

  const grassResources = new GrassResources(5 * 1e3, '/sound/lf_noise_short.m4a');
  await grassResources.load(audioContext, err => { console.log(err); });

  const grassComponent = new GrassComponent(renderContext, grassResources);
  GAME.grassTileOptions.offsetY = gridComponent.worldGrid.voxelGrid.cellDimensions[1];
  grassComponent.create(GAME.grassTileOptions, GAME.grassModelOptions, GAME.grassTextureOptions);

  const playerDims = [1.01, 1.01, 1.01];
  const player = new Player(playerDims);
  const playerMovement = new PlayerMovement(gridComponent.worldGrid.voxelGrid);

  let playerDrawable: wgl.Model = null;

  try {
    playerDrawable = await makePlayerDrawable(renderer, renderContext);
  } catch (err) {
    fatalError('Failed to load player model: ' + tryExtractErrorMessage(err));
    return;
  }

  const skyDome = await makeSkyDome(renderer, renderContext);
  // const flower = await makeFlower(renderer, renderContext);

  const sun = wgl.Light.Directional();
  sun.setUniformProperty('color', GAME.sunColor);
  sun.setUniformProperty('position', GAME.sunPosition);

  const sunModel = makeLight(renderer, renderContext, GAME.sunPosition, GAME.sunColor);
  const light2Model = makeLight(renderer, renderContext, [0, 8, 0], [1, 1, 1]);
  GAME.scene.addModel(sunModel);
  GAME.scene.addModel(light2Model);
  // GAME.scene.addModel(flower);

  const sun2 = wgl.Light.Point();
  sun2.setUniformProperty('color', [1, 1, 1]);
  sun2.setUniformProperty('position', [0, 8, 0]);
  GAME.scene.addLight(sun2);

  player.aabb.moveTo3(8, 8, 8);

  GAME.playerMovement = playerMovement;
  GAME.player = player;
  GAME.frameTimer = new Stopwatch();
  GAME.worldGrid = gridComponent;
  GAME.airParticleComponent = airParticles;
  GAME.grassComponent = grassComponent;
  GAME.moveControls = new PlayerMoveControls(playerMovement, controller);
  GAME.controller = controller;
  GAME.playerDrawable = playerDrawable;
  GAME.scene.addModel(playerDrawable);
  GAME.scene.addModel(skyDome);
  GAME.scene.addLight(sun);

  function renderLoop() {
    gameLoop(renderer, renderContext, audioContext, camera, GAME);
    requestAnimationFrame(renderLoop);
  }

  renderLoop();
}