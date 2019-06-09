import { vec2, vec3, vec4, mat4 } from 'gl-matrix';

export const enum Shader {
  Vertex,
  Fragment 
};

export type PrimitiveTypedArray = 
  Float32Array |
  Float64Array |
  Uint8Array | 
  Uint16Array | 
  Uint32Array | 
  Int8Array |
  Int16Array |
  Int32Array;

type BuiltinRealArray = PrimitiveTypedArray | Array<number>;

export type Real4 = BuiltinRealArray | vec4 | mat4;
export type Real3 = Real4 | vec3;
export type Real2 = Real3 | vec2;
export type RealN = Real2;

export type DrawFunction = (gl: WebGLRenderingContext) => void;