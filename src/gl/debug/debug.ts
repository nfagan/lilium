import { Result, NumberSampler, BuiltinRealArray } from '../../util';
import { types, Program, math, Keyboard, Keys, Vao, ICamera, FollowCamera } from '..';
import { mat4, vec3, glMatrix } from 'gl-matrix';

export function segmentedQuadPositions(numSegments: number, is3d = true): Float32Array {
  const segmentSize = 1 / numSegments;
  const positions: Array<number> = [];

  for (let i = 0; i < numSegments; i++) {
    const x0 = -1.0;
    const x1 = 1.0;
    const y0 = i * segmentSize;
    const y1 = y0 + segmentSize;
    const z = 0;

    //  tri1.
    positions.push(x0);
    positions.push(y1);

    if (is3d) {
      positions.push(z);
    }

    positions.push(x0);
    positions.push(y0);

    if (is3d) {
      positions.push(z);
    }
    
    positions.push(x1);
    positions.push(y0);

    if (is3d) {
      positions.push(z);
    }

    //  tri2.
    positions.push(x1);
    positions.push(y0);

    if (is3d) {
      positions.push(z);
    }

    positions.push(x1);
    positions.push(y1);

    if (is3d) {
      positions.push(z);
    }

    positions.push(x0);
    positions.push(y1);

    if (is3d) {
      positions.push(z);
    }
  }

  return new Float32Array(positions);
}

export function cubeNormals(): Float32Array {
  return new Float32Array([
    0, 0, -1,
    0, 0, -1,
    0, 0, -1,
    0, 0, -1,

    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
        
    0, -1, 0,
    0, -1, 0,  
    0, -1, 0,
    0, -1, 0,
      
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
        
    -1, 0, 0,
    -1, 0, 0,
    -1, 0, 0,
    -1, 0, 0,
        
    1, 0, 0,
    1, 0, 0,
    1, 0, 0,
    1, 0, 0,
  ]);
}

export function cubePositions(): Float32Array {
  return new Float32Array([
    -1.0, -1.0,  1.0,
     1.0, -1.0,  1.0,
     1.0,  1.0,  1.0,
    -1.0,  1.0,  1.0,

    -1.0, -1.0, -1.0,
    -1.0,  1.0, -1.0,
     1.0,  1.0, -1.0,
     1.0, -1.0, -1.0,
    
    -1.0,  1.0, -1.0,
    -1.0,  1.0,  1.0,
     1.0,  1.0,  1.0,
     1.0,  1.0, -1.0,
  
    -1.0, -1.0, -1.0,
     1.0, -1.0, -1.0,
     1.0, -1.0,  1.0,
    -1.0, -1.0,  1.0,
    
     1.0, -1.0, -1.0,
     1.0,  1.0, -1.0,
     1.0,  1.0,  1.0,
     1.0, -1.0,  1.0,
    
    -1.0, -1.0, -1.0,
    -1.0, -1.0,  1.0,
    -1.0,  1.0,  1.0,
    -1.0,  1.0, -1.0,
  ]);
}

export function sphereInterleavedDataAndIndices(vertexCount: number = 64): {vertexData: Float32Array, indices: Uint16Array} {
  const vertexData: Array<number> = [];

  for (let i = 0; i < vertexCount; i++) {
    for (let j = 0; j < vertexCount; j++) {
      let xSegment = j / (vertexCount-1);
      let ySegment = i / (vertexCount-1);

      let xPos = Math.cos(xSegment * 2 * Math.PI) * Math.sin(ySegment * Math.PI);
      let yPos = Math.cos(ySegment * Math.PI);
      let zPos = Math.sin(xSegment * 2 * Math.PI) * Math.sin(ySegment * Math.PI);

      vertexData.push(xPos);
      vertexData.push(yPos);
      vertexData.push(zPos);

      vertexData.push(xSegment);
      vertexData.push(ySegment);

      vertexData.push(xPos);
      vertexData.push(yPos);
      vertexData.push(zPos);
    }
  }

  let firstIndex = 0;
  let nextIndex = vertexCount;
  let indexStp = 0;
  let shouldProceed = true;
  let indices: Array<number> = [];

  while (shouldProceed) {
    indices.push(firstIndex);
    indices.push(nextIndex);
    indexStp += 2;

    shouldProceed = nextIndex != (vertexCount * vertexCount) - 1;

    if (indexStp > 0 && (nextIndex+1) % vertexCount == 0 && shouldProceed) {
      indices.push(nextIndex);
      indices.push(firstIndex+1);
      indexStp += 2;
    }

    firstIndex++;
    nextIndex++;
  }

  return {
    vertexData: new Float32Array(vertexData),
    indices: new Uint16Array(indices)
  };
}

export function cubeInterleavedPositionsNormals(): Float32Array {
  return new Float32Array([
    -1.0, -1.0,  1.0,  0, 0, 1,
     1.0, -1.0,  1.0,  0, 0, 1,
     1.0,  1.0,  1.0,  0, 0, 1,
    -1.0,  1.0,  1.0,  0, 0, 1,

    -1.0, -1.0, -1.0,  0, 0, -1,
    -1.0,  1.0, -1.0,  0, 0, -1,
     1.0,  1.0, -1.0,  0, 0, -1,
     1.0, -1.0, -1.0,  0, 0, -1,
    
    -1.0,  1.0, -1.0,  0, 1, 0,
    -1.0,  1.0,  1.0,  0, 1, 0,  
     1.0,  1.0,  1.0,  0, 1, 0,
     1.0,  1.0, -1.0,  0, 1, 0,
  
    -1.0, -1.0, -1.0,  0, -1, 0,
     1.0, -1.0, -1.0,  0, -1, 0,
     1.0, -1.0,  1.0,  0, -1, 0,
    -1.0, -1.0,  1.0,  0, -1, 0,
    
     1.0, -1.0, -1.0,  1, 0, 0,
     1.0,  1.0, -1.0,  1, 0, 0,
     1.0,  1.0,  1.0,  1, 0, 0,
     1.0, -1.0,  1.0,  1, 0, 0,
    
    -1.0, -1.0, -1.0,   -1, 0, 0,
    -1.0, -1.0,  1.0,   -1, 0, 0,
    -1.0,  1.0,  1.0,   -1, 0, 0,
    -1.0,  1.0, -1.0,   -1, 0, 0,
  ]);
}

export function cubeIndices(): Uint16Array {
  return new Uint16Array([
    0,  1,  2,      0,  2,  3,
    4,  5,  6,      4,  6,  7,
    8,  9,  10,     8,  10, 11,
    12, 13, 14,     12, 14, 15,
    16, 17, 18,     16, 18, 19,
    20, 21, 22,     20, 22, 23,
  ]);
}

export function quadPositions(): Float32Array {
  return new Float32Array([
    -1.0, -1.0,  1.0,
     1.0, -1.0,  1.0,
     1.0,  1.0,  1.0,
    -1.0,  1.0,  1.0,
  ]);
}

export function quadIndices(): Uint16Array {
  return new Uint16Array([0,  1,  2, 0,  2,  3]);
}

export function checkError<T>(res: Result<T, string>): boolean {
  if (!res.isOk()) {
    console.error(res.unwrapErr());
    return true;
  }

  return false;
}

export function unwrapResult<T>(res: Result<T, string>): T {
  if (res.isErr()) {
    throw new Error(res.unwrapErr());
  } else {
    return res.unwrap();
  }
}

export type DebugDrawFunction = (gl: WebGLRenderingContext) => void;

export type Drawable = {
  vao: Vao,
  drawFunction: DebugDrawFunction,
  isInstanced: boolean,
  numTriangles?: number,
  numActiveInstances?: number
};

export function drawAxesPlanes(gl: WebGLRenderingContext, prog: Program, model: mat4, drawFunction: DebugDrawFunction): void {
  //  Z
  mat4.identity(model);
  mat4.scale(model, model, [0.5, 0.5, 0.5]);
  mat4.translate(model, model, [0, 0, -1]);
  //
  prog.setMat4('model', model);
  prog.set3f('color', 1, 0, 0);
  drawFunction(gl);

  //  X
  mat4.identity(model);
  mat4.scale(model, model, [0.5, 0.5, 0.5]);
  mat4.translate(model, model, [-1, 0, 0]);
  mat4.rotate(model, model, glMatrix.toRadian(90), [0, 1, 0]);
  //
  prog.setMat4('model', model);
  prog.set3f('color', 0, 0, 1);
  drawFunction(gl);

  //  Y
  mat4.identity(model);
  mat4.scale(model, model, [0.5, 0.5, 0.5]);
  mat4.rotate(model, model, glMatrix.toRadian(90), [1, 0, 0]);

  prog.setMat4('model', model);
  prog.set3f('color', 0, 1, 0);
  drawFunction(gl);
}

export function drawOrigin(gl: WebGLRenderingContext, prog: Program, model: mat4, drawFunction: DebugDrawFunction): void {
  mat4.identity(model);
  mat4.scale(model, model, [0.25, 0.25, 0.25]);

  prog.setMat4('model', model);
  prog.set3f('color', 1, 1, 1);
  drawFunction(gl);
}

export function drawAabb(gl: WebGLRenderingContext, prog: Program, model: mat4, aabb: math.Aabb,
  color: vec3 | Array<number>, drawFunction: DebugDrawFunction): void {
  const w = aabb.width();
  const h = aabb.height();
  const d = aabb.depth();

  const x = aabb.minX + w/2;
  const y = aabb.minY + h/2;
  const z = aabb.minZ + d/2;

  mat4.identity(model);
  mat4.translate(model, model, [x, y, z]);
  mat4.scale(model, model, [w/2, h/2, d/2]);

  prog.setMat4('model', model);
  prog.setVec3('color', color);
  drawFunction(gl);
}

export function makeFollowCamera(gl: WebGLRenderingContext): FollowCamera {
  const camera = new FollowCamera();

  camera.followDistance = 10;
  camera.rotate(Math.PI, Math.PI/6);
  camera.setAspect(gl.canvas.clientWidth / gl.canvas.clientHeight);
  camera.setNear(0.1);
  camera.setFar(1000);
  camera.setFieldOfView(45 * Math.PI/180);

  return camera;
}

export function drawAt(gl: WebGLRenderingContext, prog: Program, model: mat4, pos: types.Real3, sz: types.Real3 | number,
  color: types.Real3, drawFunction: DebugDrawFunction): void {
  mat4.identity(model);
  mat4.translate(model, model, pos as vec3);
  if (typeof sz === 'number') {
    mat4.scale(model, model, [sz, sz, sz]);
  } else {
    mat4.scale(model, model, sz as vec3);
  }
  prog.setMat4('model', model);
  prog.setVec3('color', color);
  drawFunction(gl);
}

export function drawGroundPlane(gl: WebGLRenderingContext, prog: Program, model: mat4, scale: number, drawable: Drawable, color: types.Real3): void {
  mat4.identity(model);
  mat4.translate(model, model, [0, scale, 0]);
  mat4.rotateX(model, model, Math.PI/2);
  mat4.scale(model, model, [scale, scale, scale]);
  prog.setMat4('model', model);
  prog.setVec3('color', color);
  drawable.drawFunction(gl);
}

export function beginRender(gl: WebGLRenderingContext, camera: ICamera, dpr?: number, forceUpdate: boolean = false): void {
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  if (forceUpdate || gl.canvas.width !== gl.canvas.clientWidth || gl.canvas.height !== gl.canvas.clientHeight) {
    dpr = dpr || window.devicePixelRatio || 1;
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

export function updateFollowCamera(dt: number, camera: FollowCamera, target: types.Real3, mouseState: DebugMouseState, keyboard: Keyboard) {
  const dtFactor = Math.max(dt / (1/60), 1);

  if (isNaN(mouseState.x) || isNaN(mouseState.y)) {
    mouseState.x = 0;
    mouseState.y = 0;
  }

  if (keyboard.isDown(Keys.leftShift) || mouseState.touchDown) {
    camera.rotate(mouseState.x * 0.01, mouseState.y * 0.01);
  }

  mouseState.x *= (0.75 / dtFactor);
  mouseState.y *= (0.75 / dtFactor);

  if (Math.abs(mouseState.x) < math.EPSILON) {
    mouseState.x = 0;
  }

  if (Math.abs(mouseState.y) < math.EPSILON) {
    mouseState.y = 0;
  }

  camera.targetTo3(target[0], target[1], target[2]);
}

export function setViewProjection(prog: Program, view: mat4, proj: mat4): void {
  prog.setMat4('view', view);
  prog.setMat4('projection', proj);
}

export function makeProjectionMatrix(gl: WebGLRenderingContext, out: mat4): mat4 {
  const fov = 45 * Math.PI / 180;
  const ar = gl.canvas.clientWidth / gl.canvas.clientHeight;
  return mat4.perspective(out, fov, ar, 0.1, 1000);
}

export function tryCreateProgramFromSources(gl: WebGLRenderingContext, vsSource: string, fsSource: string): Result<Program, string> {
  try {
    const prog = Program.fromSources(gl, vsSource, fsSource);
    return Result.Ok(prog);
  } catch (err) {
    return Result.Err(err.message);
  }
}

export type DebugMouseState = {
  x: number, 
  y: number, 
  lastX: number, 
  lastY: number,
  clicked: boolean,
  down: boolean,
  touchDown: boolean
};

export function makeDebugMouseState(): DebugMouseState {
  return {
    x: null,
    y: null,
    lastX: null,
    lastY: null,
    clicked: false,
    down: false,
    touchDown: false
  };
}

export function createCanvasAndContext(appendTo: HTMLElement): Result<WebGLRenderingContext, string> {
  const canvas = document.createElement('canvas');
  canvas.style.height = '100%';
  canvas.style.width = '100%';

  const gl = canvas.getContext('webgl', {antialias: true});

  if (!gl) {
    return Result.Err('Failed to initialize WebGL render context.');
  }

  appendTo.appendChild(canvas);

  return Result.Ok(gl);
}

export function maximizeDocumentBody(): void {
  ['left', 'top', 'margin', 'padding'].map(v => document.body.style[v as any] = '0');
  document.body.style.position = 'fixed';
  document.body.style.height = '100%';
  document.body.style.width = '100%';
}

export function setupDocumentBody(mouseState: DebugMouseState): void {
  maximizeDocumentBody();

  document.body.addEventListener('touchstart', e => {
    e.preventDefault();
    mouseState.down = true;
    mouseState.touchDown = true;
    if (e.touches.length > 0) {
      mouseState.lastX = e.touches[0].clientX;
      mouseState.lastY = e.touches[0].clientY;
    }
  });
  document.body.addEventListener('touchmove', e => {
    if (e.touches.length > 0) {
      if (mouseState.lastX === null) {
        mouseState.lastX = e.touches[0].clientX;
        mouseState.lastY = e.touches[0].clientY;
      }
      mouseState.x = e.touches[0].clientX - mouseState.lastX;
      mouseState.y = e.touches[0].clientY - mouseState.lastY;
      mouseState.lastX = e.touches[0].clientX;
      mouseState.lastY = e.touches[0].clientY;
    }
  });
  document.body.addEventListener('touchend', e => {
    mouseState.lastY = null;
    mouseState.lastX = null;
    mouseState.down = false;
    mouseState.touchDown = false;
    mouseState.x = 0;
    mouseState.y = 0;
  });
  document.body.addEventListener('mousedown', e => mouseState.down = true);
  document.body.addEventListener('mouseup', e => mouseState.down = false);
  document.body.addEventListener('mousemove', e => {
    mouseState.x = e.movementX;
    mouseState.y = e.movementY;
    mouseState.lastX = e.clientX;
    mouseState.lastY = e.clientY;
  });
}

function styleTouchElement(el: HTMLDivElement, sz: number, offsetX: number, offsetY: number, color: string, rightJustify?: boolean) {  
  el.style.width = `${sz}px`;
  el.style.height = `${sz}px`;
  el.style.position = 'fixed';
  el.style.bottom = `${offsetY * sz}px`;
  el.style.backgroundColor = color;
  el.style.opacity = '0.25';
  el.style.zIndex = '3';

  if (rightJustify) {
    el.style.left = `${window.innerWidth - sz}px`;
  } else {
    el.style.left = `${offsetX * sz}`;
  }
}

function addTouchElementEventListener(element: HTMLDivElement, keyboard: Keyboard, key: number): void {
  element.addEventListener('touchstart', e => {
    e.preventDefault();
    keyboard.markDown(key);
  });
  element.addEventListener('touchend', _ => keyboard.markUp(key));
  element.addEventListener('touchcancel', _ => keyboard.markUp(key));
}

export type DebugTouchControls = {
  left: HTMLDivElement,
  right: HTMLDivElement,
  up: HTMLDivElement,
  down: HTMLDivElement,
  jump: HTMLDivElement,
  toggleQuality: HTMLDivElement,
}

export function createTouchControls(keyboard: Keyboard): DebugTouchControls {
  const left = document.createElement('div');
  const right = document.createElement('div');
  const down = document.createElement('div');
  const up = document.createElement('div');
  const jump = document.createElement('div');
  const toggleQuality = document.createElement('div');

  const sz = 50;

  styleTouchElement(left, sz, 0, 1, 'red');
  styleTouchElement(right, sz, 1, 1, 'blue');
  styleTouchElement(down, sz, 0.5, 0, 'green');
  styleTouchElement(up, sz, 0.5, 2, 'yellow');
  styleTouchElement(jump, sz, 0, 0, 'yellow', true);
  styleTouchElement(toggleQuality, sz, 0, 1, 'red', true);

  addTouchElementEventListener(left, keyboard, Keys.a);
  addTouchElementEventListener(right, keyboard, Keys.d);
  addTouchElementEventListener(down, keyboard, Keys.s);
  addTouchElementEventListener(up, keyboard, Keys.w);
  addTouchElementEventListener(jump, keyboard, Keys.space);
  addTouchElementEventListener(toggleQuality, keyboard, Keys.k);
  
  document.body.appendChild(left);
  document.body.appendChild(right);
  document.body.appendChild(down);
  document.body.appendChild(up);
  document.body.appendChild(jump);
  document.body.appendChild(toggleQuality);

  return {left, right, down, up, jump, toggleQuality};
}