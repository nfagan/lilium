import { debug, Keyboard, Keys, Program, FollowCamera, Vao, math, makeAttribute, RenderContext } from '../src/gl';
import { Result, asyncTimeout, loadAudioBufferSourceNode } from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as simpleSources from './shaders/debug-simple';
import { Player, AirParticles, AirParticleResources, components, AirParticleOptions, GrassModelOptions, GrassTile, GrassTextureOptions } from '../src/game';
import { GrassResources, GrassComponent } from '../src/game/components/grass';

const MOUSE_STATE = debug.makeDebugMouseState();
const KEYBOARD = new Keyboard();

type Drawable = debug.Drawable;

type Drawables = {
  quad: Drawable,
  cube: Drawable,
};

type Programs = {
  simple: Program,
};

type Game = {
  airParticleComponent: AirParticles,
  grassComponent: GrassComponent
};

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, simpleSources.vertex, simpleSources.fragment);
}

function makeDrawable(gl: WebGLRenderingContext, prog: Program, 
  positions: Float32Array, indices: Uint16Array, numTriangles: number): Drawable {
  
  const vboDescriptors = [{
    name: 'position',
    attributes: [makeAttribute('a_position', gl.FLOAT, 3)],
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

function makeDrawables(gl: WebGLRenderingContext, programs: Programs): Result<Drawables, string> {
  const cubePos = debug.cubePositions();
  const cubeInds = debug.cubeIndices();

  const prog = programs.simple;

  try {
    const cube = makeDrawable(gl, prog, cubePos, cubeInds, 36);
    const quad = makeDrawable(gl, prog, debug.quadPositions(), debug.quadIndices(), 6);

    return Result.Ok({cube, quad});
  } catch (err) {
    return Result.Err(err.message);
  }
}

async function render(renderContext: RenderContext, audioContext: AudioContext) {
  const gl = renderContext.gl;
  const camera = debug.makeFollowCamera(gl);

  const simpleProgResult = createSimpleProgram(gl);

  if (debug.checkError(simpleProgResult)) {
    return;
  }

  const playerDims = [1.01, 1.01, 1.01];
  const player = new Player(playerDims);

  const programs: Programs = {
    simple: simpleProgResult.unwrap()
  };

  const drawableRes = makeDrawables(gl, programs);
  if (debug.checkError(drawableRes)) {
    return;
  }

  const drawables = drawableRes.unwrap();

  const particleOptions: AirParticleOptions = {
    numParticles: 1000,
    particleGridScale: 10
  };

  const modelOptions: GrassModelOptions = {
    numSegments: 8,
    bladeHeight: 1
  };

  const tileOptions: GrassTile = {
    dimension: 200,
    density: 0.1,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0
  };

  const grassTextureOptions: GrassTextureOptions = {
    textureSize: 256
  };

  const grassResources = new GrassResources(10000);
  await grassResources.load(audioContext, err => {
    console.log(err);
  });

  const grassComponent = new GrassComponent(renderContext, grassResources);
  grassComponent.create(tileOptions, modelOptions, grassTextureOptions);

  const particleResources = new AirParticleResources(10000);
  await particleResources.load(audioContext, err => {
    console.log(err);
  });

  const airParticleComponent = new AirParticles(renderContext, particleResources.noiseSource);
  airParticleComponent.create(particleOptions);

  const game: Game = {
    grassComponent,
    airParticleComponent
  };

  function renderer() {
    renderLoop(renderContext, programs, camera, player, drawables, game);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function updatePlayerPosition(dt: number, playerAabb: math.Aabb, camera: FollowCamera): void {
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
  vec3.scale(<any>velocity, velocity, 0.5);

  playerAabb.move(velocity);
}

function updateCamera(dt: number, camera: FollowCamera, playerAabb: math.Aabb) {
  const target = [playerAabb.midX(), playerAabb.midY(), playerAabb.midZ()];
  debug.updateFollowCamera(dt, camera, target, MOUSE_STATE, KEYBOARD);
}

function drawPlayer(renderContext: RenderContext, prog: Program, aabb: math.Aabb, drawable: Drawable): void {
  renderContext.bindVao(drawable.vao);
  debug.drawAabb(renderContext.gl, prog, mat4.create(), aabb, [0, 0, 1], drawable.drawFunction);
}

function drawGround(renderContext: RenderContext, prog: Program, drawable: Drawable): void {
  const gl = renderContext.gl;
  renderContext.bindVao(drawable.vao);
  gl.disable(gl.CULL_FACE);
  debug.drawGroundPlane(gl, prog, mat4.create(), 20, drawable, [0, 1, 1]);
  gl.enable(gl.CULL_FACE);
}

function drawDebugComponents(renderContext: RenderContext, prog: Program, drawables: Drawables): void {
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;
  const gl = renderContext.gl;

  renderContext.bindVao(drawables.cube.vao);
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);

  gl.disable(gl.CULL_FACE);

  renderContext.bindVao(drawables.quad.vao);
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);
  gl.enable(gl.CULL_FACE);
}


function renderLoop(renderContext: RenderContext, programs: Programs, camera: FollowCamera, player: Player, drawables: Drawables, game: Game): void {
  const dt = 1/60;
  const gl = renderContext.gl;

  debug.beginRender(gl, camera, 0.75);

  updatePlayerPosition(dt, player.aabb, camera);
  updateCamera(dt, camera, player.aabb);

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  if (renderContext.useProgram(programs.simple)) {
    debug.setViewProjection(programs.simple, view, proj);
  }

  drawDebugComponents(renderContext, programs.simple, drawables);
  drawPlayer(renderContext, programs.simple, player.aabb, drawables.cube);
  drawGround(renderContext, programs.simple, drawables.quad);

  const sunPos = [8, 10, 8];
  const sunColor = [1, 1, 1];

  game.airParticleComponent.update(dt, player.aabb);
  game.grassComponent.update(dt, player.aabb);

  game.airParticleComponent.draw(camera.position, view, proj, sunPos, sunColor);
  game.grassComponent.render(renderContext, camera, view, proj, sunPos, sunColor);
}

export function main() {
  const glResult = debug.createCanvasAndContext(document.body);
  if (debug.checkError(glResult)) {
    return;
  }
  const gl = glResult.unwrap();
  const renderContext = new RenderContext(gl);
  const ac = new (window.AudioContext || (<any>window).webkitAudioContext)();

  debug.setupDocumentBody(MOUSE_STATE);
  debug.createTouchControls(KEYBOARD);

  render(renderContext, ac);
}