export const vertex = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_translation;
attribute float a_rotation;

varying float v_y;
varying vec3 v_position;

uniform mat4 view;
uniform mat4 projection;

uniform vec3 blade_scale;
uniform vec3 world_position;

uniform float grid_offset;
uniform float grid_dimension;

uniform sampler2D height_map;
uniform float terrain_grid_scale;
uniform float height_scale;

uniform float camera_fov;
uniform vec3 camera_front;
uniform vec3 camera_position;

mat3 make_scale_matrix() {
  float ct = cos(a_rotation);
  float st = sin(a_rotation);

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
  float x = a_position.x;
  float y = a_position.y;
  float y3 = y * y * y;
  float taper_amount = -(y3 * sign(x));
  
  //  Taper in the blade
  vec3 position = a_position;
  position.x += taper_amount;

  //
  float x_extent = grid_offset + grid_dimension * a_translation.z * tan(camera_fov / 2.0) * 10.0;
  vec3 camera_right = -normalize(cross(-camera_front, vec3(0.0, 1.0, 0.0)));
  
  float z_offset = grid_offset + grid_dimension * a_translation.z;

  vec2 z_axis = -camera_front.xz * z_offset;
  vec2 x_axis = camera_right.xz * (x_extent * (a_translation.x - 0.5));

  vec2 center_point = camera_position.xz + z_axis + x_axis;

  position = make_scale_matrix() * position;

  position.xz += center_point;

  vec2 uv = position.xz / terrain_grid_scale;
  uv.y = 1.0 - uv.y;
  float height = texture2D(height_map, uv).r * height_scale;
  position.y += height;

  v_y = y;
  v_position = position;

  gl_Position = projection * view * vec4(position, 1.0);
}
`;

export const fragment = `
precision highp float;

varying float v_y;
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

  vec3 sun_contrib = vec3(0.0);
  sun_contrib = directional_light(sun_position, sun_color, pow(v_y, 1.5));
  // tmp_color += sun_contrib * 0.5;

  gl_FragColor = vec4(tmp_color, 1.0);
}
`;