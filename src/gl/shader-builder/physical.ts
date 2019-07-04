import { types, Material } from '..';
import * as components from './components';
import { requireTemporaries, requireStatics, connectInputs, applyMaterial, connectOutputs, requireIdentifiers } from './common';
import { pbrDeclaration } from './library';

export type PhysicalComponentStatics = {
  directionalLightPositions: types.ShaderComponentPlug,
  directionalLightColors: types.ShaderComponentPlug,
  pointLightPositions: types.ShaderComponentPlug,
  pointLightColors: types.ShaderComponentPlug,
  cameraPosition: types.ShaderComponentPlug,
}

export type PhysicalComponentTemporaries = {
  lightContribution: types.GLSLVariable
}

export type PhysicalComponentInputPlug = {
  roughness: types.ShaderComponentPlug
  metallic: types.ShaderComponentPlug,
  ambientConstant: types.ShaderComponentPlug,
  modelColor: types.ShaderComponentPlug,
  position: types.ShaderComponentPlug,
  normal: types.ShaderComponentPlug,
}

export type PhysicalComponentInputOutlet = {
  roughness: types.GLSLVariable,
  metallic: types.GLSLVariable,
  ambientConstant: types.GLSLVariable,
  modelColor: types.GLSLVariable,
  position: types.GLSLVariable,
  normal: types.GLSLVariable,
}

export type PhysicalComponentOutputPlug = {
  modelColor: types.ShaderComponentPlug
}

export type PhysicalComponentOutputOutlet = {
  modelColor: types.GLSLVariable
}

const DefaultPhysicalOutletInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);
const DefaultPhysicalOutletOutputs = makeDefaultOutputOutlet(types.DefaultShaderIdentifiers);
const DefaultPhysicalStatics = makeDefaultStatics(types.DefaultShaderIdentifiers);
const DefaultPhysicalTemporaries = makeDefaultTemporaries(types.DefaultShaderIdentifiers);

export function makeDefaultTemporaries(identifiers: types.ShaderIdentifierMap): PhysicalComponentTemporaries {
  return {
    lightContribution: identifiers.temporaries.lightContribution
  }
}

export function makeDefaultStatics(identifiers: types.ShaderIdentifierMap): PhysicalComponentStatics {
  return components.makeDefaultCommonLightStatics(identifiers);
}

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): PhysicalComponentInputOutlet {
  return {
    roughness: identifiers.temporaries.roughness,
    metallic: identifiers.temporaries.metallic,
    ambientConstant: identifiers.temporaries.ambientConstant,
    modelColor: identifiers.temporaries.modelColor,
    normal: identifiers.temporaries.normal,
    position: identifiers.temporaries.position
  };
}

export function makeDefaultOutputOutlet(identifiers: types.ShaderIdentifierMap): PhysicalComponentOutputOutlet {
  return {
    modelColor: identifiers.temporaries.modelColor
  };
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): PhysicalComponentInputPlug {
  identifiers = requireIdentifiers(identifiers);

  const uniforms = identifiers.uniforms;
  const varyings = identifiers.varyings;
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;
  const defaultSamplerSource = components.makeDefaultSamplerSource(identifiers);

  return {
    roughness: makePlug(makeVar(uniforms.roughness, 'float'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    metallic: makePlug(makeVar(uniforms.metallic, 'float'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    ambientConstant: makePlug(makeVar(uniforms.ambientConstant, 'float'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    modelColor: makePlug(makeVar(uniforms.modelColor, 'vec3'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    normal: makePlug(makeVar(varyings.normal, 'vec3'), types.ShaderDataSource.Varying),
    position: makePlug(makeVar(varyings.position, 'vec3'), types.ShaderDataSource.Varying),
  };
}

export function makeDefaultOutputPlug(identifiers?: types.ShaderIdentifierMap): PhysicalComponentOutputPlug {
  identifiers = requireIdentifiers(identifiers);
  return {
    modelColor: types.makeConcreteComponentPlug(identifiers.temporaries.modelColor, types.ShaderDataSource.Temporary)
  };
}

function physicalPointLightLoop(inputs: PhysicalComponentInputOutlet, outputs: PhysicalComponentOutputOutlet, 
  statics: PhysicalComponentStatics, temporaries: PhysicalComponentTemporaries): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformPointLights;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += PBR(
      ${inputs.normal.identifier},
      ${inputs.modelColor.identifier},
      ${inputs.roughness.identifier},
      ${inputs.metallic.identifier},
      ${statics.cameraPosition.getSource().identifier},
      ${inputs.position.identifier},
      ${statics.pointLightPositions.getSource().identifier}[i],
      ${statics.pointLightColors.getSource().identifier}[i],
      false);
  }`;
}

function physicalDirectionalLightLoop(inputs: PhysicalComponentInputOutlet, outputs: PhysicalComponentOutputOutlet, 
  statics: PhysicalComponentStatics, temporaries: PhysicalComponentTemporaries): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformDirectionalLights;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += PBR(
      ${inputs.normal.identifier},
      ${inputs.modelColor.identifier},
      ${inputs.roughness.identifier},
      ${inputs.metallic.identifier},
      ${statics.cameraPosition.getSource().identifier},
      ${inputs.position.identifier},
      ${statics.directionalLightPositions.getSource().identifier}[i],
      ${statics.directionalLightColors.getSource().identifier}[i],
      true);
  }`;
}

function physicalFragmentLightingBody(inputs: PhysicalComponentInputOutlet, outputs: PhysicalComponentOutputOutlet, 
  statics: PhysicalComponentStatics, temporaries: PhysicalComponentTemporaries): string {
  
  const lightContrib = temporaries.lightContribution.identifier;
  const ambientConstant = inputs.ambientConstant.identifier;
  const inputModelColor = inputs.modelColor.identifier;
  const outputModelColor = outputs.modelColor.identifier;

  return `
  ${inputs.normal.identifier} = normalize(${inputs.normal.identifier});
  ${physicalPointLightLoop(inputs, outputs, statics, temporaries)}
  ${physicalDirectionalLightLoop(inputs, outputs, statics, temporaries)}
  ${outputModelColor} = ${lightContrib} + ${ambientConstant} * ${inputModelColor};
  ${outputModelColor} = ${outputModelColor} / (${outputModelColor} + vec3(1.0));
  ${outputModelColor} = pow(${outputModelColor}, vec3(1.0/2.2));`
}

export function applyComponent(toSchema: types.ShaderSchema, forMaterial: Material, plugInputs: PhysicalComponentInputPlug, plugOutputs: PhysicalComponentOutputPlug): void {
  const inputs = DefaultPhysicalOutletInputs;
  const outputs = DefaultPhysicalOutletOutputs;
  const statics = DefaultPhysicalStatics;
  const temporaries = DefaultPhysicalTemporaries;

  applyMaterial(plugInputs, forMaterial);
  connectInputs(toSchema, plugInputs, inputs);
  requireTemporaries(toSchema, temporaries);
  requireStatics(toSchema, statics);

  toSchema.head.push(pbrDeclaration);
  toSchema.body.push(() => physicalFragmentLightingBody(inputs, outputs, statics, temporaries));

  connectOutputs(toSchema, plugOutputs, outputs);
}