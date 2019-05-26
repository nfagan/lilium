import { mat4, vec4, vec3 } from 'gl-matrix';

export class MousePicker {
  private invProj: mat4;
  private invView: mat4;
  private tmpVec4: vec4;

  constructor() {
    this.invProj = mat4.create();
    this.invView = mat4.create();
    this.tmpVec4 = vec4.create();
  }

  ray(out: vec3, x: number, y: number, view: mat4, projection: mat4, clientWidth: number, clientHeight: number): vec3 {
    const invProj = this.invProj;
    const invView = this.invView;
    const coords = this.tmpVec4;

    mat4.invert(invView, view);
    mat4.invert(invProj, projection);

    x = -1 + (x / clientWidth) * 2;
    y =  1 - (y / clientHeight) * 2;

    coords[0] = x;
    coords[1] = y;
    coords[2] = -1;
    coords[3] = 1;

    vec4.transformMat4(coords, coords, invProj);

    coords[2] = -1;
    coords[3] = 0;

    vec4.transformMat4(coords, coords, invView);

    for (let i = 0; i < 3; i++) {
      out[i] = coords[i];
    }

    vec3.normalize(out, out);

    return out;
  }
}