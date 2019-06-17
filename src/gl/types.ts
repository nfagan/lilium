import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import { BuiltinRealArray } from '../util';

export const enum Shader {
  Vertex,
  Fragment 
};

export type Real4 = BuiltinRealArray | vec4 | mat4;
export type Real3 = Real4 | vec3;
export type Real2 = Real3 | vec2;
export type RealN = Real2;

export type DrawFunction = (gl: WebGLRenderingContext) => void;