import { types} from '..';
import { connectOutputs, requireIdentifiers, connectInputs } from './common';
import { Material } from '../material';

export type VertexVaryingsComponentInputPlug = {
  position?: types.ShaderComponentPlug,
  normal?: types.ShaderComponentPlug,
  uv?: types.ShaderComponentPlug
};

export type VertexVaryingsComponentInputOutlet = {
  position?: types.GLSLVariable,
  normal?: types.GLSLVariable,
  uv?: types.GLSLVariable,
};

const DefaultOutletOutputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);

function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): VertexVaryingsComponentInputOutlet {
  return {
    position: types.makeGLSLVariable(identifiers.temporaries.worldPosition.identifier, 'vec4'),
    normal: types.makeGLSLVariable(identifiers.varyings.normal, 'vec3'),
    uv: types.makeGLSLVariable(identifiers.varyings.uv, 'vec2'),
  }
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): VertexVaryingsComponentInputPlug {
  identifiers = requireIdentifiers(identifiers);

  const makePlug = types.makeConcreteComponentPlug;
  const makeVar = types.makeGLSLVariable;

  return {
    position: makePlug(makeVar(identifiers.temporaries.worldPosition.identifier, 'vec4'), types.ShaderDataSource.Temporary),
    normal: makePlug(makeVar(identifiers.attributes.normal, 'vec3'), types.ShaderDataSource.Attribute),
    uv: makePlug(makeVar(identifiers.attributes.uv, 'vec2'), types.ShaderDataSource.Attribute),
  }
}

export function applyComponent(toSchema: types.ShaderSchema, plugInputs: VertexVaryingsComponentInputPlug): void {
  connectInputs(toSchema, plugInputs, DefaultOutletOutputs);
}