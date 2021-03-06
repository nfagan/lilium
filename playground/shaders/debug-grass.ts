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

uniform sampler2D velocity_texture;
uniform sampler2D amount_texture;
uniform sampler2D wind_texture;

varying vec3 v_normal;
varying vec3 v_position;
varying float v_height;
varying vec3 v_color;
varying vec2 v_uv;

const float PI = 3.14159265;

float to_radians(float degrees) {
  return degrees * PI / 180.0;
}

vec3 rotate_x(vec3 v, float rad) {
  vec3 result;
  
  float ct = cos(rad);
  float st = sin(rad);
  
  vec3 row2 = vec3(0, ct, -st);
  vec3 row3 = vec3(0, st, ct);
  
  result.x = v.x;
  result.y = dot(v, row2);
  result.z = dot(v, row3);
  
  return result;
}

vec3 rotate_y(vec3 v, float rad) {
  vec3 result;
  
  float ct = cos(rad);
  float st = sin(rad);
  
  vec3 row1 = vec3(ct, 0, st);
  vec3 row3 = vec3(-st, 0, ct);
  
  result.x = dot(v, row1);
  result.y = v.y;
  result.z = dot(v, row3);
  
  return result;
}

vec3 rotate_z(vec3 v, float rad) {
  vec3 result;

  float ct = cos(rad);
  float st = sin(rad);

  vec3 row1 = vec3(ct, -st, 0);
  vec3 row2 = vec3(st, ct, 0);

  result.x = dot(v, row1);
  result.y = dot(v, row2);
  result.z = v.z;

  return result;
}

vec4 quat_mul(vec4 a, vec4 b) {
  vec4 result;

  result.x = a.y * b.z - a.z * b.y + a.w * b.x + b.w * a.x;
  result.y = a.z * b.x - a.x * b.z + a.w * b.y + b.w * a.y;
  result.z = a.x * b.y - a.y * b.z + a.w * b.z + b.w * a.z;
  //  scalar component
  result.w = a.w * b.w - (a.x * b.x + a.y * b.y + a.z * b.z);
  
  return result;
}

vec4 quat_mul3(vec4 a, vec3 b) {
  vec4 result;

  result.x = a.y * b.z - a.z * b.y + a.w * b.x;
  result.y = a.z * b.x - a.x * b.z + a.w * b.y;
  result.z = a.x * b.y - a.y * b.z + a.w * b.z;
  //  scalar component
  result.w = -(a.x * b.x + a.y * b.y + a.z * b.z);

  return result;
}

vec3 apply_quat3(vec4 quat, vec3 to) {
  vec4 conj = vec4(-quat.x, -quat.y, -quat.z, quat.w);
  vec4 quat_to = vec4(to.xyz, 0.0);
  vec4 tmp = quat_mul(conj, quat_to);
  tmp = quat_mul(quat, tmp);
  return tmp.xyz;
}

vec4 quat_normalize(vec4 quat) {
  float len = sqrt(dot(quat, quat));

  vec4 result = quat;
  result.xyz /= len;

  return result;
}

vec3 handle_player_deformation(vec3 pos, vec3 velocity, float amount_deform) {
  const float eps = 0.0001;

  // float theta = (abs(velocity.x) < eps || abs(velocity.z) < eps) ? 0.0 : atan(velocity.x, velocity.z);
  float theta = atan(velocity.x, velocity.z);
  float phi = acos(1.0 - amount_deform);

  pos = rotate_x(pos, phi);
  pos = rotate_y(pos, theta);

  return pos;
}

float sample_deformation_amount(vec2 uv, sampler2D amount_texture) {
  return texture2D(amount_texture, uv).a;
}

vec3 sample_player_velocity(vec2 uv, sampler2D velocity_texture) {
  vec4 sampled = texture2D(velocity_texture, uv);

  vec3 use_velocity = vec3(sampled.x, 0.0, sampled.y);
  float sign_x = sampled.z == 0.5 ? 1.0 : sign(sampled.z - 0.5);
  float sign_z = sampled.w == 0.5 ? 1.0 : sign(sampled.w - 0.5);

  use_velocity.x *= sign_x;
  use_velocity.z *= sign_z;

  return use_velocity;
}

vec4 sample_wind(vec2 uv, sampler2D wind_texture) {
  vec4 sampled_wind = texture2D(wind_texture, uv);
  float sgn = sign(0.5 - sampled_wind.y);

  sampled_wind.x *= sgn;
  sampled_wind.z *= sgn;

  return sampled_wind;
}

vec3 apply_wind(vec3 pos, vec4 sampled_wind) {
  float theta = atan(sampled_wind.x, sampled_wind.z);
  float amount_deform = sampled_wind.w;
  float phi = acos(1.0 - amount_deform/15.0);

  pos = rotate_x(pos, phi);
  pos = rotate_y(pos, theta);

  return pos;
}

void main() {
  float x_pos = a_position.x;
  float y_pos = a_position.y;
  float y_pos2 = y_pos * y_pos;

  vec2 use_uv = vec2(x_pos, y_pos);
  vec3 normal = vec3(0.0, 0.0, -1.0);

  if (invert_normal > 0) {
    normal = -normal;
  }

  vec4 sampled_wind = sample_wind(a_uv, wind_texture);
  vec3 sampled_velocity = sample_player_velocity(a_uv, velocity_texture);
  float sampled_amount = sample_deformation_amount(a_uv, amount_texture);
  
  const float amount_taper = 2.0;
  float base_angle = base_x_rotation_deg;
  float additional_angle = 0.0;
  
  float curl_rad = to_radians(base_angle + additional_angle);
  
  float curl_amount = y_pos * curl_rad;
  float taper_amount = -(y_pos2 * sign(x_pos) * amount_taper/2.0);
  
  vec3 use_position = a_position;
  vec3 use_normal = normal;
  
  use_position.x += taper_amount;
  
  use_position = rotate_x(use_position, curl_amount);
  use_normal = rotate_x(use_normal, curl_amount);

  use_position = vec3(model * vec4(use_position, 1.0));
  use_normal = (inv_trans_model * vec4(use_normal, 1.0)).xyz;

  use_position = rotate_y(use_position, a_rotation);
  use_normal = rotate_y(use_normal, a_rotation);

  v_height = use_position.y;

  // sampled_wind.w *= (y_pos * y_pos);
  // sampled_wind.w = 0.0;

  if (sampled_amount == 0.0) {
    use_position = apply_wind(use_position, sampled_wind);
    use_normal = apply_wind(use_normal, sampled_wind);
  } else {
    use_position = handle_player_deformation(use_position, sampled_velocity, sampled_amount);
    use_normal = handle_player_deformation(use_normal, sampled_velocity, sampled_amount);
  }

  use_position += a_translation;

  v_normal = use_normal;
  v_position = use_position;
  v_color = sampled_velocity;
  v_uv = use_uv;

  gl_Position = projection * view * vec4(use_position, 1.0);
}
`;

export const fragment = `
precision highp float;

#define MAX_NUM_POINT_LIGHTS 3

varying vec3 v_normal;
varying vec3 v_position;
varying float v_height;
varying vec3 v_color;
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
  // vec3 diffuse_normal = vec3(0.0, 1.0, 0.0);
  vec3 diffuse_normal = normal;

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
  const float divisor = 3.0;

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
  float y2 = v_height * v_height;

  float diff_ao = max(0.1, y2);
  float ambient_ao = max(0.5, y2);

  //  Total
  vec3 point_light_contrib = vec3(0.0);

  for (int i = 0; i < MAX_NUM_POINT_LIGHTS; i++) {
    if (i < num_point_lights) {
      vec3 one_light = point_light(light_position[i], light_color[i], normal, diff_ao, ambient_ao);
      point_light_contrib += one_light;
    }
  }

  vec3 use_color = color * point_light_contrib;

  // use_color *= grass_color;

  // use_color.r = toon_constrain(use_color.r);
  // use_color.g = toon_constrain(use_color.g);
  use_color.b = toon_constrain(use_color.b);

  gl_FragColor = vec4(use_color, 1.0);
}
`;