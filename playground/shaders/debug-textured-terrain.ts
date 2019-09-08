export const vertex = `
precision highp float;
attribute vec3 a_position;

#define USE_HEIGHTMAP 1

varying vec3 v_position;
varying vec2 v_uv;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

uniform vec3 camera_position;
uniform float far_grass_end;

uniform float frustum_z_extent;
uniform vec2 camera_front_xz;

uniform sampler2D height_map;
uniform float height_scale;

void main() {
  vec3 use_position = a_position;
  vec2 use_uv = a_position.xz;
  use_uv.y = 1.0 - use_uv.y;

#if USE_HEIGHTMAP
  float height = texture2D(height_map, use_uv).r * height_scale;
#else
  float height = 0.0;
#endif

  vec4 world_position = model * vec4(use_position, 1.0);
  world_position.y += height;

  vec2 world_to_camera_offset = world_position.xz - camera_position.xz;
  float frac_frustum = clamp(dot(normalize(world_to_camera_offset), camera_front_xz) * length(world_to_camera_offset) / frustum_z_extent, 0.0, 1.0);
  float y_offset = 2.9 * pow(smoothstep(0.0, 1.0, frac_frustum), 1.0);

  v_position = world_position.xyz;
  v_uv = use_uv;

  gl_Position = projection * view * world_position;
}
`;

export const fragment = `
precision highp float;

#define DISPLAY_TEXTURE 0
#define USE_SUN 0
#define USE_FOG 1

varying vec3 v_position;
varying vec2 v_uv;

uniform vec3 color;
uniform vec3 sun_position;
uniform vec3 sun_color;
uniform vec3 camera_position;

uniform vec3 sky_dome_origin;
uniform float sky_dome_radius;
uniform sampler2D sky_dome_texture;

uniform sampler2D ground_texture;

const float kd = 0.9;
const float ks = 0.9;
const vec3 up = vec3(0.0, 1.0, 0.0);

vec3 directional_light(vec3 light_position, vec3 light_color, float diff_ao) {
  vec3 direction = normalize(light_position - v_position);

  vec3 half_direction = normalize(direction + normalize(camera_position - v_position));
  float spec_strength = pow(max(dot(half_direction, up), 0.0), 4.0);
  vec3 spec = ks * light_color * spec_strength * diff_ao;

  vec3 sun_dir = normalize(light_position);
  // vec3 diff = max(dot(sun_dir, up), 0.0) * kd * light_color;
  vec3 diff = vec3(0.0);

  return spec + diff;
}

void main() {
  float use_y = 1.0;
  float y = pow(use_y, 0.25);

  vec3 tmp_color = texture2D(ground_texture, v_uv).rgb;

  vec3 sun_contrib = directional_light(sun_position, sun_color, pow(use_y, 1.5));
#if USE_SUN
  tmp_color += sun_contrib * 0.5;
#endif

  float dist_to_camera = length(camera_position - v_position);
  // float visibility = clamp(exp(-pow(dist_to_camera * 0.008, 0.5)), 0.0, 1.0);
  float visibility = clamp(exp(-pow(dist_to_camera * 0.001, 1.5)), 0.0, 1.0);
#if USE_FOG
  // vec3 fog_color = calculate_sky_color();
  vec3 fog_color = vec3(1.0);
  tmp_color = mix(fog_color, tmp_color, visibility);
#endif

  gl_FragColor = vec4(tmp_color, 1.0);
}
`;