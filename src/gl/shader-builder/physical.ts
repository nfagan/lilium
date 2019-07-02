import { types, Material } from '..';
import { addRequirements } from './common';

function makePhysicalVertexRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  return {
    inputs: [],
    outputs: [],
    temporaries: {},
    uniforms: {},
    sampler2DCoordinates: identifiers.attributes.uv,
    conditionallyRequireForMaterial: []
  }
}

function makePhysicalFragmentRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  const varyings = identifiers.varyings;
  const uniforms = identifiers.uniforms;
  const temporaries = identifiers.temporaries;

  const maxDirLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const maxPointLights = types.ShaderLimits.maxNumUniformPointLights;

  return {
    inputs: [],
    outputs: [],
    temporaries: {
      roughness: temporaries.roughness,
      metallic: temporaries.metallic,
      modelColor: temporaries.modelColor,
      normal: temporaries.normal,
      normalToCamera: temporaries.normalToCamera,
      lightContribution: temporaries.lightContribution,
      ambientConstant: temporaries.ambientConstant
    },
    uniforms: {
      ambientConstant: types.makeGLSLVariable(uniforms.ambientConstant, 'float'),
      roughness: types.makeGLSLVariable(uniforms.roughness, 'float'),
      metallic: types.makeGLSLVariable(uniforms.metallic, 'float'),
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

const PhysicalFragmentRequirements = makePhysicalFragmentRequirements(types.DefaultShaderIdentifiers);
const PhysicalVertexRequirements = makePhysicalVertexRequirements(types.DefaultShaderIdentifiers);

function pbrDeclaration(): string {
  return `
    const float PI = ${Math.PI};

		float distribution_ggx(vec3 N, vec3 H, float roughness);
		float geometry_schlick_ggx(float NdotV, float roughness);
		float geometry_smith(vec3 N, vec3 V, vec3 L, float roughness);
		vec3 fresnel_schlick(float cos_theta, vec3 F0);
		vec3 PBR(
		     vec3 normals,
		     vec3 albedo,
		     float roughness,
		     float metallic,
		     vec3 cam_position,
		     vec3 world_position,
		     vec3 light_position,
		     vec3 light_color,
		     bool is_directional) {
		    
		    vec3 F0 = vec3(0.04);
		    F0 = mix(F0, albedo, metallic);
		    
		    vec3 N = normalize(normals);
		    vec3 V = normalize(cam_position - world_position);
		    
		    vec3 L;
		    if (is_directional) {
          L = normalize(light_position);
		    } else {
          L = normalize(light_position - world_position);
		    }
		    vec3 H = normalize(V + L);
		    float attenuation = 1.0;
		    
		    if (!is_directional) {
		    	float distance = length(light_position - world_position);
		    	attenuation = 1.0 / (distance * distance * 0.0002);
		    }
		    
		    vec3 radiance = light_color * attenuation;
		    
		    vec3 F = fresnel_schlick(max(dot(H, V), 0.0), F0);
		    float NDF = distribution_ggx(N, H, roughness);
		    float G = geometry_smith(N, V, L, roughness);
		    vec3 numer = vec3(NDF) * vec3(G) * F;
		    float denom = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.001;
		    vec3 specular = numer / denom;
		    
		    vec3 kS = F;
		    vec3 kD = vec3(1.0) - kS;
		    kD *= 1.0 - metallic;
		    
		    float NdotL = max(dot(N, L), 0.0);
		    return (kD * albedo / PI + specular) * radiance * NdotL;
		}
		//
		//  Fresnel component (F)
		//
		vec3 fresnel_schlick(float cosTheta, vec3 F0) {
      return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
		}
		//
		//  Normal distribution component (D)
		//
		float distribution_beckman(vec3 h, vec3 n, float roughness) {
      float a = roughness * roughness;
      float a2 = a * a;
      float n_dot_h = max(dot(n, h), 0.0);
      float n_dot_h2 = n_dot_h * n_dot_h;
      float part_a = 1.0 / (PI * a2 * pow(n_dot_h, 4.0));
      float exp_component = (n_dot_h2 - 1.0) / (a2 * n_dot_h2);
      return part_a * exp(exp_component);
		}
		float distribution_ggx(vec3 N, vec3 H, float roughness) {
		    float a = roughness * roughness;
		    float a2 = a * a;
		    float NdotH = max(dot(N, H), 0.0);
		    float NdotH2 = NdotH * NdotH;
		    
		    float denom = (NdotH2 * (a2-1.0) + 1.0);
		    denom = PI * denom * denom;
		    
		    return a2 / denom;
		}
		//
		//  Geometry distribution component (G)
		//
		float geometry_schlick_ggx(float NdotV, float roughness) {
		    float r = roughness + 1.0;
		    //  direct light
		    float k = (r*r) / 8.0;
		    //  IBL
		    //  float k = (roughness * roughness) / 2;
		    float denom = NdotV * (1.0 - k) + k;
		    return NdotV / denom;
		}
		float geometry_smith(vec3 N, vec3 V, vec3 L, float roughness) {
		    float NdotV = max(dot(N, V), 0.0);
		    float NdotL = max(dot(N, L), 0.0);
		    float ggx2 = geometry_schlick_ggx(NdotV, roughness);
		    float ggx1 = geometry_schlick_ggx(NdotL, roughness);
		    return ggx1 * ggx2;
		}`;
}

function physicalPointLightLoop(identifiers: types.ShaderIdentifierMap): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformPointLights;
  const temporaries = identifiers.temporaries;
  const varyings = identifiers.varyings;
  const uniforms = identifiers.uniforms;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += PBR(
      ${temporaries.normal.identifier},
      ${temporaries.modelColor.identifier},
      ${temporaries.roughness.identifier},
      ${temporaries.metallic.identifier},
      ${uniforms.cameraPosition},
      ${varyings.position},
      ${uniforms.pointLightPositions}[i],
      ${uniforms.pointLightColors}[i],
      false);
  }`;
}

function physicalDirectionalLightLoop(identifiers: types.ShaderIdentifierMap): string {
  const maxNumLights = types.ShaderLimits.maxNumUniformDirectionalLights;
  const temporaries = identifiers.temporaries;
  const varyings = identifiers.varyings;
  const uniforms = identifiers.uniforms;

  return `
  for (int i = 0; i < ${maxNumLights}; i++) {
    ${temporaries.lightContribution.identifier} += PBR(
      ${temporaries.normal.identifier},
      ${temporaries.modelColor.identifier},
      ${temporaries.roughness.identifier},
      ${temporaries.metallic.identifier},
      ${uniforms.cameraPosition},
      ${varyings.position},
      ${uniforms.directionalLightPositions}[i],
      ${uniforms.directionalLightColors}[i],
      true);
  }`;
}

function physicalFragmentLightingBody(identifiers: types.ShaderIdentifierMap): string {
  const temporaries = identifiers.temporaries;
  const varyings = identifiers.varyings;
  const lightContrib = temporaries.lightContribution.identifier;

  // `
	// 		${resType} ${finalColor} = ${ambientName} + ${loName};
	// 		${finalColor} = ${finalColor} / (${finalColor} + ${resType}(1.0));
	// 		${finalColor} = pow(${finalColor}, ${resType}(1.0/2.2));`

  return `
  ${temporaries.normal.identifier} = normalize(${varyings.normal});
  ${physicalPointLightLoop(identifiers)}
  ${physicalDirectionalLightLoop(identifiers)}
  ${lightContrib} = ${lightContrib} + ${temporaries.ambientConstant.identifier} * ${temporaries.modelColor.identifier};
  ${lightContrib} = ${lightContrib} / (${lightContrib} + vec3(1.0));
  ${lightContrib} = pow(${lightContrib}, vec3(1.0/2.2));
  gl_FragColor = vec4(${lightContrib}, 1.0);`;
}

export function applyPhysicalVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  let requirements: types.ShaderRequirements;

  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
    requirements = PhysicalVertexRequirements;
  } else {
    requirements = makePhysicalVertexRequirements(identifiers);
  }

  addRequirements(toSchema, requirements, forMaterial);
}


export function applyPhysicalFragmentPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  let requirements: types.ShaderRequirements;

  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
    requirements = PhysicalFragmentRequirements;
  } else {
    requirements = makePhysicalFragmentRequirements(identifiers);
  }

  addRequirements(toSchema, requirements, forMaterial);
  
  toSchema.head.push(pbrDeclaration);
  toSchema.body.push(() => physicalFragmentLightingBody(identifiers));
}