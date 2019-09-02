export const vertex = `
precision highp float;
attribute vec3 a_position;
attribute vec2 a_offset;
attribute float a_rotation;

varying float v_y;
varying float v_alpha;
varying float v_noise;
varying vec3 v_position;
varying float v_discard;

uniform mat4 view;
uniform mat4 projection;
uniform vec3 camera_position;

uniform vec3 blade_scale;

uniform vec2 frustum_data_index;
uniform vec2 frustum_world_index;
uniform vec2 frustum_grid_origin;
uniform float frustum_grid_dimension;
uniform float frustum_cell_scale;
uniform float alpha;

uniform sampler2D noise_texture;

uniform sampler2D height_map;
uniform float terrain_grid_scale;
uniform float height_scale;

mat3 make_scale_matrix(float rotation) {
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
  scale_mat[0][0] = blade_scale.x;
  scale_mat[1][1] = blade_scale.y;
  scale_mat[2][2] = blade_scale.z;

  return rot_mat * scale_mat;
}

void main() {
  const float PI = 3.141592653589793;

  float x = a_position.x;
  float y = a_position.y;
  float y3 = y * y * y;
  float taper_amount = -(y3 * sign(x));

  vec2 noise_uv = (frustum_data_index + a_offset) / frustum_grid_dimension;
  float noise_amount = texture2D(noise_texture, noise_uv).a;

  float rotation = PI * noise_amount + a_rotation;
  
  //  Taper in the blade
  vec3 position = a_position;
  position.x += taper_amount;
  position = make_scale_matrix(rotation) * position;

  position.xz += frustum_world_index * frustum_cell_scale + (a_offset / noise_amount) * frustum_cell_scale;
  position.y *= alpha;

  vec2 uv = position.xz / terrain_grid_scale;
  uv.y = 1.0 - uv.y;
  float height = texture2D(height_map, uv).r * height_scale;

  position.y += height;

  v_y = y;

  gl_Position = projection * view * vec4(position, 1.0);
}
`;

export const fragment = `
precision highp float;

varying float v_y;
varying float v_alpha;
varying float v_noise;
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

  gl_FragColor = vec4(tmp_color, 1.0);
}
`;