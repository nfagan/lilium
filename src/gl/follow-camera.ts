import { ICamera } from './camera';
import { mat4, vec3 } from 'gl-matrix';

export class FollowCamera implements ICamera {
  public target: vec3;
  public position: vec3;

  private right: vec3;
  private up: vec3;
  private worldUp: vec3;

  private tmpVec: vec3;
  private view: mat4;

  public followDistance: number = 15;
  public maxPolar: number = Math.PI/2;
  public minPolar: number = -Infinity;

  constructor() {
    this.target = vec3.create();
    this.position = vec3.fromValues(0, 0, this.followDistance);
    this.tmpVec = vec3.create();
    this.worldUp = vec3.fromValues(0, 1, 0);
    this.right = vec3.fromValues(1, 0, 0);
    this.up = vec3.fromValues(0, 1, 0);
    this.view = mat4.create();
  }

  rotate(dx: number, dy: number): void {
    const tmpVec = this.tmpVec;
    const pos = this.position;
    const targ = this.target;

    //  Vector from target -> position
    vec3.sub(tmpVec, pos, targ);
    vec3.normalize(tmpVec, tmpVec);

    const theta = Math.atan2(tmpVec[0], tmpVec[2]);
    const phi = Math.acos(tmpVec[1]);

    const eps = 0.000001;
    const newTheta = theta + dx;
    let newPhi = phi-dy;

    newPhi = Math.max(this.minPolar, Math.min(this.maxPolar, newPhi));
    newPhi = Math.max(eps, Math.min(Math.PI-eps, newPhi));

    const sinPhi = Math.sin(newPhi);

    //  Spherical -> cartesian
    tmpVec[0] = sinPhi * Math.sin(newTheta) * this.followDistance;
    tmpVec[1] = Math.cos(newPhi) * this.followDistance;
    tmpVec[2] = sinPhi * Math.cos(newTheta) * this.followDistance;

    vec3.add(pos, targ, tmpVec);
  }

  getFront(out: vec3): vec3 {
    vec3.sub(out, this.position, this.target);
    vec3.normalize(out, out);
    return out;
  }

  getRight(out: vec3): vec3 {
    return vec3.copy(out, this.right);
  }

  move(deltas: vec3 | Array<number>): void {
    vec3.add(this.position, this.position, deltas);
    vec3.add(this.target, this.target, deltas);
  }

  moveNeg(deltas: vec3 | Array<number>): void {
    vec3.sub(this.position, this.position, deltas);
    vec3.sub(this.target, this.target, deltas);
  }

  makeViewMatrix(): mat4 {
    const pos = this.position;
    const targ = this.target;
    const tmpVec = this.tmpVec;
    const right = this.right;
    const up = this.up;
    const view = this.view;

    const front = vec3.sub(tmpVec, pos, targ);
    vec3.normalize(front, front);

    vec3.cross(right, front, this.worldUp);
    vec3.normalize(right, right);

    vec3.cross(up, right, front);
    vec3.normalize(up, up);

    //  view(0, :) = right
    view[0] = right[0];
    view[4] = right[1];
    view[8] = right[2];

    //  view(1, :) = up
    view[1] = up[0];
    view[5] = up[1];
    view[9] = up[2];

    //  view(2, :) = front
    view[2] = front[0];
    view[6] = front[1];
    view[10] = front[2];

    view[12] = -vec3.dot(right, pos);
    view[13] = -vec3.dot(up, pos);
    view[14] = -vec3.dot(front, pos);

    return view;
  }
}