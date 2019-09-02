import * as wgl from '../src/gl';
import { FrustumGrid } from './frustum-grid';

function setupDocument(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  wgl.debug.setupDocumentBody(wgl.debug.makeDebugMouseState());
  document.body.appendChild(canvas);
  canvas.width = canvas.getBoundingClientRect().width * window.devicePixelRatio;
  canvas.height = canvas.getBoundingClientRect().height * window.devicePixelRatio;
  const ctx = canvas.getContext('2d');
  return ctx;
}

function render(ctx: CanvasRenderingContext2D, frustumGrid: FrustumGrid, keyboard: wgl.Keyboard, posRot: Array<number>): void {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mv = 10;

  if (keyboard.isDown(wgl.Keys.left)) {
    posRot[2] -= 0.1;
  } else if (keyboard.isDown(wgl.Keys.right)) {
    posRot[2] += 0.1;
  }

  if (posRot[2] < 0) posRot[2] = Math.PI*2;
  if (posRot[2] > Math.PI*2) posRot[2] = 0;

  // if (keyboard.isDown(wgl.Keys.w)) frustumGrid.move([0, -mv]);
  // if (keyboard.isDown(wgl.Keys.s)) frustumGrid.move([0, mv]);
  // if (keyboard.isDown(wgl.Keys.a)) frustumGrid.move([-mv, 0]);
  // if (keyboard.isDown(wgl.Keys.d)) frustumGrid.move([mv, 0]);

  if (keyboard.isDown(wgl.Keys.w)) posRot[1] -= mv;
  if (keyboard.isDown(wgl.Keys.s)) posRot[1] += mv;
  if (keyboard.isDown(wgl.Keys.a)) posRot[0] -= mv;
  if (keyboard.isDown(wgl.Keys.d)) posRot[0] += mv;

  frustumGrid.update(posRot[0], posRot[1], posRot[2]);
  frustumGrid.render(ctx);
}

function makeFrustumGrid(): FrustumGrid {
  return new FrustumGrid(20, 800, 800, 32, 0);
}

export function main(): void {
  const ctx = setupDocument();
  const grid = makeFrustumGrid();
  const kb = new wgl.Keyboard();
  const pos = [0, 0, 0];

  const updater = () => {
    requestAnimationFrame(updater);
    render(ctx, grid, kb, pos);
  }
  
  window.requestAnimationFrame(updater);
}