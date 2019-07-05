import { types} from '..';
import { connectInputs, connectOutputs } from './common';

export type AssignmentComponentInputPlug = {
  source: types.ShaderComponentPlug,
};

export type AssignmentComponentInputOutlet = {
  source: types.GLSLVariable
};

export type AssignmentComponentOutputPlug = {
  destination: types.ShaderComponentPlug
};

export type AssignmentComponentOutputOutlet = {
  destination: types.GLSLVariable
};

const DefaultOutletOutputs = makeDefaultOutputOutlet();
const DefaultOutletInputs = makeDefaultInputOutlet();

export function makeDefaultInputOutlet(): AssignmentComponentInputOutlet {
  return {
    source: types.makeAnonymousGLSLVariable('float')
  };
}

export function makeDefaultInputPlug(): AssignmentComponentInputPlug {
  return {
    source: types.makeConcreteComponentPlug(types.makeAnonymousGLSLVariable('float'), types.ShaderDataSource.Temporary)
  };
}

export function makeDefaultOutputPlug(): AssignmentComponentOutputPlug {
  return {
    destination: types.makeConcreteComponentPlug(types.makeAnonymousGLSLVariable('float'), types.ShaderDataSource.Temporary)
  }
}

export function makeDefaultOutputOutlet(): AssignmentComponentOutputOutlet {
  return {
    destination: types.makeAnonymousGLSLVariable('float')
  }
}

export function applyComponent(toSchema: types.ShaderSchema, plugInputs: AssignmentComponentInputPlug, plugOutputs: AssignmentComponentOutputPlug): void {
  const inputs = DefaultOutletInputs;
  const outputs = DefaultOutletOutputs;

  connectInputs(toSchema, plugInputs, inputs);
  connectOutputs(toSchema, plugOutputs, outputs);
}