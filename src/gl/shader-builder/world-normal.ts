import { types } from '..';
import { requireIdentifiers, connectInputs, connectOutputs, requireStatics, assertConnectSuccess } from './common';

export type WorldNormalComponentPlug = {
  normal: types.ShaderComponentPlug,
};

export type WorldNormalComponentStatics = {
  inverseTransposeModel: types.ShaderComponentPlug
};

export type WorldNormalComponentInputOutlet = {
  normal: types.GLSLVariable
}

export type WorldNormalComponentOutputPlug = {
  normal: types.ShaderComponentPlug
}

export type WorldNormalComponentOutputOutlet = {
  normal: types.GLSLVariable
}

const DefaultStatics = makeDefaultStatics(types.DefaultShaderIdentifiers);
const DefaultOutletInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);
const DefaultOutletOutputs = makeDefaultOutputOutlet(types.DefaultShaderIdentifiers);

export function makeDefaultStatics(identifiers: types.ShaderIdentifierMap): WorldNormalComponentStatics {
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;

  return {
    inverseTransposeModel: makePlug(makeVar(identifiers.uniforms.inverseTransposeModel, 'mat4'), types.ShaderDataSource.Uniform)
  };
}

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): WorldNormalComponentInputOutlet {
  return {
    normal: types.makeGLSLVariable(identifiers.attributes.normal, 'vec3')
  };
}

export function makeDefaultOutputOutlet(identifiers: types.ShaderIdentifierMap): WorldNormalComponentOutputOutlet {
  return {
    normal: types.makeGLSLVariable(identifiers.varyings.normal, 'vec3')
  };
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): WorldNormalComponentPlug {
  identifiers = requireIdentifiers(identifiers);

  const attributes = identifiers.attributes;
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;

  return {
    normal: makePlug(makeVar(attributes.normal, 'vec3'), types.ShaderDataSource.Attribute),
  };
}

export function makeDefaultOutputPlug(identifiers?: types.ShaderIdentifierMap): WorldNormalComponentOutputPlug {
  identifiers = requireIdentifiers(identifiers);

  const makePlug = types.makeConcreteComponentPlug;
  const makeVar = types.makeGLSLVariable;

  return {
    normal: makePlug(makeVar(identifiers.varyings.normal, 'vec3'), types.ShaderDataSource.Varying)
  };
}

function worldNormalBody(inputs: WorldNormalComponentInputOutlet, outputs: WorldNormalComponentOutputOutlet, statics: WorldNormalComponentStatics): string {
  const outNorm = outputs.normal.identifier;
  const inNorm = inputs.normal.identifier;
  const model = statics.inverseTransposeModel.getSource().identifier;

  return `${outNorm} = mat3(${model}) * ${inNorm};`
}

export function applyComponent(toSchema: types.ShaderSchema, plugInputs: WorldNormalComponentPlug, plugOutputs: WorldNormalComponentOutputPlug): void {
  const inputs = DefaultOutletInputs;
  const outputs = DefaultOutletOutputs;
  const statics = DefaultStatics;

  assertConnectSuccess(connectInputs(toSchema, plugInputs, inputs));
  requireStatics(toSchema, statics);

  toSchema.body.push(() => worldNormalBody(inputs, outputs, statics));

  assertConnectSuccess(connectOutputs(toSchema, plugOutputs, outputs));
}