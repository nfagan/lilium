export const vertex = `
precision highp float;
attribute vec3 a_position;

#define USE_HEIGHTMAP 1
#define USE_EXP_HEIGHT_OFFSET 1

varying vec3 v_position;
varying vec2 v_uv;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

#if USE_EXP_HEIGHT_OFFSET
uniform vec3 camera_position;
#endif

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

#if USE_EXP_HEIGHT_OFFSET
  float dist_to_camera = length(camera_position.xz - world_position.xz);
  float dist_factor = clamp(exp(-pow(dist_to_camera * 0.08, 1.5)), 0.0, 1.0);
  world_position.y += (1.0 - dist_factor) * 1.25;
#endif

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

#if DISPLAY_TEXTURE
uniform sampler2D height_map;
#endif

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

vec3 calculate_sky_color() {
  //  https://www.scratchapixel.com/lessons/3d-basic-rendering/minimal-ray-tracer-rendering-simple-shapes/ray-sphere-intersection

  float dist_to_origin = length(v_position - sky_dome_origin);

  if (dist_to_origin > sky_dome_radius) {
    return vec3(1.0);
  }

  vec3 camera_ray_direction = normalize(v_position - camera_position);
  vec3 camera_ray_origin = camera_position;

  vec3 offset = camera_ray_origin - sky_dome_origin;

  const float a = 1.0;
  float b = 2.0 * dot(camera_ray_direction, offset);
  float c = dot(offset, offset) - (sky_dome_radius * sky_dome_radius);

  float discr = b * b - 4.0 * a * c;
  float t0 = 0.0;
  float t1 = 0.0;

  if (discr < 0.0) {
    return vec3(1.0, 0.0, 1.0);

  } else if (discr == 0.0) {
    t0 = -0.5 * b / a;
    t1 = t0;

  } else {
    float q = (b > 0.0) ? -0.5 * (b + sqrt(discr)) : -0.5 * (b - sqrt(discr)); 
    t0 = q / a;
    t1 = c / q;
  }

  if (t0 > t1) {
    float tmp = t0;
    t0 = t1;
    t1 = tmp;
  }

  if (t1 < 0.0) {
    return vec3(1.0);
  }

  vec3 intersect_point = camera_ray_origin + t0 * camera_ray_direction;

  float v = 1.0 - acos((intersect_point.y - sky_dome_origin.y) / sky_dome_radius) / 3.141592653589793;
  float u = 1.0;
  vec2 uv = vec2(u, v);

  return texture2D(sky_dome_texture, uv).rgb;
}

void main() {
  float use_y = 1.0;
  float y = pow(use_y, 0.25);

#if DISPLAY_TEXTURE
  vec3 tmp_color = texture2D(height_map, v_uv).rgb;

#else
  vec3 tmp_color = color;

  vec3 sun_contrib = vec3(0.0);
  sun_contrib = directional_light(sun_position, sun_color, pow(use_y, 1.5));
#if USE_SUN
  tmp_color += sun_contrib * 0.5;
#endif
#endif

  float dist_to_camera = length(camera_position - v_position);
  float visibility = clamp(exp(-pow(dist_to_camera * 0.008, 0.5)), 0.0, 1.0);
#if USE_FOG
  // vec3 fog_color = calculate_sky_color();
  vec3 fog_color = vec3(1.0);
  tmp_color = mix(fog_color, tmp_color, visibility);
#endif

  gl_FragColor = vec4(tmp_color, 1.0);
}
`;