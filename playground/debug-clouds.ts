import * as wgl from '../src/gl';
import { PlayerMovement, Player, GrassTile, 
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
  frameTimer: new Stopwatch(),
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

function makeController(keyboard: wgl.Keyboard): Controller {
  const jumpButton = input.Button.bindToKey(keyboard, wgl.Keys.space, 'jump');
  const directionalInput = input.DirectionalInput.fromKeyboard(keyboard);
  directionalInput.invertZ = true;
  const rotationalInput = new input.RotationalInput();
  rotationalInput.bindToMouseMove(document.body);
  rotationalInput.bindToTouchMove(document.body);

  return new Controller(jumpButton, directionalInput, rotationalInput);
}

function makeSphere(renderContext: wgl.RenderContext, renderer: wgl.Renderer): wgl.Model {
  const mat = wgl.Material.Physical();
  const prog = renderer.requireProgram(mat);
  const vaoResult = wgl.factory.vao.makeSphereVao(renderContext.gl, prog);
  const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
  drawable.mode = renderContext.gl.TRIANGLE_STRIP;
  return new wgl.Model(drawable, mat);
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

  const sunPos = game.sunPosition;
  const sunColor = game.sunColor;

  renderer.render(game.scene, camera, view, proj);

  frameTimer.reset();
}

function fillGround(grid: wgl.VoxelGrid, dim: number): void {
  const inds = [0, 0, 0];

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      inds[0] = i;
      inds[1] = 0;
      inds[2] = j;
      grid.markFilled(inds);
    }
  }
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
  const gridDim = 50;

  const playerDims = [1.01, 1.01, 1.01];
  const player = new Player(playerDims);
  const grid = new wgl.VoxelGrid([0, 0, 0], [gridDim, gridDim, gridDim], [1, 1, 1]);
  const playerMovement = new PlayerMovement(grid);
  const sphere = makeSphere(renderContext, renderer);

  fillGround(grid, gridDim);

  GAME.player = player;
  GAME.playerMovement = playerMovement;
  GAME.controller = controller;
  GAME.moveControls = new PlayerMoveControls(playerMovement, controller);
  GAME.scene.addModel(sphere);

  function renderLoop() {
    gameLoop(renderer, renderContext, audioContext, camera, GAME);
    requestAnimationFrame(renderLoop);
  }

  renderLoop();
}