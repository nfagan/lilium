import { rotationFunctions } from './rotation-functions';

export const vertex = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_translation;
attribute float a_rotation;
attribute vec2 a_uv;

uniform mat4 model;
uniform mat4 inv_trans_model;
uniform mat4 view;
uniform mat4 projection;
uniform float base_x_rotation_deg;
uniform int invert_normal;
uniform vec3 origin_offset;

uniform sampler2D wind_texture;
uniform sampler2D velocity_texture;

varying vec3 v_normal;
varying vec3 v_position;
varying float v_height;
varying vec2 v_uv;

const float PI = 3.14159265;

float to_radians(float degrees) {
  return degrees * PI / 180.0;
}

float to_degrees(float rad) {
  return rad * 180.0 / PI;
}

${rotationFunctions}

#define USE_DEF

vec3 calculate_rotation(float y_pos) {
  const float max_rot = 90.0;

#ifdef USE_DEF

  vec4 sampled_deform = texture2D(velocity_texture, a_uv);
  vec4 normalized_deform = (sampled_deform - 0.5) * 2.0;
  normalized_deform *= sampled_deform.w;

  float deform_rot_x = max_rot * normalized_deform.z * y_pos/4.0;
  float deform_rot_z = max_rot * normalized_deform.x * y_pos/4.0;

  vec4 sampled_wind = texture2D(wind_texture, a_uv);
  vec4 normalized_wind = (sampled_wind - 0.5) * 2.0;
  normalized_wind *= sampled_wind.w;
  
  float wind_rot_x = max_rot * normalized_wind.z * y_pos/2.0;
  float wind_rot_z = max_rot * normalized_wind.x * y_pos/2.0;

  float total_rot_x = clamp(deform_rot_x + wind_rot_x, -90.0, 90.0);
  float total_rot_z = clamp(deform_rot_z + wind_rot_z, -90.0, 90.0);

  return vec3(total_rot_x, 0.0, total_rot_z);

#else

  vec4 sampled_wind = texture2D(wind_texture, a_uv);
  vec4 sampled_deform = texture2D(velocity_texture, a_uv);

  vec4 normalized_wind = (sampled_wind - 0.5) * 2.0;
  normalized_wind *= sampled_wind.w;
  
  float wind_rot_x = max_rot * normalized_wind.z * y_pos/2.0;
  float wind_rot_z = max_rot * normalized_wind.x * y_pos/2.0;

  vec4 normalized_deform = (sampled_deform - 0.5) * 2.0;

  float deform_rot_x = max_rot * sampled_deform.w;

  float total_rot_x = deform_rot_x + wind_rot_x;
  float total_rot_y = 180.0 * normalized_deform.z;
  float total_rot_z = wind_rot_z;

  return vec3(total_rot_x, total_rot_y, total_rot_z);

#endif
}

void main() {
  float x_pos = a_position.x;
  float y_pos = a_position.y;
  float y_pos2 = y_pos * y_pos;
  float y_pos3 = y_pos * y_pos * y_pos;

  vec2 use_uv = vec2(x_pos, y_pos);
  vec3 normal = vec3(0.0, 0.0, -1.0);

  if (invert_normal > 0) {
    normal = -normal;
  }
  
  float taper_amount = -(y_pos2 * sign(x_pos));
  
  vec3 use_position = a_position;
  vec3 use_normal = normal;
  
  use_position.x += taper_amount;

  use_position = mat3(model) * use_position;
  use_normal = mat3(inv_trans_model) * use_normal;

  use_position = rotate_y(use_position, a_rotation);
  use_normal = rotate_y(use_normal, a_rotation);

  float curl_rad = to_radians(2.0 * (a_rotation - 0.5));
  float curl_amount = y_pos * curl_rad;
  // float curl_amount = to_radians(y_pos * 3.0 * (a_rotation - 0.5));

  //
  //
  vec3 additional_rot = calculate_rotation(y_pos);
  float rot_x = to_radians(additional_rot.x) + curl_amount;
  float rot_y = to_radians(additional_rot.y);
  float rot_z = to_radians(additional_rot.z);

  //  x
  use_position = rotate_x(use_position, rot_x);
  use_normal = rotate_x(use_normal, rot_x);

  //  y
  use_position = rotate_y(use_position, rot_y);
  use_normal = rotate_y(use_normal, rot_y);

  //  z
  use_position = rotate_z(use_position, rot_z);
  use_normal = rotate_z(use_normal, rot_z);
  //
  //
  //

  use_position += a_translation;
  use_position += origin_offset;

  v_normal = use_normal;
  v_position = use_position;
  v_uv = use_uv;
  v_height = y_pos;

  gl_Position = projection * view * vec4(use_position, 1.0);
}
`;

export const fragment = `
precision highp float;

#define MAX_NUM_POINT_LIGHTS 3

varying vec3 v_normal;
varying vec3 v_position;
varying float v_height;
varying vec2 v_uv;

uniform vec3 color;
uniform float alpha;
uniform vec3 light_position[MAX_NUM_POINT_LIGHTS];
uniform vec3 light_color[MAX_NUM_POINT_LIGHTS];
uniform int num_point_lights;
uniform vec3 camera_position;

const float kd = 0.9;
const float ka = 0.2;
const float ks = 0.32;

vec3 point_light(vec3 light_position, vec3 light_color, vec3 normal, float diff_ao, float ambient_ao) {
  //  Diffuse
  vec3 diffuse_normal = vec3(0.0, 1.0, 0.0);
  // vec3 diffuse_normal = normal;

  vec3 light_direction = normalize(light_position-v_position);
  vec3 diff = kd * light_color * max(dot(diffuse_normal, light_direction), 0.0) * diff_ao;

  //  Specular
  vec3 camera_direction = normalize(camera_position-v_position);
  vec3 half_direction = normalize(light_direction + camera_direction);

  vec3 specular_normal = vec3(0.0, 1.0, 0.0);
  // vec3 specular_normal = normal;

  float spec_strength = pow(max(dot(half_direction, specular_normal), 0.0), 16.0);
  vec3 spec = ks * light_color * spec_strength * diff_ao;

  //  Ambient
  vec3 ambient = vec3(ka) * ambient_ao;
  
  return (ambient + diff + spec);
}

float toon_constrain(float value) {
  const float divisor = 5.0;

  float inv = 1.0/divisor;

  for (float i = 0.0; i < divisor; i += 1.0) {
    float thresh = (i + 1.0) * inv;

    if (value > 1.0 - thresh) {
      return 1.0 - thresh + inv;
    }
  }

  return 0.0;
}

void main() {
  vec3 normal = -normalize(v_normal);
  float y2 = v_height;

  float diff_ao = max(0.1, y2);
  float ambient_ao = max(0.8, y2);

  //  Total
  vec3 point_light_contrib = vec3(0.0);

  for (int i = 0; i < MAX_NUM_POINT_LIGHTS; i++) {
    if (i < num_point_lights) {
      vec3 one_light = point_light(light_position[i], light_color[i], normal, diff_ao, ambient_ao);
      point_light_contrib += one_light;
    }
  }

  vec3 use_color = color * point_light_contrib;
  // float use_alpha = mix(0.7, 1.0, v_height);
  // const float use_alpha = 0.97;
  const float use_alpha = 1.0;

  // use_color *= grass_color;

  // use_color.r = toon_constrain(use_color.r);
  // use_color.g = toon_constrain(use_color.g);
  // use_color.b = toon_constrain(use_color.b);

  gl_FragColor = vec4(use_color, use_alpha);
}
`;