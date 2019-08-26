export const vertex = `
precision highp float;
attribute vec3 a_position;

varying float v_y;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;
uniform float t;

uniform vec3 local_movement_direction;
uniform float local_movement_amount;

uniform vec2 grid_position;
uniform sampler2D wind_texture;
uniform sampler2D local_movement_texture;
uniform sampler2D displacement_texture;

void main() {
  float x = a_position.x;
  float y = a_position.y;
  float y2 = y * y;
  float y3 = y * y * y;
  float taper_amount = -(y3 * sign(x));

  // float noise_amount = t;
  float noise_amount = texture2D(local_movement_texture, grid_position).a * -0.25;
  
  vec3 position = a_position;
  position.x += taper_amount;

  vec3 tmp_position = vec3(model * vec4(position, 1.0));

  //  Local movement
  tmp_position += local_movement_direction * noise_amount * y * local_movement_amount;

  //  Wind movement
  float sampled_wind = texture2D(wind_texture, grid_position).z;
  tmp_position.z += ((sampled_wind - 0.5) * 2.0) * y * noise_amount * 4.0;

  //  Player displacement
  vec4 sampled_displacement = texture2D(displacement_texture, grid_position);
  vec3 sampled_direction = normalize(sampled_displacement.xyz * 2.0 - 1.0);
  tmp_position.xz += sampled_direction.xz * y * sampled_displacement.w;

  v_y = y;
  gl_Position = projection * view * vec4(tmp_position, 1.0);
}
`;

export const fragment = `
precision highp float;

varying float v_y;

uniform vec3 color;

void main() {
  float y = pow(v_y, 0.25);

  vec3 tmp_color = color;
  tmp_color.g *= y;

  gl_FragColor = vec4(tmp_color, 1.0);
}
`;