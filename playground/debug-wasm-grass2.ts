import * as wgl from '../src/gl';
import { PlayerMovement, Player, GrassTile, 
  GrassModelOptions, GrassTextureOptions, GrassComponent, GrassResources, 
  AirParticles, AirParticleResources, PlayerMoveControls, Controller, input, ImageQualityManager, ImageQuality, getDpr, FatalError, WorldGridDrawable, 
  WorldGridComponent, AirParticleOptions, WorldGridManipulator, PlayerDrawable, 
  PlayerDrawableResources, gameUtil, wasm } from '../src/game';
import { Stopwatch, IStopWatch, tryExtractErrorMessage, asyncTimeout } from '../src/util';

const IS_FULLSCREEN = true;

type Game = {
  mousePicker: wgl.MousePicker,
  gridManipulator: WorldGridManipulator,
  mouse: wgl.debug.DebugMouseState,
  keyboard: wgl.Keyboard,
  airParticleComponent: AirParticles,
  grassComponent: GrassComponent,
  playerDrawable: PlayerDrawable,
  playerLight: wgl.Light,
  playerMovement: PlayerMovement,
  controller: Controller,
  moveControls: PlayerMoveControls,
  worldGrid: WorldGridComponent,
  player: Player,
  frameTimer: IStopWatch,
  sunPosition: Array<number>,
  sunColor: Array<number>,
  airParticleOptions: AirParticleOptions,
  grassTileOptions: GrassTile,
  grassModelOptions: GrassModelOptions,
  grassTextureOptions: GrassTextureOptions,
  imageQualityManager: ImageQualityManager,
  scene: wgl.Scene,
};

const GAME: Game = {
  mousePicker: new wgl.MousePicker(),
  gridManipulator: null,
  mouse: wgl.debug.makeDebugMouseState(),
  keyboard: new wgl.Keyboard(),
  airParticleComponent: null,
  playerDrawable: null,
  playerLight: null,
  grassComponent: null,
  playerMovement: null,
  controller: null,
  moveControls: null,
  worldGrid: null,
  player: null,
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
  grassTextureOptions: {textureSize: 256, tryUseWasm: true},
  imageQualityManager: new ImageQualityManager(ImageQuality.Low),
  scene: new wgl.Scene(),
};

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

function gameLoop(renderer: wgl.Renderer, renderContext: wgl.RenderContext, audioContext: AudioContext, camera: wgl.FollowCamera, game: Game) {
  const frameTimer = game.frameTimer;
  const dt = Math.max(frameTimer.elapsedSecs(), 1/60);
  const playerAabb = game.player.aabb;

  game.controller.update();
  game.moveControls.update(dt, camera, playerAabb);

  updateCamera(dt, camera, playerAabb, game);

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  const imQuality = game.imageQualityManager;
  wgl.debug.beginRender(renderContext.gl, camera, getDpr(imQuality.getQuality()), imQuality.needsUpdate());
  imQuality.clearNeedsUpdate();

  game.grassComponent.updateWasm(dt, playerAabb);
  game.airParticleComponent.update(dt, playerAabb);

  const sunPos = game.sunPosition;
  const sunColor = game.sunColor;

  game.grassComponent.draw(renderContext, camera, view, proj, sunPos, sunColor);

  frameTimer.reset();
}

function fatalError(cause: string): FatalError {
  return new FatalError(cause, document.body);
}

function makeCanvasContainer(): HTMLElement {
  let makeElement: () => HTMLElement;

  if (IS_FULLSCREEN) {
    makeElement = () => document.body;
  } else {
    makeElement = () => {
      const wrapper = document.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';

      const container = document.createElement('div');
      container.style.maxWidth = '500px';
      container.style.maxHeight = '500px';
      container.style.width = '100%';
      container.style.height = '100%';

      document.body.appendChild(wrapper);
      wrapper.appendChild(container);

      return container;
    }
  }

  const container = makeElement();

  return container;
}

function makeWorldGrid(renderContext: wgl.RenderContext): WorldGridComponent {
  const gridDim = 35;
  const cellDims = [2, 0.5, 2];
  const maxNumInstances = gridDim * gridDim * 2;

  const grid = new wgl.VoxelGrid([0, 0, 0], [gridDim, gridDim, gridDim], cellDims);
  const floorDim = Math.floor(gridDim/2);

  const worldGridDrawable = new WorldGridDrawable(grid, renderContext, maxNumInstances);
  worldGridDrawable.create();

  const gridComponent = new WorldGridComponent(grid, worldGridDrawable, maxNumInstances);
  gridComponent.fillGround(floorDim, floorDim);

  const dim = GAME.grassTileOptions.density * GAME.grassTileOptions.dimension;
  const offX = GAME.grassTileOptions.offsetX;
  const offZ = GAME.grassTileOptions.offsetZ;
  gridComponent.encloseSquare(dim, offX, offZ, 2);

  return gridComponent;
}

export async function main(): Promise<void> {
  const canvasContainer = makeCanvasContainer();

  const glResult = wgl.debug.createCanvasAndContext(canvasContainer);
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
  camera.rotate(Math.PI/4, -Math.PI/7);

  const gridComponent = makeWorldGrid(renderContext);
  const gridManipulator = new WorldGridManipulator(gridComponent, GAME.mousePicker);

  const airParticleResources = new AirParticleResources(5e3, '/sound/wind-a-short2.aac');
  await airParticleResources.load(audioContext, err => console.log(err));

  const airParticles = new AirParticles(renderContext, airParticleResources.noiseSource);
  airParticles.create(GAME.airParticleOptions);

  const grassResources = new GrassResources(5e3, '/sound/lf_noise_short.m4a', wasm.grass.makeMemory());
  await grassResources.load(audioContext, err => console.log(err));

  const grassComponent = new GrassComponent(renderContext, grassResources);
  GAME.grassTileOptions.offsetY = gridComponent.voxelGrid.cellDimensions[1];
  grassComponent.create(GAME.grassTileOptions, GAME.grassModelOptions, GAME.grassTextureOptions);

  const playerDrawableResources = new PlayerDrawableResources('/buffer/frame_64px_120frames.bin', 5e3);
  await playerDrawableResources.load(err => console.log(err));

  const playerDims = [1.01, 2.01, 1.01];
  const player = new Player(playerDims);
  const playerMovement = new PlayerMovement(gridComponent.voxelGrid);

  const sun = wgl.Light.Directional();
  sun.setUniformProperty('color', GAME.sunColor);
  sun.setUniformProperty('position', GAME.sunPosition);

  const sun2 = wgl.Light.Point();
  sun2.setUniformProperty('color', [1, 1, 1]);
  sun2.setUniformProperty('position', [0, 8, 0]);
  GAME.scene.addLight(sun2);

  const playerLight = wgl.Light.Point();
  playerLight.setUniformProperty('color', [0.005, 0.005, 0.005]);
  GAME.scene.addLight(playerLight);

  player.aabb.moveTo3(7.5, 7.5, 7.5);

  GAME.playerMovement = playerMovement;
  GAME.player = player;
  GAME.frameTimer = new Stopwatch();
  GAME.worldGrid = gridComponent;
  GAME.airParticleComponent = airParticles;
  GAME.grassComponent = grassComponent;
  GAME.gridManipulator = gridManipulator;
  GAME.moveControls = new PlayerMoveControls(playerMovement, controller);
  GAME.controller = controller;
  GAME.playerLight = playerLight;

  function renderLoop() {
    gameLoop(renderer, renderContext, audioContext, camera, GAME);
    requestAnimationFrame(renderLoop);
  }

  renderLoop();
}