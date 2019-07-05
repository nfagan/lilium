import { types, Material } from '..';
import { connectInputs } from './common';

export type FragColorInputPlug = {
  modelColor: types.ShaderComponentPlug
}

export type FragColorInputOutlet = {
  modelColor: types.GLSLVariable
}

const DefaultFragColorInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): FragColorInputOutlet {
  return {
    modelColor: types.makeGLSLVariable(identifiers.temporaries.fragColor.identifier, 'vec4')
  }
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): FragColorInputPlug {
  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
  }

  return {
    modelColor: types.makeConcreteComponentPlug(identifiers.temporaries.modelColor, types.ShaderDataSource.Temporary)
  };
}

function assignFragColor(inputs: FragColorInputOutlet): string {
  return `gl_FragColor = ${inputs.modelColor.identifier};`;
}

export function applyComponent(toSchema: types.ShaderSchema, forMaterial: Material, plugInputs: FragColorInputPlug): void {
  const inputs = DefaultFragColorInputs;
  connectInputs(toSchema, plugInputs, inputs);

  toSchema.body.push(() => assignFragColor(inputs));
}