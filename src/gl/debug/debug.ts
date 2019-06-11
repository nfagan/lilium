import { Result } from '../../util';
import { types, Program, math, Keyboard, Keys, Vao, VoxelGrid } from '..';
import { mat4, vec3, glMatrix } from 'gl-matrix';

export function segmentedQuadPositions(numSegments: number): Float32Array {
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
    positions.push(z);

    positions.push(x0);
    positions.push(y0);
    positions.push(z);
    
    positions.push(x1);
    positions.push(y0);
    positions.push(z);

    //  tri2.
    positions.push(x1);
    positions.push(y0);
    positions.push(z);

    positions.push(x1);
    positions.push(y1);
    positions.push(z);

    positions.push(x0);
    positions.push(y1);
    positions.push(z);
  }

  return new Float32Array(positions);
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

export type Drawable = {
  vao: Vao,
  drawFunction: types.DrawFunction,
  isInstanced: boolean,
  numTriangles?: number,
  numActiveInstances?: number
};

export function drawAxesPlanes(gl: WebGLRenderingContext, prog: Program, model: mat4, drawFunction: types.DrawFunction): void {
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

export function drawOrigin(gl: WebGLRenderingContext, prog: Program, model: mat4, drawFunction: types.DrawFunction): void {
  mat4.identity(model);
  mat4.scale(model, model, [0.25, 0.25, 0.25]);

  prog.setMat4('model', model);
  prog.set3f('color', 1, 1, 1);
  drawFunction(gl);
}

export function drawAabb(gl: WebGLRenderingContext, prog: Program, model: mat4, aabb: math.Aabb,
  color: vec3 | Array<number>, drawFunction: types.DrawFunction): void {
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

export function drawAt(gl: WebGLRenderingContext, prog: Program, model: mat4, pos: types.Real3, sz: types.Real3 | number,
  color: types.Real3, drawFunction: types.DrawFunction): void {
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
  down: boolean
};

export function makeDebugMouseState(): DebugMouseState {
  return {
    x: null,
    y: null,
    lastX: null,
    lastY: null,
    clicked: false,
    down: false,
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

export function setupDocumentBody(mouseState: DebugMouseState): void {
  ['left', 'top', 'margin', 'padding'].map(v => document.body.style[v as any] = '0');
  document.body.style.position = 'fixed';
  document.body.style.height = '100%';
  document.body.style.width = '100%';

  document.body.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 0) {
      mouseState.lastX = e.touches[0].clientX;
      mouseState.lastY = e.touches[0].clientY;
    }
  });
  document.body.addEventListener('touchmove', e => {
    if (e.touches.length === 1) {
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

function styleTouchElement(el: HTMLDivElement, offset: number, color: string) {
  const sz = 50;
  
  el.style.width = `${sz}px`;
  el.style.height = `${sz}px`;
  el.style.position = 'fixed';
  el.style.bottom = '0';
  el.style.left = `${offset * sz}`;
  el.style.backgroundColor = color;
}

export function createTouchMoveControls(keyboard: Keyboard) {
  const left = document.createElement('div');
  const right = document.createElement('div');

  styleTouchElement(left, 0, 'red');
  styleTouchElement(right, 1, 'blue');

  left.addEventListener('touchstart', _ => keyboard.markDown(Keys.w));
  left.addEventListener('touchend', _ => keyboard.markUp(Keys.w));
  right.addEventListener('touchstart', _ => keyboard.markDown(Keys.s));
  right.addEventListener('touchend', _ => keyboard.markUp(Keys.s));
  
  document.body.appendChild(left);
  document.body.appendChild(right);
}
