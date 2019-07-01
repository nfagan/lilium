import * as wgl from '../src/gl';
import { PlayerMovement, Player, WorldGrid, GrassTile, 
  GrassModelOptions, GrassTextureOptions, GrassComponent, GrassResources, gameUtil, 
  AirParticles, AirParticleResources, PlayerMoveControls, Controller, input, ImageQualityManager, getDpr, FatalError } from '../src/game';
import { Stopwatch, loadText, asyncTimeout, tryExtractErrorMessage } from '../src/util';

type Game = {
  mouse: wgl.debug.DebugMouseState,
  keyboard: wgl.Keyboard,
  airParticleComponent: AirParticles,
  grassComponent: GrassComponent,
  playerMovement: PlayerMovement,
  controller: Controller,
  moveControls: PlayerMoveControls,
  worldGrid: WorldGrid,
  player: Player,
  playerDrawable: wgl.Model,
  frameTimer: Stopwatch,
  sunPosition: Array<number>,
  sunColor: Array<number>,
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
  sunPosition: [8, 10, 8],
  sunColor: [1, 1, 1],
  grassTileOptions: {
    density: 0.1,
    dimension: 200,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0
  },
  grassModelOptions: {numSegments: 8},
  grassTextureOptions: {textureSize: 256},
  imageQualityManager: new ImageQualityManager(),
  scene: new wgl.Scene()
};

function makeWorldGrid(): WorldGrid {
  const gridDim = 50;
  const cellDims = [2, 0.5, 2];
  const maxNumInstances = gridDim * gridDim * 2;

  const grid = new wgl.VoxelGrid([0, 0, 0], [gridDim, gridDim, gridDim], cellDims);
  const worldGrid = new WorldGrid(grid, maxNumInstances);
  const floorDim = Math.floor(gridDim/2);
  worldGrid.fillGround(floorDim, floorDim);

  return worldGrid;
}

async function makePlayerDrawable(renderer: wgl.Renderer, renderContext: wgl.RenderContext): Promise<wgl.Model> {
  const modelUrl = '/model/character2:character3.obj';
  const gl = renderContext.gl;
  const model = await asyncTimeout(() => loadText(modelUrl), 5 * 1e3);
  const parse = new wgl.parse.Obj(model);

  const makeFloatAttribute = wgl.types.makeFloat3Attribute;
  const makeVboDescriptor = wgl.types.makeAnonymousVboDescriptor;
  const makeEboDescriptor = wgl.types.makeAnonymousEboDescriptor;

  const vboDescriptors = [
    makeVboDescriptor([makeFloatAttribute(gl, 'a_position')], new Float32Array(parse.positions)),
    makeVboDescriptor([makeFloatAttribute(gl, 'a_normal')], new Float32Array(parse.normals)),
  ];

  const eboDescriptor = makeEboDescriptor(new Uint16Array(parse.positionIndices));

  const mat = wgl.Material.Phong();
  mat.setUniformProperty('modelColor', 1);

  const prog = renderer.requireProgram(mat);
  const vao = wgl.Vao.fromDescriptors(gl, prog, vboDescriptors, eboDescriptor);

  const drawable = wgl.types.Drawable.fromProperties(renderContext, vao, wgl.types.DrawFunctions.indexed);
  drawable.count = parse.positionIndices.length;

  return new wgl.Model(drawable, mat);
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

  game.grassComponent.update(dt, playerAabb);
  game.airParticleComponent.update(dt, playerAabb);

  game.grassComponent.render(renderContext, camera, view, proj, sunPos, sunColor);
  game.airParticleComponent.draw(camera.position, view, proj, sunPos, sunColor);

  renderer.render(game.scene, view, proj);

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

  const worldGrid = makeWorldGrid();

  const airParticleResources = new AirParticleResources(5 * 1e3, '/sound/wind-a-short2.aac');
  await airParticleResources.load(audioContext, err => { console.log(err); });

  const airParticles = new AirParticles(renderContext, airParticleResources.noiseSource);
  airParticles.create({numParticles: 1000, particleGridScale: 10});

  const grassResources = new GrassResources(5 * 1e3, '/sound/lf_noise_short.m4a');
  await grassResources.load(audioContext, err => { console.log(err); });

  const grassComponent = new GrassComponent(renderContext, grassResources);
  GAME.grassTileOptions.offsetY = worldGrid.voxelGrid.cellDimensions[1];
  grassComponent.create(GAME.grassTileOptions, GAME.grassModelOptions, GAME.grassTextureOptions);

  const playerDims = [1.01, 1.01, 1.01];
  const player = new Player(playerDims);
  const playerMovement = new PlayerMovement(worldGrid.voxelGrid);

  let playerDrawable: wgl.Model = null;

  try {
    playerDrawable = await makePlayerDrawable(renderer, renderContext);
  } catch (err) {
    fatalError('Failed to load player model: ' + tryExtractErrorMessage(err));
    return;
  }

  const sun = wgl.Light.Directional();
  sun.setUniformProperty('color', GAME.sunColor);
  sun.setUniformProperty('position', GAME.sunPosition);

  const sun2 = wgl.Light.Point();
  sun2.setUniformProperty('color', [1, 1, 1]);
  sun2.setUniformProperty('position', [0, 8, 0]);
  GAME.scene.addLight(sun2);

  player.aabb.moveTo3(8, 8, 8);

  GAME.playerMovement = playerMovement;
  GAME.player = player;
  GAME.frameTimer = new Stopwatch();
  GAME.worldGrid = worldGrid;
  GAME.airParticleComponent = airParticles;
  GAME.grassComponent = grassComponent;
  GAME.moveControls = new PlayerMoveControls(playerMovement, controller);
  GAME.controller = controller;
  GAME.playerDrawable = playerDrawable;
  GAME.scene.addModel(playerDrawable);
  GAME.scene.addLight(sun);

  function renderLoop() {
    gameLoop(renderer, renderContext, audioContext, camera, GAME);
    requestAnimationFrame(renderLoop);
  }

  renderLoop();
}