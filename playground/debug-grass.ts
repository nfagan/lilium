import { debug, Keyboard, Keys, Program, FollowCamera, Vao, Vbo, Ebo, 
  BufferDescriptor, types, math, parse } from '../src/gl';
import { Result, loadText } from '../src/util';
import { vec3, mat4, glMatrix } from 'gl-matrix';
import * as simpleSources from './shaders/debug-simple';
import * as grassSources from './shaders/debug-grass';

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

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, simpleSources.vertex, simpleSources.fragment);
}

function createGrassProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, grassSources.vertex, grassSources.fragment);
}

function makeDrawableFromObj(gl: WebGLRenderingContext, prog: Program, obj: parse.Obj): Drawable {
  const pos = new Float32Array(obj.positions);
  const inds = new Uint16Array(obj.positionIndices);

  return makeDrawable(gl, prog, pos, inds, inds.length);
}

async function makeDrawables(gl: WebGLRenderingContext, progs: Programs): Promise<Result<Drawables, string>> {
  const cubePos = debug.cubePositions();
  const cubeInds = debug.cubeIndices();

  const modelSrc = await loadModels();

  const prog = progs.simple;
  const grassProg = progs.grass;

  try {
    const cube = makeDrawable(gl, prog, cubePos, cubeInds, 36);
    const quad = makeDrawable(gl, prog, debug.quadPositions(), debug.quadIndices(), 6);
    const grassQuad = makeGrassQuad(gl, grassProg);
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

function makeGrassQuad(gl: WebGLRenderingContext, prog: Program): Drawable {
  const numSegments = 8;
  const grassDim = 100;
  const grassDensity = 0.1;
  // const grassDensity = 0.3;
  const positions = debug.segmentedQuadPositions(numSegments);

  const descriptor = new BufferDescriptor();
  descriptor.addAttribute({name: 'a_position', size: 3, type: gl.FLOAT});
  descriptor.getAttributeLocations(prog);

  const translationDescriptor = new BufferDescriptor();
  translationDescriptor.addAttribute({name: 'a_translation', size: 3, type: gl.FLOAT, divisor: 1});
  translationDescriptor.getAttributeLocations(prog);

  const rotationDescriptor = new BufferDescriptor();
  rotationDescriptor.addAttribute({name: 'a_rotation', size: 1, type: gl.FLOAT, divisor: 1});
  rotationDescriptor.getAttributeLocations(prog);

  const translations: Array<number> = [];
  const rotations: Array<number> = [];

  for (let i = 0; i < grassDim; i++) {
    for (let j = 0; j < grassDim; j++) {
      translations.push(grassDim * Math.random() * grassDensity);
      translations.push(0);
      translations.push(grassDim * Math.random() * grassDensity);

      rotations.push(Math.random() * glMatrix.toRadian(360));
      // rotations.push(0);
    }
  }
  
  const vao = new Vao(gl);
  const numVerts = positions.length/3;
  const numInstances = translations.length/3;

  vao.bind();
  vao.attachVbo('position', new Vbo(gl, descriptor, positions));
  vao.attachVbo('translation', new Vbo(gl, translationDescriptor, new Float32Array(translations)));
  vao.attachVbo('rotation', new Vbo(gl, rotationDescriptor, new Float32Array(rotations)));
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

async function loadModels(): Promise<parse.Obj> {
  const url = '/model/tree1.obj';
  const src = await loadText(url);
  
  return new parse.Obj(src);
}

async function render(gl: WebGLRenderingContext) {
  const camera = makeCamera(gl);
  let programs: Programs = null;
  let drawables: Drawables = null;

  try {
    programs = {
      simple: debug.unwrapResult(createSimpleProgram(gl)),
      grass: debug.unwrapResult(createGrassProgram(gl))
    };
    drawables = debug.unwrapResult(await makeDrawables(gl, programs));
  } catch (err) {
    console.error(err.message);
    return;
  } 

  function renderer() {
    renderLoop(gl, programs, camera, drawables);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function updateCamera(camera: FollowCamera) {
  const front = camera.getFront(vec3.create());
  const right = camera.getRight(vec3.create());
  // const mvSpeed = 0.05;
  const mvSpeed = 0.1;

  front[1] = 0;
  vec3.normalize(front, front);

  vec3.scale(front, front, mvSpeed);
  vec3.scale(right, right, mvSpeed);
  
  const velocity = [0, 0, 0];

  if (KEYBOARD.isDown(Keys.w)) math.sub3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.s)) math.add3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.a)) math.sub3(velocity, velocity, right);
  if (KEYBOARD.isDown(Keys.d)) math.add3(velocity, velocity, right);

  camera.move(velocity);

  if (KEYBOARD.isDown(Keys.leftShift)) {
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

function drawDebugComponents(gl: WebGLRenderingContext, prog: Program, target: types.Real3, drawables: Drawables): void {
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;

  drawables.cube.vao.bind();
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);

  if (DEBUG_AABB !== null) {
    debug.drawAabb(gl, prog, model, DEBUG_AABB, [0, 1, 0], cubeDrawFunc);
  }

  debug.drawAt(gl, prog, model, target, 0.25, [1, 1, 1], cubeDrawFunc);

  gl.disable(gl.CULL_FACE);
  drawables.quad.vao.bind();
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);
}

function drawLights(gl: WebGLRenderingContext, prog: Program, cube: Drawable, lightPos: Array<types.Real3>): void {
  cube.vao.bind();
  for (let i = 0; i < lightPos.length; i++) {
    debug.drawAt(gl, prog, mat4.create(), lightPos[i], 0.25, [1, 1, 1], cube.drawFunction);
  }
}

function drawGrass(gl: WebGLRenderingContext, prog: Program, camera: FollowCamera, drawables: Drawables, lightPos: Array<types.Real3>): void {
  const model = mat4.create();
  const invTransModel = mat4.create();
  const scale = [0.01, 1, 0.2];

  // mat4.rotateY(model, model, glMatrix.toRadian(60));
  mat4.scale(model, model, scale);

  mat4.transpose(invTransModel, model);
  mat4.invert(invTransModel, invTransModel);

  prog.setMat4('model', model);
  prog.setMat4('inv_trans_model', invTransModel);
  // prog.set1f('noise_strength', Math.random());
  prog.set3f('color', 0.5, 1, 0.5);
  prog.setVec3('camera_position', camera.position);
  prog.set1f('base_x_rotation_deg', 40.0);
  prog.set1i('invert_normal', 0);

  for (let i = 0; i < lightPos.length; i++) {
    prog.setVec3(`light_position[${i}]`, lightPos[i] as vec3);
    prog.set3f(`light_color[${i}]`, 1, 1, 1);
  }

  const velocity = vec3.create();
  if (KEYBOARD.isDown(Keys.left)) velocity[0] = -1;
  if (KEYBOARD.isDown(Keys.right)) velocity[0] = 1;
  if (KEYBOARD.isDown(Keys.down)) velocity[2] = -1;
  if (KEYBOARD.isDown(Keys.up)) velocity[2] = 1;
  vec3.normalize(velocity, velocity);

  prog.setVec3('player_position', camera.target);
  prog.setVec3('player_velocity', velocity);

  prog.set1i('num_point_lights', lightPos.length);

  drawables.grassQuad.vao.bind();

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  drawables.grassQuad.drawFunction(gl);

  prog.set1i('invert_normal', 1);
  gl.cullFace(gl.FRONT);
  drawables.grassQuad.drawFunction(gl);
}

function handleGrassDrawing(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, drawables: Drawables, view: mat4, proj: mat4): void {
  const lightPos = [[1, 3, 1], [10, 3, 10]];

  drawLights(gl, programs.simple, drawables.cube, lightPos);

  programs.grass.use();
  debug.setViewProjection(programs.grass, view, proj);
  drawGrass(gl, programs.grass, camera, drawables, lightPos);
}

function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, drawables: Drawables): void {
  beginRender(gl, camera);
  updateCamera(camera);

  const simpleProg = programs.simple;
  simpleProg.use();

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  debug.setViewProjection(simpleProg, view, proj);
  drawDebugComponents(gl, simpleProg, camera.target, drawables);

  handleGrassDrawing(gl, programs, camera, drawables, view, proj);
}

export function main() {
  const glResult = debug.createCanvasAndContext(document.body);
  if (debug.checkError(glResult)) {
    return;
  }
  const gl = glResult.unwrap();

  debug.setupDocumentBody(MOUSE_STATE);
  render(gl);
}