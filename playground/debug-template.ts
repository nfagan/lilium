import { debug, Keyboard, Keys, Program, FollowCamera, Vao, math, makeAttribute } from '../src/gl';
import { Result } from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as simpleSources from './shaders/debug-simple';
import { Player } from '../src/game';

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

async function render(gl: WebGLRenderingContext, ac: AudioContext) {
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

  function renderer() {
    renderLoop(gl, programs, camera, player, drawables);
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

function drawPlayer(gl: WebGLRenderingContext, prog: Program, aabb: math.Aabb, drawable: Drawable): void {
  drawable.vao.bind();
  debug.drawAabb(gl, prog, mat4.create(), aabb, [0, 0, 1], drawable.drawFunction);
}

function drawGround(gl: WebGLRenderingContext, prog: Program, drawable: Drawable): void {
  drawable.vao.bind();
  gl.disable(gl.CULL_FACE);
  debug.drawGroundPlane(gl, prog, mat4.create(), 20, drawable, [0, 1, 1]);
  gl.enable(gl.CULL_FACE);
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


function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, player: Player, drawables: Drawables): void {
  const dt = 1/60;

  debug.beginRender(gl, camera, 1);

  updatePlayerPosition(dt, player.aabb, camera);
  updateCamera(dt, camera, player.aabb);

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  programs.simple.use();
  debug.setViewProjection(programs.simple, view, proj);

  drawDebugComponents(gl, programs.simple, drawables);
  drawPlayer(gl, programs.simple, player.aabb, drawables.cube);
  drawGround(gl, programs.simple, drawables.quad);
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