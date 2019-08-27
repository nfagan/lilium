export const vertex = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_translation;
attribute float a_rotation;

#define USE_WIND 1

varying float v_y;
varying vec3 v_position;
varying float v_noise;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

uniform vec3 blade_scale;
uniform float grid_scale;
uniform vec3 world_position;

uniform vec3 local_movement_direction;
uniform float local_movement_amount;
uniform float wind_amount;

uniform sampler2D wind_texture;
uniform sampler2D local_movement_texture;
uniform sampler2D displacement_texture;

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

  //  Texture coords
  vec2 grid_position = a_translation.xz / grid_scale;

  //  Local noise
  float noise_amount = texture2D(local_movement_texture, grid_position).a * -0.25;
  float sample_noise = noise_amount * a_rotation / 3.141592653589793;
  
  //  Taper in the blade
  vec3 position = a_position;
  position.x += taper_amount;

  //  Apply "model" matrix
  vec3 tmp_position = make_scale_matrix() * position + a_translation + world_position;

  //  Local movement
  tmp_position += local_movement_direction * noise_amount * y * local_movement_amount;

#if USE_WIND
  //  Wind movement
  float sampled_wind = texture2D(wind_texture, grid_position).z;
  tmp_position.z += ((sampled_wind - 0.5) * 2.0) * y * sample_noise * 4.0 * wind_amount;
#endif

  //  Player displacement
  vec4 sampled_displacement = texture2D(displacement_texture, grid_position);
  vec3 sampled_direction = normalize(sampled_displacement.xyz * 2.0 - 1.0);
  tmp_position.xz += sampled_direction.xz * y * sampled_displacement.w;

  v_y = y;
  v_position = tmp_position;
  v_noise = sample_noise;

  gl_Position = projection * view * vec4(tmp_position, 1.0);
}
`;

export const fragment = `
precision highp float;

varying float v_y;
varying vec3 v_position;
varying float v_noise;

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
  tmp_color += sun_contrib * 0.5;

  gl_FragColor = vec4(tmp_color, 1.0);
}
`;