import { debug, Keyboard, Program, FollowCamera, Vao, Vbo, 
  BufferDescriptor, Ebo, VoxelGrid, MousePicker, types } from '../src/gl';
import { Result, StatTimer } from '../src/util';
import { mat4, vec3 } from 'gl-matrix';

const MOUSE_STATE: {x: number, y: number, lastX: number, lastY: number, down: boolean} = {
  x: null,
  y: null,
  lastX: null,
  lastY: null,
  down: false
};

const KEYBOARD = new Keyboard();

type Drawable = {
  vao: Vao,
  drawFunction: types.DrawFunction
};

type Drawables = {
  quad: Drawable,
  cube: Drawable
};

type Programs = {
  simple: Program
};

type VoxelGridInfo = {
  grid: VoxelGrid,
  filled: Array<number>,
  colors: Array<number>,
  sub2ind: Map<number, number>,
  lastInd: number,
  lastColor: Array<number>
}

type GameState = {
  isSelectingVoxel: boolean
}

const GAME_STATE: GameState = {
  isSelectingVoxel: false
};

function createInstancedProgram(gl: WebGLRenderingContext): Result<Program, string> {
  const vsSource = `
    precision highp float;
    attribute vec3 aPosition;
    attribute vec3 aTranslation;
    attribute float aFaceIndex;
    attribute vec3 aColor;
    varying float vFaceIndex;
    varying vec3 vColor;
    uniform mat4 projection;
    uniform mat4 model;
    uniform mat4 view;
    void main() {
      vFaceIndex = aFaceIndex;
      vColor = aColor;
      vec4 pos = vec4(aPosition * 0.5 + aTranslation, 1.0);
      gl_Position = projection * view * model * pos;
    }
  `;

  const fsSource = `
  precision highp float;
  varying float vFaceIndex;
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor * vFaceIndex, 1.0);
  }
  `;
  return debug.tryCreateProgramFromSources(gl, vsSource, fsSource);
}

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  const vsSource = `
    precision highp float;
    attribute vec3 aPosition;
    uniform mat4 projection;
    uniform mat4 model;
    uniform mat4 view;
    void main() {
      gl_Position = projection * view * model * vec4(aPosition, 1.0);
    }
  `;

  const fsSource = `
  precision highp float;
  uniform vec3 color;
  uniform float alpha;
  void main() {
    gl_FragColor = vec4(color, 1.0);
  }
  `;

  return debug.tryCreateProgramFromSources(gl, vsSource, fsSource);
}

function styleTouchElement(el: HTMLDivElement, offset: number, color: string) {
  const sz = 50;
  
  el.style.width = `${sz}px`;
  el.style.height = `${sz}px`;
  el.style.position = 'fixed';
  el.style.bottom = '0';
  el.style.left = `${offset * sz}`;
  el.style.backgroundColor = color;
}

function createTouchMoveControls() {
  const left = document.createElement('div');
  const right = document.createElement('div');

  styleTouchElement(left, 0, 'red');
  styleTouchElement(right, 1, 'blue');

  left.addEventListener('touchstart', _ => KEYBOARD.markDown('w'))
  left.addEventListener('touchend', _ => KEYBOARD.markUp('w'))
  right.addEventListener('touchstart', _ => KEYBOARD.markDown('s'))
  right.addEventListener('touchend', _ => KEYBOARD.markUp('s'))
  
  document.body.appendChild(left);
  document.body.appendChild(right);
}

function makeDrawable(gl: WebGLRenderingContext, prog: Program, 
  positions: Float32Array, indices: Uint16Array, numTriangles: number): Drawable {
  const descriptor = new BufferDescriptor();
  descriptor.addAttribute({name: 'aPosition', size: 3, type: gl.FLOAT});
  descriptor.getAttributeLocations(prog);

  const vao = new Vao(gl);

  vao.bind();
  vao.attachVbo('position', new Vbo(gl, descriptor, positions));
  vao.attachEbo('indices', new Ebo(gl, indices));
  vao.unbind();

  return {
    vao: vao,
    drawFunction: gl => gl.drawElements(gl.TRIANGLES, numTriangles, gl.UNSIGNED_SHORT, 0)
  };
}

function makeDrawables(gl: WebGLRenderingContext, prog: Program): Result<Drawables, string> {
  try {
    const cube = makeDrawable(gl, prog, debug.cubePositions(), debug.cubeIndices(), 36);
    const quad = makeDrawable(gl, prog, debug.quadPositions(), debug.quadIndices(), 6);
    return Result.Ok({cube, quad});

  } catch (err) {
    return Result.Err(err.message);
  }
}

function render(gl: WebGLRenderingContext): void {
  const camera = new FollowCamera();
  camera.followDistance = 20;
  camera.move([0, 1.5, 0]);

  const progResult = createInstancedProgram(gl);
  if (debug.checkError(progResult)) {
    return;
  }
  const simpleProgResult = createSimpleProgram(gl);
  if (debug.checkError(simpleProgResult)) {
    return;
  }

  const programs: Programs = {
    simple: simpleProgResult.unwrap()
  };

  const drawableRes = makeDrawables(gl, programs.simple);
  if (debug.checkError(drawableRes)) {
    return;
  }
  const drawables = drawableRes.unwrap();

  const gridDim = 100;
  const nFilled = 10;
  const voxelGrid = makeVoxelGrid([gridDim, gridDim, gridDim], nFilled);

  function renderer() {
    renderLoop(gl, programs, camera, drawables, voxelGrid);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function updateCamera(camera: FollowCamera) {
  camera.rotate(MOUSE_STATE.x * 0.01, MOUSE_STATE.y * 0.01);
  MOUSE_STATE.x *= 0.5;
  MOUSE_STATE.y *= 0.5;

  const front = camera.getFront(vec3.create());
  const right = camera.getRight(vec3.create());
  const mvSpeed = 0.5;

  front[1] = 0;
  vec3.normalize(front, front);

  vec3.scale(front, front, mvSpeed);
  vec3.scale(right, right, mvSpeed);

  if (KEYBOARD.isDown('w')) camera.moveNeg(front);
  if (KEYBOARD.isDown('s')) camera.move(front);
  if (KEYBOARD.isDown('a')) camera.moveNeg(right);
  if (KEYBOARD.isDown('d')) camera.move(right);
  if (KEYBOARD.isDown('q')) camera.move([0, 1, 0]);
  if (KEYBOARD.isDown('z')) camera.move([0, -1, 0]);
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

function beginRender(gl: WebGLRenderingContext): void {
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  if (gl.canvas.width !== gl.canvas.clientWidth || gl.canvas.height !== gl.canvas.clientHeight) {
    const dpr = window.devicePixelRatio || 1;
    gl.canvas.width = gl.canvas.clientWidth * dpr;
    gl.canvas.height = gl.canvas.clientHeight * dpr;
  }

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.cullFace(gl.FRONT);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function drawDebugComponents(gl: WebGLRenderingContext, prog: Program, target: vec3, drawables: Drawables): void {
  const currCullState: boolean = gl.getParameter(gl.CULL_FACE);
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;

  drawables.cube.vao.bind();
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);
  debug.drawAt(gl, prog, model, target, 0.5, [1, 0, 0], cubeDrawFunc);

  gl.disable(gl.CULL_FACE);
  drawables.quad.vao.bind();
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);

  if (currCullState) {
    gl.enable(gl.CULL_FACE);
  }
}

function drawVoxelGrid(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, voxelGridInfo: VoxelGridInfo): void {
  drawable.vao.bind();

  const filled = voxelGridInfo.filled;
  const colors = voxelGridInfo.colors;
  const nFilled = filled.length/3;
  const trans = vec3.create();
  const model = mat4.create();
  const color = vec3.create();

  for (let i = 0; i < nFilled; i++) {
    for (let j = 0; j < 3; j++) {
      trans[j] = filled[i*3+j] + 0.5;
      color[j] = colors[i*3+j];
    }

    debug.drawAt(gl, prog, model, trans, 0.5, color, drawable.drawFunction);
  }
}

function makeVoxelGrid(dims: vec3 | Array<number>, initialDim: number): VoxelGridInfo {
  const gridInfo: VoxelGridInfo = {
    grid: new VoxelGrid([0, 0, 0], dims, [1, 1, 1]),
    filled: [],
    colors: [],
    sub2ind: new Map(),
    lastInd: null,
    lastColor: []
  };

  for (let i = 0; i < initialDim; i++) {
    for (let j = 0; j < initialDim; j++) {
      addVoxelCell(gridInfo, [i, 0, j]);
    }
  }

  return gridInfo;
}

function addVoxelCell(voxelGridInfo: VoxelGridInfo, atIdx: vec3 | Array<number>): void {
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
  const currIdx = voxelGridInfo.filled.length;
  
  for (let i = 0; i < 3; i++) {
    voxelGridInfo.filled.push(atIdx[i]);
    voxelGridInfo.colors.push(Math.random());
  }

  voxelGridInfo.sub2ind.set(grid.subToInd(atIdx), currIdx);
}

function resetSelection(voxelGridInfo: VoxelGridInfo): void {
  if (voxelGridInfo.lastInd !== null) {
    for (let i = 0; i < 3; i++) {
      voxelGridInfo.colors[i+voxelGridInfo.lastInd] = voxelGridInfo.lastColor[i];
    }
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
  resetSelection(voxelGridInfo);

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

  voxelGridInfo.lastInd = currIdx;
  //  Try to add an adjacent voxel.
  cellIdx[Math.floor(Math.random()*3)] += (Math.random() > 0.5 ? 1 : -1);
  // addVoxelCell(voxelGridInfo, cellIdx);
}

function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, drawables: Drawables, 
  voxelGridInfo: VoxelGridInfo): void {
  beginRender(gl);
  updateCamera(camera);

  const simpleProg = programs.simple;
  simpleProg.use();

  const view = camera.makeViewMatrix();
  const proj = debug.makeProjectionMatrix(gl, mat4.create());
  debug.setViewProjection(simpleProg, view, proj);

  drawDebugComponents(gl, simpleProg, camera.target, drawables);
  drawVoxelGrid(gl, simpleProg, drawables.cube, voxelGridInfo);

  // if (GAME_STATE.isSelectingVoxel) {
    handleVoxelSelection(voxelGridInfo, gl, camera, view, proj);
    // GAME_STATE.isSelectingVoxel = false;
  // }
}

function initializeGameStateListeners() {
  KEYBOARD.addListener('r', 'selectVoxel', () => GAME_STATE.isSelectingVoxel = true);
}

export function main() {
  const glResult = debug.createCanvasAndContext(document.body);
  if (debug.checkError(glResult)) {
    return;
  }

  debug.setupDocumentBody(MOUSE_STATE);

  createTouchMoveControls();
  initializeGameStateListeners();

  render(glResult.unwrap());
}