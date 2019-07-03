import { types, Material } from '..';
import { requireTemporaries, requireStatics, connect, applyMaterial } from './common';

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

export type PhysicalComponentOutputPlug = {
  modelColor: types.ShaderComponentPlug
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

export type PhysicalComponentOutputOutlet = {
  modelColor: types.GLSLVariable
}

const DefaultPhysicalOutletInputs = makeInputOutletDefaults(types.DefaultShaderIdentifiers);
const DefaultPhysicalOutletOutputs = makeOutputOutletDefaults(types.DefaultShaderIdentifiers);
const DefaultPhysicalStatics = makeStaticDefaults(types.DefaultShaderIdentifiers);
const DefaultPhysicalTemporaries = makeTemporaryDefaults(types.DefaultShaderIdentifiers);

function makeTemporaryDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentTemporaries {
  return {
    lightContribution: identifiers.temporaries.lightContribution
  }
}

function makeStaticDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentStatics {
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

function makeInputOutletDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentInputOutlet {
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

function makeOutputOutletDefaults(identifiers: types.ShaderIdentifierMap): PhysicalComponentOutputOutlet {
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
      false);
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

export function applyPhysicalVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  //
}


export function applyPhysicalFragmentPipeline(toSchema: types.ShaderSchema, forMaterial: Material, plugInputs: PhysicalComponentInputPlug): void {
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