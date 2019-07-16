import { Program } from '../program';
import * as geometry from '../geometry';
import { Vao } from '../vao';
import * as types from '../types';

type VaoFactoryResult = {
  vao: Vao,
  numIndices: number,
  drawMode: number
};

export function makeCubeVao(gl: WebGLRenderingContext, prog: Program, identifiers?: types.ShaderIdentifierMap): VaoFactoryResult {
  const cubeIndices = geometry.cubeIndices();
  const cubeData = geometry.cubeInterleavedPositionsNormals();
  const attrs = [types.BuiltinAttribute.Position, types.BuiltinAttribute.Normal];

  return {
    vao: Vao.fromSimpleInterleavedFloatData(gl, prog, cubeData, attrs, cubeIndices, identifiers),
    numIndices: cubeIndices.length,
    drawMode: gl.TRIANGLES
  };
}

export function makeQuadUvVao(gl: WebGLRenderingContext, prog: Program, identifiers?: types.ShaderIdentifierMap): VaoFactoryResult {
  const quadData = geometry.quadPositionsUvs();
  const quadIndices = geometry.quadIndices();
  const attrs = [types.BuiltinAttribute.Position, types.BuiltinAttribute.Uv];

  return {
    vao: Vao.fromSimpleInterleavedFloatData(gl, prog, quadData, attrs, quadIndices, identifiers),
    numIndices: quadIndices.length,
    drawMode: gl.TRIANGLES
  };
}

export function makeSphereVao(gl: WebGLRenderingContext, prog: Program, identifiers?: types.ShaderIdentifierMap): VaoFactoryResult {
  const sphereData = geometry.sphereInterleavedDataAndIndices();
  const attrs = [types.BuiltinAttribute.Position, types.BuiltinAttribute.Uv, types.BuiltinAttribute.Normal];
  
  return {
    vao: Vao.fromSimpleInterleavedFloatData(gl, prog, sphereData.vertexData, attrs, sphereData.indices, identifiers),
    numIndices: sphereData.indices.length,
    drawMode: gl.TRIANGLE_STRIP
  };
}