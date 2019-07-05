import { types } from '..';
import { requireIdentifiers, connectInputs, connectOutputs, requireStatics } from './common';

export type WorldPositionComponentInputPlug = {
  position: types.ShaderComponentPlug,
};

export type WorldPositionComponentStatics = {
  model: types.ShaderComponentPlug
};

export type WorldPositionComponentInputOutlet = {
  position: types.GLSLVariable
}

export type WorldPositionComponentOutputPlug = {
  position: types.ShaderComponentPlug
}

export type WorldPositionComponentOutputOutlet = {
  position: types.GLSLVariable
}

const DefaultStatics = makeDefaultStatics(types.DefaultShaderIdentifiers);
const DefaultOutletInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);
const DefaultOutletOutputs = makeDefaultOutputOutlet(types.DefaultShaderIdentifiers);

export function makeDefaultStatics(identifiers: types.ShaderIdentifierMap): WorldPositionComponentStatics {
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;

  return {
    model: makePlug(makeVar(identifiers.uniforms.model, 'mat4'), types.ShaderDataSource.Uniform)
  };
}

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): WorldPositionComponentInputOutlet {
  return {
    position: types.makeGLSLVariable(identifiers.temporaries.worldPosition.identifier, 'vec4')
  };
}

export function makeDefaultOutputOutlet(identifiers: types.ShaderIdentifierMap): WorldPositionComponentOutputOutlet {
  return {
    position: types.makeGLSLVariable(identifiers.temporaries.worldPosition.identifier, 'vec4')
  };
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): WorldPositionComponentInputPlug {
  identifiers = requireIdentifiers(identifiers);

  const attributes = identifiers.attributes;
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;

  return {
    position: makePlug(makeVar(attributes.position, 'vec3'), types.ShaderDataSource.Attribute),
  };
}

export function makeDefaultOutputPlug(identifiers?: types.ShaderIdentifierMap): WorldPositionComponentOutputPlug {
  identifiers = requireIdentifiers(identifiers);

  const makePlug = types.makeConcreteComponentPlug;
  const makeVar = types.makeGLSLVariable;

  return {
    position: makePlug(makeVar(identifiers.temporaries.worldPosition.identifier, 'vec4'), types.ShaderDataSource.Temporary)
  };
}

function worldPositionBody(inputs: WorldPositionComponentInputOutlet, outputs: WorldPositionComponentOutputOutlet, statics: WorldPositionComponentStatics): string {
  const outPos = outputs.position.identifier;
  const inPos = inputs.position.identifier;
  const model = statics.model.getSource().identifier;

  return `${outPos} = ${model} * ${inPos};`
}

export function applyComponent(toSchema: types.ShaderSchema, plugInputs: WorldPositionComponentInputPlug, plugOutputs: WorldPositionComponentOutputPlug): void {
  const inputs = DefaultOutletInputs;
  const outputs = DefaultOutletOutputs;
  const statics = DefaultStatics;

  connectInputs(toSchema, plugInputs, inputs);
  requireStatics(toSchema, statics);

  toSchema.body.push(() => worldPositionBody(inputs, outputs, statics));

  connectOutputs(toSchema, plugOutputs, outputs);
}