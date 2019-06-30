import { types, Material } from '..';
import { normalToCamera, addUniformsForMaterial, declareRequiredTemporaries, 
  extractUniformsToTemporaries, addPositionNormalUvVaryings, applySimpleVertexPipeline } from './common';

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
  vec3 ${temporaries.normal.identifier} = normalize(${varyings.normal});
  vec3 ${temporaries.lightContribution.identifier} = vec3(0.0);

  ${normalToCamera(identifiers)}
  ${phongDirectionalLightLoop(identifiers)}
  ${phongPointLightLoop(identifiers)}
  gl_FragColor = vec4(${temporaries.lightContribution.identifier} * ${temporaries.modelColor.identifier}, 1.0);`;
}

function addPhongFragmentUniforms(toSchema: types.ShaderSchema, identifiers: types.ShaderIdentifierMap): void {
  const maxNumDirLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const maxNumPointLights = types.ShaderLimits.maxNumUniformPointLights;

  toSchema.requireUniform(identifiers.uniforms.cameraPosition, 'vec3');
  toSchema.requireUniform(`${identifiers.uniforms.directionalLightPositions}[${maxNumDirLights}]`, 'vec3');
  toSchema.requireUniform(`${identifiers.uniforms.directionalLightColors}[${maxNumDirLights}]`, 'vec3');
  toSchema.requireUniform(`${identifiers.uniforms.pointLightPositions}[${maxNumPointLights}]`, 'vec3');
  toSchema.requireUniform(`${identifiers.uniforms.pointLightColors}[${maxNumPointLights}]`, 'vec3');
}

export function applyPhongVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
  }

  applySimpleVertexPipeline(toSchema, forMaterial, identifiers);
}

export function applyPhongFragmentPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
  }

  addUniformsForMaterial(toSchema, forMaterial);

  addPositionNormalUvVaryings(toSchema, forMaterial, identifiers);
  addPhongFragmentUniforms(toSchema, identifiers);

  toSchema.head.push(phongDirectionalLightingDeclaration);
  toSchema.head.push(phongPointLightingDeclaration);

  toSchema.body.push(() => declareRequiredTemporaries(types.RequiredPhongLightingTemporaries, identifiers.temporaries));
  toSchema.body.push(() => extractUniformsToTemporaries(forMaterial, identifiers.temporaries, identifiers.varyings.uv));
  toSchema.body.push(() => phongFragmentLightingBody(identifiers));
}