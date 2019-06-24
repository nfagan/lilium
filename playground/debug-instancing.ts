import { debug, Keyboard, Keys, Program, FollowCamera, Vao, Vbo, 
  BufferDescriptor, Ebo, MousePicker, math } from '../src/gl';
import { Result } from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as simpleSources from './shaders/debug-simple';
import * as voxelGridSources from './shaders/voxel-grid';

const MOUSE_STATE = debug.makeDebugMouseState();
const KEYBOARD = new Keyboard();

type Drawable = debug.Drawable;
type InstancedDrawable = Drawable & {
  tmpEmptyArray: Float32Array
};

type Drawables = {
  instancedCube: InstancedDrawable
};

type Programs = {
  instanced: Program
};

function createInstancedProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, voxelGridSources.vertex, voxelGridSources.fragment);
}

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, simpleSources.vertex, simpleSources.fragment);
}

function makeInstancedDrawable(gl: WebGLRenderingContext, prog: Program, positions: Float32Array, 
  indices: Uint16Array, numTriangles: number, maxNumInstances: number): InstancedDrawable {
  prog.use();
  
  const descriptor = new BufferDescriptor();
  descriptor.addAttribute({name: 'a_position', size: 3, type: gl.FLOAT, divisor: 0});
  descriptor.getAttributeLocations(prog);

  const colorDescriptor = new BufferDescriptor();
  colorDescriptor.addAttribute({name: 'a_color', size: 3, type: gl.FLOAT, divisor: 1});
  colorDescriptor.getAttributeLocations(prog);

  const transDescriptor = new BufferDescriptor();
  transDescriptor.addAttribute({name: 'a_translation', size: 3, type: gl.FLOAT, divisor: 1});
  transDescriptor.getAttributeLocations(prog);

  const emptyFloat3Array = new Float32Array(maxNumInstances * 3); //  * (x, y, z) or (r, g, b)

  const vao = new Vao(gl);

  vao.bind();
  vao.attachVbo('position', new Vbo(gl, descriptor, positions));
  vao.attachVbo('color', new Vbo(gl, colorDescriptor, emptyFloat3Array));
  vao.attachVbo('translation', new Vbo(gl, transDescriptor, emptyFloat3Array));
  vao.attachEbo('indices', new Ebo(gl, indices));
  vao.unbind();

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

function makeDrawables(gl: WebGLRenderingContext, instancedProg: Program, maxNumInstances: number): Result<Drawables, string> {
  const cubePos = debug.cubePositions();
  const cubeInds = debug.cubeIndices();

  try {
    const instancedCube = makeInstancedDrawable(gl, instancedProg, cubePos, cubeInds, 36, maxNumInstances);

    return Result.Ok({instancedCube});
  } catch (err) {
    return Result.Err(err.message);
  }
}

function makeCamera(gl: WebGLRenderingContext): FollowCamera {
  const camera = new FollowCamera();

  camera.followDistance = 10;
  camera.rotate(Math.PI, Math.PI/2);
  camera.setAspect(gl.canvas.clientWidth / gl.canvas.clientHeight);
  camera.setNear(0.1);
  camera.setFar(1000);
  camera.setFieldOfView(45 * Math.PI/180);

  return camera
}

function render(gl: WebGLRenderingContext): void {
  const camera = makeCamera(gl);

  const instancedProgResult = createInstancedProgram(gl);
  // const simpleProgResult = createSimpleProgram(gl);

  if (debug.checkError(instancedProgResult)) {
    return;
  }

  const programs: Programs = {
    instanced: instancedProgResult.unwrap()
  };

  const maxNumInstances = 10;

  const drawableRes = makeDrawables(gl, programs.instanced, maxNumInstances);
  if (debug.checkError(drawableRes)) {
    return;
  }
  const drawables = drawableRes.unwrap();

  function renderer() {
    renderLoop(gl, programs, camera, drawables);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function updateCamera(camera: FollowCamera) {
  if (KEYBOARD.isDown(Keys.leftShift)) {
    camera.rotate(MOUSE_STATE.x * 0.01, MOUSE_STATE.y * 0.01);
  }

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

  MOUSE_STATE.x *= 0.75;
  MOUSE_STATE.y *= 0.75;

  if (Math.abs(MOUSE_STATE.x) < math.EPSILON) {
    MOUSE_STATE.x = 0;
  }
  if (Math.abs(MOUSE_STATE.y) < math.EPSILON) {
    MOUSE_STATE.y = 0;
  }

  camera.move(velocity);
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

function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, drawables: Drawables): void {
  beginRender(gl, camera);
  updateCamera(camera);

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  programs.instanced.use();

  programs.instanced.set3f('scale', 1, 1, 1);
  programs.instanced.setMat4('projection', proj);
  programs.instanced.setMat4('view', view);

  debug.setViewProjection(programs.instanced, view, proj);
}

export function main() {
  const glResult = debug.createCanvasAndContext(document.body);
  if (debug.checkError(glResult)) {
    return;
  }
  const gl = glResult.unwrap();

  debug.setupDocumentBody(MOUSE_STATE);

  debug.createTouchControls(KEYBOARD);
  render(gl);
}