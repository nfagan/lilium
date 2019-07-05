import * as types from '../types';
import { promoteVector, demoteVector, singleComponentInitializerExpressionForType, requireIdentifiers } from './common';

export type CommonLightStatics = {
  directionalLightPositions: types.ShaderComponentPlug,
  directionalLightColors: types.ShaderComponentPlug,
  pointLightPositions: types.ShaderComponentPlug,
  pointLightColors: types.ShaderComponentPlug,
  cameraPosition: types.ShaderComponentPlug,
};

export function makeDefaultSamplerSource(identifiers?: types.ShaderIdentifierMap): types.ShaderComponentPlug {
  identifiers = requireIdentifiers(identifiers);
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

function isMixablePlug(plug: types.ShaderComponentPlug): boolean {
  const source = plug.getSource();
  return types.isGLSLVector(source.type) || source.type === 'float' || (source.type === 'sampler2D' && plug.getSamplerSource() !== undefined);
}

export function mix(a: types.ShaderComponentPlug, b: types.ShaderComponentPlug, byFactor: types.ShaderComponentPlug): string {
  const sourceA = a.getSource();
  const sourceB = b.getSource();
  const sourceFactor = byFactor.getSource();

  if (!isMixablePlug(a) || !isMixablePlug(b) || !isMixablePlug(byFactor)) {
    throw new Error('Mixing values must be vector, float, or sampler2D with valid samplerSource.');
  }

  const aIsSampler = sourceA.type === 'sampler2D';
  const bIsSampler = sourceB.type === 'sampler2D';
  const factorIsSampler = sourceFactor.type === 'sampler2D';

  if (aIsSampler || bIsSampler || factorIsSampler) {
    //  Samplers not yet supported.
    throw new Error('Mixing values must be vector or float.');
  }

  const numComponentsA = aIsSampler ? 1 : types.numComponentsInGLSLType(sourceA.type);
  const numComponentsB = bIsSampler ? 1 : types.numComponentsInGLSLType(sourceB.type);
  const numComponentsSrc = factorIsSampler ? 1 : types.numComponentsInGLSLType(sourceFactor.type);

  const identA = sourceA.identifier;
  const identB = sourceB.identifier;
  const identFactor = sourceFactor.identifier;

  let strA = identA;
  let strB = identB;
  let factorStr = identFactor;

  let maxNumComponents = Math.max(numComponentsA, numComponentsB);
  let maxType = numComponentsA >= numComponentsB ? sourceA.type : sourceB.type;

  if (numComponentsA < maxNumComponents) {
    if (sourceA.type === 'float') {
      strA = singleComponentInitializerExpressionForType(sourceB.type, identA);
    } else {
      strA = promoteVector(sourceA.type, identA, sourceB.type);
    }
  }

  if (numComponentsB < maxNumComponents) {
    if (sourceB.type === 'float') {
      strB = singleComponentInitializerExpressionForType(sourceA.type, identB);
    } else {
      strB = promoteVector(sourceB.type, identB, sourceA.type);
    }
  }

  if (numComponentsSrc > maxNumComponents) {
    factorStr = demoteVector(sourceFactor.type, identFactor, maxType);
  } else if (numComponentsSrc < maxNumComponents) {
    if (sourceFactor.type === 'float') {
      factorStr = singleComponentInitializerExpressionForType(maxType, identFactor);
    } else {
      factorStr = promoteVector(sourceFactor.type, identFactor, maxType);
    }
  }

  return `mix(${strA}, ${strB}, ${factorStr})`;
}