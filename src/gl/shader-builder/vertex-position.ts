import { types} from '..';
import { requireIdentifiers, connectInputs } from './common';

export type VertexPositionComponentInputPlug = {
  position: types.ShaderComponentPlug,
};

export type VertexPositionComponentInputOutlet = {
  position: types.GLSLVariable
}

const DefaultOutletInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): VertexPositionComponentInputOutlet {
  return {
    position: types.makeGLSLVariable(identifiers.temporaries.projectivePosition.identifier, 'vec4')
  };
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): VertexPositionComponentInputPlug {
  identifiers = requireIdentifiers(identifiers);

  const temporaries = identifiers.temporaries;
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;

  return {
    position: makePlug(makeVar(temporaries.projectivePosition.identifier, 'vec4'), types.ShaderDataSource.Temporary),
  };
}

function vertexPositionBody(inputs: VertexPositionComponentInputOutlet): string {
  return `gl_Position = ${inputs.position.identifier};`
}

export function applyComponent(toSchema: types.ShaderSchema, plugInputs: VertexPositionComponentInputPlug): void {
  const inputs = DefaultOutletInputs;

  connectInputs(toSchema, plugInputs, inputs);
  toSchema.body.push(() => vertexPositionBody(inputs));
}