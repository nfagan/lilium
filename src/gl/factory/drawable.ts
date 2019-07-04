import { makeCubeVao, makeSphereVao } from './vao';
import { Program } from '../program';
import { types } from '..';
import { RenderContext } from '../render-context';

export function makeCubeDrawable(renderContext: RenderContext, prog: Program, identifiers?: types.ShaderIdentifierMap): types.Drawable {
  const vaoResult = makeCubeVao(renderContext.gl, prog, identifiers);
  return types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
}

export function makeSphereDrawable(renderContext: RenderContext, prog: Program, identifiers?: types.ShaderIdentifierMap): types.Drawable {
  const vaoResult = makeSphereVao(renderContext.gl, prog, identifiers);
  return types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
}