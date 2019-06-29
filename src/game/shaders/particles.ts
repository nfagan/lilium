import { rotationFunctions } from './rotation-functions';

export const vertex = `
precision highp float;

attribute vec3 a_position;
attribute vec3 a_translation;
attribute vec3 a_rotation;
attribute float a_alpha;

varying vec3 v_normal;
varying vec3 v_position;
varying float v_alpha;
varying vec2 v_uv;

uniform vec3 scaling;
uniform mat4 projection;
uniform mat4 view;

${rotationFunctions}

void main() {
  vec3 transformed_vert = a_position * scaling;

  vec3 normal = vec3(0.0, 0.0, -1.0);

  vec3 rotated_vert = transformed_vert;
  vec3 rotated_normal = normal;

  rotated_vert = rotate_x(rotated_vert, a_rotation.x);
  rotated_normal = rotate_x(rotated_normal, a_rotation.x);

  rotated_vert = rotate_y(rotated_vert, a_rotation.y);
  rotated_normal = rotate_y(rotated_normal, a_rotation.y);

  vec3 translated_vert = rotated_vert + a_translation;
  vec4 pos = vec4(translated_vert, 1.0);

  v_position = pos.xyz;
  v_normal = rotated_normal;
  v_alpha = a_alpha;
  v_uv = a_position.xy / 2.0 + 0.5;

  gl_Position = projection * view * pos;
}
`;

export const fragment = `
precision highp float;

varying vec3 v_normal;
varying vec3 v_position;
varying float v_alpha;
varying vec2 v_uv;

uniform vec3 sun_position;
uniform vec3 sun_color;
uniform vec3 camera_position;
uniform vec3 color;

uniform sampler2D particle_texture;

const float kd = 0.5;
const float ka = 0.9;
const float ks = 0.8;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 to_sun = normalize(sun_position);
  vec3 to_camera = normalize(camera_position - v_position);
  vec3 reflect_dir = normalize(to_camera + to_sun);

  float diffuse = kd * max(dot(normal, to_sun), 0.0);
  float ambient = ka;
  float spec = ks * pow(max(dot(normal, reflect_dir), 0.0), 16.0);
  float total_light = diffuse + ambient + spec;

  // float particle_alpha = texture2D(particle_texture, v_uv).r;
  float particle_alpha = 1.0;

  vec3 sun_contrib = total_light * sun_color;

  float use_alpha = clamp(particle_alpha * v_alpha, 0.0, 1.0);

  gl_FragColor = vec4(color * sun_contrib, use_alpha);
}
`;