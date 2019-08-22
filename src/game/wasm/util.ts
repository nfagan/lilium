import { join } from 'path';

export function defaultLocateFileFunction(path: string, prefix: string): string {
  return join('wasm', path);
}

export function makeFloat32Array(memory: WebAssembly.Memory, ptr: number, size: number): Float32Array {
  return new Float32Array(memory.buffer, ptr, size);
}

export function makeInt32Array(memory: WebAssembly.Memory, ptr: number, size: number): Int32Array {
  return new Int32Array(memory.buffer, ptr, size);
}

export function makeUint8Array(memory: WebAssembly.Memory, ptr: number, size: number): Uint8Array {
  return new Uint8Array(memory.buffer, ptr, size);
}