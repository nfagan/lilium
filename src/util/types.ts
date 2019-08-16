export type PrimitiveTypedArray = 
  Float32Array |
  Float64Array |
  Uint8Array | 
  Uint16Array | 
  Uint32Array | 
  Int8Array |
  Int16Array |
  Int32Array;

export type BuiltinRealArray = PrimitiveTypedArray | Array<number>;

export interface BasicErr {
  message: string
};

export function isBasicErr(err: any): err is BasicErr {
  return typeof err === 'object' && err.hasOwnProperty('message') && typeof err.message === 'string';
}

export function True(...args: any[]): boolean {
  return true;
}

export function False(...args: any[]): boolean {
  return false;
}