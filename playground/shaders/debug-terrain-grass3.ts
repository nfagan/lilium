export const vertex = `
precision highp float;

attribute vec2 a_position;
attribute vec2 a_translation;
attribute vec2 a_frustum_grid_uv;
attribute float a_rotation; 

varying float v_y;
varying float v_alpha;
varying float v_noise;
varying vec3 v_position;
varying float v_discard;
varying float v_height_factor;

uniform mat4 view;
uniform mat4 projection;
uniform vec3 camera_position;
uniform vec2 camera_front_xz;
uniform vec2 camera_right_xz;
uniform float camera_theta;

uniform vec3 blade_scale;
uniform vec3 next_blade_scale;

uniform int is_billboarded;

uniform sampler2D frustum_grid_map;
uniform float frustum_grid_cell_size;
uniform float frustum_z_extent;
uniform float frustum_z_offset;

uniform sampler2D height_map;
uniform float terrain_grid_scale;
uniform float height_scale;

uniform float t;

mat3 make_scale_matrix(vec3 scl, float rotation) {
  float ct = cos(rotation);
  float st = sin(rotation);

  mat3 rot_mat;
  rot_mat[0][0] = ct;
  rot_mat[0][1] = 0.0;
  rot_mat[0][2] = -st;

  rot_mat[1][0] = 0.0;
  rot_mat[1][1] = 1.0;
  rot_mat[1][2] = 0.0;

  rot_mat[2][0] = st;
  rot_mat[2][1] = 0.0;
  rot_mat[2][2] = ct;

  mat3 scale_mat;
  scale_mat[0][0] = scl.x;
  scale_mat[1][1] = scl.y;
  scale_mat[2][2] = scl.z;

  return rot_mat * scale_mat;
}

void main() {
  const float PI = 3.141592653589793;

  float x = a_position.x;
  float y = a_position.y;
  float y3 = y * y * y;
  float taper_amount = -(y3 * sign(x));

  float noise_amount = a_rotation / PI;
  
  //  Taper in the blade
  vec3 position = vec3(a_position, 0.0);
  position.x += taper_amount;

  vec4 translation_info = texture2D(frustum_grid_map, a_frustum_grid_uv);
  float alpha = clamp(translation_info.a, 0.0, 1.0);

  vec2 world_translation = translation_info.xy * frustum_grid_cell_size + frustum_grid_cell_size * a_translation;

  float camera_dist = length(world_translation - camera_position.xz);
  // float height_factor = clamp(exp(-pow(camera_dist * 0.008, 1.5)), 0.0, 1.0);
  float height_factor = 1.0;

  float rotation = is_billboarded > 0 ? camera_theta : a_rotation;

  vec2 world_to_camera_offset = world_translation - (camera_position.xz + camera_front_xz * frustum_z_offset);
  float frac_frustum = clamp(dot(normalize(world_to_camera_offset), camera_front_xz) * length(world_to_camera_offset) / frustum_z_extent, 0.0, 1.0);
  vec3 use_scale = blade_scale;
  // use_scale = mix(blade_scale, next_blade_scale, frac_frustum);

  position = make_scale_matrix(use_scale, rotation) * position;
  position.xz += world_translation;
  position.y *= alpha * height_factor;

  position.xz += camera_right_xz * sin(t * noise_amount * 2.0) * y * 0.1;
  position.xz += camera_right_xz * cos(t * noise_amount * 4.0) * y3 * 0.05;

  vec2 uv = position.xz / terrain_grid_scale;
  uv.y = 1.0 - uv.y;
  float height = texture2D(height_map, uv).r * height_scale;
  position.y += height;

  v_y = y;
  v_alpha = alpha;
  v_noise = noise_amount;
  v_position = position;
  v_discard = translation_info.z > 0.5 ? 100.0 : -100.0;
  v_height_factor = frac_frustum;

  float w_component = translation_info.z > 0.5 ? 1.0 : 0.0;

  gl_Position = projection * view * vec4(position, w_component);
}
`;

export const fragment = `
precision highp float;

#define USE_FOG 1
#define USE_HEIGHT_FACTOR_VISIBILITY 0

varying float v_y;
varying float v_alpha;
varying float v_noise;
varying float v_height_factor;
varying float v_discard;
varying vec3 v_position;

uniform vec3 color;
uniform vec3 sun_position;
uniform vec3 sun_color;
uniform vec3 camera_position;

const float kd = 0.9;
const float ks = 0.9;
const vec3 up = vec3(0.0, 1.0, 0.0);

vec3 directional_light(vec3 light_position, vec3 light_color, float diff_ao) {
  vec3 direction = normalize(light_position - v_position);

  vec3 half_direction = normalize(direction + normalize(camera_position - v_position));
  float spec_strength = pow(max(dot(half_direction, up), 0.0), 4.0);
  vec3 spec = ks * light_color * spec_strength * diff_ao;

  return spec;
}

void main() {
  float y = pow(v_y, 0.25);

  vec3 tmp_color = color;
  tmp_color.g *= y;

  vec3 sun_contrib = directional_light(sun_position, sun_color, pow(v_y, 1.5));
  tmp_color += sun_contrib * 0.5;

#if USE_FOG
#if USE_HEIGHT_FACTOR_VISIBILITY
  tmp_color = mix(vec3(1.0), tmp_color, v_height_factor);
#else
  float dist_to_camera = length(camera_position - v_position);
  float visibility = clamp(exp(-pow(dist_to_camera * 0.008, 1.5)), 0.0, 1.0);
  tmp_color = mix(vec3(1.0), tmp_color, visibility);
#endif
#endif

  gl_FragColor = vec4(tmp_color, 1.0);
  // gl_FragColor = vec4(vec3(v_height_factor), 1.0);
}
`;