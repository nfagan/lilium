import { types, Material } from '..';
import * as components from './components';
import { addRequirements, requireIdentifiers, applyMaterial, connectInputs, connectOutputs } from './common';

export type NoLightComponentInputPlug = {
  modelColor: types.ShaderComponentPlug,
};

export type NoLightComponentInputOutlet = {
  modelColor: types.GLSLVariable
}

export type NoLightComponentOutputPlug = {
  modelColor: types.ShaderComponentPlug
}

export type NoLightComponentOutputOutlet = {
  modelColor: types.GLSLVariable
}

const DefaultOutletInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);
const DefaultOutletOutputs = makeDefaultOutputOutlet(types.DefaultShaderIdentifiers);

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): NoLightComponentInputOutlet {
  return {
    modelColor: identifiers.temporaries.modelColor,
  };
}

export function makeDefaultOutputOutlet(identifiers: types.ShaderIdentifierMap): NoLightComponentOutputOutlet {
  return {
    modelColor: identifiers.temporaries.modelColor
  };
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): NoLightComponentInputPlug {
  identifiers = requireIdentifiers(identifiers);

  const uniforms = identifiers.uniforms;
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;
  const defaultSamplerSource = components.makeDefaultSamplerSource(identifiers);

  return {
    modelColor: makePlug(makeVar(uniforms.modelColor, 'vec3'), types.ShaderDataSource.Uniform, defaultSamplerSource),
  };
}

export function makeDefaultOutputPlug(identifiers?: types.ShaderIdentifierMap): NoLightComponentOutputPlug {
  identifiers = requireIdentifiers(identifiers);
  return {
    modelColor: types.makeConcreteComponentPlug(identifiers.temporaries.modelColor, types.ShaderDataSource.Temporary)
  };
}


export function applyComponent(toSchema: types.ShaderSchema, forMaterial: Material, plugInputs: NoLightComponentInputPlug, plugOutputs: NoLightComponentOutputPlug): void {
  const inputs = DefaultOutletInputs;
  const outputs = DefaultOutletOutputs;

  applyMaterial(plugInputs, forMaterial);
  connectInputs(toSchema, plugInputs, inputs);
  connectOutputs(toSchema, plugOutputs, outputs);
}