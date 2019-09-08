export const vertex = `
precision highp float;

attribute vec3 a_position;
attribute vec2 a_translation;
attribute vec2 a_frustum_grid_uv;
attribute float a_rotation;

varying vec3 v_position;
varying vec2 v_uv;
varying vec2 v_color_uv;

uniform mat4 view;
uniform mat4 projection;
uniform vec3 model_scale;

uniform vec3 camera_position;
uniform float camera_theta;
uniform vec2 camera_right_xz;

uniform sampler2D height_map;
uniform float terrain_grid_scale;
uniform float height_scale;

uniform sampler2D frustum_grid_map;
uniform float frustum_grid_cell_size;

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

  float rotation = camera_theta + a_rotation * 0.0;

  vec3 use_scale = model_scale;
  float noise_amount = a_rotation / PI;
  float y = 1.0 - (a_position.y + 1.0) / 2.0;
  float y3 = pow(y, 3.0);

  //
  vec4 translation_info = texture2D(frustum_grid_map, a_frustum_grid_uv);
  float alpha = clamp(translation_info.a, 0.0, 1.0);

  use_scale.y *= alpha;

  vec3 position = a_position;
  position.z = 0.0;
  position.y = 1.0 - position.y;

  position.xz += camera_right_xz * sin(t * noise_amount * 2.0) * y * 0.1;
  position.xz += camera_right_xz * cos(t * noise_amount * 4.0) * y3 * 0.05;

  position = make_scale_matrix(use_scale, rotation) * position;

  vec2 world_translation = translation_info.xy * frustum_grid_cell_size + frustum_grid_cell_size * a_translation;
  position.xz += world_translation;

  //
  float camera_dist = length(world_translation - camera_position.xz);
  float height_factor = clamp(exp(-pow(camera_dist * 0.003, 2.0)), 0.0, 1.0);

  //
  vec2 uv = position.xz / terrain_grid_scale;
  uv.y = 1.0 - uv.y;
  float height = texture2D(height_map, uv).r * height_scale;
  position.y += height;

  v_uv = (a_position.xy + 1.0) / 2.0;
  // v_color_uv = a_frustum_grid_uv;
  v_color_uv = mod(uv + a_rotation/PI * 0.0, 1.0);
  v_position = position;

  gl_Position = projection * view * vec4(position, 1.0);
}
`;

export const fragment = `
precision highp float;

varying vec3 v_position;
varying vec2 v_uv;
varying vec2 v_color_uv;

uniform sampler2D alpha_texture;
uniform sampler2D terrain_color;

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

  vec3 sun_dir = normalize(light_position);
  vec3 diff = max(dot(sun_dir, up), 0.0) * kd * light_color * diff_ao;
  // vec3 diff = vec3(0.0);

  return spec + diff;
}

void main() {
  float alpha = texture2D(alpha_texture, v_uv).a > 0.75 ? 1.0 : 0.0;

  if (alpha == 0.0) {
    discard;
  }

  float y = 1.0 - v_uv.y;
  vec3 color = texture2D(terrain_color, v_color_uv).rgb;

  vec3 sun_contrib = directional_light(sun_position, sun_color, pow(y, 1.5));
  color += sun_contrib * 0.5;

  gl_FragColor = vec4(color, alpha);
}
`;