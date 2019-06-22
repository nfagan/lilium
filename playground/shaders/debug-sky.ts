export const vertex = `
precision highp float;

attribute vec3 a_position;
attribute vec2 a_uv;
attribute vec3 a_normal;

varying vec2 v_uv;

uniform mat4 projection;
uniform mat4 model;
uniform mat4 view;

void main() {
  v_uv = a_uv;

  gl_Position = projection * view * model * vec4(a_position, 1.0);
}
`;

export const fragment = `
precision highp float;

varying vec2 v_uv;

uniform sampler2D color_texture;

void main() {
  gl_FragColor = vec4(texture2D(color_texture, v_uv).rgb, 1.0);
}
`;