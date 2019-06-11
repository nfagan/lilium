export const vertex = `
precision highp float;

attribute vec3 a_position;
attribute vec3 a_translation;
attribute vec3 a_color;

varying vec3 v_color;

uniform vec3 scale;
uniform mat4 projection;
uniform mat4 view;

void main() {
  v_color = a_color;
  vec3 transformed_vert = a_position * scale;
  vec3 translated_vert = transformed_vert + a_translation;

  vec4 pos = vec4(translated_vert, 1.0);
  gl_Position = projection * view * pos;
}
`;

export const fragment = `
precision highp float;

varying vec3 v_color;

void main() {
  gl_FragColor = vec4(v_color, 1.0);
}
`;