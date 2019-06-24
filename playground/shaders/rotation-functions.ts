export const rotationFunctions = `
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
`