import * as wgl from '../src/gl';
import { PlayerMovement, Player, GrassTile, 
  GrassModelOptions, GrassTextureOptions, GrassComponent, GrassResources, 
  AirParticles, AirParticleResources, PlayerMoveControls, Controller, input, ImageQualityManager, ImageQuality, getDpr, FatalError, WorldGridDrawable, 
  WorldGridComponent, SkyDomeDrawable, SkyDomeResources, AirParticleOptions, WorldGridManipulator, PlayerDrawable, 
  PlayerDrawableResources, gameUtil } from '../src/game';
import { Stopwatch, tryExtractErrorMessage, asyncTimeout, loadAudioBuffer } from '../src/util';
import { mat4 } from 'gl-matrix';

const IS_FULLSCREEN = true;

type Sounds = {
  piano: AudioBuffer
}

const enum GridManipulationState {
  Selecting,
  Adding,
  NotManipulating
};

type Game = {
  gridManipulationState: GridManipulationState,
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
  gridManipulationState: GridManipulationState.NotManipulating,
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
  grassTextureOptions: {textureSize: 256},
  imageQualityManager: new ImageQualityManager(ImageQuality.Medium),
  scene: new wgl.Scene()
};

async function makeSounds(audioContext: AudioContext): Promise<Sounds> {
  const piano = await asyncTimeout(() => loadAudioBuffer(audioContext, '/sound/piano_g.mp3'), 5e3);
  return {
    piano
  }
}

async function makeSoundPlayer(audioContext: AudioContext): Promise<void> {
  const sounds = await makeSounds(audioContext);
  let semitoneIdx = 0;

  const player = () => {
    const jitter = 0.12;
    const sign = Math.random() > 0.5 ? -1 : 1;
    const semitones = [0, 3, 5, 7, 10, 7, 5, 3];
    // const semitones = [12, 15, 15, 17];
    // const semitoneIdx = Math.min(Math.floor(Math.random() * semitones.length), semitones.length-1);
    const semitone = semitones[semitoneIdx];
    const pitch = semitone + Math.random() * jitter * sign;

    const src = audioContext.createBufferSource();
    src.buffer = sounds.piano;
    src.playbackRate.value = Math.pow(2, pitch/12);

    src.connect(audioContext.destination);
    src.start();

    semitoneIdx++;
    semitoneIdx %= semitones.length;
  }

  GAME.keyboard.addAnonymousListener(wgl.Keys.up, player);

  document.body.addEventListener('touchstart', e => {
    for (let i = 0; i < e.touches.length; i++) {
      player();
    }
  });
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

function makeLightModel(renderer: wgl.Renderer, renderContext: wgl.RenderContext, lightPos: wgl.types.Real3, lightColor: wgl.types.Real3): wgl.Model {
  const gl = renderContext.gl;

  const mat = wgl.Material.NoLight();
  mat.setUniformProperty('modelColor', lightColor);
  const prog = renderer.requireProgram(mat);

  const vaoResult = wgl.factory.vao.makeSphereVao(gl, prog);
  const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
  drawable.mode = vaoResult.drawMode;

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

function makeGrassCube(renderer: wgl.Renderer, renderContext: wgl.RenderContext): wgl.Model {
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

function handleGridManipulation(game: Game, gl: WebGLRenderingContext, camera: wgl.ICamera, view: mat4, proj: mat4, aabb: wgl.math.Aabb): void {
  if (game.gridManipulationState === GridManipulationState.Selecting) {    
    const w = gl.canvas.clientWidth;
    const h = gl.canvas.clientHeight;
    const boundRect = gl.canvas.getBoundingClientRect();
    const left = boundRect.left;
    const top = boundRect.top;

    const x = game.controller.rotationalInput.x() - left;
    const y = game.controller.rotationalInput.y() - top;

    game.gridManipulator.updateSelection(x, y, w, h, view, proj, camera.position);

    if (game.gridManipulator.madeSelection()) {
      game.gridManipulationState = GridManipulationState.Adding;
    }

  } else if (game.gridManipulationState === GridManipulationState.Adding) {
    const dx = game.controller.rotationalInput.deltaX();
    const dy = game.controller.rotationalInput.deltaY();

    game.gridManipulator.updateAddition(dx, dy, aabb);

    if (game.gridManipulator.madeAddition()) {
      game.gridManipulator.clearAddition();
      game.gridManipulator.clearSelection();
      game.gridManipulationState = GridManipulationState.NotManipulating;
    }
  }
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

  handleGridManipulation(game, renderContext.gl, camera, view, proj, playerAabb);

  const imQuality = game.imageQualityManager;
  wgl.debug.beginRender(renderContext.gl, camera, getDpr(imQuality.getQuality()), imQuality.needsUpdate());
  imQuality.clearNeedsUpdate();

  const sunPos = game.sunPosition;
  const sunColor = game.sunColor;

  game.playerLight.setUniformProperty('position', [playerAabb.midX(), playerAabb.maxY, playerAabb.midZ()]);

  renderer.render(game.scene, camera, view, proj);

  game.worldGrid.gridDrawable.updateNewCells();
  game.worldGrid.gridDrawable.draw(view, proj, camera.position, GAME.scene);

  game.grassComponent.update(dt, playerAabb);
  game.airParticleComponent.update(dt, playerAabb);

  game.grassComponent.draw(renderContext, camera, view, proj, sunPos, sunColor);
  game.airParticleComponent.draw(camera.position, view, proj, sunPos, sunColor);

  game.playerDrawable.update(playerAabb);
  game.playerDrawable.draw(view, proj, camera, game.scene);

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
  
  container.addEventListener('click', e => {
    if (GAME.gridManipulationState === GridManipulationState.NotManipulating) {
      GAME.gridManipulationState = GridManipulationState.Selecting;
    }
  }); 

  return container;
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

  await makeSoundPlayer(audioContext);

  const controller = makeController(GAME.keyboard);
  const renderer = new wgl.Renderer(renderContext);

  wgl.debug.setupDocumentBody(GAME.mouse);
  const touchElements = wgl.debug.createTouchControls(GAME.keyboard);
  gameUtil.makeTouchControls(controller, touchElements);

  const camera = wgl.debug.makeFollowCamera(renderContext.gl);
  camera.rotate(Math.PI/4, -Math.PI/7);

  const gridComponent = makeWorldGrid(renderContext);
  const gridManipulator = new WorldGridManipulator(gridComponent);

  const airParticleResources = new AirParticleResources(5e3, '/sound/wind-a-short2.aac');
  await airParticleResources.load(audioContext, err => console.log(err));

  const airParticles = new AirParticles(renderContext, airParticleResources.noiseSource);
  airParticles.create(GAME.airParticleOptions);

  const grassResources = new GrassResources(5e3, '/sound/lf_noise_short.m4a');
  await grassResources.load(audioContext, err => console.log(err));

  const grassComponent = new GrassComponent(renderContext, grassResources);
  GAME.grassTileOptions.offsetY = gridComponent.voxelGrid.cellDimensions[1];
  grassComponent.create(GAME.grassTileOptions, GAME.grassModelOptions, GAME.grassTextureOptions);

  const playerDrawableResources = new PlayerDrawableResources('/buffer/frame_64px_120frames.bin', 5e3);
  await playerDrawableResources.load(err => console.log(err));

  const playerDims = [1.01, 2.01, 1.01];
  const player = new Player(playerDims);
  const playerMovement = new PlayerMovement(gridComponent.voxelGrid);

  const playerDrawable = new PlayerDrawable(renderContext, renderer);
  playerDrawable.create(playerDrawableResources);

  const grassCube = makeGrassCube(renderer, renderContext);
  const skyDome = await makeSkyDome(renderer, renderContext);

  const sun = wgl.Light.Directional();
  sun.setUniformProperty('color', GAME.sunColor);
  sun.setUniformProperty('position', GAME.sunPosition);

  const sunModel = makeLightModel(renderer, renderContext, GAME.sunPosition, GAME.sunColor);
  const light2Model = makeLightModel(renderer, renderContext, [0, 8, 0], [1, 1, 1]);
  GAME.scene.addModel(sunModel);
  GAME.scene.addModel(light2Model);

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
  GAME.playerDrawable = playerDrawable;
  GAME.playerLight = playerLight;
  // GAME.scene.addModel(grassCube);
  GAME.scene.addModel(skyDome);
  GAME.scene.addLight(sun);

  GAME.keyboard.addAnonymousListener(wgl.Keys.down, () => {
    GAME.airParticleComponent.togglePlaying();
    GAME.grassComponent.togglePlaying();
    GAME.playerDrawable.togglePlaying();
  });

  function renderLoop() {
    gameLoop(renderer, renderContext, audioContext, camera, GAME);
    requestAnimationFrame(renderLoop);
  }

  renderLoop();
}