import { debug, Keyboard, Keys, Program, FollowCamera, Vao, Vbo, 
  BufferDescriptor, Ebo, VoxelGrid, collision, MousePicker, types, math } from '../src/gl';
import { Result } from '../src/util';
import { Player } from '../src/game';
import { mat4, vec3 } from 'gl-matrix';

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
  instancedCube: Drawable
};

type Programs = {
  simple: Program,
  instanced: Program
};

type VoxelGridInfo = {
  grid: VoxelGrid,
  cellDims: Array<number>,
  gridCollider: collision.VoxelGridCollider,
  gridCollisionResult: collision.VoxelGridCollisionResult,
  filled: Array<number>,
  colors: Array<number>,
  sub2ind: Map<number, number>,
  lastLinearInd: number,
  lastVoxel: Array<number>,
  lastColor: Array<number>
};

enum VoxelManipulationStates {
  selecting,
  creating
}

type GameState = {
  voxelManipulationState: VoxelManipulationStates,
  voxelClicked: boolean,
  playerJumped: boolean
};

const GAME_STATE: GameState = {
  voxelManipulationState: VoxelManipulationStates.selecting,
  voxelClicked: false,
  playerJumped: false,
};

function createInstancedProgram(gl: WebGLRenderingContext): Result<Program, string> {
  const vsSource = `
    precision highp float;
    attribute vec3 a_position;
    attribute vec3 a_translation;
    attribute vec3 a_color;
    varying vec3 v_color;
    uniform mat4 projection;
    uniform mat4 model;
    uniform mat4 view;
    uniform vec3 scale;
    void main() {
      v_color = a_color;
      vec4 pos = vec4(a_position * scale + a_translation, 1.0);
      gl_Position = projection * view * model * pos;
    }
  `;

  const fsSource = `
  precision highp float;
  varying vec3 v_color;
  void main() {
    gl_FragColor = vec4(v_color, 1.0);
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

  left.addEventListener('touchstart', _ => KEYBOARD.markDown(Keys.w));
  left.addEventListener('touchend', _ => KEYBOARD.markUp(Keys.w));
  right.addEventListener('touchstart', _ => KEYBOARD.markDown(Keys.s));
  right.addEventListener('touchend', _ => KEYBOARD.markUp(Keys.s));
  
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
    drawFunction: gl => gl.drawElements(gl.TRIANGLES, numTriangles, gl.UNSIGNED_SHORT, 0),
    isInstanced: false
  };
}

function makeInstancedDrawable(gl: WebGLRenderingContext, prog: Program, positions: Float32Array, 
  indices: Uint16Array, numTriangles: number, maxNumInstances: number): Drawable {
  
  const descriptor = new BufferDescriptor();
  descriptor.addAttribute({name: 'a_position', size: 3, type: gl.FLOAT, divisor: 0});

  const colorDescriptor = new BufferDescriptor();
  colorDescriptor.addAttribute({name: 'a_color', size: 3, type: gl.FLOAT, divisor: 1});

  const transDescriptor = new BufferDescriptor();
  transDescriptor.addAttribute({name: 'a_translation', size: 3, type: gl.FLOAT, divisor: 1});

  const emptyFloat3Array = new Float32Array(maxNumInstances * 3); //  * (x, y, z) or (r, g, b)

  const vao = new Vao(gl);

  vao.bind();
  vao.attachVbo('position', new Vbo(gl, descriptor, positions));
  vao.attachVbo('color', new Vbo(gl, colorDescriptor, emptyFloat3Array));
  vao.attachVbo('translation', new Vbo(gl, transDescriptor, emptyFloat3Array));
  vao.attachEbo('indices', new Ebo(gl, indices));
  vao.unbind();

  const drawable: Drawable = {
    vao: vao,
    drawFunction: null,
    isInstanced: true,
    numTriangles: numTriangles,
    numActiveInstances: 0
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

function makeDrawables(gl: WebGLRenderingContext, prog: Program, 
  instancedProg: Program, maxNumInstances: number): Result<Drawables, string> {
  const cubePos = debug.cubePositions();
  const cubeInds = debug.cubeIndices();

  try {
    const cube = makeDrawable(gl, prog, cubePos, cubeInds, 36);
    const quad = makeDrawable(gl, prog, debug.quadPositions(), debug.quadIndices(), 6);
    const instancedCube = makeInstancedDrawable(gl, instancedProg, cubePos, cubeInds, 36, maxNumInstances);

    return Result.Ok({cube, quad, instancedCube});
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
  const simpleProgResult = createSimpleProgram(gl);

  if (debug.checkError(simpleProgResult) || debug.checkError(instancedProgResult)) {
    return;
  }

  const gridDim = 100;
  const cellDims = [1, 0.5, 1];
  const nFilled = 50;
  const maxNumInstances = gridDim * gridDim;
  const voxelGrid = makeVoxelGrid([gridDim, gridDim, gridDim], cellDims, nFilled);

  const playerDims = [0.51, 0.51, 0.51];
  // const playerDims = [1.01, 1.01, 1.01];
  const player = new Player(playerDims);

  player.aabb.moveTo3(0, 8, cellDims[1]);

  const programs: Programs = {
    simple: simpleProgResult.unwrap(),
    instanced: instancedProgResult.unwrap()
  };

  const drawableRes = makeDrawables(gl, programs.simple, programs.instanced, maxNumInstances);
  if (debug.checkError(drawableRes)) {
    return;
  }
  const drawables = drawableRes.unwrap();

  function renderer() {
    renderLoop(gl, programs, camera, player, drawables, voxelGrid);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function checkIsPlayerGrounded(player: Player, grid: VoxelGrid, collisionResult: collision.VoxelGridCollisionResult, velocity: vec3 | Array<number>): boolean {
  const y = player.aabb.minY;
  const isTopFace = collisionResult.isTopFace();
  const cellCrit = Math.abs(y) % grid.cellDimensions[1] < math.EPSILON;
  const collisionVoxel = collisionResult.voxelIndex;

  if (cellCrit && velocity[1] < 0 && isTopFace) {
    if (grid.isFilledAdjacentY(collisionVoxel, 1)) {
      console.warn('Caught on voxel: ', collisionVoxel);
    }
    return true;
  }

  return false;
}

function updatePlayerAabb(player: Player, velocity: Array<number>, voxelGridInfo: VoxelGridInfo): void {
  const playerAabb = player.aabb;
  const grid = voxelGridInfo.grid;
  const collisionResult = voxelGridInfo.gridCollisionResult;

  voxelGridInfo.gridCollider.moveAabb(collisionResult, playerAabb, playerAabb, velocity);

  const isBotFace = collisionResult.isBottomFace();
  const isPlayerGrounded = checkIsPlayerGrounded(player, grid, collisionResult, velocity);

  if (isPlayerGrounded) {
    player.ground();
  } else if (isBotFace) {
    player.upVelocity = -math.EPSILON;
  }

  //  Hack -- If, after moving a small amount, we do not collide with a voxel below, add fall velocity.
  voxelGridInfo.gridCollider.collidesWithAabb3(collisionResult, playerAabb, 0, -0.01, 0);
  if (!collisionResult.collided) {
    player.upVelocity -= 0.01;
    player.isOnGround = false;
  } else {
    player.ground();
  }

  //  If we fell too far, reset.
  if (player.aabb.minY < -20) {
    player.aabb.moveTo3(2, 2, 2);
  }
}

function handlePlayerJump(player: Player): void {
  const maxVelocity = 1;

  if (GAME_STATE.playerJumped) {
    if (player.canJump()) {
      player.jump();
    }
    GAME_STATE.playerJumped = false;
  }

  if (player.upVelocity !== 0) {
    player.upVelocity -= 0.01;
  }

  if (Math.abs(player.upVelocity) > maxVelocity) {
    player.upVelocity = maxVelocity * Math.sign(player.upVelocity);
  }
}

function updatePlayerPosition(player: Player, camera: FollowCamera, voxelGridInfo: VoxelGridInfo): void {
  const front = camera.getFront(vec3.create());
  const right = camera.getRight(vec3.create());
  // const mvSpeed = 0.05;
  const mvSpeed = 0.1;

  front[1] = 0;
  vec3.normalize(front, front);

  vec3.scale(front, front, mvSpeed);
  vec3.scale(right, right, mvSpeed);

  handlePlayerJump(player);
  
  const velocity = [0, player.upVelocity, 0];

  if (KEYBOARD.isDown(Keys.w)) math.sub3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.s)) math.add3(velocity, velocity, front);
  if (KEYBOARD.isDown(Keys.a)) math.sub3(velocity, velocity, right);
  if (KEYBOARD.isDown(Keys.d)) math.add3(velocity, velocity, right);

  updatePlayerAabb(player, velocity, voxelGridInfo);
}

function updateCamera(camera: FollowCamera, player: Player) {
  if (KEYBOARD.isDown(Keys.leftShift)) {
    camera.rotate(MOUSE_STATE.x * 0.01, MOUSE_STATE.y * 0.01);
  }

  MOUSE_STATE.x *= 0.75;
  MOUSE_STATE.y *= 0.75;

  if (MOUSE_STATE.x < math.EPSILON) {
    MOUSE_STATE.x = 0;
  }
  if (MOUSE_STATE.y < math.EPSILON) {
    MOUSE_STATE.y = 0;
  }

  camera.targetTo3(player.aabb.midX(), player.aabb.midY(), player.aabb.midZ());
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

function drawDebugComponents(gl: WebGLRenderingContext, prog: Program, drawables: Drawables, player: Player): void {
  const currCullState: boolean = gl.getParameter(gl.CULL_FACE);
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;

  drawables.cube.vao.bind();
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);

  if (DEBUG_AABB !== null) {
    debug.drawAabb(gl, prog, model, DEBUG_AABB, [0, 1, 0], cubeDrawFunc);
  }

  const playerAabb = player.aabb;
  debug.drawAabb(gl, prog, model, playerAabb, [0, 0, 1], cubeDrawFunc);

  gl.disable(gl.CULL_FACE);
  drawables.quad.vao.bind();
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);

  if (currCullState) {
    gl.enable(gl.CULL_FACE);
  }
}

function drawVoxelGrid(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, voxelGridInfo: VoxelGridInfo): void {
  const filled = voxelGridInfo.filled;
  const colors = voxelGridInfo.colors;
  const nFilled = filled.length/3;
  const trans = vec3.create();
  const model = mat4.create();
  const color = vec3.create();
  const cellDims = [0, 0, 0];
  
  voxelGridInfo.grid.getCellDimensions(cellDims);
  for (let i = 0; i < 3; i++) {
    cellDims[i] = cellDims[i] / 2;
  }

  drawable.vao.bind();

  for (let i = 0; i < nFilled; i++) {
    for (let j = 0; j < 3; j++) {
      const sz = cellDims[j];
      trans[j] = filled[i*3+j] / (0.5 / sz) + sz;
      color[j] = colors[i*3+j];
    }

    debug.drawAt(gl, prog, model, trans, cellDims, color, drawable.drawFunction);
  }
}

function makeVoxelGrid(gridDims: vec3 | Array<number>, cellDims: vec3 | Array<number>, initialDim: number): VoxelGridInfo {
  const grid = new VoxelGrid([0, 0, 0], gridDims, cellDims);

  const gridInfo: VoxelGridInfo = {
    grid: grid,
    gridCollisionResult: new collision.VoxelGridCollisionResult(),
    cellDims: [cellDims[0], cellDims[1], cellDims[2]],
    gridCollider: new collision.VoxelGridCollider(grid),
    filled: [],
    colors: [],
    sub2ind: new Map<number, number>(),
    lastLinearInd: null,
    lastVoxel: [],
    lastColor: []
  };

  const toAdd = [0, 0, 0];

  for (let i = 0; i < initialDim; i++) {
    for (let j = 0; j < initialDim; j++) {
      toAdd[0] = i;
      toAdd[2] = j;

      if (!gridInfo.grid.isFilled(toAdd)) {
        addVoxelCell(gridInfo, toAdd);
      }
    }
  }

  const rows = 4;
  const cols = 2;
  const height = 6;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < height; k++) {
        toAdd[0] = i;
        toAdd[1] = k + 1;
        toAdd[2] = j;

        addVoxelCell(gridInfo, toAdd);
      }
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

function clearVoxelSelection(voxelGridInfo: VoxelGridInfo): void {
  if (voxelGridInfo.lastLinearInd !== null) {
    for (let i = 0; i < 3; i++) {
      voxelGridInfo.colors[i+voxelGridInfo.lastLinearInd] = voxelGridInfo.lastColor[i];
    }
    voxelGridInfo.lastLinearInd = null;
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
  clearVoxelSelection(voxelGridInfo);

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

  voxelGridInfo.lastLinearInd = currIdx;
  for (let i = 0; i < 3; i++) {
    voxelGridInfo.lastVoxel[i] = cellIdx[i];
  }

  if (GAME_STATE.voxelClicked) {
    GAME_STATE.voxelManipulationState = VoxelManipulationStates.creating;
  }
}

function handleVoxelAddition(voxelGridInfo: VoxelGridInfo): void {
  if (voxelGridInfo.lastLinearInd === null) {
    return;
  }

  let ix = voxelGridInfo.lastVoxel[0];
  let iy = voxelGridInfo.lastVoxel[1];
  let iz = voxelGridInfo.lastVoxel[2];

  let markedKey: number = -1;

  if (KEYBOARD.isDown(Keys.w)) {
    iz++;
    markedKey = Keys.w;
  } else if (KEYBOARD.isDown(Keys.s)) {
    iz--;
    markedKey = Keys.s;
  } else if (KEYBOARD.isDown(Keys.a)) {
    ix--;
    markedKey = Keys.a;
  } else if (KEYBOARD.isDown(Keys.d)) {
    ix++;
    markedKey = Keys.d;
  } else if (KEYBOARD.isDown(Keys.q)) {
    iy++;
    markedKey = Keys.q;
  } else if (KEYBOARD.isDown(Keys.z)) {
    iy--;
    markedKey = Keys.z;
  }

  const anyMarked = markedKey !== -1;

  if (anyMarked) {
    addVoxelCell(voxelGridInfo, [ix, iy, iz]);
    GAME_STATE.voxelManipulationState = VoxelManipulationStates.selecting;
    KEYBOARD.markUp(markedKey);
  }
}

function renderLoop(gl: WebGLRenderingContext, programs: Programs, camera: FollowCamera, 
  player: Player, drawables: Drawables, voxelGridInfo: VoxelGridInfo): void {
  beginRender(gl, camera);

  if (GAME_STATE.voxelManipulationState !== VoxelManipulationStates.creating) {
    updatePlayerPosition(player, camera, voxelGridInfo);
    updateCamera(camera, player);
  }

  const simpleProg = programs.simple;
  simpleProg.use();

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  switch (GAME_STATE.voxelManipulationState) {
    case VoxelManipulationStates.selecting:
      handleVoxelSelection(voxelGridInfo, gl, camera, view, proj);
      break;
    case VoxelManipulationStates.creating:
      handleVoxelAddition(voxelGridInfo);
      break;
  }

  debug.setViewProjection(simpleProg, view, proj);
  drawDebugComponents(gl, simpleProg, drawables, player);
  drawVoxelGrid(gl, simpleProg, drawables.cube, voxelGridInfo);

  GAME_STATE.voxelClicked = false;
}

function initializeGameStateListeners(gl: WebGLRenderingContext) {
  gl.canvas.addEventListener('click', () => {
    GAME_STATE.voxelClicked = true;
  });
  KEYBOARD.addListener(Keys.space, 'playerJump', () => GAME_STATE.playerJumped = true);
}

export function main() {
  const glResult = debug.createCanvasAndContext(document.body);
  if (debug.checkError(glResult)) {
    return;
  }
  const gl = glResult.unwrap();

  debug.setupDocumentBody(MOUSE_STATE);

  createTouchMoveControls();
  initializeGameStateListeners(gl);
  render(gl);
}