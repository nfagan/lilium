export const vertex = `
precision highp float;
attribute vec3 aPosition;
uniform mat4 projection;
uniform mat4 model;
uniform mat4 view;
void main() {
  gl_Position = projection * view * model * vec4(aPosition, 1.0);
}
`;

export const fragment = `
precision highp float;
uniform vec3 color;
uniform float alpha;
void main() {
  gl_FragColor = vec4(color, 1.0);
}
`;