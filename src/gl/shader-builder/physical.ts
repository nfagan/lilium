import { types, Material } from '..';
import { requireTemporaries, requireStatics, connect, applyMaterial } from './common';
import { pbrDeclaration } from './library';

export type PhysicalComponentStatics = {
  directionalLightPositions: types.ShaderComponentPlug,
  directionalLightColors: types.ShaderComponentPlug,
  pointLightPositions: types.ShaderComponentPlug,
  pointLightColors: types.ShaderComponentPlug,
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
  cameraPosition: types.ShaderComponentPlug,
}

export type PhysicalComponentInputOutlet = {
  roughness: types.GLSLVariable,
  metallic: types.GLSLVariable,
  ambientConstant: types.GLSLVariable,
  modelColor: types.GLSLVariable,
  position: types.GLSLVariable,
  normal: types.GLSLVariable,
  cameraPosition: types.GLSLVariable,
}

export type PhysicalComponentOutputPlug = {
  modelColor: types.ShaderComponentPlug
}

export type PhysicalComponentOutputOutlet = {
  modelColor: types.GLSLVariable
}

const DefaultPhysicalOutletInputs = makeInputOutletDefaults(types.DefaultShaderIdentifiers);
const DefaultPhysicalOutletOutputs = makeOutputOutletDefaults(types.DefaultShaderIdentifiers);
const DefaultPhysicalStatics = makeStaticDefaults(types.DefaultShaderIdentifiers);
const DefaultPhysicalTemporaries = makeTemporaryDefaults(types.DefaultShaderIdentifiers);

export function makeTemporaryDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentTemporaries {
  return {
    lightContribution: identifiers.temporaries.lightContribution
  }
}

export function makeStaticDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentStatics {
  const maxNumDirLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const maxNumPointLights = types.ShaderLimits.maxNumUniformPointLights;

  return {
    directionalLightPositions: {
      source: types.makeGLSLVariable(identifiers.uniforms.directionalLightPositions, 'vec3', true, maxNumDirLights),
      sourceType: types.ShaderDataSource.Uniform
    },
    directionalLightColors: {
      source: types.makeGLSLVariable(identifiers.uniforms.directionalLightColors, 'vec3', true, maxNumDirLights),
      sourceType: types.ShaderDataSource.Uniform
    },
    pointLightPositions: {
      source: types.makeGLSLVariable(identifiers.uniforms.pointLightPositions, 'vec3', true, maxNumPointLights),
      sourceType: types.ShaderDataSource.Uniform
    },
    pointLightColors: {
      source: types.makeGLSLVariable(identifiers.uniforms.pointLightColors, 'vec3', true, maxNumPointLights),
      sourceType: types.ShaderDataSource.Uniform
    }
  };
}

export function makeInputOutletDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentInputOutlet {
  return {
    roughness: identifiers.temporaries.roughness,
    metallic: identifiers.temporaries.metallic,
    ambientConstant: identifiers.temporaries.ambientConstant,
    modelColor: identifiers.temporaries.modelColor,
    normal: identifiers.temporaries.normal,
    cameraPosition: identifiers.temporaries.cameraPosition,
    position: identifiers.temporaries.position
  };
}

export function makeOutputOutletDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentOutputOutlet {
  return {
    modelColor: identifiers.temporaries.modelColor
  };
}

export function makeInputPlugDefaults(identifiers?: types.ShaderIdentifierMap): PhysicalComponentInputPlug {
  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
  }

  return {
    roughness: {
      source: types.makeGLSLVariable(identifiers.uniforms.roughness, 'float'),
      sourceType: types.ShaderDataSource.Uniform
    },
    metallic: {
      source: types.makeGLSLVariable(identifiers.uniforms.metallic, 'float'),
      sourceType: types.ShaderDataSource.Uniform
    },
    ambientConstant: {
      source: types.makeGLSLVariable(identifiers.uniforms.ambientConstant, 'float'),
      sourceType: types.ShaderDataSource.Uniform
    },
    modelColor: {
      source: types.makeGLSLVariable(identifiers.uniforms.modelColor, 'vec3'),
      sourceType: types.ShaderDataSource.Uniform
    },
    normal: {
      source: types.makeGLSLVariable(identifiers.varyings.normal, 'vec3'),
      sourceType: types.ShaderDataSource.Varying
    },
    position: {
      source: types.makeGLSLVariable(identifiers.varyings.position, 'vec3'),
      sourceType: types.ShaderDataSource.Varying
    },
    cameraPosition: {
      source: types.makeGLSLVariable(identifiers.uniforms.cameraPosition, 'vec3'),
      sourceType: types.ShaderDataSource.Uniform
    },
  };
}

function makeOutputPlugDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentOutputPlug {
  return {
    modelColor: {
      source: identifiers.temporaries.modelColor,
      sourceType: types.ShaderDataSource.Temporary
    }
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
      ${inputs.cameraPosition.identifier},
      ${inputs.position.identifier},
      ${statics.pointLightPositions.source.identifier}[i],
      ${statics.pointLightColors.source.identifier}[i],
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
      ${inputs.cameraPosition.identifier},
      ${inputs.position.identifier},
      ${statics.directionalLightPositions.source.identifier}[i],
      ${statics.directionalLightColors.source.identifier}[i],
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
  ${outputModelColor} = pow(${outputModelColor}, vec3(1.0/2.2));
  gl_FragColor = vec4(${outputModelColor}, 1.0);`;
}

export function applyComponent(toSchema: types.ShaderSchema, forMaterial: Material, plugInputs: PhysicalComponentInputPlug): void {
  const inputs = DefaultPhysicalOutletInputs;
  const outputs = DefaultPhysicalOutletOutputs;
  const statics = DefaultPhysicalStatics;
  const temporaries = DefaultPhysicalTemporaries;

  applyMaterial(plugInputs, forMaterial);
  connect(toSchema, plugInputs, inputs);
  requireTemporaries(toSchema, temporaries);
  requireStatics(toSchema, statics);

  toSchema.head.push(pbrDeclaration);
  toSchema.body.push(() => physicalFragmentLightingBody(inputs, outputs, statics, temporaries));
}