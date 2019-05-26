import { Aabb, Ray } from './math';
import { vec3 } from 'gl-matrix';

export type RayPlaneIntersection = {
  intersects: boolean,
  t: number,
  intersectionPoint: vec3
};

export type RayAabbIntersection = {
  intersects: boolean,
  tMin: number,
  tMax: number,
}

function makeRayPlaneIntersection(intersects: boolean, t: number, intersectionPoint: vec3): RayPlaneIntersection {
  return {intersects, t, intersectionPoint};
}

function makeRayAabbIntersection(intersects: boolean, tMin: number, tMax: number): RayAabbIntersection {
    return {intersects, tMin, tMax};
}

export function rayIntersectsAabb(ray: Ray, aabb: Aabb): RayAabbIntersection {
  const rayOrigin = ray.origin;
  const rayDir = ray.direction;

  let t0x = (aabb.minX - rayOrigin[0]) / rayDir[0];
  let t0y = (aabb.minY - rayOrigin[1]) / rayDir[1];
  let t0z = (aabb.minZ - rayOrigin[2]) / rayDir[2];

  let t1x = (aabb.maxX - rayOrigin[0]) / rayDir[0];
  let t1y = (aabb.maxY - rayOrigin[1]) / rayDir[1];
  let t1z = (aabb.maxZ - rayOrigin[2]) / rayDir[2];

  let tmp = 0;

  if (t1x < t0x) {
    tmp = t1x;
    t1x = t0x;
    t0x = tmp;
  }

  if (t1y < t0y) {
    tmp = t1y;
    t1y = t0y;
    t0y = tmp;
  }

  if (t1z < t0z) {
    tmp = t1z;
    t1z = t0z;
    t0z = tmp;
  }

  if (t0x > t1y || t0y > t1x) {
    return makeRayAabbIntersection(false, null, null);
  }

  let tMin = t0x;
  if (t0y > tMin) tMin = t0y;

  let tMax = t1x;
  if (t1y < tMax) tMax = t1y;

  if (t0z > tMax || t1z < tMin) {
    return makeRayAabbIntersection(false, null, null);
  }

  if (t0z > tMin) tMin = t0z;
  if (t1z < tMax) tMax = t1z;

  return makeRayAabbIntersection(true, tMin, tMax);
}

export function rayIntersectsPlane(outPoint: vec3, rayOrigin: vec3, rayDir: vec3, planeNormal: vec3, planeOrigin: vec3): RayPlaneIntersection {
  const denom = vec3.dot(rayDir, planeNormal);

  if (denom === 0) {
    return makeRayPlaneIntersection(false, null, null);
  }

  vec3.sub(outPoint, planeOrigin, rayOrigin);
  const num = vec3.dot(outPoint, planeNormal);
  const t = num / denom;

  if (t < 0) {
    return makeRayPlaneIntersection(false, t, null);
  }

  vec3.scale(outPoint, rayDir, t);
  vec3.add(outPoint, rayOrigin, outPoint);

  return makeRayPlaneIntersection(true, t, outPoint);
}