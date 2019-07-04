export function phongDirectionalLightingDeclaration(): string {
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

export function phongPointLightingDeclaration(): string {
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


export function pbrDeclaration(): string {
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