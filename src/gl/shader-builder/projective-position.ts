import { types } from '..';
import { requireStatics, requireIdentifiers, connectInputs, connectOutputs } from './common';

export type ProjectivePositionComponentInputPlug = {
  position: types.ShaderComponentPlug,
};

export type ProjectivePositionComponentStatics = {
  view: types.ShaderComponentPlug,
  projection: types.ShaderComponentPlug,
};

export type ProjectivePositionComponentInputOutlet = {
  position: types.GLSLVariable
}

export type ProjectivePositionComponentOutputPlug = {
  position: types.ShaderComponentPlug
}

export type ProjectivePositionComponentOutputOutlet = {
  position: types.GLSLVariable
}

const DefaultStatics = makeDefaultStatics(types.DefaultShaderIdentifiers);
const DefaultOutletInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);
const DefaultOutletOutputs = makeDefaultOutputOutlet(types.DefaultShaderIdentifiers);

export function makeDefaultStatics(identifiers: types.ShaderIdentifierMap): ProjectivePositionComponentStatics {
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;

  return {
    view: makePlug(makeVar(identifiers.uniforms.view, 'mat4'), types.ShaderDataSource.Uniform),
    projection: makePlug(makeVar(identifiers.uniforms.projection, 'mat4'), types.ShaderDataSource.Uniform),
  };
}

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): ProjectivePositionComponentInputOutlet {
  return {
    position: types.makeGLSLVariable(identifiers.temporaries.projectivePosition.identifier, 'vec4')
  };
}

export function makeDefaultOutputOutlet(identifiers: types.ShaderIdentifierMap): ProjectivePositionComponentOutputOutlet {
  return {
    position: types.makeGLSLVariable(identifiers.temporaries.projectivePosition.identifier, 'vec4')
  };
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): ProjectivePositionComponentInputPlug {
  identifiers = requireIdentifiers(identifiers);

  const temporaries = identifiers.temporaries;
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;

  return {
    position: makePlug(makeVar(temporaries.worldPosition.identifier, 'vec4'), types.ShaderDataSource.Temporary),
  };
}

export function makeDefaultOutputPlug(identifiers?: types.ShaderIdentifierMap): ProjectivePositionComponentOutputPlug {
  identifiers = requireIdentifiers(identifiers);

  const makePlug = types.makeConcreteComponentPlug;
  const makeVar = types.makeGLSLVariable;

  return {
    position: makePlug(makeVar(identifiers.temporaries.projectivePosition.identifier, 'vec4'), types.ShaderDataSource.Temporary)
  };
}

function projectivePositionBody(inputs: ProjectivePositionComponentInputOutlet, outputs: ProjectivePositionComponentOutputOutlet, statics: ProjectivePositionComponentStatics): string {
  const outPos = outputs.position.identifier;
  const inPos = inputs.position.identifier;
  const view = statics.view.getSource().identifier;
  const projection = statics.projection.getSource().identifier;

  return `${outPos} = ${projection} * ${view} * ${inPos};`;
}

export function applyComponent(toSchema: types.ShaderSchema, plugInputs: ProjectivePositionComponentInputPlug, plugOutputs: ProjectivePositionComponentOutputPlug): void {
  const inputs = DefaultOutletInputs;
  const outputs = DefaultOutletOutputs;
  const statics = DefaultStatics;

  connectInputs(toSchema, plugInputs, inputs);
  requireStatics(toSchema, statics);

  toSchema.body.push(() => projectivePositionBody(inputs, outputs, statics));

  connectOutputs(toSchema, plugOutputs, outputs);
}