import { Result } from '../../util';
import { types, Program, Vao } from '..';
import { mat4, vec3, glMatrix } from 'gl-matrix';

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

export function drawAxesPlanes(gl: WebGLRenderingContext, prog: Program, model: mat4, drawFunction: types.DrawFunction): void {
  //  Z
  mat4.identity(model);
  mat4.translate(model, model, [0, 0, -1]);
  //
  prog.setMat4('model', model);
  prog.set3f('color', 1, 0, 0);
  drawFunction(gl);

  //  X
  mat4.identity(model);
  mat4.translate(model, model, [-1, 0, 0]);
  mat4.rotate(model, model, glMatrix.toRadian(90), [0, 1, 0]);
  //
  prog.setMat4('model', model);
  prog.set3f('color', 0, 0, 1);
  drawFunction(gl);

  //  Y
  mat4.identity(model);
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

export function drawAt(gl: WebGLRenderingContext, prog: Program, model: mat4, pos: vec3, sz: number, 
  color: vec3 | Array<number>, drawFunction: types.DrawFunction): void {
  mat4.identity(model);
  mat4.translate(model, model, pos);
  mat4.scale(model, model, [sz, sz, sz]);
  prog.setMat4('model', model);
  prog.setVec3('color', color)
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

type DebugMouseState = {
  x: number, 
  y: number, 
  lastX: number, 
  lastY: number,
  down: boolean
};

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
  document.body.addEventListener('click', e => {
    mouseState.down = !mouseState.down;
    if (!mouseState.down) {
      mouseState.x = 0;
      mouseState.y = 0;
    }
  })
  document.body.addEventListener('mousemove', e => {
    if (mouseState.down) {
      mouseState.x = e.movementX;
      mouseState.y = e.movementY;
    }

    mouseState.lastX = e.clientX;
    mouseState.lastY = e.clientY;
  });
}
