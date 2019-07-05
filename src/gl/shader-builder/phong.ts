import { types, Material } from '..';
import { requireIdentifiers, applyMaterial, connectInputs, connectOutputs, requireStatics, requireTemporaries, assertConnectSuccess } from './common';
import * as components from './components';
import { phongDirectionalLightingDeclaration, phongPointLightingDeclaration } from './library';

export type PhongComponentStatics = {
  directionalLightPositions: types.ShaderComponentPlug,
  directionalLightColors: types.ShaderComponentPlug,
  pointLightPositions: types.ShaderComponentPlug,
  pointLightColors: types.ShaderComponentPlug,
  cameraPosition: types.ShaderComponentPlug,
};
  
export type PhongComponentTemporaries = {
  lightContribution: types.GLSLVariable,
  normalToCamera: types.GLSLVariable
};

export type PhongComponentInputPlug = {
  ambientConstant: types.ShaderComponentPlug,
  diffuseConstant: types.ShaderComponentPlug,
  specularConstant: types.ShaderComponentPlug,
  specularPower: types.ShaderComponentPlug,
  modelColor: types.ShaderComponentPlug,
  position: types.ShaderComponentPlug,
  normal: types.ShaderComponentPlug
};

export type PhongComponentInputOutlet = {
  ambientConstant: types.GLSLVariable,
  diffuseConstant: types.GLSLVariable,
  specularConstant: types.GLSLVariable,
  specularPower: types.GLSLVariable,
  modelColor: types.GLSLVariable,
  position: types.GLSLVariable,
  normal: types.GLSLVariable
}

export type PhongComponentOutputPlug = {
  modelColor: types.ShaderComponentPlug
}

export type PhongComponentOutputOutlet = {
  modelColor: types.GLSLVariable
}

const DefaultOutletInputs = makeDefaultInputOutlet(types.DefaultShaderIdentifiers);
const DefaultOutletOutputs = makeDefaultOutputOutlet(types.DefaultShaderIdentifiers);
const DefaultStatics = makeDefaultStatics(types.DefaultShaderIdentifiers);
const DefaultTemporaries = makeDefaultTemporaries(types.DefaultShaderIdentifiers);

export function makeDefaultTemporaries(identifiers: types.ShaderIdentifierMap): PhongComponentTemporaries {
  return {
    lightContribution: identifiers.temporaries.lightContribution,
    normalToCamera: identifiers.temporaries.normalToCamera
  }
}

export function makeDefaultStatics(identifiers: types.ShaderIdentifierMap): PhongComponentStatics {
  return components.makeDefaultCommonLightStatics(identifiers);
}

export function makeDefaultInputOutlet(identifiers: types.ShaderIdentifierMap): PhongComponentInputOutlet {
  return {
    ambientConstant: identifiers.temporaries.ambientConstant,
    diffuseConstant: identifiers.temporaries.diffuseConstant,
    specularConstant: identifiers.temporaries.specularConstant,
    specularPower: identifiers.temporaries.specularPower,
    modelColor: identifiers.temporaries.modelColor,
    normal: identifiers.temporaries.normal,
    position: identifiers.temporaries.position
  };
}

export function makeDefaultOutputOutlet(identifiers: types.ShaderIdentifierMap): PhongComponentOutputOutlet {
  return {
    modelColor: identifiers.temporaries.modelColor
  };
}

export function makeDefaultInputPlug(identifiers?: types.ShaderIdentifierMap): PhongComponentInputPlug {
  identifiers = requireIdentifiers(identifiers);

  const uniforms = identifiers.uniforms;
  const varyings = identifiers.varyings;
  const makeVar = types.makeGLSLVariable;
  const makePlug = types.makeConcreteComponentPlug;
  const defaultSamplerSource = components.makeDefaultSamplerSource(identifiers);

  return {
    ambientConstant: makePlug(makeVar(uniforms.ambientConstant, 'float'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    diffuseConstant: makePlug(makeVar(uniforms.diffuseConstant, 'float'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    specularConstant: makePlug(makeVar(uniforms.specularConstant, 'float'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    specularPower: makePlug(makeVar(uniforms.specularPower, 'float'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    modelColor: makePlug(makeVar(uniforms.modelColor, 'vec3'), types.ShaderDataSource.Uniform, defaultSamplerSource),
    normal: makePlug(makeVar(varyings.normal, 'vec3'), types.ShaderDataSource.Varying),
    position: makePlug(makeVar(varyings.position, 'vec3'), types.ShaderDataSource.Varying)
  };
}

export function makeDefaultOutputPlug(identifiers?: types.ShaderIdentifierMap): PhongComponentOutputPlug {
  identifiers = requireIdentifiers(identifiers);
  return {
    modelColor: types.makeConcreteComponentPlug(identifiers.temporaries.modelColor, types.ShaderDataSource.Temporary)
  };
}


function phongPointLightLoop(inputs: PhongComponentInputOutlet, outputs: PhongComponentOutputOutlet, 
  statics: PhongComponentStatics, temporaries: PhongComponentTemporaries): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformPointLights;
  const lightPos = statics.pointLightPositions.getSource().identifier;
  const lightColor = statics.pointLightColors.getSource().identifier;
  const lightFunc = 'phong_point_lighting';

  const ka = inputs.ambientConstant.identifier;
  const kd = inputs.diffuseConstant.identifier;
  const ks = inputs.specularConstant.identifier;
  const specPower = inputs.specularPower.identifier;

  const normal = inputs.normal.identifier;
  const position = inputs.position.identifier;
  const normToCamera = temporaries.normalToCamera.identifier;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += ${lightFunc}(${position}, ${normal}, 
      ${lightPos}[i], ${lightColor}[i], 
      ${normToCamera}, ${ka}, ${kd}, ${ks}, ${specPower});
  }`;
}

function phongDirectionalLightLoop(inputs: PhongComponentInputOutlet, outputs: PhongComponentOutputOutlet, 
  statics: PhongComponentStatics, temporaries: PhongComponentTemporaries): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const lightPos = statics.directionalLightPositions.getSource().identifier;
  const lightColor = statics.directionalLightColors.getSource().identifier;
  const lightFunc = 'phong_directional_lighting';

  const ka = inputs.ambientConstant.identifier;
  const kd = inputs.diffuseConstant.identifier;
  const ks = inputs.specularConstant.identifier;
  const specPower = inputs.specularPower.identifier;

  const normal = inputs.normal.identifier;
  const normToCamera = temporaries.normalToCamera.identifier;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += ${lightFunc}(${normal}, 
      ${lightPos}[i], ${lightColor}[i], 
      ${normToCamera}, ${ka}, ${kd}, ${ks}, ${specPower});
  }`;
}

function normalToCamera(inputs: PhongComponentInputOutlet, outputs: PhongComponentOutputOutlet, 
  statics: PhongComponentStatics, temporaries: PhongComponentTemporaries): string {
  
  const normToCam = temporaries.normalToCamera.identifier
  const camPos = statics.cameraPosition.getSource().identifier;
  const pos = inputs.position.identifier;

  return `${normToCam} = normalize(${camPos} - ${pos});`;
}

function phongLightingBody(inputs: PhongComponentInputOutlet, outputs: PhongComponentOutputOutlet, 
  statics: PhongComponentStatics, temporaries: PhongComponentTemporaries): string {

  return `
  ${inputs.normal.identifier} = normalize(${inputs.normal.identifier});
  ${normalToCamera(inputs, outputs, statics, temporaries)}
  ${phongDirectionalLightLoop(inputs, outputs, statics, temporaries)}
  ${phongPointLightLoop(inputs, outputs, statics, temporaries)};
  ${outputs.modelColor.identifier} = ${temporaries.lightContribution.identifier} * ${inputs.modelColor.identifier};`;
}

export function applyComponent(toSchema: types.ShaderSchema, forMaterial: Material, plugInputs: PhongComponentInputPlug, plugOutputs: PhongComponentOutputPlug): void {
  const inputs = DefaultOutletInputs;
  const outputs = DefaultOutletOutputs;
  const statics = DefaultStatics;
  const temporaries = DefaultTemporaries;

  applyMaterial(plugInputs, forMaterial);
  assertConnectSuccess(connectInputs(toSchema, plugInputs, inputs));
  requireTemporaries(toSchema, temporaries);
  requireStatics(toSchema, statics);

  toSchema.head.push(phongDirectionalLightingDeclaration);
  toSchema.head.push(phongPointLightingDeclaration);

  toSchema.body.push(() => phongLightingBody(inputs, outputs, statics, temporaries));

  assertConnectSuccess(connectOutputs(toSchema, plugOutputs, outputs));
}