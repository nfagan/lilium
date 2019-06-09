export const vertex = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aTranslation;
attribute float aRotation;

uniform mat4 model;
uniform mat4 inv_trans_model;
uniform mat4 view;
uniform mat4 projection;
uniform float noise_strength;
uniform float base_x_rotation_deg;
uniform int invert_normal;

varying vec3 v_normal;
varying vec3 v_position;
varying float v_height;

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

void main() {
  float x_pos = aPosition.x;
  float y_pos = aPosition.y;
  float y_pos2 = y_pos * y_pos;
  float y_pos3 = y_pos * y_pos * y_pos;

  vec3 normal = vec3(0.0, 0.0, -1.0);

  if (invert_normal > 0) {
    normal = -normal;
  }
  
  const float amount_taper = 2.0;
  float base_angle = base_x_rotation_deg;
  float additional_angle = noise_strength * 8.0 * y_pos2;
  
  float curl_rad = to_radians(base_angle + additional_angle);
  
  float curl_amount = y_pos * curl_rad;
  float taper_amount = -(y_pos2 * sign(x_pos) * amount_taper/2.0);
  
  vec3 use_position = aPosition;
  vec3 use_normal = normal;
  
  use_position.x += taper_amount;
  
  use_position = rotate_x(use_position, curl_amount);
  use_normal = rotate_x(use_normal, curl_amount);

  // v_normal = mat3(inverse(transpose(model))) * use_normal;

  use_position = vec3(model * vec4(use_position, 1.0));
  use_normal = (inv_trans_model * vec4(use_normal, 1.0)).xyz;

  use_position = rotate_y(use_position, aRotation);
  use_normal = rotate_y(use_normal, aRotation);

  v_height = use_position.y;

  use_position += aTranslation;

  v_normal = use_normal;
  v_position = use_position;

  gl_Position = projection * view * vec4(use_position, 1.0);
}
`;

export const fragment = `
precision highp float;

#define MAX_NUM_POINT_LIGHTS 3

varying vec3 v_normal;
varying vec3 v_position;
varying float v_height;

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

  // vec3 specular_normal = vec3(0.0, 1.0, 0.0);
  vec3 specular_normal = normal;

  float spec_strength = pow(max(dot(half_direction, specular_normal), 0.0), 16.0);
  vec3 spec = ks * light_color * spec_strength * diff_ao;

  //  Ambient
  vec3 ambient = vec3(ka) * ambient_ao;
  
  return (ambient + diff + spec);
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

  gl_FragColor = vec4(color * point_light_contrib, 1.0);
}
`;