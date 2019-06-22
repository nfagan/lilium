import { debug, Keyboard, Keys, Program, FollowCamera, Vao, Vbo, 
  BufferDescriptor, Ebo, VoxelGrid, collision, MousePicker, math, types } from '../src/gl';
import { Result } from '../src/util';
import { Player } from '../src/game';
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
  quad: Drawable,
  cube: Drawable,
  instancedCube: InstancedDrawable
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
  return debug.tryCreateProgramFromSources(gl, voxelGridSources.vertex, voxelGridSources.fragment);
}

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  return debug.tryCreateProgramFromSources(gl, simpleSources.vertex, simpleSources.fragment);
}

function makeDrawable(gl: WebGLRenderingContext, prog: Program, 
  positions: Float32Array, indices: Uint16Array, numTriangles: number): Drawable {
  prog.use();

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

function makeDrawables(gl: WebGLRenderingContext, prog: Program, instancedProg: Program, maxNumInstances: number): Result<Drawables, string> {
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

  const simpleProgResult = createSimpleProgram(gl);
  const instancedProgResult = createInstancedProgram(gl);

  if (debug.checkError(simpleProgResult) || debug.checkError(instancedProgResult)) {
    return;
  }

  const gridDim = 100;
  const cellDims = [2, 0.5, 2];
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
    player.aabb.moveTo3(2, 20, 2);
  }
}

function handlePlayerJump(player: Player): void {
  const maxYVelocity = 2;

  if (GAME_STATE.playerJumped) {
    if (player.canJump()) {
      player.jump();
    }
    GAME_STATE.playerJumped = false;
  }

  if (player.upVelocity !== 0) {
    player.upVelocity -= 0.01;
  }

  if (Math.abs(player.upVelocity) > maxYVelocity) {
    player.upVelocity = maxYVelocity * Math.sign(player.upVelocity);
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

  if (Math.abs(MOUSE_STATE.x) < math.EPSILON) {
    MOUSE_STATE.x = 0;
  }
  if (Math.abs(MOUSE_STATE.y) < math.EPSILON) {
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
  const model = mat4.create();
  const cubeDrawFunc = drawables.cube.drawFunction;

  drawables.cube.vao.bind();
  debug.drawOrigin(gl, prog, model, cubeDrawFunc);

  const playerAabb = player.aabb;
  debug.drawAabb(gl, prog, model, playerAabb, [0, 0, 1], cubeDrawFunc);

  gl.disable(gl.CULL_FACE);
  drawables.quad.vao.bind();
  debug.drawAxesPlanes(gl, prog, model, drawables.quad.drawFunction);
  gl.enable(gl.CULL_FACE);
}

function drawSelectedVoxel(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, voxelGridInfo: VoxelGridInfo): void {
  const cellCenter = vec3.create();
  const useCellDims = vec3.create();
  const lastLinearIdx = voxelGridInfo.lastLinearInd;

  for (let i = 0; i < 3; i++) {
    cellCenter[i] = voxelGridInfo.filled[i + lastLinearIdx];
    const szOffset = 0.05;
    useCellDims[i] = voxelGridInfo.grid.cellDimensions[i] / 2 + szOffset;
  }

  drawable.vao.bind();
  voxelGridInfo.grid.getCellCenter(cellCenter, cellCenter);
  debug.drawAt(gl, prog, mat4.create(), cellCenter, useCellDims, [1, 1, 1], drawable.drawFunction);
}

function drawInstancedVoxelGrid(gl: WebGLRenderingContext, programs: Programs, drawables: Drawables, voxelGridInfo: VoxelGridInfo, view: mat4, proj: mat4): void {
  programs.simple.use();

  if (voxelGridInfo.lastLinearInd !== null) {
    drawSelectedVoxel(gl, programs.simple, drawables.cube, voxelGridInfo);
  }
  
  const instancedProg = programs.instanced;
  const cellDims = voxelGridInfo.cellDims;

  instancedProg.use();
  debug.setViewProjection(programs.instanced, view, proj);
  instancedProg.set3f('scale', cellDims[0]/2, cellDims[1]/2, cellDims[2]/2);

  drawables.instancedCube.vao.bind();
  drawables.instancedCube.drawFunction(gl);
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

function addVoxelCell(voxelGridInfo: VoxelGridInfo, atIdx: types.Real3, playerAabb?: math.Aabb): void {
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

  //  Hack -- test to see if collission occurs with this new
  //  cell. If so, unmark it, and return.
  if (playerAabb !== undefined) {
    const collider = voxelGridInfo.gridCollider;
    const collisionResult = voxelGridInfo.gridCollisionResult;

    collider.collidesWithAabb3(collisionResult, playerAabb, 0, 0, 0);

    if (collisionResult.collided) {
      console.log('Not adding cell because it overlaps with player: ', atIdx);
      grid.markEmpty(atIdx);
      return;
    }
  }

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

function handleVoxelAddition(voxelGridInfo: VoxelGridInfo, playerAabb: math.Aabb, forwardDir: types.Real3): void {
  if (voxelGridInfo.lastLinearInd === null) {
    return;
  }

  let ix = voxelGridInfo.lastVoxel[0];
  let iy = voxelGridInfo.lastVoxel[1];
  let iz = voxelGridInfo.lastVoxel[2];

  let markedKey: number = -1;

  const amtX = forwardDir[0];
  const amtZ = forwardDir[2];

  const mapping = [0, 1, 2];
  const inds = [ix, iy, iz];
  const signs = [1, 1, 1];
  let isReverse: boolean = false;
  
  if (Math.abs(amtX) > Math.abs(amtZ)) {
    mapping[0] = 2;
    mapping[2] = 0;
    isReverse = Math.sign(amtX) === -1;
  } else {
    isReverse = Math.sign(amtZ) === -1;
  }

  if (isReverse) {
    signs[0] = 1;
    signs[2] = -1;
  } else {
    signs[0] = -1;
    signs[2] = 1;
  }

  if (KEYBOARD.isDown(Keys.w)) {
    inds[mapping[2]] -= signs[2];
    markedKey = Keys.w;
  } else if (KEYBOARD.isDown(Keys.s)) {
    inds[mapping[2]] += signs[2];
    markedKey = Keys.s;
  } else if (KEYBOARD.isDown(Keys.a)) {
    inds[mapping[0]] -= signs[0];
    markedKey = Keys.a;
  } else if (KEYBOARD.isDown(Keys.d)) {
    inds[mapping[0]] += signs[0];
    markedKey = Keys.d;
  } else if (KEYBOARD.isDown(Keys.q)) {
    inds[1]++;
    markedKey = Keys.q;
  } else if (KEYBOARD.isDown(Keys.z)) {
    inds[1]--;
    markedKey = Keys.z;
  }

  const anyMarked = markedKey !== -1;

  if (anyMarked) {
    addVoxelCell(voxelGridInfo, inds, playerAabb);
    GAME_STATE.voxelManipulationState = VoxelManipulationStates.selecting;
    KEYBOARD.markUp(markedKey);
  }
}

function updateVoxelInstances(gl: WebGLRenderingContext, voxelGridInfo: VoxelGridInfo, instancedCube: InstancedDrawable): void {
  const grid = voxelGridInfo.grid;
  const numFilled = grid.countFilled();
  const numActiveInstances = instancedCube.numActiveInstances;
  const cellDims = grid.cellDimensions;
  const filled = voxelGridInfo.filled;

  if (numFilled === numActiveInstances) {
    return;
  } else if (numFilled < numActiveInstances) {
    //  @TODO: Handle this case via a removeVoxelCell() function or similar.
    console.warn('Fewer filled cells than active instances.');
    return;
  }

  // console.log('Need update; have: ', numFilled, '; ', numActiveInstances, 'are active.');

  const numToUpdate = numFilled - numActiveInstances;
  const offsetFilled = numActiveInstances * 3;
  const byteOffset = offsetFilled * Float32Array.BYTES_PER_ELEMENT;

  const instanceVao = instancedCube.vao;
  const translationVbo = instanceVao.getVbo('translation');
  const colorVbo = instanceVao.getVbo('color');

  let tmpArray: Float32Array = null;
  if (numToUpdate === 1) {
    //  Don't create a new array for only a single addition.
    tmpArray = instancedCube.tmpEmptyArray;
  } else {
    tmpArray = new Float32Array(numToUpdate * 3);
  }

  for (let i = 0; i < numToUpdate; i++) {
    for (let j = 0; j < 3; j++) {
      const linearIdx = i*3 + j;
      const minDim = filled[linearIdx + offsetFilled] * cellDims[j];
      const midDim = minDim + cellDims[j]/2;
      tmpArray[linearIdx] = midDim;
    }
  }

  translationVbo.bind(gl);
  translationVbo.subData(gl, tmpArray, byteOffset);

  for (let i = 0; i < numToUpdate; i++) {
    tmpArray[i*3] = Math.random();
    tmpArray[i*3+1] = 0.75 * Math.random();
    tmpArray[i*3+2] = 0.1 * Math.random();
  }
  
  colorVbo.bind(gl);
  colorVbo.subData(gl, tmpArray, byteOffset);

  instancedCube.numActiveInstances = numFilled;
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
      handleVoxelAddition(voxelGridInfo, player.aabb, camera.getFront(vec3.create()));
      break;
  }

  debug.setViewProjection(simpleProg, view, proj);
  drawDebugComponents(gl, simpleProg, drawables, player);
  // drawVoxelGrid(gl, simpleProg, drawables.cube, voxelGridInfo);

  updateVoxelInstances(gl, voxelGridInfo, drawables.instancedCube);
  drawInstancedVoxelGrid(gl, programs, drawables, voxelGridInfo, view, proj);

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

  debug.createTouchMoveControls(KEYBOARD);
  initializeGameStateListeners(gl);
  render(gl);
}