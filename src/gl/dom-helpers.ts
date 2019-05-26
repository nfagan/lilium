import { Result } from '../util';

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