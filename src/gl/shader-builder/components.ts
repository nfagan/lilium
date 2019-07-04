import * as types from '../types';

export type CommonLightStatics = {
  directionalLightPositions: types.ShaderComponentPlug,
  directionalLightColors: types.ShaderComponentPlug,
  pointLightPositions: types.ShaderComponentPlug,
  pointLightColors: types.ShaderComponentPlug,
  cameraPosition: types.ShaderComponentPlug,
};

export function makeDefaultSamplerSource(identifiers: types.ShaderIdentifierMap): types.ShaderComponentPlug {
  return types.makeConcreteComponentPlug(types.makeGLSLVariable(identifiers.varyings.uv, 'vec2'), types.ShaderDataSource.Varying);
}

export function makeDefaultCommonLightStatics(identifiers: types.ShaderIdentifierMap): CommonLightStatics {
  const maxNumDirLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const maxNumPointLights = types.ShaderLimits.maxNumUniformPointLights;
  const makePlug = types.makeConcreteComponentPlug;
  const makeVar = types.makeGLSLVariable;
  const uniforms = identifiers.uniforms;

  return {
    directionalLightPositions: makePlug(makeVar(uniforms.directionalLightPositions, 'vec3', true, maxNumDirLights), types.ShaderDataSource.Uniform),
    directionalLightColors: makePlug(makeVar(uniforms.directionalLightColors, 'vec3', true, maxNumDirLights), types.ShaderDataSource.Uniform),
    pointLightPositions: makePlug(makeVar(uniforms.pointLightPositions, 'vec3', true, maxNumPointLights), types.ShaderDataSource.Uniform),
    pointLightColors: makePlug(makeVar(uniforms.pointLightColors, 'vec3', true, maxNumPointLights), types.ShaderDataSource.Uniform),
    cameraPosition: makePlug(makeVar(uniforms.cameraPosition, 'vec3'), types.ShaderDataSource.Uniform)
  };
}