import { types, Material } from '..';
import { addRequirements } from './common';
import * as components from './components';

function makePhongVertexRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  return {
    inputs: [],
    outputs: [],
    temporaries: {},
    uniforms: {},
    sampler2DCoordinates: identifiers.attributes.uv,
    conditionallyRequireForMaterial: []
  }
}

function makePhongFragmentRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  const varyings = identifiers.varyings;
  const uniforms = identifiers.uniforms;
  const temporaries = identifiers.temporaries;

  const maxDirLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const maxPointLights = types.ShaderLimits.maxNumUniformPointLights;

  return {
    inputs: [],
    outputs: [],
    temporaries: {
      ambientConstant: temporaries.ambientConstant,
      diffuseConstant: temporaries.diffuseConstant,
      specularConstant: temporaries.specularConstant,
      specularPower: temporaries.specularPower,
      modelColor: temporaries.modelColor,
      normal: temporaries.normal,
      normalToCamera: temporaries.normalToCamera,
      lightContribution: temporaries.lightContribution,
    },
    uniforms: {
      ambientConstant: types.makeGLSLVariable(uniforms.ambientConstant, 'float'),
      diffuseConstant: types.makeGLSLVariable(uniforms.diffuseConstant, 'float'),
      specularConstant: types.makeGLSLVariable(uniforms.specularConstant, 'float'),
      specularPower: types.makeGLSLVariable(uniforms.specularPower, 'float'),
      directionalLightPositions: types.makeGLSLVariable(uniforms.directionalLightPositions, 'vec3', true, maxDirLights),
      directionalLightColors: types.makeGLSLVariable(uniforms.directionalLightColors, 'vec3', true, maxDirLights),
      pointLightPositions: types.makeGLSLVariable(uniforms.pointLightPositions, 'vec3', true, maxPointLights),
      pointLightColors: types.makeGLSLVariable(uniforms.pointLightColors, 'vec3', true, maxPointLights),
      modelColor: types.makeGLSLVariable(uniforms.modelColor, 'vec3'),
      cameraPosition: types.makeGLSLVariable(uniforms.cameraPosition, 'vec3')
    },
    sampler2DCoordinates: varyings.uv,
    conditionallyRequireForMaterial: []
  }
}

const PhongFragmentRequirements = makePhongFragmentRequirements(types.DefaultShaderIdentifiers);
const PhongVertexRequirements = makePhongVertexRequirements(types.DefaultShaderIdentifiers);

function phongDirectionalLightingDeclaration(): string {
  return `
vec3 phong_directional_lighting(vec3 normal, vec3 light_position, 
  vec3 light_color, vec3 normal_to_camera, float ka, float kd, float ks, float spec_power) {

  vec3 to_light = normalize(light_position);
  vec3 reflect_dir = normalize(normal_to_camera + to_light);

  float diffuse = kd * max(dot(normal, to_light), 0.0);
  float spec = ks * pow(max(dot(normal, reflect_dir), 0.0), spec_power);

  float total_light = ka + diffuse + spec;

  return light_color * total_light;
}
`;
}

function phongPointLightingDeclaration(): string {
  return `
vec3 phong_point_lighting(vec3 position, vec3 normal, vec3 light_position, vec3 light_color, 
  vec3 normal_to_camera, float ka, float kd, float ks, float spec_power) {

  vec3 to_light = normalize(light_position - position);
  vec3 reflect_dir = normalize(normal_to_camera + to_light);

  float diffuse = kd * max(dot(normal, to_light), 0.0);
  float spec = ks * pow(max(dot(normal, reflect_dir), 0.0), spec_power);

  float total_light = ka + diffuse + spec;

  return light_color * total_light;
}
`;
}

function phongDirectionalLightLoop(identifiers: types.ShaderIdentifierMap): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const temporaries = identifiers.temporaries;
  const uniforms = identifiers.uniforms;

  const ka = temporaries.ambientConstant.identifier;
  const kd = temporaries.diffuseConstant.identifier;
  const ks = temporaries.specularConstant.identifier;
  const specPower = temporaries.specularPower.identifier;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += phong_directional_lighting(${temporaries.normal.identifier}, 
      ${uniforms.directionalLightPositions}[i], ${uniforms.directionalLightColors}[i], 
      ${temporaries.normalToCamera.identifier}, ${ka}, ${kd}, ${ks}, ${specPower});
  }`;
}

function phongPointLightLoop(identifiers: types.ShaderIdentifierMap): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformPointLights;
  const temporaries = identifiers.temporaries;
  const uniforms = identifiers.uniforms;
  const varyings = identifiers.varyings;
  
  const ka = temporaries.ambientConstant.identifier;
  const kd = temporaries.diffuseConstant.identifier;
  const ks = temporaries.specularConstant.identifier;
  const specPower = temporaries.specularPower.identifier;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += phong_point_lighting(${varyings.position}, ${temporaries.normal.identifier}, 
      ${uniforms.pointLightPositions}[i], ${uniforms.pointLightColors}[i], 
      ${temporaries.normalToCamera.identifier}, ${ka}, ${kd}, ${ks}, ${specPower});
  }`;
}

function phongFragmentLightingBody(identifiers: types.ShaderIdentifierMap): string {
  const temporaries = identifiers.temporaries;
  const varyings = identifiers.varyings;

  return `
  ${temporaries.normal.identifier} = normalize(${varyings.normal});
  ${components.normalToCamera(identifiers)}
  ${phongDirectionalLightLoop(identifiers)}
  ${phongPointLightLoop(identifiers)}
  gl_FragColor = vec4(${temporaries.lightContribution.identifier} * ${temporaries.modelColor.identifier}, 1.0);`;
}

export function applyPhongVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  let requirements: types.ShaderRequirements;

  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
    requirements = PhongVertexRequirements;
  } else {
    requirements = makePhongVertexRequirements(identifiers);
  }

  addRequirements(toSchema, requirements, forMaterial);
}

export function applyPhongFragmentPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  let requirements: types.ShaderRequirements;

  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
    requirements = PhongFragmentRequirements;
  } else {
    requirements = makePhongFragmentRequirements(identifiers);
  }

  addRequirements(toSchema, requirements, forMaterial);

  toSchema.head.push(phongDirectionalLightingDeclaration);
  toSchema.head.push(phongPointLightingDeclaration);
  toSchema.body.push(() => phongFragmentLightingBody(identifiers));
}