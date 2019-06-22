export const vertex = `
precision highp float;

attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec3 a_translation;
attribute vec3 a_color;

varying vec3 v_color;
varying vec3 v_normal;
varying vec3 v_position;

uniform vec3 scale;
uniform mat4 projection;
uniform mat4 view;

void main() {
  v_color = a_color;
  v_normal = a_normal;

  vec3 transformed_vert = a_position * scale;
  vec3 translated_vert = transformed_vert + a_translation;

  vec4 pos = vec4(translated_vert, 1.0);

  v_position = pos.xyz;

  gl_Position = projection * view * pos;
}
`;

export const fragment = `
precision highp float;

varying vec3 v_color;
varying vec3 v_normal;
varying vec3 v_position;

uniform vec3 sun_position;
uniform vec3 sun_color;
uniform vec3 camera_position;

const float kd = 1.0;
const float ka = 0.9;
const float ks = 0.1;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 to_sun = normalize(sun_position);
  vec3 to_camera = normalize(camera_position - v_position);
  vec3 reflect_dir = normalize(to_camera + to_sun);

  float diffuse = kd * max(dot(normal, to_sun), 0.0);
  float ambient = ka;
  float spec = ks * pow(max(dot(normal, reflect_dir), 0.0), 2.0);
  float total_light = diffuse + ambient + spec;

  vec3 sun_contrib = total_light * sun_color;

  gl_FragColor = vec4(v_color * sun_contrib, 1.0);
}
`;