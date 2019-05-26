import { Program, FollowCamera, Vao, Vbo, BufferDescriptor, Ebo, domHelpers, VoxelGrid, MousePicker } from '../src/gl';
import { Result, StatTimer } from '../src/util';
import { mat4, vec3, glMatrix } from 'gl-matrix';

const MOUSE_COORDS: {x: number, y: number, lastX: number, lastY: number} = {
  x: null,
  y: null,
  lastX: null,
  lastY: null,
};

const KEY_STATE: {[s: string]: boolean} = {};
const WHITE = vec3.fromValues(1, 1, 1);
const TMP_VEC = vec3.create();
const MOUSE_RAY = vec3.create();
let INTERSECTIONS: Array<{point: vec3, color: vec3, size: number}> = [];
const INTERSECT_TIMER = new StatTimer();

let MOUSE_DOWN: boolean = false;
let voxelGrid: VoxelGrid = null;

type DrawFunction = (gl: WebGLRenderingContext) => void;
type Drawable = {
  vao: Vao,
  drawFunction: DrawFunction
};

type VoxelIndices = {
  indices: Float32Array,
  // sub2ind: {[s: string]: number}
  sub2ind: Map<number, number>
};

function createInstancedProgram(gl: WebGLRenderingContext): Result<Program, string> {
  const fsSource = `
  precision highp float;
  varying float vFaceIndex;
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor * vFaceIndex, 1.0);
  }
  `;

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

  try {
    const prog = Program.fromSources(gl, vsSource, fsSource);
    return Result.Ok(prog);
  } catch (err) {
    return Result.Err(err.message);
  }
}

function createSimpleProgram(gl: WebGLRenderingContext): Result<Program, string> {
  const fsSource = `
  precision highp float;
  uniform vec3 color;
  uniform float alpha;
  void main() {
    gl_FragColor = vec4(color, alpha);
  }
  `;

  const vsSource = `
    precision highp float;
    attribute vec3 aPosition;
    attribute float aFaceIndex;
    uniform mat4 projection;
    uniform mat4 model;
    uniform mat4 view;
    void main() {
      gl_Position = projection * view * model * vec4(aPosition, 1.0);
    }
  `;

  try {
    const prog = Program.fromSources(gl, vsSource, fsSource);
    return Result.Ok(prog);
  } catch (err) {
    return Result.Err(err.message);
  }
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

  left.addEventListener('touchstart', _ => KEY_STATE['w'] = true);
  left.addEventListener('touchend', _ => KEY_STATE['w'] = false);
  right.addEventListener('touchstart', _ => KEY_STATE['s'] = true);
  right.addEventListener('touchend', _ => KEY_STATE['s'] = false);
  
  document.body.appendChild(left);
  document.body.appendChild(right);
}

function setupDocumentBody(): void {
  ['left', 'top', 'margin', 'padding'].map(v => document.body.style[v as any] = '0');
  document.body.style.position = 'fixed';
  document.body.style.height = '100%';
  document.body.style.width = '100%';

  document.body.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 0) {
      MOUSE_COORDS.lastX = e.touches[0].clientX;
      MOUSE_COORDS.lastY = e.touches[0].clientY;
    }
  });
  document.body.addEventListener('touchmove', e => {
    if (e.touches.length === 1) {
      if (MOUSE_COORDS.lastX === null) {
        MOUSE_COORDS.lastX = e.touches[0].clientX;
        MOUSE_COORDS.lastY = e.touches[0].clientY;
      }
      MOUSE_COORDS.x = e.touches[0].clientX - MOUSE_COORDS.lastX;
      MOUSE_COORDS.y = e.touches[0].clientY - MOUSE_COORDS.lastY;
      MOUSE_COORDS.lastX = e.touches[0].clientX;
      MOUSE_COORDS.lastY = e.touches[0].clientY;
    }
  });
  document.body.addEventListener('touchend', e => {
    MOUSE_COORDS.lastY = null;
    MOUSE_COORDS.lastX = null;
  });
  document.body.addEventListener('click', e => {
    MOUSE_DOWN = !MOUSE_DOWN;
    if (!MOUSE_DOWN) {
      MOUSE_COORDS.x = 0;
      MOUSE_COORDS.y = 0;
    }
  })
  document.body.addEventListener('mousemove', e => {
    if (MOUSE_DOWN) {
      MOUSE_COORDS.x = e.movementX;
      MOUSE_COORDS.y = e.movementY;
    }

    MOUSE_COORDS.lastX = e.clientX;
    MOUSE_COORDS.lastY = e.clientY;
  });

  window.addEventListener('keydown', e => {
    KEY_STATE[e.key] = true;
  });
  window.addEventListener('keyup', e => {
    KEY_STATE[e.key] = false;
  });

  createTouchMoveControls();
}

function checkError<T>(res: Result<T, string>): boolean {
  if (!res.isOk()) {
    console.error(res.unwrapErr());
    return true;
  }

  return false;
}

function getQuadPositions(): Float32Array {
  const faceIntensity = 1;

  return new Float32Array([
    -1.0, -1.0,  1.0, faceIntensity,  
     1.0, -1.0,  1.0, faceIntensity, 
     1.0,  1.0,  1.0, faceIntensity, 
    -1.0,  1.0,  1.0, faceIntensity
  ]);
}

function getQuadIndices(): Uint16Array {
  return new Uint16Array([0,  1,  2, 0,  2,  3]);
}

function get3DCubePositions(): Float32Array {
  const faceIntensity = 4/6;

  return new Float32Array([
    -1.0, -1.0,  1.0, faceIntensity,  
     1.0, -1.0,  1.0, faceIntensity,  
     1.0,  1.0,  1.0, faceIntensity,  
    -1.0,  1.0,  1.0, faceIntensity,  

    -1.0, -1.0, -1.0, faceIntensity,
    -1.0,  1.0, -1.0, faceIntensity,
     1.0,  1.0, -1.0, faceIntensity,
     1.0, -1.0, -1.0, faceIntensity,
    
    -1.0,  1.0, -1.0, 6/6,
    -1.0,  1.0,  1.0, 6/6,
     1.0,  1.0,  1.0, 6/6,
     1.0,  1.0, -1.0, 6/6,
  
    -1.0, -1.0, -1.0, faceIntensity,
     1.0, -1.0, -1.0, faceIntensity,
     1.0, -1.0,  1.0, faceIntensity,
    -1.0, -1.0,  1.0, faceIntensity,
    
     1.0, -1.0, -1.0, faceIntensity,
     1.0,  1.0, -1.0, faceIntensity,
     1.0,  1.0,  1.0, faceIntensity,
     1.0, -1.0,  1.0, faceIntensity,
    
    -1.0, -1.0, -1.0, faceIntensity,
    -1.0, -1.0,  1.0, faceIntensity,
    -1.0,  1.0,  1.0, faceIntensity,
    -1.0,  1.0, -1.0, faceIntensity,
  ]);
}

function get3DCubeIndices(): Uint16Array {
  return new Uint16Array([
    0,  1,  2,      0,  2,  3,
    4,  5,  6,      4,  6,  7,
    8,  9,  10,     8,  10, 11,
    12, 13, 14,     12, 14, 15,
    16, 17, 18,     16, 18, 19,
    20, 21, 22,     20, 22, 23,
  ]);
}

function get3DCubeTranslations(voxelIndices: Float32Array): Float32Array {
  const translations: Array<number> = [];

  for (let i = 0; i < voxelIndices.length; i++) {
    translations.push(voxelIndices[i]+0.5);
  }

  return new Float32Array(translations);
}

function getFilledVoxelIndices(voxelGrid: VoxelGrid, dim: number): VoxelIndices {
  const indices: Array<number> = [];
  // const subMap: {[s: string]: number} = {};
  const subMap: Map<number, number> = new Map();
  const inds = vec3.create();

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {

      while (true) {
        const ind0 = Math.floor(Math.random() * dim);
        const ind1 = Math.floor(Math.random() * dim);
        const ind2 = Math.floor(Math.random() * dim);

        // const subStr = `${ind0},${ind1},${ind2}`;
        inds[0] = ind0;
        inds[1] = ind1;
        inds[2] = ind2;

        const key = voxelGrid.subToInd(inds);

        // if (!subMap[subStr]) {
        if (!subMap.has(key)) {
          const current = indices.length;
          for (let k = 0; k < 3; k++) {
            indices.push(inds[k]);
          }
          // subMap[subStr] = current;
          // sub2ind[subStr] = current;
          subMap.set(key, current);
          break;
        }
      }
    }
  }

  return {indices: new Float32Array(indices), sub2ind: subMap};
}

function get3DCubeColors(numInstances: number): Float32Array {
  let colors: Array<number> = [];

  for (let i = 0; i < numInstances; i++) {
    if (i === 0) {
      colors.push(0);
      colors.push(0);
      colors.push(1);
    } else {
      colors.push(Math.random());
      colors.push(Math.random());
      colors.push(Math.random());
    }
  }

  return new Float32Array(colors);
}

function makeInstancedDrawable(gl: WebGLRenderingContext, prog: Program, gridDim: number, voxelIndices: Float32Array, voxelColors: Float32Array): Drawable {
  const numInstances = gridDim * gridDim;

  const descriptor = new BufferDescriptor();
  descriptor.addAttribute({name: 'aPosition', size: 3, type: gl.FLOAT, divisor: 0});
  descriptor.addAttribute({name: 'aFaceIndex', size: 1, type: gl.FLOAT, divisor: 0});
  descriptor.getAttributeLocations(prog);

  const descr2 = new BufferDescriptor();
  descr2.addAttribute({name: 'aColor', size: 3, type: gl.FLOAT, divisor: 1});
  descr2.getAttributeLocations(prog);

  const instanceDescriptor = new BufferDescriptor();
  instanceDescriptor.addAttribute({name: 'aTranslation', size: 3, type: gl.FLOAT, divisor: 1});
  instanceDescriptor.getAttributeLocations(prog);

  const vao = new Vao(gl);

  vao.bind();
  vao.attachVbo('position', new Vbo(gl, descriptor, get3DCubePositions()));
  vao.attachEbo('indices', new Ebo(gl, get3DCubeIndices()));
  vao.attachVbo('translation', new Vbo(gl, instanceDescriptor, get3DCubeTranslations(voxelIndices)));
  vao.attachVbo('color', new Vbo(gl, descr2, voxelColors))
  vao.unbind();

  return {
    vao: vao,
    drawFunction: (gl) => {
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      ext.drawElementsInstancedANGLE(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, numInstances);
    }
  }
}

function makeDrawable(gl: WebGLRenderingContext, prog: Program, 
  positions: Float32Array, indices: Uint16Array, numTriangles: number): Drawable {
  const descriptor = new BufferDescriptor();
  descriptor.addAttribute({name: 'aPosition', size: 3, type: gl.FLOAT});
  descriptor.addAttribute({name: 'aFaceIndex', size: 1, type: gl.FLOAT});
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

function makeProjectionMatrix(gl: WebGLRenderingContext): mat4 {
  const fov = 45 * Math.PI / 180;
  const ar = gl.canvas.clientWidth / gl.canvas.clientHeight;
  return mat4.perspective(mat4.create(), fov, ar, 0.1, 1000);
}

function render(gl: WebGLRenderingContext): void {
  const camera = new FollowCamera();
  const progResult = createInstancedProgram(gl);
  if (checkError(progResult)) {
    return;
  }
  const simpleProgResult = createSimpleProgram(gl);
  if (checkError(simpleProgResult)) {
    return;
  }

  const gridDim = 100;

  camera.followDistance = 30;
  // camera.rotate(Math.PI * 1.5, 0.3);
  // camera.move([-10, gridDim, -10]);

  const prog = progResult.unwrap();
  const simpleProg = simpleProgResult.unwrap();

  voxelGrid = makeVoxelGrid(gridDim);

  const drawables: Array<Drawable> = [];
  const voxelIndices = getFilledVoxelIndices(voxelGrid, gridDim);
  const voxelColors = get3DCubeColors(gridDim * gridDim);

  fillGridWithIndices(voxelGrid, voxelIndices.indices);

  try {
    drawables.push(makeInstancedDrawable(gl, prog, gridDim, voxelIndices.indices, voxelColors));
    drawables.push(makeDrawable(gl, simpleProg, get3DCubePositions(), get3DCubeIndices(), 36));
    drawables.push(makeDrawable(gl, simpleProg, getQuadPositions(), getQuadIndices(), 6));
  } catch (err) {
    console.error(err.message);
    return;
  }

  function renderer() {
    renderLoop(gl, prog, simpleProg, camera, drawables, voxelIndices, voxelColors, gridDim);
    requestAnimationFrame(renderer);
  }

  renderer();
}

function updateCamera(camera: FollowCamera) {
  camera.rotate(MOUSE_COORDS.x * 0.01, MOUSE_COORDS.y * 0.01);
  MOUSE_COORDS.x *= 0.5;
  MOUSE_COORDS.y *= 0.5;

  const front = camera.getFront(vec3.create());
  const right = camera.getRight(vec3.create());

  // front[1] = 0;
  // vec3.normalize(front, front);

  if (KEY_STATE['w']) camera.moveNeg(front);
  if (KEY_STATE['s']) camera.move(front);
  if (KEY_STATE['a']) camera.moveNeg(right);
  if (KEY_STATE['d']) camera.move(right);
  if (KEY_STATE['q']) camera.move([0, 1, 0]);
  if (KEY_STATE['z']) camera.move([0, -1, 0]);
}

function lightUpInstancedCube(gl: WebGLRenderingContext, vao: Vao, cubeIndex: number, color: Float32Array): void {
  const byteIndex = cubeIndex * Float32Array.BYTES_PER_ELEMENT;
  const vbo = vao.getVbo('color');
  vbo.bind(gl);
  vbo.subData(gl, color, byteIndex);
}

function fillGridWithIndices(grid: VoxelGrid, inds: Float32Array): void {
  const cell = vec3.create();

  for (let i = 0; i < inds.length/3; i++) {
    for (let j = 0; j < 3; j++) {
      cell[j] = inds[i*3+j];
    }

    grid.markFilled(cell);
  }
}

function mouseRay(out: vec3, gl: WebGLRenderingContext, view: mat4, projection: mat4): boolean {
  const x = MOUSE_COORDS.lastX;
  const y = MOUSE_COORDS.lastY;
  const w = gl.canvas.clientWidth;
  const h = gl.canvas.clientHeight;

  if (x === null) {
    return false;
  }

  const mousePicker = new MousePicker();
  mousePicker.ray(out, x, y, view, projection, w, h);

  return true;
}

function makeVoxelGrid(gridDim: number): VoxelGrid {
  const pos = vec3.fromValues(0, 0, 0);
  const gridDims = vec3.fromValues(gridDim, gridDim, gridDim);
  const cellDims = vec3.fromValues(1, 1, 1);

  const voxelGrid = new VoxelGrid(pos, gridDims, cellDims);

  return voxelGrid;
}

function drawAt(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, pos: vec3, sz: number, color: vec3, alpha: number): void {
  const model = mat4.create();
  mat4.translate(model, model, pos);
  mat4.scale(model, model, [sz, sz, sz]);
  prog.setMat4('model', model);
  prog.setVec3('color', color)
  prog.set1f('alpha', alpha);
  drawable.drawFunction(gl);
}

function drawRay(gl: WebGLRenderingContext, prog: Program, drawable: Drawable, 
  p0: vec3, rayDir: vec3, dist: number, numPoints: number): void {

  const ptScale = [0.1, 0.1, 0.1];
  const targModel = mat4.create();
  const p1 = vec3.create();
  const copyDir = vec3.copy(vec3.create(), rayDir);

  mat4.translate(targModel, targModel, p0);
  mat4.scale(targModel, targModel, [0.5, 0.5, 0.5]);
  prog.setMat4('model', targModel);
  prog.set3f('color', 0, 0, 1);

  vec3.add(p1, p0, vec3.scale(copyDir, copyDir, dist));

  drawable.drawFunction(gl);

  mat4.identity(targModel);
  mat4.translate(targModel, targModel, p1);
  mat4.scale(targModel, targModel, [0.5, 0.5, 0.5]);

  prog.setMat4('model', targModel);
  drawable.drawFunction(gl);

  for (let i = 0; i < numPoints; i++) {
    const dir = vec3.sub(vec3.create(), p1, p0);
    const dist = vec3.distance(p1, p0);
    const ptPlacement = dist * ((i+1)/numPoints)

    vec3.normalize(dir, dir);
    vec3.scale(dir, dir, ptPlacement);
    vec3.add(dir, dir, p0);

    mat4.identity(targModel);
    mat4.translate(targModel, targModel, dir);
    mat4.scale(targModel, targModel, ptScale);
    prog.setMat4('model', targModel);

    drawable.drawFunction(gl);
  }
}

function drawPlanes(gl: WebGLRenderingContext, prog: Program, quad: Drawable, gridDim: number): void {
  quad.vao.bind();
  const model = mat4.create();
  const scl = [5, 5, 5];
  const enclosingSz = 1;

  // mat4.scale(model, model, scl);
  mat4.translate(model, model, [0, 0, -1]);

  prog.setMat4('model', model);
  prog.set3f('color', 1, 0, 0);
  quad.drawFunction(gl);

  //  X
  mat4.identity(model);
  mat4.translate(model, model, [-1, 0, 0]);
  mat4.rotate(model, model, glMatrix.toRadian(90), [0, 1, 0]);
  //
  prog.setMat4('model', model);
  prog.set3f('color', 0, 0, 1);
  quad.drawFunction(gl);

  //  Y
  mat4.identity(model);
  mat4.rotate(model, model, glMatrix.toRadian(90), [1, 0, 0]);
  // mat4.scale(model, model, scl);

  prog.setMat4('model', model);
  prog.set3f('color', 0, 1, 0);
  quad.drawFunction(gl);

  mat4.identity(model);
  mat4.translate(model, model, [0, gridDim+1, 0]);
  mat4.rotate(model, model, glMatrix.toRadian(90), [1, 0, 0]);
  mat4.scale(model, model, [enclosingSz, enclosingSz, 1]);

  prog.setMat4('model', model);
  prog.set3f('color', 0, 1, 0);
  quad.drawFunction(gl);

  mat4.identity(model);
  mat4.translate(model, model, [gridDim-1, 0, 0]);
  mat4.rotate(model, model, glMatrix.toRadian(90), [0, 1, 0]);
  mat4.scale(model, model, [enclosingSz, enclosingSz, 1]);

  prog.setMat4('model', model);
  prog.set3f('color', 0, 0, 1);
  quad.drawFunction(gl);

  mat4.identity(model);
  mat4.translate(model, model, [0, 0, gridDim-1]);
  mat4.scale(model, model, [enclosingSz, enclosingSz, 1]);

  prog.setMat4('model', model);
  prog.set3f('color', 1, 0, 0);
  quad.drawFunction(gl);
}

function drawOrigin(gl: WebGLRenderingContext, prog: Program, cube: Drawable): void {
  const model = mat4.create();
  mat4.scale(model, model, [0.25, 0.25, 0.25]);

  prog.setMat4('model', model);
  prog.set3f('color', 1, 1, 1);

  cube.vao.bind();
  cube.drawFunction(gl);
}

function drawCubes(gl: WebGLRenderingContext, prog: Program, cube: Drawable, inds: Float32Array, colors: Float32Array): void {
  const trans = vec3.create();
  const model = mat4.create();

  for (let i = 0; i < inds.length; i += 3) {
    vec3.set(trans, inds[i]+0.5, inds[i+1]+0.5, inds[i+2]+0.5);
    mat4.identity(model);
    
    mat4.translate(model, model, trans);
    mat4.scale(model, model, [0.5, 0.5, 0.5]);
    prog.setMat4('model', model);
    prog.set3f('color', colors[i], colors[i+1], colors[i+2]);

    cube.drawFunction(gl);
  }
}

function setModelViewProjection(prog: Program, model: mat4, view: mat4, proj: mat4): void {
  prog.setMat4('model', model);
  prog.setMat4('view', view);
  prog.setMat4('projection', proj);
}

const LAST_COLOR = vec3.create();
let LAST_INDEX: number = null;

function handleIntersection(gl: WebGLRenderingContext, drawable: Drawable, camera: FollowCamera, 
  view: mat4, project: mat4, voxelIndicesAggregate: VoxelIndices, voxelColors: Float32Array) {
  vec3.copy(TMP_VEC, camera.position);
  mouseRay(MOUSE_RAY, gl, view, project);

  INTERSECT_TIMER.tick();
  const cellIdx = vec3.create();
  const intersectRes = voxelGrid.intersectingCell(cellIdx, camera.position, MOUSE_RAY);
  INTERSECT_TIMER.tock();

  if (!intersectRes) {
    if (LAST_INDEX !== null) {
      lightUpInstancedCube(gl, drawable.vao, LAST_INDEX, LAST_COLOR);
      for (let i = 0; i < 3; i++) voxelColors[LAST_INDEX+i] = LAST_COLOR[i];
      LAST_INDEX = null;
    }
    return;
  }

  const key = voxelGrid.subToInd(cellIdx);
  const ind = voxelIndicesAggregate.sub2ind.get(key);

  if (ind === undefined) {
    console.error('No indices matched: ', cellIdx);
    return;
  }
  
  if (LAST_INDEX === null || LAST_INDEX !== ind) {
    if (LAST_INDEX !== null) {
      lightUpInstancedCube(gl, drawable.vao, LAST_INDEX, LAST_COLOR);
      for (let i = 0; i < 3; i++) voxelColors[LAST_INDEX+i] = LAST_COLOR[i];
    }

    for (let i = 0; i < 3; i++) LAST_COLOR[i] = voxelColors[ind+i];
    voxelColors[ind] = 1;
    voxelColors[ind+1] = 1;
    voxelColors[ind+2] = 1;
    LAST_INDEX = ind;
    lightUpInstancedCube(gl, drawable.vao, ind, WHITE);

  } else if (LAST_INDEX !== null && LAST_INDEX !== ind) {
    for (let i = 0; i < 3; i++) voxelColors[LAST_INDEX+i] = LAST_COLOR[i];
    lightUpInstancedCube(gl, drawable.vao, LAST_INDEX, LAST_COLOR);
  }
}

function renderLoop(gl: WebGLRenderingContext, prog: Program, simpleProg: Program, 
  camera: FollowCamera, drawables: Array<Drawable>, voxelIndicesAggregate: VoxelIndices, voxelColors: Float32Array, gridDim: number): void {
  const voxelIndices = voxelIndicesAggregate.indices;

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  // gl.enable(gl.BLEND);
  // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

  updateCamera(camera);

  if (drawables.length < 3) {
    console.error('Expected at least 3 drawables.');
    return;
  }

  const instancedDrawable = drawables[0];
  const cubeDrawable = drawables[1];

  const model = mat4.create();
  const view = camera.makeViewMatrix();
  const project = makeProjectionMatrix(gl);

  prog.use();
  setModelViewProjection(prog, model, view, project);
  instancedDrawable.vao.bind();
  instancedDrawable.drawFunction(gl);

  const targModel = mat4.create();
  mat4.translate(targModel, targModel, camera.target);
  mat4.scale(targModel, targModel, [0.5, 0.5, 0.5]);

  simpleProg.use();
  simpleProg.set1f('alpha', 0.75);
  setModelViewProjection(simpleProg, targModel, view, project);
  cubeDrawable.vao.bind();
  cubeDrawable.drawFunction(gl);

  // drawRay(gl, simpleProg, cubeDrawable, TMP_VEC, MOUSE_RAY, 100, 50);
  // drawCubes(gl, simpleProg, cubeDrawable, voxelIndices, voxelColors);
  drawOrigin(gl, simpleProg, cubeDrawable);
  handleIntersection(gl, instancedDrawable, camera, view, project, voxelIndicesAggregate, voxelColors);

  if (KEY_STATE['t']) {
    INTERSECT_TIMER.display();
  }

  // for (let i = 0; i < INTERSECTIONS.length; i++) {
  //   if (INTERSECTIONS[i]) {
  //     drawAt(gl, simpleProg, cubeDrawable, INTERSECTIONS[i].point, INTERSECTIONS[i].size, INTERSECTIONS[i].color, 1.0);
  //   }
  // }

  simpleProg.set1f('alpha', 0.75);

  gl.disable(gl.CULL_FACE);
  drawPlanes(gl, simpleProg, drawables[2], gridDim);
}

export function main() {
  const glResult = domHelpers.createCanvasAndContext(document.body);
  if (checkError(glResult)) {
    return;
  }

  // checkVoxelGrid();

  setupDocumentBody();
  render(glResult.unwrap());
}