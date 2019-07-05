import { Program } from '../program';
import * as geometry from '../geometry';
import { Vao } from '../vao';
import * as types from '../types';

type VaoFactoryResult = {
  vao: Vao,
  numIndices: number
};

export function makeCubeVao(gl: WebGLRenderingContext, prog: Program, identifiers?: types.ShaderIdentifierMap): VaoFactoryResult {
  const cubeIndices = geometry.cubeIndices();
  const cubeData = geometry.cubeInterleavedPositionsNormals();
  const attrs = [types.BuiltinAttribute.Position, types.BuiltinAttribute.Normal];

  return {
    vao: Vao.fromSimpleInterleavedFloatData(gl, prog, cubeData, attrs, cubeIndices, identifiers),
    numIndices: cubeIndices.length
  };
}

export function makeSphereVao(gl: WebGLRenderingContext, prog: Program, identifiers?: types.ShaderIdentifierMap): VaoFactoryResult {
  const sphereData = geometry.sphereInterleavedDataAndIndices();
  const attrs = [types.BuiltinAttribute.Position, types.BuiltinAttribute.Uv, types.BuiltinAttribute.Normal];
  
  return {
    vao: Vao.fromSimpleInterleavedFloatData(gl, prog, sphereData.vertexData, attrs, sphereData.indices, identifiers),
    numIndices: sphereData.indices.length
  };
}